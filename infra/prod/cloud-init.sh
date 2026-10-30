#!/bin/sh
# First-boot setup for the Lightsail instance (passed as user_data in main.tf).
# Runs once, as root, when the instance is created. Changing this file makes Terraform
# replace the instance, so keep app-specific config (systemd unit, Caddyfile) in deploy/.
# Log on the server: /var/log/cloud-init-output.log
#
# POSIX sh only, no bash: Lightsail prepends its own #!/bin/sh script to user_data, so this
# runs under dash whatever the first line says (no pipefail, [[ ]], arrays, ...).
set -eux
export DEBIAN_FRONTEND=noninteractive

# 1. Swap: the nano plan has ~412 MB of RAM. Done first so apt has room too.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Use swap only when RAM is nearly full, not as a cache.
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -p /etc/sysctl.d/99-swappiness.conf

apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https sqlite3
install -d -m 755 /etc/apt/keyrings

# 2. Node 22 from NodeSource (Ubuntu's own package is older than the 22.12 node:sqlite needs).
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' \
  > /etc/apt/sources.list.d/nodesource.list

# 3. Caddy from its official repository (reverse proxy + automatic HTTPS).
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  > /etc/apt/sources.list.d/caddy-stable.list

apt-get update
apt-get install -y nodejs caddy

# 4. System user that runs the app: no password, no login shell.
if ! id fpl > /dev/null 2>&1; then
  useradd --system --home-dir /var/lib/fantasy-epl --shell /usr/sbin/nologin fpl
fi

# 5. Folders: releases (written by deploys as ubuntu), database (fpl only), env file (root only).
install -d -o ubuntu -g ubuntu -m 755 /opt/fantasy-epl /opt/fantasy-epl/releases
install -d -o fpl -g fpl -m 750 /var/lib/fantasy-epl
install -d -o root -g root -m 700 /etc/fantasy-epl
