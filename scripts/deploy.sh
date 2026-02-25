#!/usr/bin/env bash
#
# deploy.sh — Deploy Shaktris to staging or production.
#
# Usage:
#   bash scripts/deploy.sh staging
#   bash scripts/deploy.sh production
#
set -euo pipefail

ENVIRONMENT="${1:-}"

case "$ENVIRONMENT" in
	staging)
		DEPLOY_DIR="/var/www/shaktris.staging"
		PM2_NAME="shaktris-staging"
		PORT=3661
		;;
	production)
		DEPLOY_DIR="/var/www/shaktris.live"
		PM2_NAME="shaktris-production"
		PORT=3666
		;;
	*)
		echo "Usage: $0 {staging|production}"
		exit 1
		;;
esac

echo "=== Deploying to ${ENVIRONMENT} ==="
echo "    Target: ${DEPLOY_DIR}"
echo "    Port:   ${PORT}"
echo ""

if [ ! -d "$DEPLOY_DIR" ]; then
	echo "ERROR: Deploy directory ${DEPLOY_DIR} does not exist."
	exit 1
fi

mkdir -p "${DEPLOY_DIR}/logs"

# Sync files (exclude dev-only artefacts)
echo "--- Syncing files ---"
rsync -a --delete \
	--exclude='node_modules' \
	--exclude='.git' \
	--exclude='.env' \
	--exclude='.env.local' \
	--exclude='*.test.js' \
	--exclude='tests/' \
	--exclude='ci/' \
	--exclude='Jenkinsfile' \
	--exclude='docker-compose.jenkins.yml' \
	--exclude='ecosystem.config.cjs' \
	--exclude='jest.config.js' \
	--exclude='jest.setup.js' \
	--exclude='babel.config.json' \
	--exclude='.cursor/' \
	--exclude='logs/' \
	./ "${DEPLOY_DIR}/"

# Copy the ecosystem config (needed by PM2 on the host)
cp ecosystem.config.cjs "${DEPLOY_DIR}/ecosystem.config.cjs" 2>/dev/null || true

# Install production dependencies in the deploy dir
echo "--- Installing production dependencies ---"
cd "${DEPLOY_DIR}"
npm ci --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev

# Restart the process — try PM2 directly first, fall back to trigger file
echo "--- Restarting ${PM2_NAME} ---"
if command -v pm2 &>/dev/null; then
	_pm2_on_host=true
	# Check if we can actually talk to a PM2 daemon
	if pm2 ping &>/dev/null 2>&1; then
		if pm2 describe "$PM2_NAME" &>/dev/null; then
			pm2 restart "$PM2_NAME" --update-env
		else
			pm2 start "${DEPLOY_DIR}/ecosystem.config.cjs" --only "$PM2_NAME"
		fi
		pm2 save
		echo "PM2 restarted ${PM2_NAME} directly"
		_pm2_on_host=false
	fi

	if [ "$_pm2_on_host" = true ]; then
		echo "PM2 daemon not reachable (likely inside Docker)"
		echo "Writing deploy trigger for host watcher..."
		_write_trigger=true
	fi
else
	echo "PM2 not found, writing deploy trigger for host watcher..."
	_write_trigger=true
fi

# Write a trigger file so the host's cron/watcher can restart PM2
if [ "${_write_trigger:-false}" = true ]; then
	TRIGGER_DIR="/var/www/.deploy-triggers"
	mkdir -p "$TRIGGER_DIR"
	echo "${ENVIRONMENT}|${PM2_NAME}|$(date -Iseconds)" > "${TRIGGER_DIR}/${ENVIRONMENT}"
	echo "Trigger written: ${TRIGGER_DIR}/${ENVIRONMENT}"
fi

echo ""
echo "=== ${ENVIRONMENT} deployment complete ==="
