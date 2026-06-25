param (
    [string]$remoteUser = "root",
    [string]$remoteHost = "217.160.148.112",
    [string]$remotePath = "/var/www/softspace",
    [string]$localPath = "Q:\softsapce app maybe",
    [string]$password = "zynFnGcW6r0L"
)

Write-Host "Deploying Softspace to $remoteHost..." -ForegroundColor Cyan

# 1. Zip the local directory (excluding node_modules, .git, etc.)
Write-Host "Compressing files..." -ForegroundColor Yellow
$zipFile = "$env:TEMP\softspace_deploy.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }

$tempDir = "$env:TEMP\softspace_temp_deploy"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Host "Copying files to temp directory..." -ForegroundColor Yellow
robocopy $localPath $tempDir /MIR /XD node_modules .git .vscode /XF *.zip *.log dev.db .env .env.local .env.production .env.*.local /NFL /NDL /NJH /NJS /nc /ns /np

Write-Host "Zipping files..." -ForegroundColor Yellow
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force

Write-Host "Uploading to server (This will prompt for password: $password)..." -ForegroundColor Yellow
Write-Host "PASSWORD IS: $password" -ForegroundColor Green

# Using scp
scp -o StrictHostKeyChecking=no $zipFile "${remoteUser}@${remoteHost}:/root/deploy.zip"

Write-Host "Extracting and updating on server..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no ${remoteUser}@${remoteHost} "mkdir -p ${remotePath} && cp /root/deploy.zip ${remotePath}/ && cd ${remotePath} && unzip -o deploy.zip && chmod +x update.sh && ./update.sh"

Write-Host "Deployment Complete!" -ForegroundColor Green
