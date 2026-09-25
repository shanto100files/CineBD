#!/usr/bin/env bash
# Publish a self-hosted OTA update to cinepix.top.
# Usage:  bash ota_publish.sh "fix message"
set -e
cd "$(dirname "$0")"   # CineBD repo root

MSG="${1:-ota update}"
VERSION=$(grep -oE "version: '[^']+'" app.config.js | head -1 | sed "s/version: '//;s/'//")
UPDATE_ID=$(node -e "console.log(require('crypto').randomUUID())")
HOST="root@160.25.226.103"
PW='6zcqDn8RUXtydGE6X7Uv'
PLINK="/c/Program Files/PuTTY/plink.exe"
PSCP="/c/Program Files/PuTTY/pscp.exe"

echo ">> Exporting OTA bundle for runtime version $VERSION ..."
rm -rf .ota-export
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

echo ">> Preparing remote directory /var/www/cinepix/ota/$VERSION/$UPDATE_ID ..."
"$PLINK" -batch -ssh "$HOST" -pw "$PW" "mkdir -p /var/www/cinepix/ota/$VERSION/$UPDATE_ID"

echo ">> Uploading bundle + assets (this can take a minute) ..."
"$PSCP" -batch -pw "$PW" -r .ota-export/* "$HOST:/var/www/cinepix/ota/$VERSION/$UPDATE_ID/"

echo ">> Registering release ..."
"$PLINK" -batch -ssh "$HOST" -pw "$PW" "cat > /var/www/cinepix/ota/$VERSION/releases.json <<'EOF'
{\"id\":\"$UPDATE_ID\",\"createdAt\":\"$CREATED_AT\",\"message\":\"$MSG\"}
EOF
chown -R www-data:www-data /var/www/cinepix/ota/$VERSION
echo REGISTERED: $UPDATE_ID"

echo ">> Done. Users receive this update on next app start."
