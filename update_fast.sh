#!/bin/bash

# Farben für bessere Lesbarkeit
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_DIR=$(pwd)
SERVER_DIR="$BASE_DIR/server"
CLIENT_DIR="$BASE_DIR/client"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}   Softspace.cc - Fast Update Script      ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# 1. Server/Backend updaten
echo -e "${GREEN}[1/3] Updating Backend (Server)...${NC}"
cd "$SERVER_DIR" || { echo -e "${RED}Error: Server directory not found!${NC}"; exit 1; }

echo "Generating Prisma Client..."
../node_modules/.bin/prisma generate || echo "Prisma generate skipped/failed (normal if no schema changes)."

echo "Restarting PM2 backend processes..."
pm2 restart softspace-backend softspace-backend-backup1 softspace-backend-backup2 || echo -e "${RED}Warning: PM2 processes failed to restart.${NC}"

echo ""

# 2. Frontend updaten
echo -e "${GREEN}[2/3] Building React App (Vite)...${NC}"
cd "$CLIENT_DIR" || { echo -e "${RED}Error: Client directory not found!${NC}"; exit 1; }

echo "Building React App (Vite)..."
npm run build

echo ""

# 3. SELinux & Berechtigungen fixen
echo -e "${GREEN}[3/3] Fixing permissions...${NC}"
if command -v chcon &> /dev/null; then
    sudo chcon -Rt httpd_sys_content_t "$CLIENT_DIR/dist"
    echo "SELinux permissions updated."
fi

sudo chmod -R 755 "$CLIENT_DIR/dist"
if [ -d "$SERVER_DIR/uploads" ]; then
    sudo chmod -R 755 "$SERVER_DIR/uploads"
fi

echo ""
echo -e "${GREEN}Done! Fast deploy completed successfully!${NC}"
echo -e "${BLUE}==========================================${NC}"
