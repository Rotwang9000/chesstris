# Shaktris CI/CD Setup

## Architecture

```
  GitHub (push) ──► Jenkins in Docker (port 8090)
                        │
                 ┌──────┴──────┐
                 │  npm test   │
                 └──────┬──────┘
                        │
           ┌────────────┼────────────┐
           │                         │
    Develop branch              main branch
           │                         │
    ┌──────▼──────┐          ┌───────▼───────┐
    │   Staging   │          │  Production   │
    │  port 3661  │          │  port 3666    │
    │ staging.    │          │ shaktris.com  │
    │ shaktris.com│          │               │
    └─────────────┘          └───────────────┘
```

### How deployment works

1. Jenkins (in Docker) runs tests, then rsyncs files to a **mounted volume**
   (`/var/www/shaktris.staging` or `/var/www/shaktris.live`)
2. Jenkins writes a **trigger file** to `/var/www/.deploy-triggers/`
3. A **cron job** on the host (every 30s) picks up the trigger and restarts
   the corresponding PM2 process
4. PM2 manages the Node.js server on the correct port

## Quick Start

```bash
# Run as root on the server
cd /home/rotwang/chesstris
sudo bash ci/jenkins-setup.sh
```

This will:
- Install PM2 on the host
- Create deployment directories
- Build and start the Jenkins Docker container on port 8090
- Set up the deploy-watcher cron job
- Print the initial admin password

## Pipeline Stages

| Stage | Trigger | What it does |
|-------|---------|-------------|
| Checkout | Every push | Pulls the code |
| Install | Every push | `npm ci` |
| Lint Check | Every push | Syntax-checks key ES modules |
| Test | Every push | `npm test` (Jest, CI mode) |
| Deploy Staging | Develop branch | Syncs to `/var/www/shaktris.staging`, triggers PM2 restart |
| Deploy Production | main branch | Manual approval, then deploys to `/var/www/shaktris.live` |

## Environments

| Environment | Directory | Port | URL |
|-------------|-----------|------|-----|
| Staging | `/var/www/shaktris.staging` | 3661 | https://staging.shaktris.com |
| Production | `/var/www/shaktris.live` | 3666 | https://shaktris.com |

## Manual Deployment

```bash
bash scripts/deploy.sh staging
bash scripts/deploy.sh production
```

## PM2 Commands

```bash
pm2 list
pm2 logs shaktris-staging
pm2 logs shaktris-production
pm2 restart shaktris-staging
pm2 start ecosystem.config.cjs --only shaktris-staging
```

## Docker Commands

```bash
# View Jenkins logs
docker logs -f shaktris-jenkins

# Restart Jenkins
docker compose -f docker-compose.jenkins.yml restart

# Rebuild after Dockerfile changes
docker compose -f docker-compose.jenkins.yml up -d --build

# Stop Jenkins
docker compose -f docker-compose.jenkins.yml down

# Get initial admin password
docker exec shaktris-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

## Files

| File | Purpose |
|------|---------|
| `Jenkinsfile` | Pipeline definition |
| `docker-compose.jenkins.yml` | Jenkins Docker Compose config |
| `ci/Dockerfile.jenkins` | Custom Jenkins image with Node.js |
| `ci/jenkins-setup.sh` | One-time server setup (run as root) |
| `ci/deploy-watcher.sh` | Host cron script — restarts PM2 on deploy |
| `ci/nginx-jenkins.conf` | Optional nginx proxy for Jenkins |
| `ecosystem.config.cjs` | PM2 process config |
| `scripts/deploy.sh` | Deployment script |
