/**
 * This file contains the key method implementations for axis reorientation
 * from XY-Z to XZ-Y in Shaktris.
 * 
 * IMPORTANT: This is not a standalone file - it contains code snippets to be
 * integrated into the GameManager.js file.
 */

//------------------------------------------------------------------------
// 1. Board representation methods
//------------------------------------------------------------------------

/**
 * Create an empty game board
 * @param {number} width - Board width (X-axis)
 * @param {number} depth - Board depth (Z-axis)
 * @returns {Array} 2D array representing the empty board on the XZ plane
 * @private
 */
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

/**
 * Check if a cell has another cell underneath it
 * @param {Object} game - The game state
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} True if there's a cell underneath
 * @private
 */
_hasCellUnderneath(game, x, z) {
    const boardSize = game.settings.boardSize;
    
    // Check bounds
    if (x < 0 || x >= boardSize || z < 0 || z >= boardSize) {
        return false;
    }
    
    // Check if there's a cell at this position
    return game.board[z][x] !== null;
}

//------------------------------------------------------------------------
// 2. Tetromino placement logic
//------------------------------------------------------------------------

/**
 * Determines if a tetromino can be placed at a specific position
 * @param {Object} game - The game state
 * @param {Array|Object} tetromino - The tetromino shape (array or object with shape property)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate (horizontal depth)
 * @param {number} y - Y coordinate (vertical height, default 0)
 * @param {string} playerId - Player ID
 * @returns {boolean} True if the tetromino can be placed
 * @private
 */
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

/**
 * Places a tetromino on the board
 * @param {Object} game - The game state
 * @param {Array|Object} tetromino - The tetromino shape
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {string} playerId - Player ID
 * @private
 */
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

//------------------------------------------------------------------------
// 3. Chess piece movement logic
//------------------------------------------------------------------------

/**
 * Handles chess piece movement
 * @param {string} gameId - Game ID
 * @param {string} playerId - Player ID
 * @param {Object} moveData - Move data including from/to coordinates
 * @returns {Object} Result of the move
 */
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
        
        // Find the specified piece
        const piece = this._findChessPiece(game, pieceId, playerId);
        if (!piece) {
            return {
                success: false,
                error: `Piece with ID ${pieceId} not found or doesn't belong to player ${playerId}`
            };
        }
        
        // Validate the move
        if (!this._isValidChessMove(game, piece, fromX, fromZ, toX, toZ)) {
            return {
                success: false,
                error: `Invalid chess move for ${piece.type} from (${fromX}, ${fromZ}) to (${toX}, ${toZ})`
            };
        }
        
        // Update the piece position
        piece.position = { x: toX, z: toZ };
        
        // [...rest of method implementation...]
    } catch (error) {
        // [...error handling...]
    }
}

//------------------------------------------------------------------------
// 4. Validation methods for chess piece movement
//------------------------------------------------------------------------

/**
 * Validates if a chess move is legal
 * @param {Object} game - The game state
 * @param {Object} piece - The chess piece to move
 * @param {number} startX - Starting X coordinate
 * @param {number} startZ - Starting Z coordinate
 * @param {number} destX - Destination X coordinate
 * @param {number} destZ - Destination Z coordinate
 * @returns {boolean} True if the move is valid
 * @private
 */
_isValidChessMove(game, piece, startX, startZ, destX, destZ) {
    // Check if the destination is the same as the start
    if (startX === destX && startZ === destZ) {
        return false;
    }
    
    // Check if the destination is within the board
    if (!this._validateCoordinates(game, destX, destZ)) {
        return false;
    }
    
    // Check if the destination has a piece of the same player
    const destCell = game.board[destZ][destX];
    if (destCell && destCell.type === 'piece' && destCell.player === piece.player) {
        return false;
    }
    
    // Check piece-specific movement rules
    switch (piece.type) {
        case 'pawn':
            // [...pawn logic update for XZ plane...]
            break;
        case 'rook':
            // Rooks move horizontally or vertically
            if (startX !== destX && startZ !== destZ) {
                return false;
            }
            return this._isPathClear(game, startX, startZ, destX, destZ);
        case 'knight':
            // Knights move in L-shape: 2 squares in one direction, 1 in perpendicular
            const xDiff = Math.abs(destX - startX);
            const zDiff = Math.abs(destZ - startZ);
            return (xDiff === 1 && zDiff === 2) || (xDiff === 2 && zDiff === 1);
        case 'bishop':
            // Bishops move diagonally
            if (Math.abs(destX - startX) !== Math.abs(destZ - startZ)) {
                return false;
            }
            return this._isPathClear(game, startX, startZ, destX, destZ);
        case 'queen':
            // Queens move like rooks or bishops
            if (startX === destX || startZ === destZ || Math.abs(destX - startX) === Math.abs(destZ - startZ)) {
                return this._isPathClear(game, startX, startZ, destX, destZ);
            }
            return false;
        case 'king':
            // Kings move one square in any direction
            return Math.abs(destX - startX) <= 1 && Math.abs(destZ - startZ) <= 1;
        default:
            return false;
    }
}

/**
 * Checks if the path is clear for chess piece movement
 * @param {Object} game - The game state
 * @param {number} startX - Starting X coordinate
 * @param {number} startZ - Starting Z coordinate
 * @param {number} destX - Destination X coordinate
 * @param {number} destZ - Destination Z coordinate
 * @returns {boolean} True if the path is clear
 * @private
 */
_isPathClear(game, startX, startZ, destX, destZ) {
    const xDir = Math.sign(destX - startX);
    const zDir = Math.sign(destZ - startZ);
    
    let x = startX + xDir;
    let z = startZ + zDir;
    
    // Check each square along the path
    while (x !== destX || z !== destZ) {
        if (game.board[z][x] !== null) {
            return false; // Path is blocked
        }
        
        x += xDir;
        z += zDir;
    }
    
    return true;
}

//------------------------------------------------------------------------
// 5. Row clearing and related methods
//------------------------------------------------------------------------

/**
 * Checks for and clears rows that have enough cells
 * @param {Object} game - The game state
 * @returns {Array} Indices of cleared rows
 * @private
 */
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

/**
 * Clears a row on the board
 * @param {Object} game - The game state
 * @param {number} rowIndex - Index of the row to clear (z-coordinate)
 * @private
 */
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

/**
 * Checks if a cell is in a safe home zone (home zone with at least one piece)
 * @param {Object} game - The game state
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} True if the cell is in a safe home zone
 * @private
 */
_isCellInSafeHomeZone(game, x, z) {
    for (const playerId in game.players) {
        const player = game.players[playerId];
        
        // Check if the cell is in this player's home zone
        if (this._isInPlayerHomeZone(game, x, z, playerId)) {
            // Check if the player has at least one piece in their home zone
            if (this._doesHomeZoneHavePieces(game, playerId)) {
                return true;
            }
        }
    }
    
    return false;
}

//------------------------------------------------------------------------
// 6. Helper methods
//------------------------------------------------------------------------

/**
 * Checks if a cell has adjacent cells that belong to the player
 * @param {Object} game - The game state
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {string} playerId - Player ID
 * @returns {Object|null} Adjacent cell info or null if none found
 * @private
 */
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

/**
 * Checks if there's a path from the given position to the player's king
 * @param {Object} game - The game state
 * @param {number} startX - Starting X coordinate
 * @param {number} startZ - Starting Z coordinate
 * @param {string} playerId - Player ID
 * @returns {boolean} True if there's a path to the king
 * @private
 */
_hasPathToKing(game, startX, startZ, playerId) {
    const boardSize = game.settings.boardSize;
    const visited = Array(boardSize).fill().map(() => Array(boardSize).fill(false));
    const queue = [];
    
    // Find player's king position
    let kingX = -1;
    let kingZ = -1;
    const player = game.players[playerId];
    
    if (!player) return false;
    
    const king = player.pieces.find(piece => piece.type === 'king');
    if (king && king.position) {
        kingX = king.position.x;
        kingZ = king.position.z;
    }
    
    if (kingX === -1 || kingZ === -1) {
        // King not found
        return false;
    }
    
    // Start BFS from the starting position
    queue.push({ x: startX, z: startZ });
    visited[startZ][startX] = true;
    
    while (queue.length > 0) {
        const { x, z } = queue.shift();
        
        // Check if we've reached the king
        if (x === kingX && z === kingZ) {
            return true;
        }
        
        // Check adjacent cells
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
            
            // Check if the cell exists, belongs to the player, and hasn't been visited
            if (!visited[pos.z][pos.x]) {
                const cell = game.board[pos.z][pos.x];
                if (cell && (cell.player === playerId || (cell.type === 'piece' && cell.player === playerId))) {
                    queue.push(pos);
                    visited[pos.z][pos.x] = true;
                }
            }
        }
    }
    
    // No path found
    return false;
}

//------------------------------------------------------------------------
// 7. Placetriсe API interface
//------------------------------------------------------------------------

/**
 * Places a tetromino on the board
 * @param {string} gameId - Game ID
 * @param {string} playerId - Player ID
 * @param {Object} moveData - Move data including tetromino information
 * @returns {Object} Result of the placement
 */
placeTetrisPiece(gameId, playerId, moveData) {
    try {
        // [...existing validation logic...]
        
        const { pieceType, rotation, x, z, y = 0 } = moveData;
        
        // Get the tetromino shape
        let pieceShape;
        if (typeof pieceType === 'string') {
            // Convert pieceType string to tetromino shape
            pieceShape = this._getTetromino(pieceType, rotation);
        } else if (Array.isArray(pieceType)) {
            // Direct array representation
            pieceShape = pieceType;
        } else {
            return {
                success: false,
                error: "Invalid tetromino piece format"
            };
        }
        
        // Check if the piece can be placed
        if (!this._canPlaceTetromino(game, pieceShape, x, z, y, playerId)) {
            return {
                success: false,
                error: "Cannot place tetromino at the specified position"
            };
        }
        
        // Place the piece
        this._placeTetromino(game, pieceShape, x, z, playerId);
        
        // [...rest of method implementation...]
    } catch (error) {
        // [...error handling...]
    }
} 