# Shaktris 24-Hour YOLO Deployment Checklist

## 1. Server Setup (1 hour)
- [ ] SSH into your Ubuntu 22.04 server
- [ ] Update system: `sudo apt update && sudo apt upgrade -y`
- [ ] Install dependencies: `sudo apt install -y git curl build-essential`

## 2. Database Setup (2 hours)

### MongoDB
- [ ] Configure MongoDB authentication:
```bash
mongosh
use admin
db.createUser({
  user: "admin",
  pwd: "your_admin_password",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})
use chesstris
db.createUser({
  user: "chesstris_app",
  pwd: "your_app_password",
  roles: [ { role: "readWrite", db: "chesstris" } ]
})
exit
```
- [ ] Enable authentication in MongoDB:
```bash
sudo vim /etc/mongod.conf
# Add: security.authorization: enabled
sudo systemctl restart mongod
```

### Redis
- [ ] Configure Redis authentication:
```bash
sudo vim /etc/redis/redis.conf
# Add: requirepass "your_redis_password"
sudo systemctl restart redis-server
```

## 3. Node.js Setup (1 hour)
- [ ] Install NVM:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
source ~/.bashrc
```
- [ ] Install Node.js:
```bash
nvm install 16
nvm use 16
npm install -g pm2
```

## 4. Application Deployment (3 hours)
- [ ] Clone repository:
```bash
git clone https://github.com/your-repo/chesstris.git /var/www/chesstris
cd /var/www/chesstris
```
- [ ] Install dependencies:
```bash
npm install --production
```
- [ ] Create environment file:
```bash
cat > .env << EOL
NODE_ENV=production
PORT=3666
HOST=0.0.0.0
MONGODB_URI=mongodb://chesstris_app:your_app_password@localhost:27017/chesstris
REDIS_URI=redis://:your_redis_password@localhost:6379/0
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRY=7d
CSRF_SECRET=$(openssl rand -hex 16)
COOKIE_SECRET=$(openssl rand -hex 16)
EOL
```
- [ ] Start application:
```bash
cd /var/www/chesstris
pm2 start server.js --name chesstris
# If that doesn't work, try:
pm2 start src/server.js --name chesstris
```
- [ ] Verify it's running:
```bash
pm2 status
ss -tlpn | grep 3666
```
- [ ] Configure PM2 to start on boot:
```bash
pm2 save
pm2 startup
# Follow the instructions shown
```

## 5. Web Server Setup (2 hours)
- [ ] Install Nginx:
```bash
sudo apt install -y nginx
```
- [ ] Configure Nginx:
```bash
sudo vim /etc/nginx/sites-available/shaktris.com
```
Add this configuration:
```nginx
server {
    listen 80;
    server_name shaktris.com www.shaktris.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name shaktris.com www.shaktris.com;
    
    # SSL configs will be added by certbot
    
    location /static/ {
        alias /var/www/chesstris/public/;
        expires 30d;
    }
    
    location ~ \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|otf)$ {
        root /var/www/chesstris/public;
        expires 30d;
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:3666;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    location / {
        proxy_pass http://localhost:3666;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
- [ ] Enable site and check configuration:
```bash
sudo ln -s /etc/nginx/sites-available/shaktris.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6. SSL Setup (1 hour)
- [ ] Install Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
```
- [ ] Get SSL certificate:
```bash
sudo certbot --nginx -d shaktris.com -d www.shaktris.com
```

## 7. Testing & Troubleshooting (14 hours)
- [ ] Check website in browser: https://shaktris.com
- [ ] Test WebSocket functionality
- [ ] Monitor application logs: `pm2 logs chesstris`
- [ ] Check server resources: `htop`
- [ ] Implement quick fixes for any issues
- [ ] Set up basic monitoring (as described in monitoring section of setup guide)

## 8. Backup Configuration (1 hour)
- [ ] Set up backup script (see backup guide for details)
- [ ] Perform initial backup
- [ ] Schedule regular backups

## Common Issues & Quick Fixes

### Application Not Starting
- Check logs: `pm2 logs chesstris`
- Verify MongoDB & Redis are running
- Try running directly: `node server.js` to see errors
- Check .env file contents

### Website Not Loading
- Check Nginx status: `sudo systemctl status nginx`
- Verify Nginx configuration: `sudo nginx -t`
- Check Nginx logs: `sudo tail -f /var/nginx/logs/error.log`
- Ensure firewall allows ports 80 & 443: `sudo ufw status`

### Database Connection Issues
- Verify credentials in .env file
- Test MongoDB connection: `mongosh "mongodb://chesstris_app:password@localhost:27017/chesstris"`
- Test Redis connection: `redis-cli -a "password" ping`

### SSL Certificate Issues
- Re-run Certbot: `sudo certbot --nginx -d shaktris.com`
- Check certificate renewal: `sudo certbot renew --dry-run` 