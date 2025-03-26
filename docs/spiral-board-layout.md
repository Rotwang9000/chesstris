# Spiral Board Layout for Shaktris

> **IMPORTANT**: This approach has been replaced by the new controlled pawn clash positioning system. This document is maintained for historical reference only. Please see [Cell-Based Board with Controlled Pawn Clash](cell-based-board.md) for the current implementation.

## Overview

Shaktris uses a dynamic spiral layout for positioning player home zones. This document explains the implementation details and the reasoning behind this approach.

## Board Structure

### Cell-Based Approach

The game has recently moved away from a traditional 2D array board structure to a sparse cell-based approach:

- Instead of a fixed grid, the board is represented as a collection of cells in a key-value store
- Each cell is identified by a key in the format `"x,z"` (e.g., `"12,5"`)
- Only occupied cells are stored, reducing memory usage and allowing for infinite expansion
- No fixed board boundaries - the board can grow dynamically as needed

The cell-based approach offers several advantages:
- Flexible board size and shape
- Efficient storage (only occupied cells are tracked)
- Easy serialization for network transmission
- Support for non-rectangular board layouts like spiral patterns

### Cell Types

Each cell contains information about what occupies that position:

```javascript
// Home zone cell
{
  type: 'homeZone',
  player: playerId
}

// Chess piece cell
{
  type: 'chess',
  chessPiece: { type: 'PAWN' }, // Or other piece type
  player: playerId
}

// Tetromino block cell
{
  type: 'tetromino',
  player: playerId
}
```

## Spiral Home Zone Layout

### Concept

Players' home zones are arranged in a spiral pattern around the center of the board. This allows for:

1. **Unlimited Players**: The spiral can expand indefinitely to accommodate any number of players
2. **Fair Positioning**: Each player has equal distance to the center
3. **Interesting Interactions**: Players at different positions in the spiral have different tactical considerations

### Implementation Details

The spiral layout is calculated on the server side in `server/boardGenerator.js`. Key components:

#### Home Zone Calculation

The `calculateSpiralHomePosition` function:

1. **Initial Position**: First player is placed near the center
2. **Spiral Growth**: Each subsequent player is positioned further out in the spiral
3. **Steepness Control**: Controlled by the `spiralFactor` which determines how quickly the spiral expands
4. **Orientation**: Each zone is oriented so pawns face toward the center
5. **Perpendicular Orientations**: Every 4th player has perpendicular orientation for tactical pawn interactions

```javascript
// First 4 players get maximum separation
spiralFactor = 10;

// Players further out get gradually decreasing separation
spiralFactor = Math.max(6, 10 - ((playerIndex - 5) * 0.5));
```

#### Special Case: Player 5

Player 5 requires special handling to avoid overlap with Player 1:

```javascript
// Apply additional offset for player 5 specifically
if (playerIndex === 4) { // Index 4 = player 5
  // Get direction vector from center
  const dirX = Math.sign(homeX - centerX);
  const dirZ = Math.sign(homeZ - centerZ);
  // Apply extra offset in that direction
  homeX += dirX * 3;
  homeZ += dirZ * 3;
}
```

### Chess Piece Orientation

Each player's pieces are oriented to face the center:

1. **Orientation Calculation**: Based on the angle from the center to the home zone
2. **Four Orientations**: Pieces can face up (0), right (1), down (2), or left (3)
3. **Pawn Positioning**: Pawns are always positioned in the "front" row/column facing the center
4. **Direction Vectors**: Different placement logic for horizontal vs. vertical orientations

## Server-Side Implementation

The board layout is entirely generated on the server side:

1. **generateSpiralHomeZones**: Creates home zones for all players following the spiral pattern
2. **createInitialChessPieces**: Places chess pieces in each player's home zone with correct orientation
3. **addChessPiece**: Helper function for adding pieces to the game state

The server sends the complete board state to clients, which are only responsible for visualizing it.

## Client-Side Changes

The client no longer calculates home zone positions:

1. **Removed Position Calculation**: All positioning logic moved to server
2. **Visualization Only**: Client simply renders the board state it receives
3. **Orientation Support**: Client respects the orientation data from the server
4. **Dynamic Rendering**: Renders pieces at any position in the sparse cell structure

## Best Practices

When working with the spiral board layout:

1. **Server Authority**: All home zone and piece positioning must be done on the server
2. **Respect Orientation**: Always use the orientation value when rendering pieces
3. **Sparse Cell Access**: Use `gameState.board.cells[x,z]` to access cells
4. **Boundary Awareness**: Don't assume a fixed board size or shape
5. **Incremental Updates**: Only send changed cells to clients for efficiency

## Migration Notes

For developers working with older code that assumes a 2D array board:

- Replace `board[y][x]` with `board.cells[x,z]`
- Check for cell existence before accessing properties
- Don't iterate through the board with nested loops
- Use Object.entries() to iterate over cells 