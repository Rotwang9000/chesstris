# Shaktris API Documentation for External Computer Players

This document describes the API endpoints available for third-party developers to create their own computer players for Shaktris.

## Overview

Shaktris supports external computer players through a RESTful API. This allows developers to create their own AI algorithms that can play the game without having to modify the core game code. The API enforces a minimum 10-second delay between moves to ensure fair play and prevent server overload.

## Authentication

All API requests must include a valid API token. This token is provided when you register your computer player with the system.

## Player Registration

### Register a Computer Player

Before your computer player can join games, you need to register it with the system.

**Endpoint**: `POST /api/computer-players/register`

**Request Body**:
```json
{
	"name": "Your Computer Player Name",
	"apiEndpoint": "https://your-server.com/callback",
	"apiKey": "optional-api-key-for-callbacks",
	"description": "A brief description of your computer player"
}
```

**Response**:
```json
{
	"success": true,
	"message": "Computer player registered successfully",
	"playerId": "ext-ai-12345678",
	"apiToken": "your-api-token"
}
```

**Important**: Store your `playerId` and `apiToken` securely. You will need these for all future API requests.

## Game Management

### Get All Games

Retrieve a list of all available games that your computer player can join.

**Endpoint**: `GET /api/games`

**Response**:
```json
{
	"success": true,
	"games": ["game-12345678", "game-87654321", "default-game"]
}
```

### Get Game Details

Retrieve detailed information about a specific game.

**Endpoint**: `GET /api/games/:gameId`

**Parameters**:
- `gameId`: The ID of the game to retrieve

**Response**:
```json
{
	"success": true,
	"gameId": "game-12345678",
	"gameState": {
		"board": [...],
		"players": {...},
		"chessPieces": [...],
		"status": "in_progress"
	}
}
```

### Join a Game

Add your computer player to an existing game.

**Endpoint**: `POST /api/games/:gameId/add-computer-player`

**Parameters**:
- `gameId`: The ID of the game to join

**Request Body**:
```json
{
	"computerId": "ext-ai-12345678",
	"apiToken": "your-api-token"
}
```

**Response**:
```json
{
	"success": true,
	"message": "Computer player added to game successfully",
	"gameId": "game-12345678",
	"computerId": "ext-ai-12345678"
}
```

## Game Actions

### Get Available Tetromino Shapes

Retrieve the tetromino shapes available for your player to place.

**Endpoint**: `GET /api/games/:gameId/available-tetrominos`

**Parameters**:
- `gameId`: The ID of the game
- `playerId`: Your computer player ID
- `apiToken`: Your API token

**Response**:
```json
{
	"success": true,
	"tetrominos": [
		{ "shape": "I", "rotations": 2 },
		{ "shape": "J", "rotations": 4 },
		{ "shape": "L", "rotations": 4 },
		{ "shape": "O", "rotations": 1 },
		{ "shape": "S", "rotations": 2 },
		{ "shape": "T", "rotations": 4 },
		{ "shape": "Z", "rotations": 2 }
	]
}
```

### Get Player Chess Pieces

Retrieve the chess pieces belonging to your player.

**Endpoint**: `GET /api/games/:gameId/chess-pieces`

**Parameters**:
- `gameId`: The ID of the game
- `playerId`: Your computer player ID
- `apiToken`: Your API token

**Response**:
```json
{
	"success": true,
	"chessPieces": [
		{
			"id": "piece-12345",
			"type": "king",
			"position": { "x": 4, "y": 0 }
		},
		{
			"id": "piece-23456",
			"type": "queen",
			"position": { "x": 3, "y": 0 }
		}
	]
}
```

### Submit a Move

This is the main endpoint used to make a move in the game. You can either place a tetromino or move a chess piece.

**Endpoint**: `POST /api/games/:gameId/computer-move`

**Parameters**:
- `gameId`: The ID of the game

**Request Body**:
```json
{
	"playerId": "ext-ai-12345678",
	"apiToken": "your-api-token",
	"moveType": "tetromino",
	"moveData": {
		"shape": "I",
		"rotation": 0,
		"x": 5,
		"y": 10
	}
}
```

OR

```json
{
	"playerId": "ext-ai-12345678",
	"apiToken": "your-api-token",
	"moveType": "chess",
	"moveData": {
		"pieceId": "piece-12345",
		"fromX": 4,
		"fromY": 0,
		"toX": 5,
		"toY": 1
	}
}
```

**Response**:
```json
{
	"success": true,
	"message": "Move processed successfully",
	"gameState": {
		"board": [...],
		"players": {...},
		"chessPieces": [...],
		"status": "in_progress"
	}
}
```

**Important**: You can only make a move once every 10 seconds. If you try to move more frequently, you'll receive a 429 error with a `retryAfter` value indicating how many seconds to wait before retrying.

## Game Rules and Constraints

When building your computer player, be aware of these constraints:

1. **Minimum Move Time**: You must wait at least 10 seconds between moves.
2. **Tetromino Connectivity**: Tetrominos can only be placed if at least one block connects to an existing cell that has a path back to your king.
3. **Valid Chess Moves**: Chess pieces can only move according to standard chess rules, and only on cells that are part of the board.
4. **Turn Order**: Each player cycles through placing a tetromino and then moving a chess piece.

## Error Handling

All API endpoints return appropriate HTTP status codes:

- `200 OK`: Request successful
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Invalid API token
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Exceeded rate limit (too many moves too quickly)
- `500 Internal Server Error`: Server error

Error responses include a JSON body with information about the error:

```json
{
	"success": false,
	"message": "Error description"
}
```

## Example Computer Player Implementation

Here's a simple example of how to implement a computer player in Node.js:

```javascript
const axios = require('axios');

// Configuration
const API_URL = 'https://shaktris.com/api';
const PLAYER_ID = 'ext-ai-12345678';
const API_TOKEN = 'your-api-token';
const GAME_ID = 'game-87654321';

// Join the game
async function joinGame() {
	try {
		const response = await axios.post(`${API_URL}/games/${GAME_ID}/add-computer-player`, {
			computerId: PLAYER_ID,
			apiToken: API_TOKEN
		});
		
		console.log('Joined game:', response.data);
		return response.data.success;
	} catch (error) {
		console.error('Error joining game:', error.response?.data || error.message);
		return false;
	}
}

// Get game state
async function getGameState() {
	try {
		const response = await axios.get(`${API_URL}/games/${GAME_ID}`);
		return response.data.gameState;
	} catch (error) {
		console.error('Error getting game state:', error.response?.data || error.message);
		return null;
	}
}

// Get available tetrominos
async function getAvailableTetrominos() {
	try {
		const response = await axios.get(
			`${API_URL}/games/${GAME_ID}/available-tetrominos?playerId=${PLAYER_ID}&apiToken=${API_TOKEN}`
		);
		return response.data.tetrominos;
	} catch (error) {
		console.error('Error getting tetrominos:', error.response?.data || error.message);
		return [];
	}
}

// Get chess pieces
async function getChessPieces() {
	try {
		const response = await axios.get(
			`${API_URL}/games/${GAME_ID}/chess-pieces?playerId=${PLAYER_ID}&apiToken=${API_TOKEN}`
		);
		return response.data.chessPieces;
	} catch (error) {
		console.error('Error getting chess pieces:', error.response?.data || error.message);
		return [];
	}
}

// Make a move (tetromino or chess)
async function makeMove(moveType, moveData) {
	try {
		const response = await axios.post(`${API_URL}/games/${GAME_ID}/computer-move`, {
			playerId: PLAYER_ID,
			apiToken: API_TOKEN,
			moveType,
			moveData
		});
		
		console.log(`${moveType} move successful:`, response.data);
		return true;
	} catch (error) {
		// Check if we need to wait before retrying
		if (error.response?.status === 429) {
			const retryAfter = error.response.data.retryAfter || 10;
			console.log(`Rate limited. Retrying in ${retryAfter} seconds...`);
			await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
			return makeMove(moveType, moveData);
		}
		
		console.error(`Error making ${moveType} move:`, error.response?.data || error.message);
		return false;
	}
}

// Main game loop
async function gameLoop() {
	// Join the game
	const joined = await joinGame();
	if (!joined) return;
	
	// Game loop
	while (true) {
		// Get game state
		const gameState = await getGameState();
		if (!gameState || gameState.status === 'game_over') {
			console.log('Game over.');
			break;
		}
		
		// Get available tetrominos
		const tetrominos = await getAvailableTetrominos();
		if (tetrominos.length > 0) {
			// Place a tetromino (simple strategy: place the first available tetromino at a random position)
			const tetromino = tetrominos[0];
			const x = Math.floor(Math.random() * 10);
			const y = Math.floor(Math.random() * 10);
			
			await makeMove('tetromino', {
				shape: tetromino.shape,
				rotation: 0,
				x,
				y
			});
		}
		
		// Wait a bit before the next action (chess move)
		await new Promise(resolve => setTimeout(resolve, 11000));
		
		// Get chess pieces
		const chessPieces = await getChessPieces();
		if (chessPieces.length > 0) {
			// Move a chess piece (simple strategy: move a random piece to a random adjacent square)
			const piece = chessPieces[Math.floor(Math.random() * chessPieces.length)];
			const dx = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
			const dy = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
			
			await makeMove('chess', {
				pieceId: piece.id,
				fromX: piece.position.x,
				fromY: piece.position.y,
				toX: piece.position.x + dx,
				toY: piece.position.y + dy
			});
		}
		
		// Wait before the next cycle
		await new Promise(resolve => setTimeout(resolve, 11000));
	}
}

// Start the game loop
gameLoop().catch(console.error);
```

## Rate Limiting

To ensure fair play and server stability, the API enforces the following rate limits:

1. **Move Rate**: Maximum 1 move per 10 seconds per player
2. **API Requests**: Maximum 60 requests per minute per API token

If you exceed these limits, you'll receive a 429 response with a `retryAfter` header indicating how long to wait before retrying.

## Support

If you have any questions or issues with the API, please contact support@shaktris.com. 