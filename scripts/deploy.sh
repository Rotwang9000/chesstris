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

# Ensure the target directory exists
if [ ! -d "$DEPLOY_DIR" ]; then
	echo "ERROR: Deploy directory ${DEPLOY_DIR} does not exist."
	echo "Create it first:  sudo mkdir -p ${DEPLOY_DIR} && sudo chmod 777 ${DEPLOY_DIR}"
	exit 1
fi

# Create logs directory
mkdir -p "${DEPLOY_DIR}/logs"

# Sync files (exclude dev-only files, .git, node_modules)
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
	--exclude='ecosystem.config.cjs' \
	--exclude='jest.config.js' \
	--exclude='jest.setup.js' \
	--exclude='babel.config.json' \
	--exclude='.cursor/' \
	--exclude='logs/' \
	./ "${DEPLOY_DIR}/"

# Install production dependencies
echo "--- Installing dependencies ---"
cd "${DEPLOY_DIR}"
npm ci --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev

# Restart the process via PM2
echo "--- Restarting ${PM2_NAME} ---"
if command -v pm2 &>/dev/null; then
	# Check if the process already exists
	if pm2 describe "$PM2_NAME" &>/dev/null; then
		pm2 restart "$PM2_NAME" --update-env
	else
		# Start using the ecosystem config
		pm2 start "${DEPLOY_DIR}/ecosystem.config.cjs" --only "$PM2_NAME"
	fi
	pm2 save
	echo ""
	pm2 show "$PM2_NAME"
else
	echo "WARNING: PM2 not found. Install it:  npm install -g pm2"
	echo "Starting with plain node for now..."
	# Kill any existing process on this port
	fuser -k "${PORT}/tcp" 2>/dev/null || true
	sleep 1
	PORT="${PORT}" nohup node server.js > "${DEPLOY_DIR}/logs/out.log" 2> "${DEPLOY_DIR}/logs/err.log" &
	echo "Started on PID $! (port ${PORT})"
fi

echo ""
echo "=== ${ENVIRONMENT} deployment complete ==="
