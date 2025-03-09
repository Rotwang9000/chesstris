# Shaktris Migration Guide

This guide outlines the process for migrating your Shaktris installation from one server to another. Follow these steps to ensure a smooth transition with minimal downtime.

## Pre-Migration Preparation

1. **Create complete backups** of your current installation using the instructions in the backup guide
2. **Provision new server** with similar specifications or better than your current server
3. **Set up the required base software** on the new server:
   - Ubuntu 22.04 (or comparable)
   - Node.js (via NVM)
   - MongoDB
   - Redis
   - Nginx
   - PM2
   - Certbot (for SSL)

## Migration Steps

### 1. Set Up Databases

#### MongoDB

```bash
# Connect to MongoDB shell
mongosh

# Switch to admin database
use admin

# Create admin user (same as on original server)
db.createUser({
  user: "admin",
  pwd: "use_same_password_as_original",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})

# Create application user
use chesstris
db.createUser({
  user: "chesstris_app",
  pwd: "use_same_password_as_original",
  roles: [ { role: "readWrite", db: "chesstris" } ]
})

# Exit MongoDB shell
exit
```

Enable authentication in MongoDB configuration:
```bash
sudo vim /etc/mongod.conf
```

Add/modify these lines:
```yaml
security:
  authorization: enabled
```

Restart MongoDB:
```bash
sudo systemctl restart mongod
```

#### Redis

```bash
# Edit Redis config
sudo vim /etc/redis/redis.conf
```

Add/modify these lines:
```
requirepass "use_same_password_as_original"
```

Restart Redis:
```bash
sudo systemctl restart redis-server
```

### 2. Restore Data

#### MongoDB Data

```bash
# Copy backup file from old server or backup location
scp user@old-server:/opt/backup/shaktris/mongodb_YYYY-MM-DD_HH-MM-SS.tar.gz /tmp/

# Extract the backup
tar -xzf /tmp/mongodb_YYYY-MM-DD_HH-MM-SS.tar.gz -C /tmp/

# Restore to MongoDB
mongorestore --uri="mongodb://chesstris_app:password@localhost:27017/chesstris" --drop /tmp/YYYY-MM-DD_HH-MM-SS/
```

#### Redis Data

```bash
# Copy backup file from old server or backup location
scp user@old-server:/opt/backup/shaktris/redis/dump_YYYY-MM-DD_HH-MM-SS.rdb /tmp/

# Stop Redis
sudo systemctl stop redis-server

# Replace the dump file
sudo cp /tmp/dump_YYYY-MM-DD_HH-MM-SS.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb

# Start Redis
sudo systemctl start redis-server
```

### 3. Set Up Application

#### Clone Repository

```bash
# Clone repository
git clone https://github.com/your-repo/chesstris.git /var/www/chesstris
cd /var/www/chesstris

# Set up Node environment
nvm install 16  # or required version
nvm use 16
```

#### Restore Configuration

```bash
# Copy .env file from backup
scp user@old-server:/opt/backup/shaktris/config/.env_YYYY-MM-DD_HH-MM-SS /var/www/chesstris/.env

# Update .env with new server details if necessary
vim /var/www/chesstris/.env
```

Sample .env adjustments:
```
# Only update these if server details changed
HOST=0.0.0.0
PORT=3666
```

#### Install Dependencies and Start App

```bash
# Install dependencies
cd /var/www/chesstris
npm install --production

# Fix missing export in server.js (if needed)
vim server.js
```

Add to server.js if it's missing the getPauseCooldownRemaining function:
```javascript
export const getPauseCooldownRemaining = (playerId) => {
  // Implementation based on your game logic
  const player = getPlayer(playerId);
  if (!player || !player.pauseCooldown) {
    return 0;
  }
  const now = Date.now();
  const remaining = Math.max(0, player.pauseCooldown - now);
  return remaining;
};
```

Setup PM2:
```bash
# Install PM2 globally if not already installed
sudo npm install -g pm2

# Start the application
pm2 start server.js --name chesstris

# Set PM2 to start on boot
pm2 save
pm2 startup
# Follow the instructions from the above command
```

### 4. Nginx and SSL Configuration

#### Nginx Configuration

```bash
# Copy Nginx configuration from backup or create new
scp user@old-server:/opt/backup/shaktris/config/nginx_YYYY-MM-DD_HH-MM-SS.conf /etc/nginx/sites-available/shaktris.com

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/shaktris.com /etc/nginx/sites-enabled/

# Test and reload Nginx
sudo nginx -t
sudo systemctl reload nginx
```

#### SSL Certificates

If using Let's Encrypt (recommended):
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get new certificates
sudo certbot --nginx -d shaktris.com -d www.shaktris.com
```

If migrating existing certificates:
```bash
# Create directory structure
sudo mkdir -p /etc/letsencrypt/live/shaktris.com/

# Copy certificates from backup
sudo cp /path/to/backup/ssl_YYYY-MM-DD_HH-MM-SS/fullchain.pem /etc/letsencrypt/live/shaktris.com/
sudo cp /path/to/backup/ssl_YYYY-MM-DD_HH-MM-SS/privkey.pem /etc/letsencrypt/live/shaktris.com/

# Set proper permissions
sudo chmod 600 /etc/letsencrypt/live/shaktris.com/privkey.pem
```

### 5. DNS Cutover

Once everything is set up and tested on the new server:

1. **Reduce TTL** on your DNS records a day before migration (if possible)
2. **Update DNS records** to point to the new server IP
3. **Monitor DNS propagation** using tools like `dig` or online DNS checkers
4. **Keep both servers running** during the transition period

### 6. Post-Migration Verification

```bash
# Check if application is running
pm2 status chesstris

# Verify logs for any errors
pm2 logs chesstris

# Test website functionality
curl -L https://shaktris.com

# Verify database access
mongosh "mongodb://chesstris_app:password@localhost:27017/chesstris" --eval "db.stats()"
redis-cli -a "password" INFO
```

### 7. Backup Configuration on New Server

Set up the backup system on the new server:

```bash
# Create backup directory
sudo mkdir -p /opt/backup

# Copy backup script from old server
scp user@old-server:/opt/backup/backup-shaktris.sh /opt/backup/

# Update script if necessary
sudo vim /opt/backup/backup-shaktris.sh

# Make executable
sudo chmod +x /opt/backup/backup-shaktris.sh

# Set up cron job
crontab -e
# Add: 0 3 * * * /opt/backup/backup-shaktris.sh > /opt/backup/backup.log 2>&1
```

### 8. Decommission Old Server

After confirming that the new server is functioning correctly for a few days:

1. **Create final backup** from the old server
2. **Stop services** on the old server:
   ```bash
   pm2 stop chesstris
   sudo systemctl stop nginx
   sudo systemctl stop mongodb
   sudo systemctl stop redis-server
   ```
3. **Archive any important files** not included in regular backups
4. **Decommission server** according to your hosting provider's instructions 