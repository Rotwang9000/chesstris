#!/usr/bin/env bash
#
# deploy-tetches-cutover.sh — One-shot sudo script that does the
# entire tetches.com cutover on the production host.
#
# Run as root (or via sudo):
#     sudo bash scripts/deploy-tetches-cutover.sh
#
# Idempotent enough to re-run if interrupted. Each step is guarded
# by a check; safe to repeat. The companion runbook is
# `docs/tetches-cutover.md` — this script just bundles the
# commands into one batch so you don't have to babysit each one.
#
# Steps:
#   1. Create /var/www/tetches.{live,staging} and trigger dir
#   2. Mirror the repo into the deploy tree (uses rsync from the
#      developer checkout)
#   3. npm ci --omit=dev in the deploy tree
#   4. Install pm2 globally if missing
#   5. Drop a bootstrap HTTP-only nginx config so certbot can run
#   6. Reload nginx + run certbot
#   7. Swap in the hardened repo nginx config and reload
#   8. Start the PM2 production process on port 3666
#
# Verify with the manual probes at the end.

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
	echo "This script must be run as root (sudo bash $0)."
	exit 1
fi

# ── Configuration ────────────────────────────────────────────────────────────
REPO_DIR="/home/rotwang/chesstris"
DEPLOY_USER="rotwang"
DEPLOY_GROUP="rotwang"

LIVE_DIR="/var/www/tetches.live"
STAGING_DIR="/var/www/tetches.staging"
TRIGGER_DIR="/var/www/.deploy-triggers"

NGINX_SITES_AVAIL="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
NGINX_BOOTSTRAP_FILE="${NGINX_SITES_AVAIL}/tetches.com"
NGINX_HARDENED_SRC="${REPO_DIR}/ci/nginx-production.conf"

CERTBOT_EMAIL="${CERTBOT_EMAIL:-rotwang@gmail.com}"
DOMAIN="tetches.com"
WWW_DOMAIN="www.tetches.com"

LOG_TAG="[deploy-cutover]"
log() { echo "${LOG_TAG} $*"; }

# ── 1. Filesystem layout ────────────────────────────────────────────────────
log "1/8 Ensuring deploy directories exist"
mkdir -p "${LIVE_DIR}" "${STAGING_DIR}" "${TRIGGER_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_GROUP}" "${LIVE_DIR}" "${STAGING_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_GROUP}" "${TRIGGER_DIR}"

# ── 2. Sync the repo into /var/www/tetches.live ─────────────────────────────
log "2/8 Syncing ${REPO_DIR} -> ${LIVE_DIR}"
sudo -u "${DEPLOY_USER}" rsync -a --delete \
	--exclude='node_modules' \
	--exclude='.git' \
	--exclude='.env' \
	--exclude='.env.local' \
	--exclude='data/' \
	--exclude='logs/' \
	--exclude='coverage/' \
	--exclude='tests/' \
	--exclude='*.test.js' \
	--exclude='.cursor/' \
	"${REPO_DIR}/" "${LIVE_DIR}/"

# Copy the developer .env (which has Sentry DSN, SendGrid, Auth0
# keys etc.) explicitly because the rsync above excludes it. We
# rsync separately so the file's mode is set tight before anything
# else can read it.
if [ -f "${REPO_DIR}/.env" ]; then
	install -m 600 -o "${DEPLOY_USER}" -g "${DEPLOY_GROUP}" \
		"${REPO_DIR}/.env" "${LIVE_DIR}/.env"
	log "2/8 Copied .env (mode 600) into ${LIVE_DIR}/.env"
else
	log "2/8 WARN: No .env in ${REPO_DIR} — server will start without secrets."
fi

# Persist a small marker so we know which commit is live.
sudo -u "${DEPLOY_USER}" bash -c "cd '${REPO_DIR}' && git rev-parse HEAD > '${LIVE_DIR}/REVISION' 2>/dev/null || true"

# ── 3. Production dependencies ───────────────────────────────────────────────
log "3/8 npm ci --omit=dev in ${LIVE_DIR}"
sudo -u "${DEPLOY_USER}" bash -c "
	cd '${LIVE_DIR}' &&
	export PATH=\$PATH:/usr/local/bin &&
	npm ci --omit=dev --prefer-offline --no-audit --no-fund || npm install --omit=dev
"

# Make sure the data directory exists + writable for the deploy user.
mkdir -p "${LIVE_DIR}/data" "${LIVE_DIR}/data/backups" "${LIVE_DIR}/logs"
chown -R "${DEPLOY_USER}:${DEPLOY_GROUP}" "${LIVE_DIR}/data" "${LIVE_DIR}/logs"

# ── 4. PM2 globally ─────────────────────────────────────────────────────────
log "4/8 Ensuring pm2 is installed globally"
if ! command -v pm2 >/dev/null 2>&1; then
	# Use whichever node is on root's PATH.
	npm install -g pm2 || {
		log "WARN: pm2 install via npm -g failed; will fall back to npx pm2."
	}
fi

# ── 5. Bootstrap nginx config (HTTP-only for the ACME handshake) ────────────
log "5/8 Writing bootstrap nginx config -> ${NGINX_BOOTSTRAP_FILE}"
mkdir -p /var/www/certbot

cat > "${NGINX_BOOTSTRAP_FILE}" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Proxy everything else to Node so the site is reachable while
    # certbot is doing its thing. certbot --nginx will edit this
    # block to add the HTTPS redirect once the cert is issued.
    location / {
        proxy_pass http://127.0.0.1:3666;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
NGINX

# Remove any stale shaktris.com enabled symlinks so they don't bind
# port 80 ahead of us. The sites-available files stay around for
# rollback, but the symlinks go.
log "5/8 Disabling legacy shaktris.com symlinks (if any)"
rm -f "${NGINX_SITES_ENABLED}/shaktris.com.conf" \
      "${NGINX_SITES_ENABLED}/staging.shaktris.com.conf" || true

ln -sf "${NGINX_BOOTSTRAP_FILE}" "${NGINX_SITES_ENABLED}/tetches.com"

log "5/8 Testing + reloading nginx"
nginx -t
systemctl reload nginx

# ── 6. PM2 start (before certbot — certbot needs the port up) ───────────────
log "6/8 Starting tetches-production on port 3666"
PM2_BIN="$(command -v pm2 || true)"
if [ -z "${PM2_BIN}" ]; then
	PM2_BIN="$(sudo -u "${DEPLOY_USER}" bash -c 'command -v pm2' || true)"
fi
if [ -z "${PM2_BIN}" ]; then
	# Last-resort: use npx
	PM2_BIN="$(command -v npx)"
	PM2_CMD="npx pm2"
else
	PM2_CMD="${PM2_BIN}"
fi

sudo -u "${DEPLOY_USER}" bash -c "
	cd '${LIVE_DIR}' &&
	${PM2_CMD} delete tetches-production >/dev/null 2>&1 || true &&
	${PM2_CMD} start ecosystem.config.cjs --only tetches-production &&
	${PM2_CMD} save || true
"

# Sanity-check the listener.
sleep 2
if ! ss -ltnp 2>/dev/null | grep -q ':3666'; then
	log "WARN: Nothing listening on :3666 yet. Check ${LIVE_DIR}/logs/err.log"
fi

# ── 7. certbot ──────────────────────────────────────────────────────────────
log "7/8 Issuing TLS cert via certbot for ${DOMAIN} + ${WWW_DOMAIN}"
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
	certbot --nginx \
		-d "${DOMAIN}" \
		-d "${WWW_DOMAIN}" \
		--redirect \
		--non-interactive \
		--agree-tos \
		-m "${CERTBOT_EMAIL}"
else
	log "Cert already exists for ${DOMAIN}; skipping certbot issuance."
	# Make sure renewal is up to date though.
	certbot renew --dry-run || true
fi

# Generate dhparams if missing (used by the hardened nginx config).
if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
	log "7/8 Generating /etc/letsencrypt/ssl-dhparams.pem (one-off, ~2 min)"
	openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
fi

# ── 8. Swap to hardened nginx config ────────────────────────────────────────
log "8/8 Installing hardened nginx config from repo"
if [ -f "${NGINX_HARDENED_SRC}" ]; then
	cp "${NGINX_HARDENED_SRC}" "${NGINX_BOOTSTRAP_FILE}"
	# The hardened config references ssl_dhparam; if it's missing we
	# already created it above.
	nginx -t
	systemctl reload nginx
else
	log "WARN: ${NGINX_HARDENED_SRC} not found; leaving bootstrap config in place."
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo
echo "==========================================="
echo " ${LOG_TAG} Cutover complete."
echo "==========================================="
echo " Smoke tests (run from your local machine):"
echo "   curl -sI https://${DOMAIN}      | head -5"
echo "   curl -sI https://${WWW_DOMAIN}  | head -5"
echo "   curl -s  https://${DOMAIN}/api/health"
echo
echo " On the server:"
echo "   ${PM2_CMD} list"
echo "   ${PM2_CMD} logs tetches-production --lines 50"
echo "   ss -ltnp | grep ':3666'"
echo
echo " If anything is unhappy, rollback per docs/tetches-cutover.md §Rollback."
