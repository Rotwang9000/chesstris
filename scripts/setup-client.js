/**
 * Client Setup Script
 * 
 * Ensures the client directory structure is set up correctly for React development.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Define paths and directories to create
const projectRoot = path.resolve(__dirname, '..');
const clientDir = path.join(projectRoot, 'client');
const srcDir = path.join(clientDir, 'src');
const componentsDir = path.join(srcDir, 'components');
const servicesDir = path.join(srcDir, 'services');
const publicDir = path.join(clientDir, 'public');
const buildDir = path.join(clientDir, 'build');

// Directories to create if they don't exist
const directoriesToCreate = [
	clientDir,
	srcDir,
	componentsDir,
	servicesDir,
	publicDir,
	buildDir
];

console.log('Setting up client directory structure...');

// Create directories
directoriesToCreate.forEach(dir => {
	if (!fs.existsSync(dir)) {
		console.log(`Creating directory: ${path.relative(projectRoot, dir)}`);
		fs.mkdirSync(dir, { recursive: true });
	}
});

// Copy over any public assets if they exist in the original public directory
const originalPublicDir = path.join(projectRoot, 'public');
if (fs.existsSync(originalPublicDir)) {
	console.log('Copying assets from public directory to client/public...');
	
	// Get all files in the public directory
	const files = fs.readdirSync(originalPublicDir);
	
	// Copy each file to the client public directory
	files.forEach(file => {
		const srcPath = path.join(originalPublicDir, file);
		const destPath = path.join(publicDir, file);
		
		// Skip directories for now - we're just copying files
		if (fs.statSync(srcPath).isFile()) {
			console.log(`Copying ${file} to client/public directory`);
			fs.copyFileSync(srcPath, destPath);
		}
	});
}

// Install any missing dependencies
console.log('Checking for required dependencies...');

const checkDependencies = spawn('npm', ['list', '--json', '--depth=0'], {
	cwd: projectRoot,
	stdio: ['inherit', 'pipe', 'inherit'],
	shell: true
});

let output = '';
checkDependencies.stdout.on('data', (data) => {
	output += data.toString();
});

checkDependencies.on('close', (code) => {
	if (code !== 0) {
		console.error('Error checking dependencies');
		process.exit(code);
	}
	
	try {
		const dependencies = JSON.parse(output).dependencies || {};
		
		// List of React dependencies we need
		const requiredDeps = [
			'react',
			'react-dom',
			'react-router-dom',
			'react-scripts',
			'three',
			'socket.io-client',
			'prop-types'
		];
		
		const missingDeps = requiredDeps.filter(dep => !dependencies[dep]);
		
		if (missingDeps.length > 0) {
			console.log(`Installing missing dependencies: ${missingDeps.join(', ')}`);
			
			const install = spawn('npm', ['install', '--save', ...missingDeps], {
				cwd: projectRoot,
				stdio: 'inherit',
				shell: true
			});
			
			install.on('close', (code) => {
				if (code !== 0) {
					console.error(`Dependency installation failed with code ${code}`);
					process.exit(code);
				}
				
				console.log('Client setup complete!');
				console.log('You can now start building React components in client/src/components');
			});
		} else {
			console.log('All required dependencies are already installed.');
			console.log('Client setup complete!');
		}
	} catch (err) {
		console.error('Error parsing dependency information:', err);
		process.exit(1);
	}
}); 