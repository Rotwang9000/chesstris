#!/usr/bin/env node

/**
 * Setup script for Shaktris computer player development environment
 * This script helps developers set up their environment for creating computer players
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

// Configuration
const CONFIG = {
	examplesDir: path.join(__dirname, '..', 'examples'),
	docsDir: path.join(__dirname, '..', 'docs'),
	logsDir: path.join(__dirname, '..', 'logs', 'computer-players'),
	defaultPort: 8080,
	defaultApiUrl: 'http://localhost:3020/api'
};

// Ensure directories exist
function ensureDirectoriesExist() {
	console.log('Ensuring required directories exist...');
	
	const dirs = [
		CONFIG.examplesDir,
		CONFIG.docsDir,
		CONFIG.logsDir
	];
	
	dirs.forEach(dir => {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
			console.log(`Created directory: ${dir}`);
		}
	});
}

// Check dependencies
function checkDependencies() {
	console.log('Checking dependencies...');
	
	const dependencies = ['axios', 'express', 'body-parser'];
	let missingDeps = [];
	
	try {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
		
		dependencies.forEach(dep => {
			if (!packageJson.dependencies[dep]) {
				missingDeps.push(dep);
			}
		});
		
		if (missingDeps.length > 0) {
			console.log(`Installing missing dependencies: ${missingDeps.join(', ')}...`);
			execSync(`npm install --save ${missingDeps.join(' ')}`, { stdio: 'inherit' });
		} else {
			console.log('All dependencies are installed.');
		}
	} catch (error) {
		console.error('Error checking dependencies:', error.message);
		process.exit(1);
	}
}

// Create config file
function createConfigFile(port, apiUrl) {
	console.log('Creating computer player configuration file...');
	
	const configContent = `// Computer Player Configuration
// Generated on ${new Date().toISOString()}

module.exports = {
	// API configuration
	apiUrl: '${apiUrl}',
	
	// Server configuration
	port: ${port},
	
	// Player configuration
	playerName: 'MyComputerPlayer',
	
	// Logging configuration
	logLevel: 'info', // 'debug', 'info', 'warn', 'error'
	logToFile: true,
	logDir: '${CONFIG.logsDir.replace(/\\/g, '\\\\')}',
	
	// Game strategy configuration
	strategy: {
		// Tetromino placement strategy
		tetrominoPlacement: 'random', // 'random', 'optimal', 'defensive'
		
		// Chess movement strategy
		chessMovement: 'random', // 'random', 'aggressive', 'defensive'
		
		// Decision making delay (ms)
		thinkingTime: 1000
	}
};
`;
	
	const configPath = path.join(CONFIG.examplesDir, 'computer-player-config.js');
	fs.writeFileSync(configPath, configContent);
	console.log(`Configuration file created at: ${configPath}`);
}

// Create a basic template for a new computer player
function createPlayerTemplate(playerName) {
	console.log(`Creating template for computer player: ${playerName}...`);
	
	const templateContent = `/**
 * ${playerName} - Shaktris Computer Player
 * Created on ${new Date().toISOString()}
 */

const axios = require('axios');
const config = require('./computer-player-config');

// Configuration
const API_URL = config.apiUrl;
const PLAYER_NAME = '${playerName}';
const API_ENDPOINT = \`http://localhost:\${config.port}/callback\`;

// Player state
let playerId = null;
let apiToken = null;
let currentGameId = null;
let gameState = null;

/**
 * Register the computer player with the game server
 */
async function registerPlayer() {
	try {
		console.log(\`Registering player \${PLAYER_NAME}...\`);
		
		const response = await axios.post(\`\${API_URL}/computer-players/register\`, {
			name: PLAYER_NAME,
			apiEndpoint: API_ENDPOINT,
			description: 'Custom computer player for Shaktris'
		});
		
		if (response.data.success) {
			playerId = response.data.playerId;
			apiToken = response.data.apiToken;
			console.log(\`Successfully registered as \${playerId}\`);
			return true;
		} else {
			console.error('Registration failed:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error registering player:', error.message);
		return false;
	}
}

/**
 * Join an available game
 */
async function joinGame() {
	try {
		console.log('Looking for available games...');
		
		const response = await axios.get(\`\${API_URL}/games\`);
		
		if (response.data.games && response.data.games.length > 0) {
			currentGameId = response.data.games[0].id;
			
			console.log(\`Joining game \${currentGameId}...\`);
			
			const joinResponse = await axios.post(\`\${API_URL}/games/\${currentGameId}/add-computer-player\`, {
				computerId: playerId,
				apiToken
			});
			
			if (joinResponse.data.success) {
				console.log('Successfully joined game');
				return true;
			} else {
				console.error('Failed to join game:', joinResponse.data.message);
				return false;
			}
		} else {
			console.log('No games available');
			return false;
		}
	} catch (error) {
		console.error('Error joining game:', error.message);
		return false;
	}
}

/**
 * Update the current game state
 */
async function updateGameState() {
	try {
		if (!currentGameId) return false;
		
		const response = await axios.get(\`\${API_URL}/games/\${currentGameId}\`);
		
		if (response.data.success) {
			gameState = response.data.game;
			return true;
		} else {
			console.error('Failed to update game state:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error updating game state:', error.message);
		return false;
	}
}

/**
 * Get available tetromino shapes
 */
async function getAvailableTetrominos() {
	try {
		if (!currentGameId) return [];
		
		const response = await axios.get(\`\${API_URL}/games/\${currentGameId}/available-tetrominos\`, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			return response.data.tetrominos;
		} else {
			console.error('Failed to get tetrominos:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting tetrominos:', error.message);
		return [];
	}
}

/**
 * Get chess pieces
 */
async function getChessPieces() {
	try {
		if (!currentGameId) return [];
		
		const response = await axios.get(\`\${API_URL}/games/\${currentGameId}/chess-pieces\`, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			return response.data.pieces;
		} else {
			console.error('Failed to get chess pieces:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting chess pieces:', error.message);
		return [];
	}
}

/**
 * Make a random tetromino placement
 */
async function placeRandomTetromino() {
	try {
		const tetrominos = await getAvailableTetrominos();
		
		if (tetrominos.length === 0) {
			console.log('No tetrominos available');
			return false;
		}
		
		// Select a random tetromino
		const tetromino = tetrominos[Math.floor(Math.random() * tetrominos.length)];
		
		// Generate random position and rotation
		const x = Math.floor(Math.random() * 10);
		const y = Math.floor(Math.random() * 10);
		const rotation = Math.floor(Math.random() * 4);
		
		console.log(\`Placing tetromino \${tetromino.type} at (\${x}, \${y}) with rotation \${rotation}\`);
		
		const response = await axios.post(\`\${API_URL}/games/\${currentGameId}/computer-move\`, {
			moveType: 'tetromino',
			tetrominoType: tetromino.type,
			position: { x, y },
			rotation
		}, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			console.log('Tetromino placed successfully');
			return true;
		} else {
			console.error('Failed to place tetromino:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error placing tetromino:', error.message);
		return false;
	}
}

/**
 * Make a random chess move
 */
async function makeRandomChessMove() {
	try {
		const pieces = await getChessPieces();
		
		if (pieces.length === 0) {
			console.log('No chess pieces available');
			return false;
		}
		
		// Select a random piece
		const piece = pieces[Math.floor(Math.random() * pieces.length)];
		
		// Generate random destination
		const destX = Math.floor(Math.random() * 10);
		const destY = Math.floor(Math.random() * 10);
		
		console.log(\`Moving \${piece.type} from (\${piece.position.x}, \${piece.position.y}) to (\${destX}, \${destY})\`);
		
		const response = await axios.post(\`\${API_URL}/games/\${currentGameId}/computer-move\`, {
			moveType: 'chess',
			pieceId: piece.id,
			from: { x: piece.position.x, y: piece.position.y },
			to: { x: destX, y: destY }
		}, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			console.log('Chess piece moved successfully');
			return true;
		} else {
			console.error('Failed to move chess piece:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error moving chess piece:', error.message);
		return false;
	}
}

/**
 * Main function
 */
async function main() {
	console.log(\`Starting \${PLAYER_NAME}...\`);
	
	// Register player
	if (!await registerPlayer()) {
		console.error('Failed to register player. Exiting...');
		process.exit(1);
	}
	
	// Join a game
	if (!await joinGame()) {
		console.error('Failed to join a game. Exiting...');
		process.exit(1);
	}
	
	// Update game state
	await updateGameState();
	
	// Game loop
	console.log('Starting game loop...');
	
	// Example of a simple game loop
	// In a real implementation, you would listen for turn notifications
	// and make moves accordingly
	setInterval(async () => {
		await updateGameState();
		
		if (gameState && gameState.currentTurn === playerId) {
			console.log('It\\'s my turn!');
			
			if (gameState.currentMoveType === 'tetromino') {
				await placeRandomTetromino();
			} else {
				await makeRandomChessMove();
			}
		}
	}, 5000);
}

// Start the player
main().catch(console.error);
`;
	
	const templatePath = path.join(CONFIG.examplesDir, `${playerName.toLowerCase().replace(/\s+/g, '-')}.js`);
	fs.writeFileSync(templatePath, templateContent);
	console.log(`Player template created at: ${templatePath}`);
}

// Main function
async function main() {
	console.log('=== Shaktris Computer Player Setup ===');
	
	// Ensure directories exist
	ensureDirectoriesExist();
	
	// Check dependencies
	checkDependencies();
	
	// Get user input for configuration
	rl.question('Enter port for callback server [8080]: ', (port) => {
		port = port || CONFIG.defaultPort;
		
		rl.question('Enter API URL [http://localhost:3020/api]: ', (apiUrl) => {
			apiUrl = apiUrl || CONFIG.defaultApiUrl;
			
			// Create config file
			createConfigFile(port, apiUrl);
			
			rl.question('Enter a name for your computer player [MyComputerPlayer]: ', (playerName) => {
				playerName = playerName || 'MyComputerPlayer';
				
				// Create player template
				createPlayerTemplate(playerName);
				
				console.log('\nSetup complete! You can now start developing your computer player.');
				console.log(`\nTo run your player: node ${CONFIG.examplesDir}/${playerName.toLowerCase().replace(/\s+/g, '-')}.js`);
				console.log('\nRefer to the documentation in docs/computer-player-api.md for more information.');
				
				rl.close();
			});
		});
	});
}

// Run the setup
main().catch(console.error); 