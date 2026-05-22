# Tetches CI/CD Setup

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
    │ staging.    │          │ tetches.com  │
    │ tetches.com│          │               │
    └─────────────┘          └───────────────┘
```

### How deployment works

1. Jenkins (in Docker) runs tests, then rsyncs files to a **mounted volume**
   (`/var/www/tetches.staging` or `/var/www/tetches.live`) using
   `--no-times --omit-dir-times --no-perms --no-owner --no-group` to avoid
   Docker-volume permission failures when syncing metadata
2. When running inside Docker, deploy writes a **trigger file** to
   `/var/www/.deploy-triggers/` instead of trying to run PM2 in-container
3. A **cron job** on the host (every 30s) picks up the trigger and restarts
   the corresponding PM2 process (using detected or configured `PM2_BIN`)
4. PM2 manages the Node.js server on the correct port

## Quick Start

```bash
# Run as root on the server
cd /home/rotwang/tetches
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
| Test — Server | Every push | `npx jest --selectProjects server tests/server/` (must pass) |
| Test — Other | Every push | Runs stable non-server tests; non-blocking |
| Deploy Staging | Develop branch | Syncs to `/var/www/tetches.staging`, triggers PM2 restart |
| Deploy Production | main branch | Manual approval, then deploys to `/var/www/tetches.live` |

## Environments

| Environment | Directory | Port | URL |
|-------------|-----------|------|-----|
| Staging | `/var/www/tetches.staging` | 3661 | https://staging.tetches.com |
| Production | `/var/www/tetches.live` | 3666 | https://tetches.com |

## Manual Deployment

```bash
bash scripts/deploy.sh staging
bash scripts/deploy.sh production
```

## Deployment Troubleshooting

```bash
# Trigger watcher manually on the host
/opt/tetches/deploy-watcher.sh

# Check watcher output
tail -n 100 /var/log/tetches-deploy.log

# Verify the app is listening
ss -ltnp | grep ':3661\|:3666'
```

## Nginx Configuration

The game requires correct nginx config to work behind a reverse proxy. Key points:
- `/socket.io/` must use `^~` prefix to override the static-file regex
- `/api/` must also be proxied to Node.js
- Static file regex should use `try_files $uri @backend` as a fallback

Updated configs are in the repo:
- `ci/nginx-staging.conf` → copy to `/etc/nginx/sites-available/staging.tetches.com.conf`
- `ci/nginx-production.conf` → copy to `/etc/nginx/sites-available/tetches.com.conf`

```bash
# As root:
cp ci/nginx-staging.conf /etc/nginx/sites-available/staging.tetches.com.conf
cp ci/nginx-production.conf /etc/nginx/sites-available/tetches.com.conf
nginx -t && systemctl reload nginx
```

## PM2 Commands

```bash
pm2 list
pm2 logs tetches-staging
pm2 logs tetches-production
pm2 restart tetches-staging
pm2 start ecosystem.config.cjs --only tetches-staging
```

## Docker Commands

```bash
# View Jenkins logs
docker logs -f tetches-jenkins

# Restart Jenkins
docker compose -f docker-compose.jenkins.yml restart

# Rebuild after Dockerfile changes
docker compose -f docker-compose.jenkins.yml up -d --build

# Stop Jenkins
docker compose -f docker-compose.jenkins.yml down

# Get initial admin password
docker exec tetches-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
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
