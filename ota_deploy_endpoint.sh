#!/usr/bin/env bash
# Deploy the OTA endpoint (ota_server_index.php -> /var/www/cinepix/ota-endpoint/index.php).
#
#   bash ota_deploy_endpoint.sh
#   OTA_APP_KEY=<new key> bash ota_deploy_endpoint.sh   # also rotate the key
#
# Auth is identical to ota_publish.sh: .ota-secret / OTA_SSH_PW (or sshpass on
# Linux), or OTA_SSH_KEY for key-based auth. The old index.php is kept as a
# timestamped .bak next to it, and the upload is `php -l` syntax-checked
# before it replaces anything.
set -e
cd "$(dirname "$0")"

HOST="${OTA_SSH_HOST:-root@160.25.226.103}"
REMOTE_DIR="/var/www/cinepix/ota-endpoint"
STAMP=$(date -u '+%Y%m%d%H%M%S')
SRC="ota_server_index.php"

if [ ! -f "$SRC" ]; then
  echo "!! $SRC not found"
  exit 1
fi

if [ -z "$OTA_SSH_PW" ] && [ -f "$(dirname "$0")/.ota-secret" ]; then
  OTA_SSH_PW="$(cat "$(dirname "$0")/.ota-secret")"
fi

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
elif [ "$HAVE_KEY" = 0 ]; then
  if [ -z "$OTA_SSH_PW" ]; then
    echo "!! SSH auth missing: provide OTA_SSH_KEY (a private key file) or OTA_SSH_PW"
    exit 1
  fi
  command -v sshpass >/dev/null 2>&1 || {
    echo "!! sshpass not installed (needed for password auth on Linux): apt-get install sshpass"
    exit 1
  }
fi

remote() {
  if [ "$USE_PUTTY" = 1 ]; then
    "$PLINK" -batch -ssh "$HOST" -pw "$OTA_SSH_PW" "$@"
  elif [ "$HAVE_KEY" = 1 ]; then
    ssh -i "$OTA_SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$HOST" "$@"
  else
    SSHPASS="$OTA_SSH_PW" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$HOST" "$@"
  fi
}

upload() {
  local dest="$1"; shift
  if [ "$USE_PUTTY" = 1 ]; then
    "$PSCP" -batch -pw "$OTA_SSH_PW" -r "$@" "$HOST:$dest"
  elif [ "$HAVE_KEY" = 1 ]; then
    scp -i "$OTA_SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -r "$@" "$HOST:$dest"
  else
    SSHPASS="$OTA_SSH_PW" sshpass -e scp -o StrictHostKeyChecking=accept-new -r "$@" "$HOST:$dest"
  fi
}

echo ">> Backing up current endpoint ..."
remote "mkdir -p $REMOTE_DIR && if [ -f $REMOTE_DIR/index.php ]; then cp -a $REMOTE_DIR/index.php $REMOTE_DIR/index.php.bak.$STAMP; fi && ls -1 $REMOTE_DIR | tail -5"

echo ">> Uploading $SRC ..."
upload "$REMOTE_DIR/" "$SRC"

echo ">> Installing + syntax check ..."
remote "cd $REMOTE_DIR && mv -f $SRC index.php && chown www-data:www-data index.php && chmod 644 index.php && php -l index.php"

if [ -n "$OTA_APP_KEY" ]; then
  echo ">> Writing rotated key to $REMOTE_DIR/.app_key ..."
  printf '%s' "$OTA_APP_KEY" > .ota-app-key.tmp
  upload "$REMOTE_DIR/" .ota-app-key.tmp
  remote "cd $REMOTE_DIR && mv -f .ota-app-key.tmp .app_key && chown www-data:www-data .app_key && chmod 600 .app_key"
  rm -f .ota-app-key.tmp
  echo "!! Remember: the key is baked into the APK (expo-updates reads it natively),"
  echo "!! so a rotated key only takes effect after a NEW APK build."
fi

echo ">> Deployed. Verify with: php _test_ota_manifest_latest.php"
