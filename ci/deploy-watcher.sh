#!/usr/bin/env bash
#
# deploy-watcher.sh — Runs on the HOST via cron.
# Watches /var/www/.deploy-triggers/ for trigger files written by Jenkins
# and restarts the corresponding PM2 process.
#
# Cron entry (every 30 seconds via two cron lines):
#   * * * * * /opt/shaktris/deploy-watcher.sh >> /var/log/shaktris-deploy.log 2>&1
#   * * * * * sleep 30 && /opt/shaktris/deploy-watcher.sh >> /var/log/shaktris-deploy.log 2>&1
#
set -euo pipefail

TRIGGER_DIR="/var/www/.deploy-triggers"

if [ ! -d "$TRIGGER_DIR" ]; then
	exit 0
fi

for TRIGGER_FILE in "$TRIGGER_DIR"/*; do
	[ -f "$TRIGGER_FILE" ] || continue

	CONTENT=$(cat "$TRIGGER_FILE")
	ENV_NAME=$(echo "$CONTENT" | cut -d'|' -f1)
	PM2_NAME=$(echo "$CONTENT" | cut -d'|' -f2)
	TIMESTAMP=$(echo "$CONTENT" | cut -d'|' -f3)

	echo "[$(date -Iseconds)] Processing trigger: ${ENV_NAME} (${PM2_NAME}) from ${TIMESTAMP}"

	DEPLOY_DIR="/var/www/shaktris.${ENV_NAME}"
	if [ "$ENV_NAME" = "production" ]; then
		DEPLOY_DIR="/var/www/shaktris.live"
	fi

	if command -v pm2 &>/dev/null; then
		if pm2 describe "$PM2_NAME" &>/dev/null 2>&1; then
			pm2 restart "$PM2_NAME" --update-env
			echo "  Restarted ${PM2_NAME}"
		else
			if [ -f "${DEPLOY_DIR}/ecosystem.config.cjs" ]; then
				pm2 start "${DEPLOY_DIR}/ecosystem.config.cjs" --only "$PM2_NAME"
				echo "  Started ${PM2_NAME} from ecosystem config"
			else
				echo "  ERROR: No ecosystem config found at ${DEPLOY_DIR}/ecosystem.config.cjs"
			fi
		fi
		pm2 save
	else
		echo "  ERROR: PM2 not found"
	fi

	rm -f "$TRIGGER_FILE"
	echo "  Trigger consumed"
done
