# Shaktris Implementation Guide

## Core Gameplay Mechanics - Missing or Incomplete Features

This guide outlines the features from the core gameplay mechanics that need to be implemented or corrected in the backend.

### 1. Tetromino Connectivity Rules

**Current Status:** Partially Implemented

The basic tetromino connectivity rule is implemented in `_canPlaceTetromino()` which checks if a tetromino has an adjacent cell with a path to the king. However, there are issues with the Z-axis logic:

**Required Implementation:**
- The Z-axis logic needs to be revised. Currently, the code doesn't properly handle the 3D aspect:
  - When a tetromino reaches Z=1, if there's a cell underneath, it should explode to nothing
  - When a tetromino reaches Z=0 and has a neighboring cell (with a path to the king), it should stick and become 4 cells
  - Otherwise it should continue falling

```javascript
// Implementation in _canPlaceTetromino() needs to include Z-axis logic
if (z === 1 && this._hasCellUnderneath(game, x, y)) {
	return false; // Tetromino will explode
}

if (z === 0 && this._hasAdjacentCell(game, x, y, playerId) && this._hasPathToKing(game, adjacentX, adjacentY, playerId)) {
	return true; // Tetromino will stick
}

// If z < 0, tetromino continues falling
```

### 2. Pawn Promotion

**Current Status:** Not Implemented

The automatic promotion of pawns after moving 8 spaces forward isn't implemented.

**Required Implementation:**
- Add logic to the `moveChessPiece()` function to track pawn movement distances
- When a pawn has moved 8 spaces forward, automatically promote it to a knight

```javascript
// In the moveChessPiece function, after validating the move:
if (piece.type === 'pawn') {
	// Initialize moveCount if it doesn't exist
	if (!piece.moveCount) piece.moveCount = 0;
	
	// Count only forward movement based on player's perspective
	const forwardDirection = ...; // Determine based on player's home zone orientation
	if ((forwardDirection === 'up' && destY < startY) || 
	    (forwardDirection === 'down' && destY > startY) ||
	    (forwardDirection === 'left' && destX < startX) ||
	    (forwardDirection === 'right' && destX > startX)) {
		piece.moveCount += Math.abs(destY - startY) || Math.abs(destX - startX);
	}
	
	// Check for promotion
	if (piece.moveCount >= 8) {
		piece.type = 'knight';
		// Update piece properties and visuals
	}
}
```

### 3. Asynchronous Turns

**Current Status:** Partially Implemented

The basic turn structure exists but needs refinement to fully implement the asynchronous turn cycle.

**Required Implementation:**
- Ensure each player has their own sequence: tetromino placement → chess piece movement
- Implement minimum 10-second turn length 
- Add difficulty-based timing adjustments

```javascript
// Add to player object when joining:
player.lastMoveTime = Date.now();
player.minMoveInterval = 10000; // 10 seconds minimum between moves

// In moveChessPiece and placeTetrisPiece:
const timeSinceLastMove = Date.now() - player.lastMoveTime;
if (timeSinceLastMove < player.minMoveInterval) {
	return {
		success: false,
		error: `Must wait ${(player.minMoveInterval - timeSinceLastMove) / 1000} more seconds`,
		waitTime: player.minMoveInterval - timeSinceLastMove
	};
}
```

### 4. Piece Acquisition

**Current Status:** Partially Implemented

The `purchasePiece()` function exists but needs to be verified to use the correct pricing in Solana.

**Required Implementation:**
- Verify pricing matches the requirements:
  - 0.1 SOL for a pawn
  - 0.5 SOL for rooks, knights, or bishops
  - 1.0 SOL for a queen
  - No kings can be purchased

```javascript
// Update price constants:
const PIECE_PRICES = {
	pawn: 0.1,    // SOL
	rook: 0.5,    // SOL
	knight: 0.5,  // SOL
	bishop: 0.5,  // SOL
	queen: 1.0    // SOL
	// No king option
};

// In purchasePiece, prevent king purchases:
if (pieceType === 'king') {
	return {
		success: false,
		error: 'Kings cannot be purchased'
	};
}
```

### 5. King Capture Mechanics

**Current Status:** Partially Implemented

The basic king capture is implemented in `_handleKingCapture()`, but needs verification for the fee distribution.

**Required Implementation:**
- Ensure captured player's pieces are transferred to the victor
- Verify 50% of fees paid by the defeated player are awarded to the victor

```javascript
// In _transferFees:
const capturedPlayerFees = ...; // Get total fees paid by captured player
const feeReward = capturedPlayerFees * 0.5; // 50% of fees
// Award feeReward to captor
```

### 6. Player Pause System

**Current Status:** Implemented

The pause system appears to be fully implemented in `playerPause.js` and integrated with the game manager.

**Additional Testing:**
- Verify the system correctly protects cells and pieces during pauses
- Ensure proper cleanup after the 15-minute timeout
- Test the island reassignment logic when a player doesn't return

### 7. Row Clearing

**Current Status:** Partially Implemented

Row clearing is implemented, but needs verification it's using the correct rules.

**Required Implementation:**
- Ensure that any 8 cells in a line are cleared (not requiring full rows)
- Verify protected home zones are properly excluded
- Test that orphaned pieces drop back towards the player's king

```javascript
// Update _checkAndClearRows to clear rows with 8+ cells
const requiredCellsForClearing = 8; // Any 8 cells in a line
```

## Testing Recommendations

1. Create unit tests for each core mechanic
2. Test edge cases like:
   - Tetromino placement at different Z levels
   - Pawn promotion at exactly 8 moves
   - King capture and piece transfer
   - Row clearing with partial rows (8 cells)
   - Home zone protection during pauses
3. Integration tests to ensure all mechanics work together properly

## Next Steps

1. Implement the missing features in priority order:
   - Z-axis logic for tetromino placement
   - Pawn promotion
   - Asynchronous turns timing
2. Fix any incorrect implementations
3. Add comprehensive tests
4. Document the implementations for future reference 

## Outstanding Items

### Difficulty-based Timing Adjustments

While the basic 10-second minimum move interval is implemented, the code doesn't yet have difficulty-based timing adjustments for computer players. This would allow for different difficulty levels (easy/medium/hard) to have different timing constraints.

**Suggested Implementation:**
```javascript
// When initializing a computer player:
const difficulty = computerPlayer.difficulty || 'medium';
let moveInterval;

switch(difficulty) {
  case 'easy':
    moveInterval = 15000; // 15 seconds for easy opponents
    break;
  case 'medium':
    moveInterval = 10000; // 10 seconds for medium opponents
    break;
  case 'hard':
    moveInterval = 5000;  // 5 seconds for hard opponents
    break;
  default:
    moveInterval = 10000;
}

// Set the minimum move interval
game.players[computerId].minMoveInterval = moveInterval;
```

## Recommendations for Further Improvements

1. Add more comprehensive error handling and logging throughout the codebase
2. Create more extensive test coverage for edge cases
3. Consider performance optimizations for large-scale multiplayer scenarios
4. Add more detailed API documentation for external computer players
5. Implement accessibility features for the user interface 

# Shaktris Implementation Guide - Update

All core gameplay mechanics have now been fully implemented, including:

1. Z-axis logic for tetromino placement
2. Pawn promotion after 8 moves forward
3. Asynchronous turns with minimum move timing
4. Piece acquisition pricing rules
5. King capture mechanics
6. Row clearing with 8-cell rule
7. Player pause system
8. Difficulty-based timing adjustments for computer players

## Implementation Details for Difficulty-based Timing Adjustments

The difficulty-based timing feature has been implemented across several key points in the codebase:

### 1. Computer Player Registration (External)

When registering external computer players, the difficulty level is now accepted as a parameter and stored:

```javascript
// In GameManager.js - registerExternalComputerPlayer
const { id, name, apiEndpoint, difficulty = 'medium' } = playerData;

// Validate difficulty
const validDifficulty = ['easy', 'medium', 'hard'].includes(difficulty.toLowerCase()) 
  ? difficulty.toLowerCase() 
  : 'medium';

// Store player data with difficulty
this.externalComputerPlayers.set(id, {
  ...playerData,
  difficulty: validDifficulty,
  apiToken
});
```

### 2. Computer Player Addition to Games (External)

When adding an external computer player to a game, the difficulty level determines the minimum move interval:

```javascript
// In GameManager.js - addExternalComputerPlayer
// Determine move interval based on difficulty
const difficulty = computerPlayer.difficulty || 'medium';
let minMoveInterval;

switch (difficulty.toLowerCase()) {
  case 'easy':
    minMoveInterval = 15000; // 15 seconds for easy opponents
    break;
  case 'hard':
    minMoveInterval = 5000;  // 5 seconds for hard opponents
    break;
  case 'medium':
  default:
    minMoveInterval = 10000; // 10 seconds for medium opponents
}

// Set the minimum move interval
game.players[computerId].minMoveInterval = minMoveInterval;
```

### 3. Computer Player Addition (Built-in)

When adding built-in computer players in server.js, the difficulty level also determines the minimum move interval:

```javascript
// In server.js - addComputerPlayer
// Determine move interval based on difficulty
let minMoveInterval;
switch (validDifficulty) {
  case COMPUTER_DIFFICULTY.EASY:
    minMoveInterval = 15000; // 15 seconds for easy opponents
    break;
  case COMPUTER_DIFFICULTY.MEDIUM:
    minMoveInterval = 10000; // 10 seconds for medium opponents
    break;
  case COMPUTER_DIFFICULTY.HARD:
    minMoveInterval = 5000;  // 5 seconds for hard opponents
    break;
  default:
    minMoveInterval = 10000;
}

// Add computer player with minMoveInterval
computerPlayers.set(computerId, {
  // ... other properties
  minMoveInterval: minMoveInterval,
  // ... other properties
});
```

### 4. API Routes Updated

The API routes have been updated to accept difficulty as a parameter when registering computer players:

```javascript
// In api.js - /computer-players/register route
const { name, apiEndpoint, apiKey, description, difficulty } = req.body;

// Used when registering
const registrationResult = gameManager.registerExternalComputerPlayer({
  // ... other properties
  difficulty: difficulty || 'medium',
  // ... other properties
});
```

### 5. Documentation Added

Documentation has been added to explain the difficulty levels and their effect on gameplay:

- Added difficulty level descriptions to the Computer Player API documentation
- Updated test files to verify difficulty-based timings
- Updated implementation status report

## Testing

A new test file `tests/computer-player-difficulty.test.js` has been added to verify:

1. Registration of computer players with different difficulty levels
2. Setting of correct minMoveInterval values based on difficulty

## Recommendations for Further Improvements

1. Add more comprehensive error handling and logging throughout the codebase
2. Create more extensive test coverage for edge cases
3. Consider performance optimizations for large-scale multiplayer scenarios
4. Add more detailed API documentation for external computer players
5. Implement accessibility features for the user interface