#!/usr/bin/env bash
# Publish a self-hosted OTA update to cinepix.top.
# Usage:
#   bash ota_publish.sh "fix message"              — regular update (silent)
#   bash ota_publish.sh "critical fix" --critical  — shows restart dialog
set -e
cd "$(dirname "$0")"   # CineBD repo root

MSG="${1:-ota update}"
CRITICAL="false"
if [ "$2" = "--critical" ]; then
  CRITICAL="true"
fi
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

echo ">> Registering release (critical=$CRITICAL) ..."
"$PLINK" -batch -ssh "$HOST" -pw "$PW" "cat > /var/www/cinepix/ota/$VERSION/releases.json <<'EOF'
{\"id\":\"$UPDATE_ID\",\"createdAt\":\"$CREATED_AT\",\"message\":\"$MSG\",\"critical\":$CRITICAL}
EOF
ls -1dt /var/www/cinepix/ota/$VERSION/*/ 2>/dev/null | tail -n +5 | xargs -r rm -rf
chown -R www-data:www-data /var/www/cinepix/ota/$VERSION
echo REGISTERED: $UPDATE_ID"

echo ">> Mirroring to all other runtime versions ..."
"$PLINK" -batch -ssh "$HOST" -pw "$PW" "for d in /var/www/cinepix/ota/*/; do rv=\$(basename \"\$d\"); [ \"\$rv\" = \"$VERSION\" ] && continue; mkdir -p \"\$d$UPDATE_ID\"; cp -a /var/www/cinepix/ota/$VERSION/$UPDATE_ID/. \"\$d$UPDATE_ID/\"; cp /var/www/cinepix/ota/$VERSION/releases.json \"\$d/releases.json\"; ls -1dt \"\$d\"*/ 2>/dev/null | tail -n +5 | xargs -r rm -rf; chown -R www-data:www-data \"\$d\"; echo mirrored: \$rv; done"

echo ">> Done. Users receive this update on next app start."
