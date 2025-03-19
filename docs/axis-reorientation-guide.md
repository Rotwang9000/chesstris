# Shaktris Axis Reorientation Guide

## Current vs. Required Orientation

### Current Implementation
- Chess board: XY plane (horizontal)
- Tetris pieces: Fall along Z-axis (vertical)

### Required Implementation
- Chess board: XZ plane (horizontal)
- Tetris pieces: Fall along Y-axis (vertical)

This document outlines the necessary changes to update the coordinate system throughout the codebase.

## Critical Components Requiring Changes

### 1. Core Data Structures

#### Board Representation
The board is currently represented as a 2D array indexed by `[y][x]`. This needs to be changed to `[z][x]` to maintain the row/column structure while adjusting the axes.

```javascript
// Current: board[y][x]
game.board[y][x] = { player: playerId, type: 'cell' };

// New: board[z][x]
game.board[z][x] = { player: playerId, type: 'cell' };
```

#### Piece Position Representation
Chess pieces and tetromino positions use `{x, y}` coordinates. These need to be updated to `{x, z, y}` with `y` representing height.

```javascript
// Current
piece.position = { x: 5, y: 10 }; // Position on XY plane

// New
piece.position = { x: 5, z: 10, y: 0 }; // Position on XZ plane with y=height
```

### 2. Game Mechanics

#### Tetromino Placement Logic (`_canPlaceTetromino` method)

The current implementation places tetrominos on the XY plane when they reach Z=0. This needs to be changed to place them on the XZ plane when they reach Y=0.

```javascript
// Current Z-axis logic
if (z === 1 && this._hasCellUnderneath(game, x, y)) {
    return false; // Tetromino will explode
}

if (z === 0 && this._hasAdjacentCell(game, x, y, playerId)) {
    return true; // Tetromino will stick
}

// New Y-axis logic
if (y === 1 && this._hasCellUnderneath(game, x, z)) {
    return false; // Tetromino will explode
}

if (y === 0 && this._hasAdjacentCell(game, x, z, playerId)) {
    return true; // Tetromino will stick
}
```

#### Row Clearing Logic

The row clearing mechanics check for 8 cells in a row on the XY plane. This needs to be updated to check rows on the XZ plane.

```javascript
// Current - checks rows along Y
for (let y = 0; y < boardSize; y++) {
    // Count filled cells in this row
    let filledCellCount = 0;
    for (let x = 0; x < boardSize; x++) {
        if (game.board[y][x] && !this._isCellInSafeHomeZone(game, x, y)) {
            filledCellCount++;
        }
    }
    // Clear if 8+ cells filled
}

// New - check rows along Z
for (let z = 0; z < boardSize; z++) {
    // Count filled cells in this row
    let filledCellCount = 0;
    for (let x = 0; x < boardSize; x++) {
        if (game.board[z][x] && !this._isCellInSafeHomeZone(game, x, z)) {
            filledCellCount++;
        }
    }
    // Clear if 8+ cells filled
}
```

#### Chess Movement Logic

Chess pieces move on the XY plane currently. This needs to be changed to the XZ plane.

```javascript
// Current - chess moves on XY plane
if (!this._isValidChessMove(game, piece, fromX, fromY, toX, toY)) {
    return { success: false, error: "Invalid move" };
}

// New - chess moves on XZ plane
if (!this._isValidChessMove(game, piece, fromX, fromZ, toX, toZ)) {
    return { success: false, error: "Invalid move" };
}
```

### 3. Helper Methods

Many helper methods will need to be updated to reflect the new coordinate system:

#### `_hasCellUnderneath`

```javascript
// Current
_hasCellUnderneath(game, x, y) {
    return game.board[y][x] !== null;
}

// New
_hasCellUnderneath(game, x, z) {
    return game.board[z][x] !== null;
}
```

#### `_hasAdjacentCell` and `_hasPathToKing`

These need to be updated to consider neighbors on the XZ plane.

```javascript
// Current
const adjacentPositions = [
    { x: x - 1, y },     // Left
    { x: x + 1, y },     // Right
    { x, y: y - 1 },     // Up
    { x, y: y + 1 }      // Down
];

// New
const adjacentPositions = [
    { x: x - 1, z },     // Left
    { x: x + 1, z },     // Right
    { x, z: z - 1 },     // Forward
    { x, z: z + 1 }      // Backward
];
```

### 4. Client-Server Interaction

The API and socket calls need to be updated to use the new coordinate system in the data exchanged between client and server.

```javascript
// Current request format
{
    pieceType: "I",
    rotation: 0,
    x: 5,
    y: 10,
    z: 0
}

// New request format
{
    pieceType: "I",
    rotation: 0,
    x: 5,
    z: 10,
    y: 0
}
```

## Implementation Strategy

Follow these steps to implement the axis reorientation:

1. **Update data structures**:
   - Refactor the board representation to use `[z][x]` indexing
   - Update piece position objects to use `{x, z, y}` format

2. **Update game mechanics**:
   - Modify tetromino placement logic for Y-axis falling
   - Update row clearing to work on XZ plane
   - Adjust chess movement rules for XZ plane

3. **Rename parameters and variables**:
   - Throughout the codebase, rename variables to reflect the new meaning
   - Change `y` to `z` for board positions
   - Introduce `y` as the height parameter

4. **Update helper methods**:
   - Refactor each helper method to work with the new coordinate system
   - Pay special attention to methods that check adjacency and connectivity

5. **Update API and socket interfaces**:
   - Ensure all client-server communications use the new coordinate system
   - Document the changes for frontend developers

## Files Requiring Changes

Based on the code review, the following files need to be updated:

1. `server/game/GameManager.js` - Most critical changes
   - The board representation methods
   - Tetromino placement logic
   - Chess movement logic
   - Row clearing logic

2. `server.js`
   - Computer player simulation logic
   - Game state handling

3. `server/routes/api.js`
   - API endpoint handlers for tetromino and chess move processing

## Testing Strategy

After implementing these changes, thorough testing is required:

1. **Unit Tests**:
   - Update existing tests to use the new coordinate system
   - Add new tests specifically for the axis reorientation
   - Test tetromino placement at different Y levels
   - Test chess movement on the XZ plane

2. **Integration Tests**:
   - Test the full game flow with the new coordinate system
   - Verify row clearing works correctly
   - Test computer player interactions

3. **End-to-End Tests**:
   - Test client-server communication with the updated coordinates

## Specific Method Changes

### In `GameManager.js`:

#### 1. `_createEmptyBoard`
```javascript
// Current
_createEmptyBoard(width, height) {
    const board = [];
    for (let y = 0; y < height; y++) {
        board[y] = [];
        for (let x = 0; x < width; x++) {
            board[y][x] = null;
        }
    }
    return board;
}

// New
_createEmptyBoard(width, depth) {
    const board = [];
    for (let z = 0; z < depth; z++) {
        board[z] = [];
        for (let x = 0; x < width; x++) {
            board[z][x] = null;
        }
    }
    return board;
}
```

#### 2. `_canPlaceTetromino`
```javascript
// Current
_canPlaceTetromino(game, tetromino, x, y, z = 0, playerId) {
    // Z-axis logic
    if (z === 1) {
        // Check if there's a cell underneath
        // ...
    } else if (z === 0) {
        // Check connectivity
        // ...
    }
    // ...
}

// New
_canPlaceTetromino(game, tetromino, x, z, y = 0, playerId) {
    // Y-axis logic
    if (y === 1) {
        // Check if there's a cell underneath
        // ...
    } else if (y === 0) {
        // Check connectivity
        // ...
    }
    // ...
}
```

#### 3. `_placeTetromino`
```javascript
// Current
_placeTetromino(game, tetromino, x, y, playerId) {
    // ...
}

// New
_placeTetromino(game, tetromino, x, z, playerId) {
    // ...
}
```

#### 4. `moveChessPiece`
```javascript
// Current
moveChessPiece(gameId, playerId, moveData) {
    // ...
    const { fromX, fromY, toX, toY } = moveData;
    // ...
}

// New
moveChessPiece(gameId, playerId, moveData) {
    // ...
    const { fromX, fromZ, toX, toZ } = moveData;
    // ...
}
```

#### 5. `_checkAndClearRows`
```javascript
// Current - checking rows along Y
_checkAndClearRows(game) {
    // ...
    for (let y = 0; y < boardSize; y++) {
        // Check row y
        // ...
    }
    // ...
}

// New - checking rows along Z
_checkAndClearRows(game) {
    // ...
    for (let z = 0; z < boardSize; z++) {
        // Check row z
        // ...
    }
    // ...
}
```

## Potential Challenges

1. **Coordinate System Confusion**: Maintaining consistent use of X, Y, and Z throughout the codebase will be challenging.

2. **Board Visualization**: The mental model of the board needs to shift from XY to XZ, which may cause confusion during development.

3. **Edge Cases**: Special attention needs to be paid to edge cases such as board expansion, home zone placement, and connectivity checks.

4. **3D to 2D Mapping**: For 2D mode, the mapping from 3D coordinates to 2D needs to be adjusted.

## Frontend Considerations

While this document focuses on backend changes, the frontend will need corresponding updates:

1. **3D Rendering**: The 3D visualization needs to be updated to render the chess board on the XZ plane.

2. **Camera Positioning**: Camera angles and controls may need adjustment for the new coordinate system.

3. **User Interaction**: The mapping of user inputs to game coordinates will need to be updated.

## Conclusion

This reorientation is a significant architectural change that affects core game mechanics and data structures. A careful, methodical approach is required with thorough testing at each step to ensure the game functions correctly with the new coordinate system.

The changes should be implemented as a single, cohesive update rather than incrementally, as mixing the old and new coordinate systems would lead to confusion and bugs. 