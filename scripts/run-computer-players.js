/**
 * Run Multiple Computer Players
 * 
 * This script launches multiple instances of the simple computer player
 * to test the game mechanics and API functionality.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const NUM_PLAYERS = process.env.NUM_PLAYERS || 3;
const BASE_PORT = process.env.BASE_PORT || 8080;
const API_URL = process.env.API_URL || 'http://localhost:3020/api';
const LOG_DIR = path.join(__dirname, '..', 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
	fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Array to track player processes
const players = [];

/**
 * Start a computer player
 * @param {number} index - Player index
 */
function startPlayer(index) {
	const playerName = `TestBot-${index}`;
	const port = BASE_PORT + index;
	const logFile = path.join(LOG_DIR, `player-${index}.log`);
	
	// Create log file stream
	const logStream = fs.createWriteStream(logFile, { flags: 'a' });
	
	console.log(`Starting player ${index}: ${playerName} on port ${port}`);
	
	// Set environment variables for the player
	const env = {
		...process.env,
		PLAYER_NAME: playerName,
		API_URL: API_URL,
		API_ENDPOINT: `http://localhost:${port}/callback`,
		PORT: port.toString()
	};
	
	// Spawn player process
	const playerProcess = spawn('node', [path.join(__dirname, '..', 'examples', 'simple-computer-player.js')], {
		env,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	
	// Log output
	playerProcess.stdout.pipe(logStream);
	playerProcess.stderr.pipe(logStream);
	
	// Also log to console with player prefix
	playerProcess.stdout.on('data', (data) => {
		console.log(`[Player ${index}] ${data.toString().trim()}`);
	});
	
	playerProcess.stderr.on('data', (data) => {
		console.error(`[Player ${index} ERROR] ${data.toString().trim()}`);
	});
	
	// Handle process exit
	playerProcess.on('exit', (code) => {
		console.log(`Player ${index} exited with code ${code}`);
		
		// Remove from players array
		const playerIndex = players.findIndex(p => p.process === playerProcess);
		if (playerIndex !== -1) {
			players.splice(playerIndex, 1);
		}
		
		// Restart player after a delay
		setTimeout(() => {
			console.log(`Restarting player ${index}...`);
			startPlayer(index);
		}, 5000);
	});
	
	// Store player info
	players.push({
		index,
		name: playerName,
		port,
		process: playerProcess,
		logStream
	});
}

/**
 * Stop all players
 */
function stopAllPlayers() {
	console.log('Stopping all players...');
	
	players.forEach(player => {
		player.process.kill();
		player.logStream.end();
	});
	
	players.length = 0;
}

/**
 * Start all players
 */
function startAllPlayers() {
	console.log(`Starting ${NUM_PLAYERS} computer players...`);
	
	for (let i = 0; i < NUM_PLAYERS; i++) {
		startPlayer(i);
	}
}

// Handle process exit
process.on('SIGINT', () => {
	console.log('Received SIGINT. Shutting down...');
	stopAllPlayers();
	process.exit(0);
});

process.on('SIGTERM', () => {
	console.log('Received SIGTERM. Shutting down...');
	stopAllPlayers();
	process.exit(0);
});

// Start all players
startAllPlayers();

console.log('All players started. Press Ctrl+C to stop.'); 