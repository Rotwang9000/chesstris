# NetworkManager Class Implementation

## Overview

The NetworkManager has been refactored from a module-based approach to a class-based implementation to support unit testing and prevent state inconsistencies across the application.

## Key Changes

1. **Class-based Implementation**: The core functionality is now in `NetworkManagerClass.js`.
2. **Adapter Pattern**: `networkManager.js` now serves as an adapter that exports a singleton instance.
3. **Consistent State**: All components now use the same NetworkManager instance, ensuring state consistency.
4. **Unit Testing**: The class-based approach makes it easier to test network functionality in isolation.

## Usage

There are two ways to use the NetworkManager:

### Modern Import (Recommended)

```javascript
import NetworkManager from './utils/networkManager.js';

// Use the instance directly
NetworkManager.initialize('PlayerName')
  .then(() => NetworkManager.joinGame())
  .then(gameData => console.log('Joined game:', gameData));
```

### Legacy Import (For Compatibility)

```javascript
import * as NetworkManager from './utils/networkManager.js';

// Use the module functions
NetworkManager.initialize('PlayerName')
  .then(() => NetworkManager.joinGame())
  .then(gameData => console.log('Joined game:', gameData));
```

## Global Access

The NetworkManager is still available globally as `window.NetworkManager` for compatibility with existing code.

## Unit Testing

A simple unit test is provided in `public/js/utils/tests/NetworkManagerTest.js`.

To run the tests:

```
NODE_ENV=test node public/js/utils/tests/NetworkManagerTest.js
```

## Method Reference

The following methods are available:

- `initialize(playerName)`: Connect to the server
- `ensureConnected(playerName, maxAttempts)`: Ensure the connection is established
- `joinGame(gameIdArg)`: Join a game
- `leaveGame()`: Leave the current game
- `onMessage(messageType, handler)`: Listen for specific message types
- `on(eventType, callback)`: Listen for events
- `sendMessage(eventType, data)`: Send a message to the server
- `submitTetrominoPlacement(tetromino)`: Submit a tetromino placement
- `submitChessMove(move)`: Submit a chess move
- `isConnected()`: Check if connected to the server
- `getPlayerId()`: Get the current player ID
- `getGameId()`: Get the current game ID
- `getGameState(options)`: Get the current game state
- `getCurrentGameState()`: Get the cached game state

## Socket Event Contract (current)

The server is authoritative; clients submit actions and receive state via Socket.IO.

### Client → Server

- `join_game` `{ playerName?, gameId? }`
  - Ack: `{ success, gameId, playerId, playerName, gameState }`
- `get_game_state` `{ gameId?, options? }`
  - `options.aoi` (optional): request a board window for global-world scalability
    - `{ centerX, centerZ, radius }` or `{ minX, maxX, minZ, maxZ }`
  - Server also emits `game_state` `{ success, gameId, state, players, timestamp }`
- `tetromino_placed` `{ tetromino }`
  - Ack success: `{ success:true, boardState, clearedRows, hasValidMoves }`
  - Ack fail: `{ success:false, error:'invalid_placement', reason, message }`
  - Rate limit: `{ success:false, error:'rate_limited', retryAfterMs }`
- `chess_move` `{ pieceId, targetPosition:{x,z} }`
  - Ack success: `{ success:true, updatedPiece, capturedPiece? }`
  - Rate limit: `{ success:false, error:'rate_limited', retryAfterMs }`

### Server → Client

- `game_update` (full or delta)
  - Full: `{ ...state, fullUpdate:true, timestamp, boardBounds }`
  - Delta: `{ fullUpdate:false, timestamp, boardChanges, removedCells, boardBounds, chessPieces, lastAction }`
- `row_cleared` `{ rows:[z,...], cols:[x,...], playerId }`
  - `rows` are z-row indices (X-aligned lines), `cols` are x-column indices (Z-aligned lines)
  - Either array may be empty; at least one will be non-empty when the event is emitted
- `player_joined` / `player_left`

### Notes on deltas

When `fullUpdate:false`, the client should:
- apply each `boardChanges[]` item (set/overwrite `board.cells["x,z"]`)
- apply each `removedCells[]` item (delete `board.cells["x,z"]`)
- update local bounds from `boardBounds`

## Benefits of Class-based Approach

1. **Improved Testability**: The class can be instantiated for testing with mocked dependencies.
2. **State Isolation**: Each instance maintains its own state.
3. **Dependency Injection**: Dependencies can be injected for testing.
4. **Better Encapsulation**: Internal methods and properties are clearly separated from the public API. 