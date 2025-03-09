# Source Code Directory

This directory contains supporting modules and libraries for the Chesstris application.

## Overview

The `src` directory houses auxiliary components that support the main application but are not part of the core server functionality. The main server functionality is in the `server.js` file at the root of the project.

## Directory Structure

- **node_modules/**: Dependencies specific to this directory's components
- **package.json**: Dependencies and scripts for this directory's components

## About Server Structure

Chesstris has a unified, modern codebase:

1. **Main Server (`/server.js`)**: The primary application server using ES modules (import/export). This is the file that should be started with PM2 in production.

2. **Supporting Modules**: The `src` directory contains various utility modules and libraries that support the main application but aren't directly part of the server.

## When Deploying

Always deploy and run the main server.js in the root directory:

```bash
pm2 start server.js --name chesstris
``` 