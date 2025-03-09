# Shaktris Server Structure Guide

This document explains the server architecture of the Shaktris application and how to properly deploy it.

## Server Files Structure

Shaktris has a modern, unified server structure:

1. **Main Server (`/server.js`)**
   - The primary application server using ES modules (import/export)
   - Contains all game logic, player management, and API endpoints
   - This is the file that should be started with PM2 in production

2. **Supporting Modules (`/src` directory)**
   - Various utility modules and libraries that support the main application
   - Not directly part of the server implementation
   - Used by the main server for auxiliary functions

## Key Functions Location

All essential game functions are exported from the main `/server.js` file, including:

- Player management functions
- Game state functions
- Player pause functionality
- Chess piece movement
- Energy management
- Home zone management

## Correct Deployment

When deploying to production, you should:

```bash
# Clone repository
git clone https://github.com/your-repo/chesstris.git /var/www/chesstris
cd /var/www/chesstris

# Install dependencies
npm install --production

# Set up environment variables in .env
# Ensure PORT=3666 is set

# Start the MAIN server.js file
pm2 start server.js --name chesstris
```

## Testing Configuration

Tests import functions directly from the main `server.js` file or via test utilities:

```javascript
// Direct import
import { 
    handlePlayerPause, 
    handlePlayerResume, 
    // other functions...
} from '../../server.js';

// OR via test utilities
import {
    handlePlayerPause,
    handlePlayerResume,
    // other functions...
} from '../testUtils.js';
```

## Troubleshooting Server Issues

If having problems with the server not starting:

1. **Verify the correct server file is being used**:
   ```bash
   pm2 list
   # Should show server.js
   ```

2. **Check for port conflicts**:
   ```bash
   sudo lsof -i :3666
   # or
   ss -tlpn | grep 3666
   ```

3. **Run the server directly to see errors**:
   ```bash
   cd /var/www/chesstris
   node server.js
   ```

4. **Check .env file**:
   ```bash
   cat .env
   # Should have PORT=3666
   ```

## Nginx Configuration Notes

When configuring Nginx, point to port 3666 where the main server listens:

```nginx
location / {
    proxy_pass http://localhost:3666;
    # Other proxy settings...
}
``` 