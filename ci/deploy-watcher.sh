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

PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"
TRIGGER_DIR="/var/www/.deploy-triggers"

resolve_pm2_bin() {
	if [ -n "${PM2_BIN:-}" ] && [ -x "${PM2_BIN}" ]; then
		echo "${PM2_BIN}"
		return 0
	fi

	if command -v pm2 &>/dev/null; then
		command -v pm2
		return 0
	fi

	if command -v npm &>/dev/null; then
		NPM_GLOBAL_BIN=$(npm bin -g 2>/dev/null || true)
		if [ -n "${NPM_GLOBAL_BIN}" ] && [ -x "${NPM_GLOBAL_BIN}/pm2" ]; then
			echo "${NPM_GLOBAL_BIN}/pm2"
			return 0
		fi
	fi

	for CANDIDATE in /usr/local/bin/pm2 /usr/bin/pm2 /bin/pm2; do
		if [ -x "$CANDIDATE" ]; then
			echo "$CANDIDATE"
			return 0
		fi
	done

	for CANDIDATE in /root/.nvm/versions/node/*/bin/pm2 /home/*/.nvm/versions/node/*/bin/pm2; do
		if [ -x "$CANDIDATE" ]; then
			echo "$CANDIDATE"
			return 0
		fi
	done

	return 1
}

PM2_CMD="$(resolve_pm2_bin || true)"

if [ ! -d "$TRIGGER_DIR" ]; then
	exit 0
fi

for TRIGGER_FILE in "$TRIGGER_DIR"/*; do
	[ -f "$TRIGGER_FILE" ] || continue

	IFS='|' read -r ENV_NAME PM2_NAME TIMESTAMP < "$TRIGGER_FILE"

	if [ -z "${ENV_NAME:-}" ] || [ -z "${PM2_NAME:-}" ]; then
		echo "[$(date -Iseconds)] ERROR: Malformed trigger ${TRIGGER_FILE}"
		mv -f "$TRIGGER_FILE" "${TRIGGER_FILE}.invalid"
		continue
	fi

	echo "[$(date -Iseconds)] Processing trigger: ${ENV_NAME} (${PM2_NAME}) from ${TIMESTAMP}"

	DEPLOY_DIR="/var/www/shaktris.${ENV_NAME}"
	if [ "$ENV_NAME" = "production" ]; then
		DEPLOY_DIR="/var/www/shaktris.live"
	fi

	PROCESSED_OK=false
	if [ -z "$PM2_CMD" ]; then
		echo "  ERROR: PM2 not found (set PM2_BIN in cron env)"
	else
		if "$PM2_CMD" describe "$PM2_NAME" &>/dev/null 2>&1; then
			"$PM2_CMD" restart "$PM2_NAME" --update-env
			echo "  Restarted ${PM2_NAME}"
			PROCESSED_OK=true
		else
			if [ -f "${DEPLOY_DIR}/ecosystem.config.cjs" ]; then
				"$PM2_CMD" start "${DEPLOY_DIR}/ecosystem.config.cjs" --only "$PM2_NAME"
				echo "  Started ${PM2_NAME} from ecosystem config"
				PROCESSED_OK=true
			else
				echo "  ERROR: No ecosystem config found at ${DEPLOY_DIR}/ecosystem.config.cjs"
			fi
		fi

		if [ "$PROCESSED_OK" = true ]; then
			"$PM2_CMD" save || true
		fi
	fi

	if [ "$PROCESSED_OK" = true ]; then
		rm -f "$TRIGGER_FILE"
		echo "  Trigger consumed"
	else
		echo "  Trigger retained for retry"
	fi
done
