#!/bin/bash

# Farben für bessere Lesbarkeit
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Basis-Verzeichnis (wird automatisch erkannt, da das Skript im Root-Ordner liegt)
BASE_DIR=$(pwd)
SERVER_DIR="$BASE_DIR/server"
CLIENT_DIR="$BASE_DIR/client"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}    Softspace.cc - Auto Update Script     ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# 1. Server/Backend updaten
echo -e "${GREEN}[1/5] Updating Backend (Server)...${NC}"

# Clean up local node_modules to prevent conflict / Windows-compiled binaries
cd "$SERVER_DIR"
rm -rf node_modules package-lock.json
cd "$CLIENT_DIR"
rm -rf node_modules package-lock.json
cd "$BASE_DIR"
rm -rf node_modules package-lock.json

echo "Installing fresh npm dependencies for all workspaces..."
npm install

cd "$SERVER_DIR"
echo "Generating Prisma Client..."
../node_modules/.bin/prisma generate

echo "Pushing database schema changes..."
../node_modules/.bin/prisma db push

echo "Restarting PM2 backend process..."
pm2 restart softspace-backend || echo -e "${RED}Warning: PM2 process 'softspace-backend' not found or failed to restart.${NC}"

echo ""

# 2. Frontend updaten
echo -e "${GREEN}[2/5] Updating Frontend (Client)...${NC}"
cd "$CLIENT_DIR"

echo "Building React App (Vite)..."
npm run build

echo ""

# 3. SELinux Berechtigungen fixen (WICHTIG FÜR ALMALINUX)
echo -e "${GREEN}[3/5] Fixing SELinux permissions for Nginx...${NC}"
# Nur ausführen wenn chcon existiert (also wenn wir wirklich auf Linux sind)
if command -v chcon &> /dev/null; then
    sudo chcon -Rt httpd_sys_content_t "$CLIENT_DIR/dist"
    echo "SELinux permissions updated."
else
    echo "chcon command not found. Skipping SELinux fix (normal if not on AlmaLinux/RHEL)."
fi

echo ""

# 4. Normale Linux Berechtigungen fixen
echo -e "${GREEN}[4/5] Fixing standard Linux file permissions...${NC}"
sudo chmod -R 755 "$CLIENT_DIR/dist"
# Falls der Uploads-Ordner im Backend existiert, Rechte setzen
if [ -d "$SERVER_DIR/uploads" ]; then
    sudo chmod -R 755 "$SERVER_DIR/uploads"
fi

echo ""

# 5. Abschluss
echo -e "${GREEN}[5/5] Done!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}Softspace was successfully updated and deployed!${NC}"
echo -e "You can check the backend logs using: ${BLUE}pm2 logs softspace-backend${NC}"
echo ""