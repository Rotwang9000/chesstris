# Shaktris Backup Guide

This guide provides instructions for backing up your Shaktris installation. Regular backups are essential to prevent data loss and enable quick recovery in case of server issues.

## What to Back Up

1. **MongoDB Data**
2. **Redis Data**
3. **Environment Variables**
4. **Nginx Configuration**
5. **SSL Certificates**
6. **Application Code (if modified locally)**

## Automated Backup Script

Create a backup script at `/opt/backup/backup-shaktris.sh`:

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/opt/backup/shaktris"
MONGODB_URI="mongodb://chesstris_app:password@localhost:27017/chesstris"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
APP_DIR="/var/www/chesstris"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR/mongodb"
mkdir -p "$BACKUP_DIR/redis"
mkdir -p "$BACKUP_DIR/config"

# MongoDB backup
echo "Starting MongoDB backup..."
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/mongodb/$DATE"

# Compress the backup
echo "Compressing MongoDB backup..."
tar -czf "$BACKUP_DIR/mongodb_$DATE.tar.gz" -C "$BACKUP_DIR/mongodb" "$DATE"

# Clean up
rm -rf "$BACKUP_DIR/mongodb/$DATE"

# Redis backup (ensure Redis is configured to create RDB dumps)
echo "Starting Redis backup..."
# Create a Redis backup trigger
redis-cli -a "your_redis_password" SAVE
# Copy the Redis dump file
cp /var/lib/redis/dump.rdb "$BACKUP_DIR/redis/dump_$DATE.rdb"

# Environment variables
echo "Backing up environment variables..."
cp "$APP_DIR/.env" "$BACKUP_DIR/config/.env_$DATE"

# Nginx configuration
echo "Backing up Nginx configuration..."
cp /etc/nginx/sites-available/shaktris.com "$BACKUP_DIR/config/nginx_$DATE.conf"

# SSL certificates (if self-managed)
echo "Backing up SSL certificates..."
if [ -d "/etc/letsencrypt/live/shaktris.com" ]; then
    mkdir -p "$BACKUP_DIR/ssl_$DATE"
    cp -L /etc/letsencrypt/live/shaktris.com/fullchain.pem "$BACKUP_DIR/ssl_$DATE/"
    cp -L /etc/letsencrypt/live/shaktris.com/privkey.pem "$BACKUP_DIR/ssl_$DATE/"
fi

# PM2 process configuration
echo "Backing up PM2 configuration..."
pm2 save
cp -r ~/.pm2 "$BACKUP_DIR/config/pm2_$DATE"

# Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "mongodb_*.tar.gz" -type f -mtime +7 -delete
find "$BACKUP_DIR/redis" -name "dump_*.rdb" -type f -mtime +7 -delete
find "$BACKUP_DIR/config" -name ".env_*" -type f -mtime +7 -delete
find "$BACKUP_DIR/config" -name "nginx_*.conf" -type f -mtime +7 -delete
find "$BACKUP_DIR/config" -name "pm2_*" -type d -mtime +7 -exec rm -rf {} \;
find "$BACKUP_DIR" -name "ssl_*" -type d -mtime +7 -exec rm -rf {} \;

echo "Backup completed successfully at $(date)"
```

Make the script executable:

```bash
chmod +x /opt/backup/backup-shaktris.sh
```

## Setting Up Automated Backups

Add a cron job to run daily backups:

```bash
# Edit crontab
crontab -e
```

Add this line to run backup daily at 3:00 AM:

```
0 3 * * * /opt/backup/backup-shaktris.sh > /opt/backup/backup.log 2>&1
```

## Manual Backup

You can also run a manual backup at any time:

```bash
sudo /opt/backup/backup-shaktris.sh
```

## Backup Verification

Periodically verify that your backups are functioning correctly:

```bash
# Check the latest backup log
tail -n 50 /opt/backup/backup.log

# Verify MongoDB backup integrity
tar -tzf /opt/backup/shaktris/mongodb_YYYY-MM-DD_HH-MM-SS.tar.gz

# Verify Redis backup file exists
ls -la /opt/backup/shaktris/redis/
```

## Offsite Backups

For additional security, consider copying backups to an offsite location:

```bash
# Example: Using rsync to copy to another server
rsync -avz --delete /opt/backup/shaktris/ user@backup-server:/path/to/backups/shaktris/

# Alternative: Using rclone to copy to cloud storage
rclone copy /opt/backup/shaktris/ remote:shaktris-backups/
```

## Emergency Database Restore

If you need to restore from backup:

### MongoDB Restore

```bash
# Extract the backup
tar -xzf /opt/backup/shaktris/mongodb_YYYY-MM-DD_HH-MM-SS.tar.gz -C /tmp/

# Restore to MongoDB
mongorestore --uri="mongodb://chesstris_app:password@localhost:27017/chesstris" --drop /tmp/YYYY-MM-DD_HH-MM-SS/
```

### Redis Restore

```bash
# Stop Redis
sudo systemctl stop redis-server

# Replace the dump file
sudo cp /opt/backup/shaktris/redis/dump_YYYY-MM-DD_HH-MM-SS.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb

# Start Redis
sudo systemctl start redis-server
``` 