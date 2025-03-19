# Shaktris Computer Player API

This document provides a comprehensive guide to creating computer players for Shaktris using the external computer player API.

## Overview

Shaktris allows developers to create their own computer players (AI bots) that can play the game through a RESTful API. This enables you to implement custom strategies and algorithms without having to modify the core game code.

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm (v6+)
- Basic understanding of RESTful APIs
- Knowledge of chess and Tetris game mechanics

### Installation

1. Clone the Shaktris repository:
   ```
   git clone https://github.com/yourusername/shaktris.git
   cd shaktris
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the game server:
   ```
   npm run dev
   ```

## Creating a Computer Player

There are two main approaches to creating a computer player:

1. **Simple API Client**: Make direct API calls to the game server
2. **Callback Server**: Set up a server to receive real-time game events

### Example Computer Players

We provide several example implementations to help you get started:

- `examples/simple-computer-player.js`: A basic computer player that makes direct API calls
- `examples/callback-server.js`: A simple callback server for receiving game events

To run the example computer player:

```
npm run run:simple-player
```

To run the callback server:

```
npm run run:callback-server
```

To run multiple computer players for testing:

```
npm run run:computer-players
```

## API Reference

### Player Registration

Before your computer player can join games, you need to register it with the system.

**Endpoint**: `POST /api/computer-players/register`

**Request Body**:
```json
{
	"name": "Your Computer Player Name",
	"apiEndpoint": "https://your-server.com/callback",
	"difficulty": "medium",
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

### Game Management

#### Get All Games

Retrieve a list of all available games that your computer player can join.

**Endpoint**: `GET /api/games`

#### Get Game Details

Retrieve detailed information about a specific game.

**Endpoint**: `GET /api/games/:gameId`

#### Join a Game

Add your computer player to an existing game.

**Endpoint**: `POST /api/games/:gameId/add-computer-player`

### Game Actions

#### Get Available Tetromino Shapes

Retrieve the tetromino shapes available for your player to place.

**Endpoint**: `GET /api/games/:gameId/available-tetrominos`

#### Get Chess Pieces

Retrieve the chess pieces belonging to your player.

**Endpoint**: `GET /api/games/:gameId/chess-pieces`

#### Submit a Move

This is the main endpoint used to make a move in the game. You can either place a tetromino or move a chess piece.

**Endpoint**: `POST /api/games/:gameId/computer-move`

## Game Rules

### Tetromino Placement Rules

1. Tetrominos can only be placed if at least one block connects to an existing cell that has a path back to your king.
2. Tetrominos must be placed within the bounds of the board.
3. Tetrominos cannot overlap with existing pieces.

### Chess Movement Rules

1. Chess pieces follow standard chess movement rules.
2. Pieces can only move on cells that are part of the board (have been built with tetrominos).
3. Pieces cannot move through other pieces (except knights).

### Turn Order

1. Each player cycles through placing a tetromino and then moving a chess piece.
2. There is a minimum 10-second delay between moves to ensure fair play.

## Callback Server

If you provide an `apiEndpoint` when registering your computer player, the game server will send HTTP POST requests to that endpoint when events occur in the game.

### Event Types

- `game_update`: General game state update
- `player_joined`: A new player has joined the game
- `player_left`: A player has left the game
- `tetromino_placed`: A tetromino has been placed on the board
- `chess_move`: A chess piece has been moved
- `game_over`: The game has ended
- `your_turn`: It's your player's turn to make a move

### Callback Request Format

```json
{
	"event": "event_type",
	"data": {
		// Event-specific data
	}
}
```

### Callback Response

Your server should respond with a 200 OK status code and a JSON body:

```json
{
	"success": true
}
```

## Testing Your Computer Player

We provide a test framework to help you validate your computer player implementation:

```
npm run test:computer-players
```

This will run a series of tests to ensure your computer player follows the game rules and can interact with the API correctly.

## Best Practices

1. **Rate Limiting**: Respect the 10-second minimum delay between moves.
2. **Error Handling**: Implement robust error handling to deal with API failures.
3. **Reconnection Logic**: Handle disconnections gracefully and implement reconnection logic.
4. **Strategy Separation**: Separate your game strategy from the API interaction code.
5. **Logging**: Implement comprehensive logging to help debug issues.

## Example Implementation

Here's a simple example of a computer player implementation in Node.js:

```javascript
const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:3020/api';
const PLAYER_NAME = 'MyComputerPlayer';
const API_ENDPOINT = 'http://localhost:8080/callback';

// Register player
async function registerPlayer() {
	const response = await axios.post(`${API_URL}/computer-players/register`, {
		name: PLAYER_NAME,
		apiEndpoint: API_ENDPOINT,
		difficulty: "medium",
		description: 'My awesome computer player'
	});
	
	const { playerId, apiToken } = response.data;
	
	// Store these securely for future API calls
	console.log(`Registered as ${playerId} with token ${apiToken}`);
	
	return { playerId, apiToken };
}

// Main function
async function main() {
	const { playerId, apiToken } = await registerPlayer();
	
	// Join a game
	const games = await axios.get(`${API_URL}/games`);
	const gameId = games.data.games[0];
	
	await axios.post(`${API_URL}/games/${gameId}/add-computer-player`, {
		computerId: playerId,
		apiToken
	});
	
	console.log(`Joined game ${gameId}`);
	
	// Game loop would go here...
}

main().catch(console.error);
```

## Troubleshooting

### Common Issues

1. **API Token Invalid**: Ensure you're using the correct API token from registration.
2. **Rate Limiting**: If you receive a 429 error, you're making moves too quickly.
3. **Invalid Move**: Check that your moves follow the game rules.
4. **Connection Issues**: Verify your network connection and the game server status.

### Debugging

1. Enable verbose logging in your computer player.
2. Use the test framework to validate your implementation.
3. Check the game server logs for error messages.

## Support

If you have any questions or issues with the API, please contact support@shaktris.com or open an issue on the GitHub repository.

## Turn Sequence

Each player must follow a specific turn sequence:

1. First, place a tetromino piece on the board
2. Then, move a chess piece

This sequence is enforced by the API, which indicates the expected move type through the `currentMoveType` field in the game state. Making a move out of sequence will result in a "Not your turn" error.

### Handling No Valid Chess Moves

If a player has no valid chess moves available (e.g., all their chess pieces are blocked), the API will automatically allow them to skip the chess move and continue with tetromino placement. There are two ways to handle this situation:

1. **Automatic Detection**: When attempting to make a chess move, if the server detects that the player has no valid chess moves, it will return a response with:
   ```json
   {
     "success": false,
     "error": "No valid chess moves available",
     "skipToTetromino": true,
     "gameState": { ... }
   }
   ```
   The `skipToTetromino` flag indicates that the player should proceed to making a tetromino move.

2. **Manual Skip**: You can explicitly skip the chess move by sending a request to the chess move endpoint with a `skipMove` flag:
   ```json
   {
     "gameId": "your-game-id",
     "playerId": "your-player-id",
     "moveData": {
       "skipMove": true
     }
   }
   ```

### Common Turn Sequence Errors

- **"Expected tetromino move, got chess"**: You're trying to make a chess move when the API expects a tetromino placement.
- **"Expected chess move, got tetromino"**: You're trying to place a tetromino when the API expects a chess move.

### Checking the Turn Sequence

Always check the `currentMoveType` field in the player's state to determine what type of move to make:

```javascript
// Example: Checking what type of move to make
function determineNextMove(gameState, playerId) {
  const player = gameState.players[playerId];
  
  if (!player) {
    console.error('Player not found in game state');
    return;
  }
  
  const moveType = player.currentMoveType;
  
  if (moveType === 'tetromino') {
    // Make a tetromino move
    placeTetromino();
  } else if (moveType === 'chess') {
    // Make a chess move or handle no valid moves
    makeChessMove();
  } else {
    console.error(`Unknown move type: ${moveType}`);
  }
}
```

## API Endpoints

### Get Game State

Retrieves the current state of a game.

**Endpoint:** `GET /api/game/:gameId`

**Response:**
```json
{
  "success": true,
  "gameState": {
    "id": "game-123",
    "board": [...],
    "players": {
      "player-1": {
        "id": "player-1",
        "currentMoveType": "tetromino",
        ...
      },
      ...
    },
    ...
  }
}
```

### Join Game

Joins an existing game.

**Endpoint:** `POST /api/join`

**Request:**
```json
{
  "gameId": "game-123",
  "playerId": "player-1"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Player player-1 joined game game-123",
  "gameState": {...}
}
```

### Create Game

Creates a new game.

**Endpoint:** `POST /api/create`

**Request:**
```json
{
  "playerId": "player-1",
  "options": {
    "maxPlayers": 2048,
    "boardWidth": 20,
    "boardHeight": 20
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Game game-123 created and player player-1 joined",
  "gameId": "game-123",
  "gameState": {...}
}
```

### Place Tetromino

Places a tetromino piece on the board.

**Endpoint:** `POST /api/move/tetromino`

**Request:**
```json
{
  "gameId": "game-123",
  "playerId": "player-1",
  "moveData": {
    "pieceType": "I",
    "rotation": 0,
    "x": 5,
    "y": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tetris piece placed successfully",
  "completedRows": 0,
  "gameState": {...}
}
```

### Move Chess Piece

Moves a chess piece on the board.

**Endpoint:** `POST /api/move/chess`

**Request:**
```json
{
  "gameId": "game-123",
  "playerId": "player-1",
  "moveData": {
    "fromX": 5,
    "fromY": 10,
    "toX": 6,
    "toY": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Chess piece moved successfully",
  "capture": null,
  "gameState": {...}
}
```

**Skip Chess Move Request (when no valid moves):**
```json
{
  "gameId": "game-123",
  "playerId": "player-1",
  "moveData": {
    "skipMove": true
  }
}
```

**Response when no valid chess moves:**
```json
{
  "success": false,
  "error": "No valid chess moves available",
  "skipToTetromino": true,
  "gameState": {...}
}
```

## Game Objects

### Game State

The game state object contains all information about the current state of the game.

```json
{
  "id": "game-123",
  "board": [...],
  "players": {
    "player-1": {
      "id": "player-1",
      "currentMoveType": "tetromino",
      ...
    },
    ...
  },
  "maxPlayers": 2048,
  "boardWidth": 20,
  "boardHeight": 20,
  "createdAt": 1621234567890,
  "lastUpdate": 1621234567890
}
```

### Board Cell

Each cell on the board can contain a tetromino block or a chess piece.

```json
{
  "type": "cell",
  "player": "player-1",
  "chessPiece": {
    "type": "king",
    "player": "player-1"
  }
}
```

### Chess Piece

A chess piece that can be moved on the board.

```json
{
  "type": "king",
  "player": "player-1"
}
```

### Tetromino Piece

A tetromino piece that can be placed on the board.

```json
{
  "pieceType": "I",
  "rotation": 0,
  "x": 5,
  "y": 10
}
```

## Tetromino Movement Limits

To ensure fair play between human and computer players, there are limits on how tetromino pieces can be moved:

1. **Horizontal Movement Limit**: For every unit of vertical movement (downward), a tetromino can only move a maximum of 3 units horizontally. This prevents computer players from having an unfair advantage by making extreme horizontal movements.

2. **Example**: If a tetromino moves down by 2 units, it can only move horizontally by a maximum of 6 units (3 × 2).

3. **Error Response**: If a move exceeds this limit, the server will return an error:
   ```json
   {
     "success": false,
     "error": "Horizontal movement (10) exceeds the limit of 6 squares for vertical movement of 2"
   }
   ```

4. **First Move Exception**: This limit does not apply to the first tetromino placement for each player.

This movement limit encourages more realistic and fair gameplay, as it simulates the constraints that human players face when playing with a keyboard or controller.

## Difficulty Levels

The API supports three difficulty levels for computer players: `easy`, `medium`, and `hard`. Each difficulty level affects the minimum time between moves for the computer player:

- **Easy**: 15 seconds minimum between moves
- **Medium**: 10 seconds minimum between moves (default)
- **Hard**: 5 seconds minimum between moves

You can specify the difficulty level when registering a computer player:

```
POST /api/computer-players/register
{
  "name": "My AI",
  "apiEndpoint": "https://example.com/my-ai",
  "difficulty": "medium",  // "easy", "medium", or "hard"
  "apiKey": "optional-api-key",
  "description": "Description of my AI"
}
```

If no difficulty is specified, `medium` will be used by default.

### Impact on Gameplay

The difficulty level primarily affects the minimum time between moves, which can be crucial in competitive scenarios. Computer players with harder difficulty settings can make moves more frequently, simulating a more skilled player.

Human players will always have the standard 10-second minimum time between moves, but computer players' timing will vary based on their difficulty level.

## Turn Sequence 