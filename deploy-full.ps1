param (
    [string]$remoteUser = "root",
    [string]$remoteHost = "217.160.148.112",
    [string]$remotePath = "/var/www/softspace",
    [string]$localPath = "Q:\softsapce app maybe",
    [string]$password = "zynFnGcW6r0L",
    [string]$backendPm2Name = "softspace-backend",
    [switch]$skipFrontendBuild,
    [switch]$skipLocalFrontendBuild
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param (
        [string]$message,
        [string]$color = "Cyan"
    )

    Write-Host $message -ForegroundColor $color
}

$archiveFile = Join-Path $env:TEMP "softspace_deploy_full.tar.gz"
$tempDir = Join-Path $env:TEMP "softspace_temp_deploy_full"
$remoteScriptFile = Join-Path $env:TEMP "softspace_deploy_remote.sh"
$clientPath = Join-Path $localPath "client"

Write-Step "Deploying Softspace to $remoteHost..." "Cyan"
Write-Step "This script uploads the project and restarts backend + frontend services." "DarkCyan"

if ($skipFrontendBuild -and -not $skipLocalFrontendBuild) {
    $distPath = Join-Path $clientPath "dist"
    if (-not (Test-Path $distPath)) {
        throw "skipFrontendBuild was requested, but client/dist does not exist. Build frontend locally first or remove -skipFrontendBuild."
    }
}

if (-not $skipFrontendBuild -and -not $skipLocalFrontendBuild) {
    Write-Step "Building frontend locally..." "Yellow"
    Push-Location $clientPath
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "local frontend build failed"
        }
    }
    finally {
        Pop-Location
    }
} elseif ($skipLocalFrontendBuild -and -not $skipFrontendBuild) {
    Write-Step "Skipping local frontend build; frontend will be built on the remote host." "Yellow"
}

$clientEnvPath = Join-Path $clientPath ".env.production"
if (Test-Path $clientEnvPath) {
    $clientEnvText = Get-Content $clientEnvPath -Raw
    if ($clientEnvText -notmatch 'VITE_RTC_TURN_URLS=') {
        Write-Step "Warning: client/.env.production does not contain VITE_RTC_TURN_URLS. Frontend build may not use your TURN server." "Yellow"
    }
}

if (Test-Path $archiveFile) {
    Remove-Item $archiveFile -Force
}

if (Test-Path $remoteScriptFile) {
    Remove-Item $remoteScriptFile -Force
}

if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}

New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Step "Copying project files..." "Yellow"
# Exclude environment files so deployed server config is not overwritten.
$null = robocopy $localPath $tempDir /MIR /XD node_modules .git .vscode client\release-buildv3 server\node_modules client\node_modules "server\prisma\dev.db" "server\uploads" /XF *.log dev.db *.tmp .env *.env.*
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
    throw "robocopy failed with exit code $robocopyExit"
}

Write-Step "Creating deploy archive..." "Yellow"
tar -C $tempDir -czf $archiveFile .
if ($LASTEXITCODE -ne 0) {
    throw "tar archive creation failed"
}

Write-Step "Uploading archive to server..." "Yellow"
Write-Step "Password if prompted: $password" "Green"
scp -o StrictHostKeyChecking=no $archiveFile "${remoteUser}@${remoteHost}:/root/deploy-full.tar.gz"
if ($LASTEXITCODE -ne 0) {
    throw "scp upload failed"
}

$skipFrontendBuildFlag = if ($skipFrontendBuild) { "1" } else { "0" }
$remoteBuildFrontendFlag = if ($skipLocalFrontendBuild -and -not $skipFrontendBuild) { "1" } else { "0" }

$remoteScript = @'
#!/bin/bash
set -euo pipefail

REMOTE_PATH='__REMOTE_PATH__'
BACKEND_PM2_NAME='__BACKEND_PM2_NAME__'
SKIP_FRONTEND_BUILD='__SKIP_FRONTEND_BUILD__'
REMOTE_BUILD_FRONTEND='__REMOTE_BUILD_FRONTEND__'

echo '[0/9] Setting up SSL certificates...'
if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing certbot..."
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y certbot python3-certbot-nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y certbot python3-certbot-nginx
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y certbot python3-certbot-nginx
  fi
fi

if [ ! -f /etc/letsencrypt/live/softspace.cc/fullchain.pem ]; then
  echo "Generating SSL certificates for softspace.cc and api.softspace.cc..."
  mkdir -p /var/www/certbot
  certbot certonly --standalone -d softspace.cc -d www.softspace.cc -d api.softspace.cc --email kartheuserjamie@gmail.com --agree-tos --non-interactive || true
fi

echo '[1/9] Preparing deploy directory...'
mkdir -p "$REMOTE_PATH"
cp /root/deploy-full.tar.gz "$REMOTE_PATH/deploy-full.tar.gz"
cd "$REMOTE_PATH"

echo '[2/9] Extracting archive...'
if [ -f "$REMOTE_PATH/server/prisma/dev.db" ]; then
  cp "$REMOTE_PATH/server/prisma/dev.db" "$REMOTE_PATH/server/prisma/dev.db.pre-deploy.$(date +%Y%m%d_%H%M%S)"
fi
tar -xzf deploy-full.tar.gz --exclude='server/prisma/dev.db'

echo '[3/9] Installing backend dependencies...'
cd "$REMOTE_PATH/server"
npm install --workspaces=false

echo '[4/9] Generating Prisma client and syncing schema...'
npx prisma generate

# Production DB was historically synced via db push, so migrate history may be out of sync.
# Clear failed migration state from previous deploy attempts, then sync schema safely.
npx prisma migrate resolve --rolled-back 20260608121000_add_user_badges 2>/dev/null || true
npx prisma db push --skip-generate

echo '[5/9] Restarting backend process...'
if pm2 describe "$BACKEND_PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$BACKEND_PM2_NAME"
else
  pm2 start src/index.js --name "$BACKEND_PM2_NAME"
fi

if [ "$REMOTE_BUILD_FRONTEND" = "1" ]; then
  echo '[6/9] Building frontend on the remote host...'
  cd "$REMOTE_PATH/client"
  npm install
  npm run build
  cd "$REMOTE_PATH"
elif [ "$SKIP_FRONTEND_BUILD" != "1" ]; then
  echo '[6/9] Frontend dist was uploaded from local build.'
else
  echo '[6/9] Skipping frontend build as requested.'
fi

echo '[7/9] Fixing permissions...'
if [ -d "$REMOTE_PATH" ]; then
  chmod 755 "$REMOTE_PATH" || true
fi
if [ -d "$REMOTE_PATH/server" ]; then
  chmod 755 "$REMOTE_PATH/server" || true
fi
mkdir -p "$REMOTE_PATH/server/uploads"
chmod -R 755 "$REMOTE_PATH/server/uploads" || true
if command -v chcon >/dev/null 2>&1; then
  chcon -Rt httpd_sys_content_t "$REMOTE_PATH/server/uploads" || true
fi

if [ -d "$REMOTE_PATH/client/dist" ]; then
  chmod -R 755 "$REMOTE_PATH/client/dist" || true
  if command -v chcon >/dev/null 2>&1; then
    chcon -Rt httpd_sys_content_t "$REMOTE_PATH/client/dist" || true
  fi
fi

# Optional: copy api.softspace.cc nginx config on AlmaLinux/RHEL hosts
if [ -f "$REMOTE_PATH/nginx/conf.d/api.softspace.conf" ] && [ -d /etc/nginx/conf.d ]; then
  cp "$REMOTE_PATH/nginx/conf.d/api.softspace.conf" /etc/nginx/conf.d/api.softspace.conf || true
fi

echo '[8/9] Testing nginx configuration...'
nginx -t || echo "nginx config test failed, continuing anyway..."

echo '[9/9] Reloading frontend service...'
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload nginx || systemctl restart nginx || true
fi

pm2 save || true
echo 'Deploy complete.'
'@

$remoteScript = $remoteScript.Replace('__REMOTE_PATH__', $remotePath)
$remoteScript = $remoteScript.Replace('__BACKEND_PM2_NAME__', $backendPm2Name)
$remoteScript = $remoteScript.Replace('__SKIP_FRONTEND_BUILD__', $skipFrontendBuildFlag)
$remoteScript = $remoteScript.Replace('__REMOTE_BUILD_FRONTEND__', $remoteBuildFrontendFlag)

Set-Content -Path $remoteScriptFile -Value $remoteScript -Encoding ascii

Write-Step "Uploading remote deploy script..." "Yellow"
scp -o StrictHostKeyChecking=no $remoteScriptFile "${remoteUser}@${remoteHost}:/root/softspace_deploy_remote.sh"
if ($LASTEXITCODE -ne 0) {
    throw "scp remote script upload failed"
}

Write-Step "Running remote update and restart steps..." "Yellow"
ssh -tt -o StrictHostKeyChecking=no ${remoteUser}@${remoteHost} "chmod +x /root/softspace_deploy_remote.sh && bash /root/softspace_deploy_remote.sh"
if ($LASTEXITCODE -ne 0) {
    throw "remote deploy failed"
}

Write-Step "Cleaning up temp files..." "Yellow"
if (Test-Path $archiveFile) {
    Remove-Item $archiveFile -Force
}
if (Test-Path $remoteScriptFile) {
    Remove-Item $remoteScriptFile -Force
}
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}

Write-Step "Deployment complete. Backend and frontend were refreshed." "Green"
