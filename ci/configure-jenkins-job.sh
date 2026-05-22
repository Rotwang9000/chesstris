#!/usr/bin/env bash
#
# configure-jenkins-job.sh — Installs plugins and creates the tetches pipeline.
# Run as root: sudo bash ci/configure-jenkins-job.sh
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Configuring Jenkins Pipeline ==="

# ── 1. Install required plugins ──────────────────────────────────────────────

echo ""
echo "--- Installing plugins (this may take a minute) ---"
docker exec tetches-jenkins bash -c '
	jenkins-plugin-cli --verbose --plugins \
		git \
		workflow-aggregator \
		workflow-multibranch \
		github \
		github-branch-source \
		pipeline-stage-view \
		branch-api \
		scm-api \
		2>&1 || {
		echo "jenkins-plugin-cli failed — trying wget fallback..."
		cd /var/jenkins_home/plugins
		for PLUGIN in git workflow-aggregator workflow-multibranch github github-branch-source pipeline-stage-view branch-api scm-api; do
			if [ ! -f "${PLUGIN}.jpi" ] && [ ! -f "${PLUGIN}.hpi" ]; then
				echo "Downloading ${PLUGIN}..."
				wget -q "https://updates.jenkins.io/latest/${PLUGIN}.hpi" -O "${PLUGIN}.hpi" 2>/dev/null || \
					echo "  Could not download ${PLUGIN} — install it via the UI"
			fi
		done
	}
'

# ── 2. Copy the pipeline init script ─────────────────────────────────────────

echo ""
echo "--- Copying pipeline creation script ---"
docker exec tetches-jenkins mkdir -p /var/jenkins_home/init.groovy.d
docker cp "${REPO_DIR}/ci/create-pipeline-job.groovy" \
	tetches-jenkins:/var/jenkins_home/init.groovy.d/create-pipeline-job.groovy

echo "Groovy init script copied"

# ── 3. Restart Jenkins ───────────────────────────────────────────────────────

echo ""
echo "--- Restarting Jenkins ---"
docker restart tetches-jenkins

echo "Waiting for Jenkins..."
for i in $(seq 1 90); do
	HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090 2>/dev/null || echo "000")
	if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "200" ]; then
		echo ""
		echo "Jenkins is up!"
		break
	fi
	sleep 2
	echo -n "."
done
echo ""

# ── 4. Check if the job was created ──────────────────────────────────────────

sleep 10
echo "--- Checking for pipeline job ---"
docker exec tetches-jenkins bash -c '
	if [ -d /var/jenkins_home/jobs/tetches ]; then
		echo "SUCCESS: tetches pipeline job exists"
	else
		echo "Job not auto-created (plugins may need a UI restart)."
		echo ""
		echo "To create manually:"
		echo "  1. Open http://<server>:8090"
		echo "  2. Click New Item"
		echo "  3. Name: tetches"
		echo "  4. Type: Multibranch Pipeline"
		echo "  5. Branch Source: Git"
		echo "  6. Repo URL: https://github.com/Rotwang9000/tetches.git"
		echo "  7. Build Config: by Jenkinsfile"
		echo "  8. Scan trigger: 2 minutes"
		echo "  9. Save"
	fi
'

echo ""
echo "=== Done ==="
