# Shaktris CI/CD Setup

## Architecture

```
  GitHub (push) ──► Jenkins (port 8090)
                        │
                 ┌──────┴──────┐
                 │  npm test   │
                 └──────┬──────┘
                        │
           ┌────────────┼────────────┐
           │                         │
    develop branch              main branch
           │                         │
    ┌──────▼──────┐          ┌───────▼───────┐
    │   Staging   │          │  Production   │
    │  port 3661  │          │  port 3666    │
    │ staging.    │          │ shaktris.com  │
    │ shaktris.com│          │               │
    └─────────────┘          └───────────────┘
```

## Quick Start (run as root)

```bash
# 1. Run the setup script
bash ci/jenkins-setup.sh

# 2. Open Jenkins at http://<server>:8090
#    Enter the initial admin password printed by the script

# 3. Install plugins: suggested + NodeJS + GitHub Integration

# 4. Create a Multibranch Pipeline job:
#    - Source: https://github.com/Rotwang9000/chesstris.git
#    - Build config: Jenkinsfile
```

## Pipeline Stages

| Stage | Trigger | What it does |
|-------|---------|-------------|
| Checkout | Every push | Pulls the code |
| Install | Every push | `npm ci` |
| Lint Check | Every push | Syntax-checks ES modules |
| Test | Every push | `npm test` (Jest) |
| Deploy Staging | develop branch | Syncs to `/var/www/shaktris.staging`, restarts PM2 |
| Deploy Production | main branch | Manual approval, then syncs to `/var/www/shaktris.live` |

## Deployment Directories

| Environment | Directory | Port | URL |
|-------------|-----------|------|-----|
| Staging | `/var/www/shaktris.staging` | 3661 | https://staging.shaktris.com |
| Production | `/var/www/shaktris.live` | 3666 | https://shaktris.com |

## Manual Deployment

```bash
# Deploy to staging
bash scripts/deploy.sh staging

# Deploy to production
bash scripts/deploy.sh production
```

## PM2 Process Management

```bash
# View processes
pm2 list

# View logs
pm2 logs shaktris-staging
pm2 logs shaktris-production

# Restart
pm2 restart shaktris-staging

# Start from ecosystem config
pm2 start ecosystem.config.cjs --only shaktris-staging
```

## Files

| File | Purpose |
|------|---------|
| `Jenkinsfile` | Pipeline definition |
| `ecosystem.config.cjs` | PM2 process config |
| `scripts/deploy.sh` | Deployment script |
| `ci/jenkins-setup.sh` | One-time Jenkins setup (run as root) |
| `ci/nginx-jenkins.conf` | Optional nginx proxy for Jenkins |
