# Shaktris YOLO Deployment Guide

## Prerequisites
- Ubuntu 22.04 server with root access
- Domain configured (shaktris.com) with DNS records pointing to your server
- MongoDB installed
- Redis installed
- Node.js environment (preferably using NVM)

## 1. Database Authentication Setup

### MongoDB Authentication

```bash
# Connect to MongoDB shell
mongosh

# Switch to admin database
use admin

# Create admin user
db.createUser({
  user: "admin",
  pwd: "choose_strong_password_here",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})

# Create application user
use chesstris
db.createUser({
  user: "chesstris_app",
  pwd: "another_strong_password",
  roles: [ { role: "readWrite", db: "chesstris" } ]
})

# Exit MongoDB shell
exit
```

Enable authentication in MongoDB:
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

### Redis Authentication

```bash
# Edit Redis config
sudo vim /etc/redis/redis.conf
```

Add/modify these lines:
```
requirepass "choose_strong_redis_password"
```

Restart Redis:
```bash
sudo systemctl restart redis-server
```

## 2. Code Deployment

```bash
# Clone repo (if not already done)
git clone https://github.com/your-repo/chesstris.git /var/www/chesstris
cd /var/www/chesstris

# Setup Node (if using NVM)
nvm install 16  # or a compatible version
nvm use 16

# Install dependencies
npm install --production

# Fix missing export in server.js
vim server.js
```

Add to server.js towards the end of the file (before any existing exports):
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

Continue with setup:
```bash
# Create production env file
vim .env
```

Add to .env:
```
NODE_ENV=production
PORT=3666
HOST=0.0.0.0
MONGODB_URI=mongodb://chesstris_app:another_strong_password@localhost:27017/chesstris
REDIS_URI=redis://:choose_strong_redis_password@localhost:6379/0
JWT_SECRET=generate_a_strong_secret_key
JWT_EXPIRY=7d
CSRF_SECRET=generate_a_strong_csrf_key
COOKIE_SECRET=generate_a_strong_cookie_key
```

## 3. Process Management with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the app with PM2
pm2 start server.js --name chesstris

# Make PM2 start on boot
pm2 save
pm2 startup
# Follow the instructions provided by the above command

# Check if the app is running
pm2 status
pm2 logs chesstris
```

## 4. Nginx Configuration

```bash
# Create a new site config
sudo vim /etc/nginx/sites-available/shaktris.com
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name shaktris.com www.shaktris.com;
    
    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name shaktris.com www.shaktris.com;
    
    # SSL Config (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/shaktris.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shaktris.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    
    # Static files
    location /static/ {
        alias /var/www/chesstris/public/;
        expires 30d;
    }
    
    # Additional static file types
    location ~ \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|otf)$ {
        root /var/www/chesstris/public;
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
sudo ln -s /etc/nginx/sites-available/shaktris.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 5. SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d shaktris.com -d www.shaktris.com
```

## 6. Troubleshooting

### If app is not listening on port 3666:

1. Check if the port is being used by another process:
   ```bash
   sudo lsof -i :3666
   ```

2. Check PM2 logs for errors:
   ```bash
   pm2 logs chesstris
   ```

3. Try running the app directly to see errors:
   ```bash
   cd /var/www/chesstris
   node server.js
   ```

4. Ensure your firewall allows the port:
   ```bash
   sudo ufw allow 3666
   ```

5. Check .env file is being loaded correctly:
   ```bash
   cat .env | grep PORT
   ``` 