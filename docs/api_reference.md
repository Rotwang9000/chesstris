# Shaktris API Reference

## Overview

This document outlines the API endpoints and Socket.IO events used for communication between the Shaktris client and server.

## REST API Endpoints

### Game Management

#### GET /api/games

Retrieves a list of available game sessions.

**Response:**
```json
{
	"success": true,
	"games": [
		{
			"id": "game-id-1",
			"players": 2,
			"maxPlayers": 4,
			"status": "waiting",
			"created": 1615482000000
		},
		{
			"id": "game-id-2",
			"players": 1,
			"maxPlayers": 2,
			"status": "playing",
			"created": 1615482100000
		}
	]
}
```

#### GET /api/games/:id

Retrieves information about a specific game session.

**Response:**
```json
{
	"success": true,
	"game": {
		"id": "game-id-1",
		"players": [
			{
				"id": "player-id-1",
				"name": "Player1"
			},
			{
				"id": "player-id-2",
				"name": "Player2"
			}
		],
		"maxPlayers": 4,
		"status": "waiting",
		"created": 1615482000000,
		"settings": {
			"gameMode": "standard",
			"difficulty": "normal",
			"startLevel": 1,
			"boardSize": {
				"width": 10,
				"height": 20
			},
			"renderMode": "3d"
		}
	}
}
```

#### POST /api/games

Creates a new game session.

**Request:**
```json
{
	"maxPlayers": 2,
	"gameMode": "standard",
	"difficulty": "normal",
	"startLevel": 1,
	"boardSize": {
		"width": 10,
		"height": 20
	},
	"renderMode": "3d"
}
```

**Response:**
```json
{
	"success": true,
	"gameId": "game-id-1"
}
```

### Player Management

#### GET /api/players/:id

Retrieves information about a specific player.

**Response:**
```json
{
	"success": true,
	"player": {
		"id": "player-id-1",
		"name": "Player1",
		"gameId": "game-id-1",
		"stats": {
			"gamesPlayed": 10,
			"gamesWon": 5,
			"highScore": 1000
		}
	}
}
```

#### PUT /api/players/:id

Updates information about a specific player.

**Request:**
```json
{
	"name": "NewPlayerName"
}
```

**Response:**
```json
{
	"success": true,
	"player": {
		"id": "player-id-1",
		"name": "NewPlayerName",
		"gameId": "game-id-1"
	}
}
```

## Socket.IO Events

### Connection Events

#### connect

Emitted when a client connects to the server.

**Client Receives:**
```json
{
	"message": "Connected to server"
}
```

#### disconnect

Emitted when a client disconnects from the server.

**Client Receives:**
```json
{
	"message": "Disconnected from server"
}
```

#### error

Emitted when an error occurs.

**Client Receives:**
```json
{
	"message": "Error message",
	"code": "ERROR_CODE"
}
```

### Player Events

#### player_id

Emitted when a player ID is assigned to a client.

**Client Receives:**
```
"player-id-1"
```

#### player_joined

Emitted when a player joins a game.

**Client Receives:**
```json
{
	"playerId": "player-id-1",
	"playerName": "Player1",
	"gameId": "game-id-1",
	"players": [
		{
			"id": "player-id-1",
			"name": "Player1"
		},
		{
			"id": "player-id-2",
			"name": "Player2"
		}
	]
}
```

#### player_left

Emitted when a player leaves a game.

**Client Receives:**
```json
{
	"playerId": "player-id-1",
	"gameId": "game-id-1",
	"players": [
		{
			"id": "player-id-2",
			"name": "Player2"
		}
	]
}
```

### Game Events

#### join_game

Emitted when a player wants to join a game.

**Client Sends:**
```json
"game-id-1", "Player1", callback
```

**Client Receives (via callback):**
```json
{
	"success": true,
	"gameId": "game-id-1"
}
```

#### create_game

Emitted when a player wants to create a new game.

**Client Sends:**
```json
{
	"maxPlayers": 2,
	"gameMode": "standard",
	"difficulty": "normal",
	"startLevel": 1,
	"boardSize": {
		"width": 10,
		"height": 20
	},
	"renderMode": "3d"
}, callback
```

**Client Receives (via callback):**
```json
{
	"success": true,
	"gameId": "game-id-1"
}
```

#### game_update

Emitted when the game state is updated.

**Client Sends:**
```json
{
	"board": [...],
	"chessPieces": [...],
	"score": 1000,
	"level": 2,
	"lines": 10
}
```

**Client Receives:**
```json
{
	"board": [...],
	"chessPieces": [...],
	"score": 1000,
	"level": 2,
	"lines": 10
}
```

#### tetromino_placed

Emitted when a player places a tetromino.

**Client Sends:**
```json
{
	"board": [...],
	"piece": {
		"type": "T",
		"position": { "x": 5, "y": 10 },
		"rotation": 0
	},
	"score": 100
}
```

**Client Receives:**
```json
{
	"playerId": "player-id-1",
	"board": [...],
	"piece": {
		"type": "T",
		"position": { "x": 5, "y": 10 },
		"rotation": 0
	},
	"score": 100
}
```

#### chess_move

Emitted when a player moves a chess piece.

**Client Sends:**
```json
{
	"chessPieces": [...],
	"piece": {
		"type": "pawn",
		"from": { "x": 1, "y": 1 },
		"to": { "x": 1, "y": 2 }
	},
	"captured": null
}
```

**Client Receives:**
```json
{
	"playerId": "player-id-1",
	"chessPieces": [...],
	"piece": {
		"type": "pawn",
		"from": { "x": 1, "y": 1 },
		"to": { "x": 1, "y": 2 }
	},
	"captured": null
}
```

#### game_over

Emitted when a game ends.

**Client Receives:**
```json
{
	"winner": "player-id-1",
	"reason": "king_captured"
}
```

## Data Structures

### Game State

```json
{
	"board": [
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		...
	],
	"chessPieces": [
		{
			"id": "piece-id-1",
			"type": "pawn",
			"player": "player-id-1",
			"position": { "x": 1, "y": 1 },
			"hasMoved": false
		},
		...
	],
	"players": [
		{
			"id": "player-id-1",
			"name": "Player1",
			"score": 1000,
			"level": 2,
			"lines": 10,
			"nextPiece": "T",
			"heldPiece": "L"
		},
		...
	],
	"gameMode": "standard",
	"difficulty": "normal",
	"startLevel": 1,
	"boardSize": {
		"width": 10,
		"height": 20
	},
	"renderMode": "3d",
	"status": "playing",
	"lastAction": {
		"type": "chess_move",
		"playerId": "player-id-1",
		"data": {
			"piece": {
				"type": "pawn",
				"from": { "x": 1, "y": 1 },
				"to": { "x": 1, "y": 2 }
			},
			"captured": null
		}
	}
}
```

### Tetromino Piece

```json
{
	"type": "T",
	"position": { "x": 5, "y": 10 },
	"rotation": 0,
	"blocks": [
		{ "x": 0, "y": 0 },
		{ "x": -1, "y": 0 },
		{ "x": 1, "y": 0 },
		{ "x": 0, "y": 1 }
	]
}
```

### Chess Piece

```json
{
	"id": "piece-id-1",
	"type": "pawn",
	"player": "player-id-1",
	"position": { "x": 1, "y": 1 },
	"hasMoved": false,
	"isPromoted": false
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `GAME_NOT_FOUND` | The requested game was not found |
| `GAME_FULL` | The game is already at maximum capacity |
| `INVALID_MOVE` | The requested move is invalid |
| `INVALID_PLACEMENT` | The requested tetromino placement is invalid |
| `PLAYER_NOT_FOUND` | The requested player was not found |
| `SERVER_ERROR` | An internal server error occurred |
| `UNAUTHORIZED` | The client is not authorized to perform the requested action | 