#!/usr/bin/env bash
# Publish a self-hosted OTA update to cinepix.top.
#
# Local (Windows):   bash ota_publish.sh "fix message"
#                    bash ota_publish.sh "critical fix" --critical
# CI  (Linux):       same script, driven by .github/workflows/ota-publish.yml
#                    SSH auth there comes from the OTA_SSH_KEY secret (falls
#                    back to OTA_SSH_PW via sshpass).
#
# Only JS ships over OTA. Native changes (android/, plugins/, app.config.js
# native config, package.json native deps) need a new APK + version bump —
# .github/workflows/native-guard.yml enforces that on PRs.
set -e
cd "$(dirname "$0")"   # CineBD repo root

MSG="${1:-ota update}"
CRITICAL="false"
if [ "$2" = "--critical" ]; then
  CRITICAL="true"
fi
# How many bundles to retain per runtime version. Must stay > 1 so a rollback
# still has an older bundle to return to.
KEEP_BUNDLES="${OTA_KEEP_BUNDLES:-8}"
VERSION=$(grep -oE "^[[:space:]]*version:[[:space:]]*'[^']+'" app.config.js | head -1 | sed -E "s/.*'([^']+)'.*/\1/")
UPDATE_ID=$(node -e "console.log(require('crypto').randomUUID())")
HOST="${OTA_SSH_HOST:-root@160.25.226.103}"

# ---------------------------------------------------------------- auth ------
# Credentials live ONLY in the untracked local file .ota-secret (or env var
# OTA_SSH_PW / OTA_SSH_KEY). Never hardcode them here: this file is committed
# to a public repo, and a leaked VPS password once had to be rotated because
# of it.
if [ -z "$OTA_SSH_PW" ] && [ -f "$(dirname "$0")/.ota-secret" ]; then
  OTA_SSH_PW="$(cat "$(dirname "$0")/.ota-secret")"
fi

# PuTTY on Windows (the historical local setup), OpenSSH everywhere else.
PLINK="/c/Program Files/PuTTY/plink.exe"
PSCP="/c/Program Files/PuTTY/pscp.exe"
USE_PUTTY=0
if [ -f "$PLINK" ] && [ -f "$PSCP" ]; then
  USE_PUTTY=1
fi

HAVE_KEY=0
if [ -n "$OTA_SSH_KEY" ] && [ -f "$OTA_SSH_KEY" ]; then
  HAVE_KEY=1
fi

if [ "$USE_PUTTY" = 1 ]; then
  if [ -z "$OTA_SSH_PW" ]; then
    echo "!! SSH password missing: set OTA_SSH_PW env var or create .ota-secret (untracked)"
    exit 1
  fi
else
  if [ "$HAVE_KEY" = 0 ]; then
    if [ -z "$OTA_SSH_PW" ]; then
      echo "!! SSH auth missing: provide OTA_SSH_KEY (a private key file) or OTA_SSH_PW"
      exit 1
    fi
    if ! command -v sshpass >/dev/null 2>&1; then
      echo "!! sshpass not installed (needed for password auth on Linux): apt-get install sshpass"
      exit 1
    fi
  fi
fi

# `remote "<shell command>"` runs one command on the host.
remote() {
  if [ "$USE_PUTTY" = 1 ]; then
    "$PLINK" -batch -ssh "$HOST" -pw "$OTA_SSH_PW" "$@"
  elif [ "$HAVE_KEY" = 1 ]; then
    ssh -i "$OTA_SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$HOST" "$@"
  else
    SSH_PASSWORD="$OTA_SSH_PW" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$HOST" "$@"
  fi
}

# `upload <remote-dest> <src...>` copies files/dirs up.
upload() {
  local dest="$1"; shift
  if [ "$USE_PUTTY" = 1 ]; then
    "$PSCP" -batch -pw "$OTA_SSH_PW" -r "$@" "$HOST:$dest"
  elif [ "$HAVE_KEY" = 1 ]; then
    scp -i "$OTA_SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -r "$@" "$HOST:$dest"
  else
    SSH_PASSWORD="$OTA_SSH_PW" sshpass -e scp -o StrictHostKeyChecking=accept-new -r "$@" "$HOST:$dest"
  fi
}

# --------------------------------------------------------------- export -----
echo ">> Exporting OTA bundle for runtime version $VERSION ..."
rm -f .ota-release.json
rm -rf .ota-export
# Same generator the prebuild/test flows use - keeps the bundle identical to
# what a fresh APK would embed.
npm run build:sandbox >/dev/null
npx expo export --platform android --output-dir .ota-export --source-maps false >/dev/null

if [ ! -f .ota-export/metadata.json ]; then
  echo "!! metadata.json missing - export failed"
  exit 1
fi

# Windows-built metadata.json uses backslashes in paths - normalize to "/".
node -e "
const fs=require('fs');
const p='.ota-export/metadata.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
const norm=(o)=>{for(const k in o){if(typeof o[k]==='string')o[k]=o[k].replace(/\\\\\\\\/g,'/');else if(o[k]&&typeof o[k]==='object')norm(o[k]);}};
norm(j);
fs.writeFileSync(p,JSON.stringify(j));
console.log('metadata normalized');
"

CREATED_AT=$(node -e "console.log(new Date().toISOString())")
BUNDLE_SIZE=$(du -sh .ota-export 2>/dev/null | cut -f1 || echo '?')
echo ">> Bundle export size: $BUNDLE_SIZE"

# Build the registration JSON locally. The old inline heredoc with \" escaping
# produced invalid JSON the moment $MSG contained a quote (or any non-ASCII),
# which silently killed the whole release registration.
echo ">> Building release registration (critical=$CRITICAL) ..."
node -e '
  const fs = require("fs");
  // `node -e` has NO script-path slot in argv: argv is [nodePath, arg1, ...],
  // so the arguments start at index 1. Using slice(2) (the correct index for
  // a script FILE) dropped the first argument, shifted every field one place
  // (id received createdAt, message received critical) and left `out`
  // undefined - which is what crashed writeFileSync in CI.
  const args = process.argv.slice(1);
  if (args.length !== 5) {
    console.error("release registration: expected 5 args, got " + JSON.stringify(args));
    process.exit(1);
  }
  const [id, createdAt, message, critical, out] = args;
  fs.writeFileSync(out, JSON.stringify({id, createdAt, message, critical: critical === "true"}));
  console.log("registered", id, "critical=" + (critical === "true"));
' "$UPDATE_ID" "$CREATED_AT" "$MSG" "$CRITICAL" ".ota-release.json"

# Also drop a copy inside the bundle folder: _mirror.sh on the server rewrites
# releases.json for every other runtime version, so per-runtime pointer files
# are not guaranteed to carry the flags. A file living NEXT TO metadata.json
# travels with the bundle itself, and the endpoint prefers it.
cp .ota-release.json .ota-export/release.json

echo ">> Preparing remote directory /var/www/cinepix/ota/$VERSION/$UPDATE_ID ..."
remote "mkdir -p /var/www/cinepix/ota/$VERSION/$UPDATE_ID"

echo ">> Uploading bundle + assets (this can take a minute) ..."
upload "/var/www/cinepix/ota/$VERSION/$UPDATE_ID/" .ota-export/*

echo ">> Registering release ..."
# Register LAST: until releases.json points at the new id, clients still see
# the previous (fully uploaded) bundle. Never publish a half-uploaded folder.
upload "/var/www/cinepix/ota/$VERSION/releases.json" .ota-release.json

echo ">> Pruning to the newest $KEEP_BUNDLES bundles (keeps rollback history) ..."
remote "ls -1dt /var/www/cinepix/ota/$VERSION/*/ 2>/dev/null | tail -n +$((KEEP_BUNDLES + 1)) | xargs -r rm -rf; chown -R www-data:www-data /var/www/cinepix/ota/$VERSION; echo REGISTERED: $UPDATE_ID"

echo ">> Mirroring to all other runtime versions ..."
remote "bash /var/www/cinepix/ota-endpoint/_mirror.sh $VERSION $UPDATE_ID" || echo "!! mirror step failed - run _mirror.sh manually"

rm -f .ota-release.json
echo ">> Done. Users receive this update on next app start."
