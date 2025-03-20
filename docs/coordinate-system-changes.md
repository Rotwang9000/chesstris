# Coordinate System Changes in Chesstris

## Overview

The Chesstris game has undergone a coordinate system reorientation, changing from an XY-Z system to an XZ-Y system. 
This document explains the changes and their implications for development.

## Coordinate System Change

### Original System (XY-Z)

In the original coordinate system:
- The X-axis ran horizontally (left to right)
- The Y-axis ran vertically on the board (top to bottom)
- The Z-axis represented height/depth (into/out of the screen)

### New System (XZ-Y)

In the new coordinate system:
- The X-axis still runs horizontally (left to right)
- The Z-axis now runs vertically on the board (top to bottom)
- The Y-axis represents height/depth (into/out of the screen)

## Key Changes

The following methods have been updated to reflect the new coordinate system:

1. **_hasCellUnderneath(game, x, z)**: Uses z-coordinate instead of y to check for cells underneath
2. **_canPlaceTetromino(game, tetromino, x, z, y, playerId)**: Order of parameters changed from (x, y, z) to (x, z, y)
3. **_placeTetromino(game, tetromino, x, z, playerId)**: Uses z-coordinate instead of y for placement
4. **_hasAdjacentCell(game, x, z, playerId)**: Changed to work in the XZ plane instead of XY
5. **_hasPathToKing(game, startX, startZ, playerId)**: Uses z-coordinate instead of y for path finding
6. **placeTetrisPiece(gameId, playerId, moveData)**: Updated to work with the new coordinates
7. **_createEmptyBoard(width, height)**: Uses z-index for rows instead of y-index

## Board Access Changes

Board access has been changed from:
```javascript
game.board[y][x]
```

To:
```javascript
game.board[z][x]
```

## Benefits of the Change

1. **More Intuitive**: The new system is more intuitive for a chess-like game, where the board is viewed from above
2. **Better 3D Integration**: The Y-axis now represents height, which is more standard for 3D environments
3. **Simplified Gravity**: Tetromino pieces now naturally "fall" along the Y-axis
4. **Improved Readability**: Code is more self-consistent, with Y clearly representing height

## Testing Considerations

When testing the game after these changes:
1. Check that tetromino placement works correctly on the XZ plane
2. Verify that chess piece movement is correctly mapped to the XZ plane
3. Ensure row clearing works correctly along the Z-axis
4. Test that tetromino "falling" behavior works along the Y-axis

## Further Development

Future development should consistently use the XZ-Y coordinate system. Any new features should follow this convention to maintain consistency throughout the codebase. 