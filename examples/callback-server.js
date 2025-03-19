/**
 * Callback Server for External Computer Players
 * 
 * This is a simple Express server that receives callbacks from the Shaktris game server
 * when events occur in the game. External computer players can use this to react to
 * game events in real-time.
 */

const express = require('express');
const bodyParser = require('body-parser');

// Configuration
const PORT = process.env.PORT || 8080;
const PLAYER_NAME = process.env.PLAYER_NAME || 'CallbackBot';

// Create Express app
const app = express();

// Middleware
app.use(bodyParser.json());

// Event handlers
const eventHandlers = {
	// Game state update
	'game_update': (data) => {
		console.log(`[${PLAYER_NAME}] Game state updated`);
		// Process game state update
		// This could trigger a move in response
	},
	
	// Player joined
	'player_joined': (data) => {
		console.log(`[${PLAYER_NAME}] Player joined: ${data.playerName}`);
	},
	
	// Player left
	'player_left': (data) => {
		console.log(`[${PLAYER_NAME}] Player left: ${data.playerId}`);
	},
	
	// Tetromino placed
	'tetromino_placed': (data) => {
		console.log(`[${PLAYER_NAME}] Tetromino placed by ${data.playerId}`);
		// React to tetromino placement
	},
	
	// Chess move
	'chess_move': (data) => {
		console.log(`[${PLAYER_NAME}] Chess move by ${data.playerId}`);
		// React to chess move
	},
	
	// Game over
	'game_over': (data) => {
		console.log(`[${PLAYER_NAME}] Game over. Winner: ${data.winner}`);
	},
	
	// Your turn
	'your_turn': (data) => {
		console.log(`[${PLAYER_NAME}] It's your turn!`);
		// This is a good time to make a move
	}
};

// Callback endpoint
app.post('/callback', (req, res) => {
	try {
		const { event, data } = req.body;
		
		console.log(`[${PLAYER_NAME}] Received event: ${event}`);
		
		// Handle the event
		if (eventHandlers[event]) {
			eventHandlers[event](data);
		} else {
			console.log(`[${PLAYER_NAME}] Unknown event: ${event}`);
		}
		
		// Send success response
		res.json({ success: true });
	} catch (error) {
		console.error(`[${PLAYER_NAME}] Error handling callback:`, error);
		res.status(500).json({ success: false, error: error.message });
	}
});

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ status: 'ok', player: PLAYER_NAME });
});

// Start the server
app.listen(PORT, () => {
	console.log(`[${PLAYER_NAME}] Callback server listening on port ${PORT}`);
}); 