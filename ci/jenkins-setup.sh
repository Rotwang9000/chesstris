#!/usr/bin/env bash
#
# jenkins-setup.sh — One-time Jenkins setup (run as root / with sudo).
#
# This script:
#   1. Changes Jenkins to listen on port 8090
#   2. Installs PM2 globally
#   3. Creates deployment directories
#   4. Starts Jenkins
#   5. Prints the initial admin password
#
set -euo pipefail

echo "=== Shaktris Jenkins CI/CD Setup ==="
echo ""

# ── 1. Change Jenkins port to 8090 ──────────────────────────────────────────

JENKINS_DEFAULTS="/etc/default/jenkins"
JENKINS_SYSTEMD="/etc/systemd/system/jenkins.service.d"
JENKINS_SERVICE="/lib/systemd/system/jenkins.service"

echo "--- Configuring Jenkins on port 8090 ---"

# Method A: Systemd override (preferred on modern Ubuntu)
if [ -f "$JENKINS_SERVICE" ]; then
	mkdir -p "$JENKINS_SYSTEMD"
	cat > "${JENKINS_SYSTEMD}/override.conf" <<'OVERRIDE'
[Service]
Environment="JENKINS_PORT=8090"
OVERRIDE
	echo "Created systemd override: ${JENKINS_SYSTEMD}/override.conf"
fi

# Method B: /etc/default/jenkins (older systems)
if [ -f "$JENKINS_DEFAULTS" ]; then
	if grep -q 'HTTP_PORT=' "$JENKINS_DEFAULTS"; then
		sed -i 's/HTTP_PORT=.*/HTTP_PORT=8090/' "$JENKINS_DEFAULTS"
	else
		echo 'HTTP_PORT=8090' >> "$JENKINS_DEFAULTS"
	fi
	echo "Updated ${JENKINS_DEFAULTS}"
fi

# ── 2. Install PM2 globally ─────────────────────────────────────────────────

echo ""
echo "--- Installing PM2 ---"
if ! command -v pm2 &>/dev/null; then
	npm install -g pm2
	echo "PM2 installed"
else
	echo "PM2 already installed: $(pm2 --version)"
fi

# ── 3. Create deployment directories ────────────────────────────────────────

echo ""
echo "--- Creating deployment directories ---"
for DIR in /var/www/shaktris.staging /var/www/shaktris.live; do
	mkdir -p "${DIR}/logs"
	chmod 777 "$DIR"
	chmod 777 "${DIR}/logs"
	echo "  Created: ${DIR}"
done

# ── 4. Grant Jenkins user access ────────────────────────────────────────────

echo ""
echo "--- Granting Jenkins user deployment access ---"
JENKINS_USER="jenkins"
if id "$JENKINS_USER" &>/dev/null; then
	# Add jenkins to the rotwang group (if it exists) for file access
	usermod -aG rotwang "$JENKINS_USER" 2>/dev/null || true
	echo "Jenkins user configured"
else
	echo "WARNING: Jenkins user '${JENKINS_USER}' not found"
fi

# ── 5. Start Jenkins ────────────────────────────────────────────────────────

echo ""
echo "--- Starting Jenkins ---"
systemctl daemon-reload
systemctl enable jenkins
systemctl restart jenkins

# Wait for Jenkins to start
echo "Waiting for Jenkins to start on port 8090..."
for i in $(seq 1 30); do
	if curl -s -o /dev/null -w "%{http_code}" http://localhost:8090 2>/dev/null | grep -q '403\|200'; then
		echo "Jenkins is running!"
		break
	fi
	sleep 2
	echo -n "."
done
echo ""

# ── 6. Print initial admin password ─────────────────────────────────────────

INITIAL_PW="/var/lib/jenkins/secrets/initialAdminPassword"
echo ""
echo "=============================================="
echo " Jenkins is running at http://localhost:8090"
echo "=============================================="
echo ""
if [ -f "$INITIAL_PW" ]; then
	echo "Initial admin password:"
	echo ""
	cat "$INITIAL_PW"
	echo ""
else
	echo "(Initial password already consumed — Jenkins was previously set up)"
fi

echo ""
echo "=== Next steps ==="
echo "1. Open http://<your-server>:8090 in a browser"
echo "2. Enter the admin password above"
echo "3. Install suggested plugins + 'NodeJS' + 'GitHub Integration'"
echo "4. Create a Pipeline job:"
echo "   - Name: shaktris"
echo "   - Type: Multibranch Pipeline"
echo "   - Source: Git → https://github.com/Rotwang9000/chesstris.git"
echo "   - Build Configuration: Jenkinsfile"
echo "   - Scan Multibranch Pipeline Triggers: 1 minute"
echo "5. Configure NodeJS tool:"
echo "   - Manage Jenkins → Tools → NodeJS"
echo "   - Add NodeJS 21.x, name it 'NodeJS-21'"
echo "6. Set up GitHub webhook (optional):"
echo "   - Repo Settings → Webhooks → Add webhook"
echo "   - URL: http://<your-server>:8090/github-webhook/"
echo "   - Content type: application/json"
echo "   - Events: Just the push event"
echo ""
