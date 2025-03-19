# Shaktris Axis Changes: Critical Method Implementation Details

This document provides specific implementation details for the most critical methods that need to be changed to reorient the game's axis system from XY-Z to XZ-Y.

## Core Data Structure Method Changes

### 1. _createEmptyBoard

```javascript
// BEFORE
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

// AFTER
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

### 2. _hasCellUnderneath

```javascript
// BEFORE
_hasCellUnderneath(game, x, y) {
    const boardSize = game.settings.boardSize;
    
    // Check bounds
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
        return false;
    }
    
    // Check if there's a cell at this position
    return game.board[y][x] !== null;
}

// AFTER
_hasCellUnderneath(game, x, z) {
    const boardSize = game.settings.boardSize;
    
    // Check bounds
    if (x < 0 || x >= boardSize || z < 0 || z >= boardSize) {
        return false;
    }
    
    // Check if there's a cell at this position
    return game.board[z][x] !== null;
}
```

## Tetromino Placement Logic Changes

### 3. _canPlaceTetromino

```javascript
// BEFORE
_canPlaceTetromino(game, tetromino, x, y, z = 0, playerId) {
    // Handle both array and object formats for tetromino
    const shape = Array.isArray(tetromino) ? tetromino : tetromino.shape;
    const height = shape.length;
    const width = shape[0].length;
    const boardSize = game.settings.boardSize;
    
    // Z-axis logic
    if (z === 1) {
        // When a Tetris piece gets to Z=1, if there is a cell underneath, it should explode to nothing
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                if (shape[i][j] && this._hasCellUnderneath(game, x + j, y + i)) {
                    return false; // Tetromino will explode
                }
            }
        }
        return false; // Keep falling to Z=0
    } else if (z === 0) {
        // When the Tetris piece gets to Z=0, check for connectivity
        
        // Check if tetromino is within board bounds
        if (x < 0 || y < 0 || x + width > boardSize || y + height > boardSize) {
            return false;
        }
        
        // Check if tetromino overlaps with existing cells
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                if (shape[i][j] && game.board[y + i][x + j]) {
                    return false;
                }
            }
        }
        
        // Check if tetromino is adjacent to at least one existing cell with a path to the king
        let hasValidConnection = false;
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                if (!shape[i][j]) continue;
                
                const adjacentCell = this._hasAdjacentCell(game, x + j, y + i, playerId);
                if (adjacentCell && adjacentCell.hasPathToKing) {
                    hasValidConnection = true;
                    break;
                }
            }
            if (hasValidConnection) break;
        }
        
        return hasValidConnection;
    }
    
    // If z < 0, tetromino continues falling
    return false;
}

// AFTER
_canPlaceTetromino(game, tetromino, x, z, y = 0, playerId) {
    // Handle both array and object formats for tetromino
    const shape = Array.isArray(tetromino) ? tetromino : tetromino.shape;
    const depth = shape.length;
    const width = shape[0].length;
    const boardSize = game.settings.boardSize;
    
    // Y-axis logic (tetrominos fall along Y-axis)
    if (y === 1) {
        // When a Tetris piece gets to Y=1, if there is a cell underneath, it should explode to nothing
        for (let i = 0; i < depth; i++) {
            for (let j = 0; j < width; j++) {
                if (shape[i][j] && this._hasCellUnderneath(game, x + j, z + i)) {
                    return false; // Tetromino will explode
                }
            }
        }
        return false; // Keep falling to Y=0
    } else if (y === 0) {
        // When the Tetris piece gets to Y=0, check for connectivity
        
        // Check if tetromino is within board bounds
        if (x < 0 || z < 0 || x + width > boardSize || z + depth > boardSize) {
            return false;
        }
        
        // Check if tetromino overlaps with existing cells
        for (let i = 0; i < depth; i++) {
            for (let j = 0; j < width; j++) {
                if (shape[i][j] && game.board[z + i][x + j]) {
                    return false;
                }
            }
        }
        
        // Check if tetromino is adjacent to at least one existing cell with a path to the king
        let hasValidConnection = false;
        for (let i = 0; i < depth; i++) {
            for (let j = 0; j < width; j++) {
                if (!shape[i][j]) continue;
                
                const adjacentCell = this._hasAdjacentCell(game, x + j, z + i, playerId);
                if (adjacentCell && adjacentCell.hasPathToKing) {
                    hasValidConnection = true;
                    break;
                }
            }
            if (hasValidConnection) break;
        }
        
        return hasValidConnection;
    }
    
    // If y < 0, tetromino continues falling
    return false;
}
```

### 4. _placeTetromino

```javascript
// BEFORE
_placeTetromino(game, tetromino, x, y, playerId) {
    const shape = Array.isArray(tetromino) ? tetromino : tetromino.shape;
    const height = shape.length;
    const width = shape[0].length;
    
    // Place each cell of the tetromino
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            if (shape[i][j]) {
                // Place cell on the board
                game.board[y + i][x + j] = {
                    player: playerId,
                    type: 'cell'
                };
            }
        }
    }
    
    // Check for row clearing
    this._checkAndClearRows(game);
    
    // Check if any pieces are now orphaned (no path to king)
    this._handleOrphanedPieces(game);
}

// AFTER
_placeTetromino(game, tetromino, x, z, playerId) {
    const shape = Array.isArray(tetromino) ? tetromino : tetromino.shape;
    const depth = shape.length;
    const width = shape[0].length;
    
    // Place each cell of the tetromino
    for (let i = 0; i < depth; i++) {
        for (let j = 0; j < width; j++) {
            if (shape[i][j]) {
                // Place cell on the board
                game.board[z + i][x + j] = {
                    player: playerId,
                    type: 'cell'
                };
            }
        }
    }
    
    // Check for row clearing
    this._checkAndClearRows(game);
    
    // Check if any pieces are now orphaned (no path to king)
    this._handleOrphanedPieces(game);
}
```

## Chess Movement Logic Changes

### 5. _hasAdjacentCell

```javascript
// BEFORE
_hasAdjacentCell(game, x, y, playerId) {
    const boardSize = game.settings.boardSize;
    
    // Check all adjacent positions
    const adjacentPositions = [
        { x: x - 1, y },     // Left
        { x: x + 1, y },     // Right
        { x, y: y - 1 },     // Up
        { x, y: y + 1 }      // Down
    ];
    
    for (const pos of adjacentPositions) {
        // Check bounds
        if (pos.x < 0 || pos.x >= boardSize || pos.y < 0 || pos.y >= boardSize) {
            continue;
        }
        
        // Check if the cell exists, belongs to the player, and has a path to the king
        const cell = game.board[pos.y][pos.x];
        if (cell && cell.player === playerId) {
            if (this._hasPathToKing(game, pos.x, pos.y, playerId)) {
                return {
                    x: pos.x,
                    y: pos.y,
                    hasPathToKing: true
                };
            }
        }
    }
    
    return null;
}

// AFTER
_hasAdjacentCell(game, x, z, playerId) {
    const boardSize = game.settings.boardSize;
    
    // Check all adjacent positions in the XZ plane
    const adjacentPositions = [
        { x: x - 1, z },     // Left
        { x: x + 1, z },     // Right
        { x, z: z - 1 },     // Forward
        { x, z: z + 1 }      // Backward
    ];
    
    for (const pos of adjacentPositions) {
        // Check bounds
        if (pos.x < 0 || pos.x >= boardSize || pos.z < 0 || pos.z >= boardSize) {
            continue;
        }
        
        // Check if the cell exists, belongs to the player, and has a path to the king
        const cell = game.board[pos.z][pos.x];
        if (cell && cell.player === playerId) {
            if (this._hasPathToKing(game, pos.x, pos.z, playerId)) {
                return {
                    x: pos.x,
                    z: pos.z,
                    hasPathToKing: true
                };
            }
        }
    }
    
    return null;
}
```

### 6. moveChessPiece

```javascript
// BEFORE (simplified version)
moveChessPiece(gameId, playerId, moveData) {
    try {
        // Extract move data
        const { pieceId, position } = moveData;
        let fromX, fromY, toX, toY;
        
        // Handle different move data formats
        if (position) {
            fromX = position.fromX;
            fromY = position.fromY;
            toX = position.toX;
            toY = position.toY;
        } else {
            fromX = moveData.fromX;
            fromY = moveData.fromY;
            toX = moveData.toX;
            toY = moveData.toY;
        }
        
        // Find the specified piece
        const piece = this._findChessPiece(game, pieceId, playerId);
        
        // Validate the move
        if (!this._isValidChessMove(game, piece, fromX, fromY, toX, toY)) {
            return {
                success: false,
                error: `Invalid chess move for ${piece.type} from (${fromX}, ${fromY}) to (${toX}, ${toY})`
            };
        }
        
        // Update the piece position
        piece.position = { x: toX, y: toY };
        
        // ... rest of method
    } catch (error) {
        // ... error handling
    }
}

// AFTER (simplified version)
moveChessPiece(gameId, playerId, moveData) {
    try {
        // Extract move data
        const { pieceId, position } = moveData;
        let fromX, fromZ, toX, toZ;
        
        // Handle different move data formats
        if (position) {
            fromX = position.fromX;
            fromZ = position.fromZ;
            toX = position.toX;
            toZ = position.toZ;
        } else {
            fromX = moveData.fromX;
            fromZ = moveData.fromZ;
            toX = moveData.toX;
            toZ = moveData.toZ;
        }
        
        // Find the specified piece
        const piece = this._findChessPiece(game, pieceId, playerId);
        
        // Validate the move
        if (!this._isValidChessMove(game, piece, fromX, fromZ, toX, toZ)) {
            return {
                success: false,
                error: `Invalid chess move for ${piece.type} from (${fromX}, ${fromZ}) to (${toX}, ${toZ})`
            };
        }
        
        // Update the piece position
        piece.position = { x: toX, z: toZ, y: 0 }; // Add y=0 to represent height
        
        // ... rest of method
    } catch (error) {
        // ... error handling
    }
}
```

## Row Clearing Logic Changes

### 7. _checkAndClearRows

```javascript
// BEFORE
_checkAndClearRows(game) {
    const boardSize = game.settings.boardSize;
    const clearedRows = [];
    const requiredCellsForClearing = 8; // According to the game rules, any 8 cells in a line should be cleared
    
    // Check each row
    for (let y = 0; y < boardSize; y++) {
        // Count filled cells in the row
        let filledCellCount = 0;
        for (let x = 0; x < boardSize; x++) {
            // Skip cells in safe home zones (home zones with at least one piece)
            if (game.board[y][x] && !this._isCellInSafeHomeZone(game, x, y)) {
                filledCellCount++;
            }
        }
        
        // If the row has at least 8 filled cells, clear it
        if (filledCellCount >= requiredCellsForClearing) {
            this._clearRow(game, y);
            clearedRows.push(y);
        }
    }
    
    return clearedRows;
}

// AFTER
_checkAndClearRows(game) {
    const boardSize = game.settings.boardSize;
    const clearedRows = [];
    const requiredCellsForClearing = 8; // According to the game rules, any 8 cells in a line should be cleared
    
    // Check each row (now on Z-axis)
    for (let z = 0; z < boardSize; z++) {
        // Count filled cells in the row
        let filledCellCount = 0;
        for (let x = 0; x < boardSize; x++) {
            // Skip cells in safe home zones (home zones with at least one piece)
            if (game.board[z][x] && !this._isCellInSafeHomeZone(game, x, z)) {
                filledCellCount++;
            }
        }
        
        // If the row has at least 8 filled cells, clear it
        if (filledCellCount >= requiredCellsForClearing) {
            this._clearRow(game, z);
            clearedRows.push(z);
        }
    }
    
    return clearedRows;
}
```

### 8. _clearRow

```javascript
// BEFORE (simplified version)
_clearRow(game, rowIndex) {
    const boardSize = game.settings.boardSize;
    
    // Remove all pieces and cells in the row that aren't in a safe home zone
    for (let x = 0; x < boardSize; x++) {
        if (game.board[rowIndex][x] && !this._isCellInSafeHomeZone(game, x, rowIndex)) {
            // Remove any chess piece at this position
            for (const playerId in game.players) {
                const player = game.players[playerId];
                player.pieces = player.pieces.filter(piece => 
                    !(piece.position && piece.position.x === x && piece.position.y === rowIndex)
                );
            }
            
            // Clear the cell
            game.board[rowIndex][x] = null;
        }
    }
}

// AFTER (simplified version)
_clearRow(game, rowIndex) {
    const boardSize = game.settings.boardSize;
    
    // Remove all pieces and cells in the row that aren't in a safe home zone
    for (let x = 0; x < boardSize; x++) {
        if (game.board[rowIndex][x] && !this._isCellInSafeHomeZone(game, x, rowIndex)) {
            // Remove any chess piece at this position
            for (const playerId in game.players) {
                const player = game.players[playerId];
                player.pieces = player.pieces.filter(piece => 
                    !(piece.position && piece.position.x === x && piece.position.z === rowIndex)
                );
            }
            
            // Clear the cell
            game.board[rowIndex][x] = null;
        }
    }
}
```

## Board Expansion Logic Changes

### 9. _expandBoard

```javascript
// BEFORE
_expandBoard(game, addWidth, addHeight) {
    const oldWidth = game.board[0].length;
    const oldHeight = game.board.length;
    
    const newWidth = oldWidth + addWidth;
    const newHeight = oldHeight + addHeight;
    
    // Create a new, larger board
    const newBoard = this._createEmptyBoard(newWidth, newHeight);
    
    // Calculate offsets to center the old board in the new one
    const xOffset = Math.floor(addWidth / 2);
    const yOffset = Math.floor(addHeight / 2);
    
    // Copy the old board content to the new board
    for (let y = 0; y < oldHeight; y++) {
        for (let x = 0; x < oldWidth; x++) {
            if (game.board[y][x]) {
                newBoard[y + yOffset][x + xOffset] = game.board[y][x];
            }
        }
    }
    
    // Update the board
    game.board = newBoard;
    game.settings.boardSize = newWidth;
    
    // Update all piece positions
    for (const playerId in game.players) {
        const player = game.players[playerId];
        for (const piece of player.pieces) {
            if (piece.position) {
                piece.position.x += xOffset;
                piece.position.y += yOffset;
            }
        }
        
        // Update the player's home zone
        if (player.homeZone) {
            player.homeZone.x += xOffset;
            player.homeZone.y += yOffset;
        }
    }
}

// AFTER
_expandBoard(game, addWidth, addDepth) {
    const oldWidth = game.board[0].length;
    const oldDepth = game.board.length;
    
    const newWidth = oldWidth + addWidth;
    const newDepth = oldDepth + addDepth;
    
    // Create a new, larger board
    const newBoard = this._createEmptyBoard(newWidth, newDepth);
    
    // Calculate offsets to center the old board in the new one
    const xOffset = Math.floor(addWidth / 2);
    const zOffset = Math.floor(addDepth / 2);
    
    // Copy the old board content to the new board
    for (let z = 0; z < oldDepth; z++) {
        for (let x = 0; x < oldWidth; x++) {
            if (game.board[z][x]) {
                newBoard[z + zOffset][x + xOffset] = game.board[z][x];
            }
        }
    }
    
    // Update the board
    game.board = newBoard;
    game.settings.boardSize = newWidth;
    
    // Update all piece positions
    for (const playerId in game.players) {
        const player = game.players[playerId];
        for (const piece of player.pieces) {
            if (piece.position) {
                piece.position.x += xOffset;
                piece.position.z += zOffset;
            }
        }
        
        // Update the player's home zone
        if (player.homeZone) {
            player.homeZone.x += xOffset;
            player.homeZone.z += zOffset;
        }
    }
}
```

## API Interface Changes

### 10. placeTetrisPiece (API interface)

```javascript
// BEFORE
placeTetrisPiece(gameId, playerId, moveData) {
    try {
        // ... validation
        
        const { pieceType, rotation, x, y, z = 0 } = moveData;
        
        // ... get tetromino shape
        
        // Check if the piece can be placed
        if (!this._canPlaceTetromino(game, pieceShape, x, y, z, playerId)) {
            return {
                success: false,
                error: "Cannot place tetromino at the specified position"
            };
        }
        
        // Place the piece
        this._placeTetromino(game, pieceShape, x, y, playerId);
        
        // ... rest of method
    } catch (error) {
        // ... error handling
    }
}

// AFTER
placeTetrisPiece(gameId, playerId, moveData) {
    try {
        // ... validation
        
        const { pieceType, rotation, x, z, y = 0 } = moveData;
        
        // ... get tetromino shape
        
        // Check if the piece can be placed
        if (!this._canPlaceTetromino(game, pieceShape, x, z, y, playerId)) {
            return {
                success: false,
                error: "Cannot place tetromino at the specified position"
            };
        }
        
        // Place the piece
        this._placeTetromino(game, pieceShape, x, z, playerId);
        
        // ... rest of method
    } catch (error) {
        // ... error handling
    }
}
```

## Piece Position Updates

Throughout the codebase, all references to piece positions need to be updated:

```javascript
// BEFORE
piece.position = { x: toX, y: toY };

// AFTER
piece.position = { x: toX, z: toZ, y: 0 }; // y represents height (0 for chess pieces on the board)
```

Similarly, all accesses to piece positions need to be updated:

```javascript
// BEFORE
const { x, y } = piece.position;

// AFTER
const { x, z } = piece.position; // y is optional when we only need the board coordinates
```

## Test Case Updates

All test cases should be updated to use the new coordinate system. For example:

```javascript
// BEFORE
const result = gameManager.moveChessPiece(gameId, playerId, {
    pieceId: piece.id,
    fromX: piece.position.x,
    fromY: piece.position.y,
    toX: piece.position.x + 1,
    toY: piece.position.y + 1
});

// AFTER
const result = gameManager.moveChessPiece(gameId, playerId, {
    pieceId: piece.id,
    fromX: piece.position.x,
    fromZ: piece.position.z,
    toX: piece.position.x + 1,
    toZ: piece.position.z + 1
});
``` 