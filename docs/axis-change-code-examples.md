# Shaktris Axis Change Code Examples

This document provides concrete code examples showing the necessary changes to reorient the game axes from XY-Z to XZ-Y. These examples focus on the most critical components.

## 1. Tetromino Placement Logic

### Before:

```javascript
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
```

### After:

```javascript
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

## 2. Row Clearing Logic

### Before:

```javascript
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
```

### After:

```javascript
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

## 3. Chess Movement Logic

### Before:

```javascript
moveChessPiece(gameId, playerId, moveData) {
    try {
        // [...existing validation logic...]
        
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
        
        // [...validation logic...]
        
        // Validate the move
        if (!this._isValidChessMove(game, piece, fromX, fromY, toX, toY)) {
            return {
                success: false,
                error: `Invalid chess move for ${piece.type} from (${fromX}, ${fromY}) to (${toX}, ${toY})`
            };
        }
        
        // [...rest of method...]
    } catch (error) {
        // [...error handling...]
    }
}
```

### After:

```javascript
moveChessPiece(gameId, playerId, moveData) {
    try {
        // [...existing validation logic...]
        
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
        
        // [...validation logic...]
        
        // Validate the move
        if (!this._isValidChessMove(game, piece, fromX, fromZ, toX, toZ)) {
            return {
                success: false,
                error: `Invalid chess move for ${piece.type} from (${fromX}, ${fromZ}) to (${toX}, ${toZ})`
            };
        }
        
        // [...rest of method...]
    } catch (error) {
        // [...error handling...]
    }
}
```

## 4. Helper Methods

### Before:

```javascript
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
```

### After:

```javascript
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

## 5. Client-Server Interaction

### Before:

```javascript
// Client sends tetromino placement
socket.emit('tetromino_placed', {
    pieceType: 'I',
    rotation: 0,
    x: 5,
    y: 10,
    z: 0
});

// Server processes tetromino placement
socket.on('tetromino_placed', (data) => {
    const { pieceType, rotation, x, y, z = 0 } = data;
    const result = gameManager.placeTetrisPiece(gameId, playerId, {
        pieceType, rotation, x, y, z
    });
});
```

### After:

```javascript
// Client sends tetromino placement
socket.emit('tetromino_placed', {
    pieceType: 'I',
    rotation: 0,
    x: 5,
    z: 10,
    y: 0
});

// Server processes tetromino placement
socket.on('tetromino_placed', (data) => {
    const { pieceType, rotation, x, z, y = 0 } = data;
    const result = gameManager.placeTetrisPiece(gameId, playerId, {
        pieceType, rotation, x, z, y
    });
});
``` 