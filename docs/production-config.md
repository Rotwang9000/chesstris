# Chesstris Production Configuration Guide

This guide provides recommendations for configuring Chesstris for production deployment.

## Environment Variables

Create a `.env` file for production with these variables (do not commit to source control):

```
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database Configuration
MONGODB_URI=mongodb://username:password@your-mongodb-host:27017/chesstris
REDIS_URI=redis://username:password@your-redis-host:6379/0

# Security
JWT_SECRET=your-very-strong-jwt-secret-key-here
JWT_EXPIRY=7d
CSRF_SECRET=your-secure-csrf-secret
COOKIE_SECRET=your-secure-cookie-secret

# Stripe Payments (if applicable)
STRIPE_SECRET_KEY=sk_live_your_stripe_live_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
STRIPE_PUBLIC_KEY=pk_live_your_stripe_public_key

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Update System
UPDATE_CHECK_INTERVAL=3600000  # 1 hour in milliseconds
```

## Server Configuration

### Node.js Settings

Add a `ecosystem.config.js` for PM2:

```javascript
module.exports = {
  apps: [{
    name: 'chesstris',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
```

### Nginx Configuration (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Static assets with caching
    location /static/ {
        root /path/to/chesstris/public;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    # API and app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Database Configuration

### MongoDB

For production, consider using MongoDB Atlas or a properly configured MongoDB replica set:

1. Create a replica set for redundancy
2. Enable authentication
3. Set up regular backups
4. Implement proper indices based on query patterns
5. Consider sharding if you expect large data volumes

### Redis

For production:

1. Enable persistence (RDB + AOF)
2. Configure password authentication
3. Set appropriate memory limits
4. Consider Redis Sentinel or Redis Cluster for high availability

## Monitoring Setup

### Basic Monitoring Script

Create a `monitoring.js` file:

```javascript
const axios = require('axios');
const { createClient } = require('redis');
const mongoose = require('mongoose');

// Check server health
async function checkServerHealth() {
  try {
    const response = await axios.get('https://your-domain.com/api/health');
    console.log('Server health:', response.data);
  } catch (error) {
    console.error('Server health check failed:', error.message);
  }
}

// Check database connections
async function checkDatabases() {
  // Check MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connection successful');
    await mongoose.connection.close();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
  
  // Check Redis
  try {
    const redisClient = createClient(process.env.REDIS_URI);
    await redisClient.connect();
    console.log('Redis connection successful');
    await redisClient.quit();
  } catch (error) {
    console.error('Redis connection failed:', error.message);
  }
}

// Run checks
(async () => {
  await checkServerHealth();
  await checkDatabases();
})();
```

## Backup Strategy

### Database Backups

Schedule regular backups:

1. MongoDB: Use `mongodump` for daily backups
2. Redis: Configure RDB snapshots and AOF persistence

### Backup Script Example

Create a `backup.sh` script:

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/path/to/backups"
MONGODB_URI="mongodb://username:password@your-mongodb-host:27017/chesstris"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR/mongodb"

# MongoDB backup
echo "Starting MongoDB backup..."
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/mongodb/$DATE"

# Compress the backup
echo "Compressing MongoDB backup..."
tar -czf "$BACKUP_DIR/mongodb_$DATE.tar.gz" -C "$BACKUP_DIR/mongodb" "$DATE"

# Clean up
rm -rf "$BACKUP_DIR/mongodb/$DATE"

# Keep only the last 7 daily backups
find "$BACKUP_DIR" -name "mongodb_*.tar.gz" -type f -mtime +7 -delete

echo "Backup completed successfully"
```

Make it executable:
```
chmod +x backup.sh
```

Set up a daily cron job:
```
0 2 * * * /path/to/backup.sh > /path/to/backup.log 2>&1
```

## Performance Optimization

### Node.js Optimizations

1. Use Node.js v16+ for better performance
2. Set appropriate garbage collection flags:
   ```
   node --optimize_for_size --max_old_space_size=4096 server.js
   ```

### Redis Optimizations

1. Set an appropriate `maxmemory` limit
2. Configure an eviction policy:
   ```
   maxmemory-policy allkeys-lru
   ```

### Network Optimizations

1. Enable HTTP/2 in Nginx
2. Use WebSocket compression
3. Implement CDN for static assets

## Load Testing

Before full launch, conduct load tests:

1. Install artillery: `npm install -g artillery`
2. Create a load test scenario file `load-test.yml`:

```yaml
config:
  target: "https://your-domain.com"
  phases:
    - duration: 60
      arrivalRate: 5
      rampTo: 50
      name: "Warm up phase"
    - duration: 300
      arrivalRate: 50
      name: "Sustained load"
  websocket:
    url: "wss://your-domain.com"

scenarios:
  - name: "Game sessions"
    flow:
      - get:
          url: "/"
      - think: 2
      - post:
          url: "/api/users/login"
          json:
            email: "{{ $randomString(10) }}@example.com"
            password: "password123"
      - think: 3
      - websocket:
          connect: "/"
          on_connect:
            emit:
              channel: "joinGame"
              data: 
                gameId: "test-game-{{ $randomNumber(1, 10000) }}"
          on_message:
            - channel: "gameJoined"
              response:
                emit:
                  channel: "moveChessPiece"
                  data:
                    from: { x: 1, y: 1 }
                    to: { x: 1, y: 3 }
          wait: 10
```

Run the test:
```
artillery run load-test.yml
``` 