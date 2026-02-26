#!/usr/bin/env bash
#
# jenkins-setup.sh — Set up Docker-based Jenkins + PM2 deploy watcher.
# Run as root on the host.
#
set -euo pipefail

echo "=== Shaktris Jenkins CI/CD Setup (Docker) ==="
echo ""

# ── 1. Pre-flight checks ────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
	echo "ERROR: Docker is not installed."
	exit 1
fi

if ! docker compose version &>/dev/null 2>&1; then
	echo "ERROR: Docker Compose v2 is not available."
	exit 1
fi

# ── 2. Install PM2 on the host ──────────────────────────────────────────────

echo "--- Installing PM2 on the host ---"
if ! command -v pm2 &>/dev/null; then
	npm install -g pm2
	echo "PM2 installed"
else
	echo "PM2 already installed: $(pm2 --version)"
fi

# ── 3. Create deployment directories ────────────────────────────────────────

echo ""
echo "--- Creating directories ---"
for DIR in /var/www/shaktris.staging /var/www/shaktris.live /var/www/.deploy-triggers; do
	mkdir -p "${DIR}/logs" 2>/dev/null || mkdir -p "$DIR"
	chmod 777 "$DIR"
	echo "  ${DIR}"
done

# ── 4. Build and start Jenkins container ─────────────────────────────────────

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo ""
echo "--- Building Jenkins Docker image ---"
cd "$REPO_DIR"
docker compose -f docker-compose.jenkins.yml build

echo ""
echo "--- Starting Jenkins ---"
docker compose -f docker-compose.jenkins.yml up -d

# Wait for Jenkins to start
echo "Waiting for Jenkins on port 8090..."
for i in $(seq 1 60); do
	HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090 2>/dev/null || echo "000")
	if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "200" ]; then
		echo ""
		echo "Jenkins is running!"
		break
	fi
	sleep 2
	echo -n "."
done
echo ""

# ── 5. Set up the deploy watcher cron ───────────────────────────────────────

echo "--- Setting up deploy watcher cron ---"
WATCHER_SCRIPT="/opt/shaktris/deploy-watcher.sh"
mkdir -p /opt/shaktris
cp "${REPO_DIR}/ci/deploy-watcher.sh" "$WATCHER_SCRIPT"
chmod +x "$WATCHER_SCRIPT"

# Add cron entries (every 30 seconds) if not already present
CRON_MARKER="# shaktris-deploy-watcher"
if ! crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
	(crontab -l 2>/dev/null || true; cat <<CRON
$CRON_MARKER
* * * * * $WATCHER_SCRIPT >> /var/log/shaktris-deploy.log 2>&1
* * * * * sleep 30 && $WATCHER_SCRIPT >> /var/log/shaktris-deploy.log 2>&1
CRON
) | crontab -
	echo "Cron entries added (30-second polling)"
else
	echo "Cron entries already exist"
fi

# ── 6. Install required plugins and create pipeline job ──────────────────────

echo "--- Installing Jenkins plugins ---"

# Install plugins using jenkins-plugin-cli inside the container
docker exec shaktris-jenkins bash -c '
	jenkins-plugin-cli --plugins \
		git \
		workflow-aggregator \
		workflow-multibranch \
		github \
		github-branch-source \
		pipeline-stage-view \
		2>/dev/null || echo "Plugin CLI not available — will install via UI"
' 2>/dev/null

echo "--- Copying pipeline init script ---"
docker exec shaktris-jenkins mkdir -p /var/jenkins_home/init.groovy.d
docker cp "${REPO_DIR}/ci/create-pipeline-job.groovy" \
	shaktris-jenkins:/var/jenkins_home/init.groovy.d/create-pipeline-job.groovy

echo "--- Restarting Jenkins to apply plugins and create pipeline ---"
docker restart shaktris-jenkins

# Wait for Jenkins to come back up
echo "Waiting for Jenkins to restart..."
for i in $(seq 1 60); do
	HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090 2>/dev/null || echo "000")
	if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "200" ]; then
		echo ""
		echo "Jenkins is back up!"
		break
	fi
	sleep 2
	echo -n "."
done
echo ""

# ── 7. Get the initial admin password ────────────────────────────────────────

echo ""
echo "=============================================="
echo " Jenkins is running at http://localhost:8090"
echo "=============================================="
echo ""

# Wait a moment for Jenkins to write the password file
sleep 5
INIT_PW=$(docker exec shaktris-jenkins cat /var/jenkins_home/secrets/initialAdminPassword 2>/dev/null || echo "")

if [ -n "$INIT_PW" ]; then
	echo "Initial admin password:"
	echo ""
	echo "  $INIT_PW"
	echo ""
else
	echo "(Password not yet available — try in a few seconds:)"
	echo "  docker exec shaktris-jenkins cat /var/jenkins_home/secrets/initialAdminPassword"
fi

echo ""
echo "=== Next steps ==="
echo ""
echo "1. Open http://<your-server>:8090 in a browser"
echo "2. Enter the admin password above"
echo "3. Install suggested plugins, then also install:"
echo "   - GitHub Integration Plugin"
echo "   - (NodeJS plugin is NOT needed — Node.js is baked into the image)"
echo "4. Create a new item:"
echo "   - Name: shaktris"
echo "   - Type: Multibranch Pipeline"
echo "   - Branch Source: Git"
echo "   - Repository URL: https://github.com/Rotwang9000/chesstris.git"
echo "   - Build Configuration: by Jenkinsfile"
echo "   - Scan Multibranch Pipeline Triggers: 1 minute"
echo "5. Optional — GitHub webhook for instant builds:"
echo "   - Repo → Settings → Webhooks → Add"
echo "   - URL: http://<server-ip>:8090/github-webhook/"
echo "   - Content type: application/json"
echo "   - Events: Just the push event"
echo ""
