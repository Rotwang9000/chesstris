# Shaktris Axis Change Implementation Plan

This document provides a detailed, step-by-step implementation plan for reorienting the coordinate system from XY-Z to XZ-Y in the Shaktris game.

## Overview

The current implementation incorrectly uses:
- Chess board: XY plane (horizontal)
- Tetris pieces: Z-axis (vertical)

The correct implementation should use:
- Chess board: XZ plane (horizontal)
- Tetris pieces: Y-axis (vertical)

## Implementation Steps

### Phase 1: Core Data Structures

1. **Update the _createEmptyBoard method** 
   - Rename parameters from (width, height) to (width, depth)
   - Change all loop variables from `y` to `z` 
   - The board representation will change from `board[y][x]` to `board[z][x]`

2. **Update helper methods that access the board**
   - _hasCellUnderneath(game, x, y) → _hasCellUnderneath(game, x, z)
   - _validateCoordinates(game, x, y) → _validateCoordinates(game, x, z)
   - _isInPlayerHomeZone(game, x, y, playerId) → _isInPlayerHomeZone(game, x, z, playerId)
   - _isCellInSafeHomeZone(game, x, y) → _isCellInSafeHomeZone(game, x, z)
   - _isCellInHomeZone(game, x, y) → _isCellInHomeZone(game, x, z)

### Phase 2: Tetromino Placement Logic

3. **Update _canPlaceTetromino method**
   - Change signature from (game, tetromino, x, y, z = 0, playerId) to (game, tetromino, x, z, y = 0, playerId)
   - Change all references to variable `height` to `depth`
   - Update the axis logic to use Y-axis for vertical movement
   - All board accesses should now use `board[z][x]` instead of `board[y][x]`

4. **Update _placeTetromino method**
   - Change signature from (game, tetromino, x, y, playerId) to (game, tetromino, x, z, playerId)
   - Update board accesses to use `board[z + i][x + j]` instead of `board[y + i][x + j]`

5. **Update placeTetrisPiece method**
   - Change request parameter extraction to use `z` instead of `y` for horizontal coordinate
   - Update calls to _canPlaceTetromino and _placeTetromino with the new parameter order

### Phase 3: Chess Movement Logic

6. **Update _hasAdjacentCell method**
   - Change signature from (game, x, y, playerId) to (game, x, z, playerId)
   - Update adjacentPositions to use the XZ plane
   - All board accesses should now use `board[pos.z][pos.x]` instead of `board[pos.y][pos.x]`

7. **Update _hasPathToKing method**
   - Change signature from (game, startX, startY, playerId) to (game, startX, startZ, playerId)
   - Update BFS algorithm to work on the XZ plane
   - Update king position to use `king.position.z` instead of `king.position.y`

8. **Update _isValidChessMove method**
   - Change signature from (game, piece, startX, startY, destX, destY) to (game, piece, startX, startZ, destX, destZ)
   - Update piece-specific movement rules for the XZ plane
   - All board accesses should use `board[destZ][destX]` instead of `board[destY][destX]`

9. **Update _isPathClear method**
   - Change signature from (game, startX, startY, destX, destY) to (game, startX, startZ, destX, destZ)
   - Update path checking to work on the XZ plane

10. **Update moveChessPiece method**
    - Change request parameter extraction to use `fromZ/toZ` instead of `fromY/toY`
    - Update piece positions to use `{ x: toX, z: toZ }` instead of `{ x: toX, y: toY }`

### Phase 4: Row Clearing Logic

11. **Update _checkAndClearRows method**
    - Change loop from `for (let y = 0; y < boardSize; y++)` to `for (let z = 0; z < boardSize; z++)`
    - Update all board accesses to use `board[z][x]` instead of `board[y][x]`

12. **Update _clearRow method**
    - Update to clear cells along the Z-axis instead of Y-axis
    - Update piece filtering to check `piece.position.z === rowIndex` instead of `piece.position.y === rowIndex`

### Phase 5: Home Zone and Board Expansion Logic

13. **Update _findHomeZonePosition method**
    - Update to find positions in the XZ plane
    - Update all references to home zones to use Z-coordinate

14. **Update _expandBoard method**
    - Rename parameters from (game, addWidth, addHeight) to (game, addWidth, addDepth)
    - Update offsets and copying logic to work with Z instead of Y coordinates

15. **Update _createHomeZoneForPlayer method**
    - Update to create home zones in the XZ plane
    - All references to home zone coordinates should use Z instead of Y

### Phase 6: API and Interfaces

16. **Update API endpoints**
    - Update request/response formats to use `z` instead of `y` for board coordinates
    - Update socket event handlers to extract parameters correctly

17. **Update chess piece position objects**
    - Change from `{ x, y }` to `{ x, z, y: 0 }` where y represents height
    - Update all code that accesses piece positions

### Phase 7: Testing

18. **Update test files**
    - Update all test cases to use the new coordinate system
    - Create new tests specifically for verifying the axis orientation logic

## Validation Steps

After each phase:
1. Run existing tests (they will likely fail until fully updated)
2. Add new tests to verify the changes
3. Manually test the affected functionality

## Expected Challenges

1. **Coordinate System Confusion**: Keep careful track of x, z, y coordinates
2. **Default Parameters**: Be extra careful with default parameters in method signatures
3. **3D Visualization**: Test visual representation thoroughly
4. **Edge Cases**: Test boundary conditions at board edges

## Rollout Strategy

1. Implement changes in a separate branch
2. Complete all changes before merging
3. Update documentation to reflect the new coordinate system
4. Perform end-to-end testing before releasing 