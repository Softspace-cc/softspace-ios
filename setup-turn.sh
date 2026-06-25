#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
turn_conf_path="/etc/turnserver.conf"

function echo_error() {
  echo "[ERROR] $*" >&2
}

function echo_info() {
  echo "[INFO] $*"
}

function prompt() {
  local label="$1"
  local default="$2"
  local value=""
  read -r -p "$label${default:+ [$default]}: " value
  if [[ -z "$value" ]]; then
    echo "$default"
  else
    echo "$value"
  fi
}

project_root="${PROJECT_ROOT:-$repo_root}"

if [[ ! -d "$project_root/client" ]]; then
  echo_info "Could not find client directory at $project_root/client"
  project_root="$(prompt 'Pfad zum Softspace-Projektordner auf diesem Server' '')"
  if [[ -z "$project_root" ]]; then
    echo_error "Projektordner ist erforderlich"
    exit 1
  fi
  project_root="$(cd "$project_root" && pwd)"
fi

client_env="$project_root/client/.env.production"
client_local_env="$project_root/client/.env.local"

function install_coturn() {
  if command -v turnserver >/dev/null 2>&1; then
    echo_info "coturn is already installed"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    echo_info "Installing coturn via apt-get"
    sudo apt-get update
    sudo apt-get install -y coturn
  elif command -v yum >/dev/null 2>&1; then
    echo_info "Installing coturn via yum"
    sudo yum install -y coturn
  elif command -v dnf >/dev/null 2>&1; then
    echo_info "Installing coturn via dnf"
    sudo dnf install -y coturn
  elif command -v pacman >/dev/null 2>&1; then
    echo_info "Installing coturn via pacman"
    sudo pacman -Sy --noconfirm coturn
  else
    echo_error "Unable to install coturn automatically. Please install it manually and rerun this script."
    exit 1
  fi
}

function write_turn_config() {
  local host="$1"
  local user="$2"
  local pass="$3"
  local realm="$4"
  local public_ip="$5"
  local listen_ip="$6"
  local use_tls="$7"
  local cert_path="$8"
  local key_path="$9"

  echo_info "Writing TURN configuration to $turn_conf_path"

  if [[ -z "$listen_ip" ]]; then
    listen_ip="$public_ip"
  fi

  sudo tee "$turn_conf_path" >/dev/null <<EOF
listening-port=3478
realm=$realm
listening-ip=$listen_ip
external-ip=$public_ip
lt-cred-mech
user=$user:$pass
fingerprint
no-stdout-log
simple-log

# Optional secure TURN (TLS) support
EOF

  if [[ "$use_tls" == "yes" ]]; then
    if [[ -z "$cert_path" || -z "$key_path" ]]; then
      echo_error "TLS requested but cert/key path is missing. Skipping TLS configuration."
    else
      sudo tee -a "$turn_conf_path" >/dev/null <<EOF
# TLS listener
tls-listening-port=5349
cert=$cert_path
pkey=$key_path
EOF
    fi
  fi

  echo_info "TURN config created"
}

function enable_turn_service() {
  if command -v systemctl >/dev/null 2>&1; then
    echo_info "Enabling and starting coturn service"
    sudo systemctl enable coturn
    sudo systemctl restart coturn
  else
    echo_info "systemctl not available; please start coturn manually"
  fi
}

function update_client_env() {
  local host="$1"
  local user="$2"
  local pass="$3"
  local api_url="$4"
  local socket_url="$5"
  local use_tls="$6"

  echo_info "Updating client environment file: $client_env"

  local turn_urls="turn:$host:3478?transport=udp,turn:$host:3478?transport=tcp"
  if [[ "$use_tls" == "yes" ]]; then
    turn_urls=turn:$host:3478?transport=udp,turn:$host:3478?transport=tcp,turns:$host:5349?transport=tcp
  fi

  cat > "$client_env" <<EOF
VITE_API_URL="$api_url"
VITE_SOCKET_URL="$socket_url"
VITE_RTC_STUN_URLS="stun:$host:3478"
VITE_RTC_TURN_URLS="$turn_urls"
VITE_RTC_TURN_USERNAME="$user"
VITE_RTC_TURN_CREDENTIAL="$pass"
EOF

  echo_info "Client production env updated"

  if [[ ! -f "$client_local_env" ]]; then
    echo_info "Creating client local env copy: $client_local_env"
    cp "$client_env" "$client_local_env"
  fi
}

function check_required() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo_error "$name is required"
    exit 1
  fi
}

# Read existing values from environment if provided, otherwise use production defaults.
TURN_HOST="${TURN_HOST:-217.160.148.112}"
TURN_USER="${TURN_USER:-jamie}"
TURN_PASSWORD="${TURN_PASSWORD:-J4m!e2025#Go}"
TURN_REALM="${TURN_REALM:-softspace.cc}"
TURN_PUBLIC_IP="${TURN_PUBLIC_IP:-$TURN_HOST}"
TURN_LISTEN_IP="${TURN_LISTEN_IP:-$TURN_PUBLIC_IP}"
TURN_USE_TLS="${TURN_USE_TLS:-no}"
TURN_TLS_CERT="${TURN_TLS_CERT:-}"
TURN_TLS_KEY="${TURN_TLS_KEY:-}"
API_URL="${API_URL:-https://softspace.cc}"
SOCKET_URL="${SOCKET_URL:-https://softspace.cc}"

if [[ -z "$TURN_HOST" ]]; then
  TURN_HOST="$(prompt 'TURN Hostname oder IP' '')"
fi
if [[ -z "$TURN_USER" ]]; then
  TURN_USER="$(prompt 'TURN Benutzername' '')"
fi
if [[ -z "$TURN_PASSWORD" ]]; then
  TURN_PASSWORD="$(prompt 'TURN Passwort' '')"
fi
if [[ -z "$TURN_PUBLIC_IP" ]]; then
  TURN_PUBLIC_IP="$(prompt 'Öffentliche IP oder Hostname für TURN/Außenadresse' "$TURN_HOST")"
fi
if [[ -z "$TURN_LISTEN_IP" ]]; then
  TURN_LISTEN_IP="$(prompt 'Lokale Listening-IP (leer = öffentliche IP)' "$TURN_PUBLIC_IP")"
fi
if [[ -z "$TURN_USE_TLS" ]]; then
  TURN_USE_TLS="$(prompt 'TLS/secure TURN verwenden? (yes/no)' 'no')"
fi
if [[ "$TURN_USE_TLS" == "yes" ]]; then
  if [[ -z "$TURN_TLS_CERT" ]]; then
    TURN_TLS_CERT="$(prompt 'Pfad zum TLS-Zertifikat (.crt)' '/etc/letsencrypt/live/yourdomain/fullchain.pem')"
  fi
  if [[ -z "$TURN_TLS_KEY" ]]; then
    TURN_TLS_KEY="$(prompt 'Pfad zum TLS-Schlüssel (.key)' '/etc/letsencrypt/live/yourdomain/privkey.pem')"
  fi
fi
if [[ -z "$API_URL" ]]; then
  API_URL="$(prompt 'VITE_API_URL' 'https://softspace.cc')"
fi
if [[ -z "$SOCKET_URL" ]]; then
  SOCKET_URL="$(prompt 'VITE_SOCKET_URL' 'https://softspace.cc')"
fi

check_required "TURN_HOST" "$TURN_HOST"
check_required "TURN_USER" "$TURN_USER"
check_required "TURN_PASSWORD" "$TURN_PASSWORD"
check_required "TURN_PUBLIC_IP" "$TURN_PUBLIC_IP"

install_coturn
write_turn_config "$TURN_HOST" "$TURN_USER" "$TURN_PASSWORD" "$TURN_REALM" "$TURN_PUBLIC_IP" "$TURN_LISTEN_IP" "$TURN_USE_TLS" "$TURN_TLS_CERT" "$TURN_TLS_KEY"
enable_turn_service
update_client_env "$TURN_HOST" "$TURN_USER" "$TURN_PASSWORD" "$API_URL" "$SOCKET_URL" "$TURN_USE_TLS"

echo_info "Setup complete."
echo_info "Please verify the TURN server is reachable and rebuild the client with 'npm run build' in ./client if required."
