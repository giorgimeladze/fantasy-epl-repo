#!/bin/bash
# Activates a release on the server. Run as `ubuntu` (passwordless sudo) after the tarball
# has been unpacked into /opt/fantasy-epl/releases/<sha>/:
#   /opt/fantasy-epl/releases/<sha>/deploy/release.sh <sha> <domain> [new-env-file]
# Installs the systemd unit and Caddyfile when they changed, points `current` at the release,
# restarts the app and checks /api/health. Unhealthy → back to the previous release, exit 1.
# Without [new-env-file] the env file (/etc/fantasy-epl/env) is left as it is. With it (the
# deploy workflow passes one built from GitHub secrets), the file replaces the env file, the
# old one is kept as env.prev, and a rollback puts the old one back too.
set -euo pipefail

SHA=${1:?usage: release.sh <sha> <domain> [new-env-file]}
DOMAIN=${2:?usage: release.sh <sha> <domain> [new-env-file]}
NEW_ENV=${3:-}
BASE=/opt/fantasy-epl
RELEASE=$BASE/releases/$SHA
ENV_FILE=/etc/fantasy-epl/env
HEALTH_URL=http://127.0.0.1:3001/api/health
KEEP=3 # releases kept for rolling back by hand

log() { echo "==> $*"; }

caddyfile=$(mktemp)
trap 'rm -f "$caddyfile" ${NEW_ENV:+"$NEW_ENV"}' EXIT

[ -f "$RELEASE/app/server/dist/server.js" ] || { echo "No release at $RELEASE" >&2; exit 1; }
touch "$RELEASE" # newest first when pruning

# 0. Env file (only when a new one is given); the old one stays as env.prev for rollback.
env_changed=false
if [ -n "$NEW_ENV" ]; then
  [ -f "$NEW_ENV" ] || { echo "No env file at $NEW_ENV" >&2; exit 1; }
  if ! sudo cmp -s "$NEW_ENV" "$ENV_FILE"; then
    log "Installing new env file"
    if sudo test -f "$ENV_FILE"; then sudo cp -p "$ENV_FILE" "$ENV_FILE.prev"; fi
    sudo install -m 600 -o root -g root "$NEW_ENV" "$ENV_FILE"
    env_changed=true
  fi
fi
sudo test -f "$ENV_FILE" || { echo "Missing $ENV_FILE" >&2; exit 1; }

# 1. systemd unit
if ! cmp -s "$RELEASE/deploy/fantasy-epl.service" /etc/systemd/system/fantasy-epl.service; then
  log "Installing systemd unit"
  sudo install -m 644 "$RELEASE/deploy/fantasy-epl.service" /etc/systemd/system/fantasy-epl.service
  sudo systemctl daemon-reload
fi
sudo systemctl enable --quiet fantasy-epl

# 2. Caddyfile, with the domain filled in; validated before Caddy sees it.
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/" "$RELEASE/deploy/Caddyfile" > "$caddyfile"
if ! cmp -s "$caddyfile" /etc/caddy/Caddyfile; then
  log "Installing Caddyfile for $DOMAIN"
  caddy validate --adapter caddyfile --config "$caddyfile" > /dev/null 2>&1 \
    || { caddy validate --adapter caddyfile --config "$caddyfile"; exit 1; }
  sudo install -m 644 "$caddyfile" /etc/caddy/Caddyfile
  sudo systemctl reload caddy
fi

# 3. Switch `current` (rename is atomic: it is never missing) and restart.
previous=$(readlink -f "$BASE/current" || true)
activate() {
  ln -sfn "$1" "$BASE/current.new"
  mv -Tf "$BASE/current.new" "$BASE/current"
  sudo systemctl restart fantasy-epl
}
healthy() {
  for _ in $(seq 1 20); do
    curl -fsS --max-time 2 "$HEALTH_URL" > /dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

log "Activating $SHA"
activate "$RELEASE"

# 4. Health check; roll back on failure (previous release and previous env file).
if ! healthy; then
  echo "!! $SHA is unhealthy. Last log lines:" >&2
  sudo journalctl -u fantasy-epl -n 40 --no-pager >&2
  if $env_changed && sudo test -f "$ENV_FILE.prev"; then
    log "Restoring previous env file"
    sudo cp -p "$ENV_FILE.prev" "$ENV_FILE"
  fi
  target=$RELEASE # a re-deploy of the same sha only rolls back the env file
  if [ -n "$previous" ] && [ -d "$previous" ]; then target=$previous; fi
  if [ "$target" != "$RELEASE" ] || $env_changed; then
    log "Rolling back to $(basename "$target")"
    activate "$target"
    healthy && log "Rollback healthy" || echo "!! Rollback is unhealthy too" >&2
  fi
  exit 1
fi
log "$SHA is live"

# 5. Keep the newest $KEEP releases (never the active one).
active=$(readlink -f "$BASE/current")
ls -1t "$BASE/releases" | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$BASE/releases/$old" = "$active" ] || { log "Removing old release $old"; rm -rf "${BASE:?}/releases/$old"; }
done
