/**
 * Client Build Script
 * 
 * This script builds the React client application using react-scripts
 * and copies the build output to the correct location for serving by the Express server.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Define paths
const projectRoot = path.resolve(__dirname, '..');
const clientDir = path.join(projectRoot, 'client');
const buildDir = path.join(clientDir, 'build');

console.log('Starting client build process...');

// Ensure client directory exists
if (!fs.existsSync(clientDir)) {
	console.error('Error: Client directory not found at', clientDir);
	process.exit(1);
}

// Run npm run build in the client directory
const buildProcess = spawn('npm', ['run', 'react-scripts', 'build'], {
	cwd: clientDir,
	stdio: 'inherit',
	shell: true,
	env: { ...process.env, NODE_ENV: 'production' }
});

buildProcess.on('error', (err) => {
	console.error('Error building client:', err);
	process.exit(1);
});

buildProcess.on('close', (code) => {
	if (code !== 0) {
		console.error(`Client build process exited with code ${code}`);
		process.exit(code);
	}
	
	console.log('Client build complete!');
	console.log(`Build output is in ${buildDir}`);
	console.log('You can now start the server with npm start or npm run dev');
}); 