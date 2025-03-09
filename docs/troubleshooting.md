# Shaktris Troubleshooting Guide

This guide provides solutions for common issues encountered when deploying or running Shaktris.

## Server Not Listening on Port 3666

If PM2 shows the application is running but nothing is listening on port 3666:

### 1. Check Environment Variables

The most common reason for this issue is that the `.env` file isn't being read correctly or contains incorrect values.

```bash
# Verify .env file exists and contains correct PORT
cat /var/www/chesstris/.env | grep PORT

# If missing, create it with proper values
cat > /var/www/chesstris/.env << EOL
NODE_ENV=production
PORT=3666
HOST=0.0.0.0
MONGODB_URI=mongodb://chesstris_app:your_password@localhost:27017/chesstris
REDIS_URI=redis://:your_redis_password@localhost:6379/0
JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRY=7d
CSRF_SECRET=your_secure_csrf_secret
COOKIE_SECRET=your_secure_cookie_secret
EOL
```

### 2. Verify PM2 Process

Check if PM2 is actually running the correct file:

```bash
# Check PM2 status and logs
pm2 status
pm2 logs chesstris

# Restart the application
pm2 restart chesstris

# Verify the process with system tools
netstat -tlpn | grep 3666
# or
ss -tlpn | grep 3666
```

### 3. Start Server Directly

Try running the server directly to see any error messages:

```bash
cd /var/www/chesstris
node -r dotenv/config server.js
```

### 4. Check for Correct Entry Point

Make sure PM2 is starting the correct file. In the project root directory:

```bash
# Check if there's a server.js or src/server.js 
ls -la server.js src/server.js

# Update PM2 config to use the correct file
pm2 stop chesstris
pm2 delete chesstris
pm2 start src/server.js --name chesstris  # if this is the correct file
# or
pm2 start server.js --name chesstris      # if this is the correct file
```

### 5. Check Server Logs

Look for any startup errors:

```bash
# Tail the last 100 lines of logs
pm2 logs chesstris --lines 100
```

### 6. Verify MongoDB and Redis Connections

Make sure MongoDB and Redis are running and accessible:

```bash
# Check MongoDB
systemctl status mongod
mongosh --eval "db.version()"

# Check Redis
systemctl status redis-server
redis-cli ping
```

### 7. Check for Port Conflicts

See if another process is using port 3666:

```bash
sudo lsof -i :3666
```

If another process is using the port, either stop that process or change the port in your .env file.

## Test Failures

If you encounter test failures when running `npm test`:

### 1. Node.js Version Issues

Ensure you're using a compatible Node.js version:

```bash
# Check current version
node -v

# If needed, install and use a more compatible version
nvm install 16
nvm use 16
```

### 2. Missing Dependencies

```bash
# Install all dependencies including dev dependencies
npm install
```

### 3. Duplicate Function Declarations

If you see errors like "Identifier 'X' has already been declared", it typically means multiple modules are exporting the same function name. This is often an issue with tests that mock functionality.

In the case of `getPauseCooldownRemaining` and other player pause functions, these are already defined in the main server.js file (around line 2671) and shouldn't be duplicated.

### 4. ECONNREFUSED Errors

If tests are trying to connect to MongoDB or Redis but failing:

```bash
# Start MongoDB and Redis if not running
sudo systemctl start mongod
sudo systemctl start redis-server

# Make sure test environment variables are set correctly
export MONGODB_URI="mongodb://localhost:27017/chesstris_test"
export REDIS_URI="redis://localhost:6379/1"
```

## MongoDB Authentication Issues

### 1. Connection Refused

```bash
# Check if MongoDB is running
sudo systemctl status mongod

# Start if not running
sudo systemctl start mongod

# Check firewall
sudo ufw status
```

### 2. Authentication Failed

```bash
# Try connecting manually to verify credentials
mongosh "mongodb://chesstris_app:your_password@localhost:27017/chesstris"

# If that fails, re-create the user
mongosh
use chesstris
db.dropUser("chesstris_app")
db.createUser({
  user: "chesstris_app",
  pwd: "new_password",
  roles: [ { role: "readWrite", db: "chesstris" } ]
})
```

## Redis Authentication Issues

```bash
# Try connecting with authentication
redis-cli -a "your_redis_password" ping

# If authentication fails, reset the password
sudo vim /etc/redis/redis.conf
# Find and update: requirepass "your_new_password"

# Restart Redis
sudo systemctl restart redis-server
``` 