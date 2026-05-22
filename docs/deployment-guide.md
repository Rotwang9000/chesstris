# Tetches Deployment Guide

This comprehensive guide provides step-by-step instructions for deploying Tetches to a production environment.

## 1. Server Architecture

Tetches uses a modern, unified server architecture:

- **Main Server (`/server.js`)**: The primary application server using ES modules (import/export)
- **Supporting Modules (`/src` directory)**: Helper modules that provide auxiliary functionality
- **No Legacy Components**: All code uses ES modules for consistency and maintainability

## 2. Server Setup

### Prerequisites
- Ubuntu 22.04 server
- Domain configured (tetches.com) with DNS records pointing to your server
- SSH access to the server

### Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required dependencies
sudo apt install -y git curl build-essential vim
```

### MongoDB Setup

```bash
# Install MongoDB
sudo apt install -y mongodb

# Enable and start MongoDB
sudo systemctl enable mongodb
sudo systemctl start mongodb

# Configure MongoDB authentication
mongosh
```

In the MongoDB shell:

```
use admin
db.createUser({
  user: "admin",
  pwd: "your_admin_password",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})

use tetches
db.createUser({
  user: "tetches_app",
  pwd: "your_app_password",
  roles: [ { role: "readWrite", db: "tetches" } ]
})

exit
```

Edit MongoDB configuration:

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
sudo systemctl restart mongodb
```

### Redis Setup

```bash
# Install Redis
sudo apt install -y redis-server

# Configure Redis authentication
sudo vim /etc/redis/redis.conf
```

Add/modify these lines:
```
requirepass "your_redis_password"
```

Restart Redis:
```bash
sudo systemctl restart redis-server
```

### Node.js Setup

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
source ~/.bashrc

# Install Node.js
nvm install 16
nvm use 16
npm install -g pm2
```

## 3. Application Deployment

### Clone the Repository

```bash
# Create web directory
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www

# Clone the repository
git clone https://github.com/your-repo/tetches.git /var/www/tetches
cd /var/www/tetches
```

### Install Dependencies

```bash
# Install production dependencies
npm install --production
```

### Configure Environment

```bash
# Create production .env file
vim .env
```

Add the following content:
```
NODE_ENV=production
PORT=3666
HOST=0.0.0.0
MONGODB_URI=mongodb://tetches_app:your_app_password@localhost:27017/tetches
REDIS_URI=redis://:your_redis_password@localhost:6379/0
JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRY=7d
CSRF_SECRET=your_secure_csrf_secret
COOKIE_SECRET=your_secure_cookie_secret
```

### Start the Application

```bash
# Start with PM2
pm2 start server.js --name tetches

# Configure PM2 to start on boot
pm2 save
pm2 startup
# Follow the instructions shown by the above command

# Check if the application is running
pm2 status
pm2 logs tetches
```

## 4. Web Server Setup

### Install and Configure Nginx

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo vim /etc/nginx/sites-available/tetches.com
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name tetches.com www.tetches.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tetches.com www.tetches.com;
    
    # SSL configs will be added by certbot
    
    # Static files
    location /static/ {
        alias /var/www/tetches/public/;
        expires 30d;
    }
    
    # Additional static file types
    location ~ \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|otf)$ {
        root /var/www/tetches/public;
        expires 30d;
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3666;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    # Everything else
    location / {
        proxy_pass http://localhost:3666;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/tetches.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Configure SSL

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d tetches.com -d www.tetches.com
```

## 5. Monitoring and Maintenance

### Basic Monitoring

```bash
# Create a simple monitoring script
mkdir -p ~/monitoring
vim ~/monitoring/check.sh
```

Add this content:
```bash
#!/bin/bash
DATE=$(date +"%Y-%m-%d %H:%M:%S")
echo "$DATE - Checking services..."

# Check Node app
if pm2 status | grep -q "online"; then
    echo "✅ App running"
else
    echo "❌ App DOWN!"
    pm2 restart tetches
fi

# Check MongoDB
if systemctl is-active --quiet mongod; then
    echo "✅ MongoDB running"
else
    echo "❌ MongoDB DOWN!"
    sudo systemctl restart mongod
fi

# Check Redis
if systemctl is-active --quiet redis-server; then
    echo "✅ Redis running"
else
    echo "❌ Redis DOWN!"
    sudo systemctl restart redis-server
fi

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [ $DISK_USAGE -gt 90 ]; then
    echo "⚠️ Disk usage high: $DISK_USAGE%"
fi
```

Make executable and schedule:
```bash
chmod +x ~/monitoring/check.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/monitoring/check.sh >> ~/monitoring/logs.txt 2>&1") | crontab -
```

### Backup Setup

Follow the instructions in the backup guide (`docs/backup-guide.md`) to set up regular backups.

## 6. Troubleshooting

### Application Not Starting

Check logs and common issues:
```bash
# Check PM2 logs
pm2 logs tetches

# Check if the port is in use
sudo lsof -i :3666

# Try running the app directly
cd /var/www/tetches
node server.js
```

### Environment Issues

Check that your .env file is correctly set up:
```bash
cat /var/www/tetches/.env
```

### Database Connection Issues

Test MongoDB connection:
```bash
mongosh "mongodb://tetches_app:your_app_password@localhost:27017/tetches" --eval "db.stats()"
```

Test Redis connection:
```bash
redis-cli -a "your_redis_password" ping
```

## 7. Quick Reference

### Service Management

```bash
# Restart the application
pm2 restart tetches

# View application logs
pm2 logs tetches

# Restart web server
sudo systemctl restart nginx

# Restart MongoDB
sudo systemctl restart mongod

# Restart Redis
sudo systemctl restart redis-server
```

### Updating the Application

```bash
cd /var/www/tetches
git pull
npm install --production
pm2 restart tetches
``` 