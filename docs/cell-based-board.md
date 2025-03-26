# Cell-Based Board with Controlled Pawn Clash

## Current Implementation

Shaktris uses a cell-based board structure with a controlled pawn clash positioning system, replacing the previous spiral home zone layout approach.

## Cell-Based Board Structure

### Key Concepts

The game has moved away from traditional fixed-size board arrays to a sparse cell-based approach:

- The board is represented as a collection of cells in a key-value store
- Each cell is identified by a coordinate key in the format `"x,z"` (e.g., `"12,5"`)
- Only occupied cells are stored, reducing memory usage
- No fixed boundaries - the board can grow dynamically as needed

```javascript
// Example board structure
gameState.board = {
  cells: {
    "10,15": { type: 'homeZone', player: 'player1' },
    "10,16": { type: 'chess', chessPiece: { type: 'PAWN' }, player: 'player1' },
    "11,15": { type: 'tetromino', player: 'player2' }
  }
};
```

## Controlled Pawn Clash Positioning

### Overview

The home zone positioning system has been redesigned to use a randomized approach with controlled pawn clashing, replacing the previous spiral layout.

### Key Principles

1. **Randomized Placement**: Home zones are positioned randomly on the board
2. **Pawn Path Avoidance**: Positions avoid direct pawn paths (8 spaces forward)
3. **Controlled Clashing**: Positions ensure some pawn clashing (at 6 spaces forward)
4. **Fallback Positioning**: If random placement fails, positions are determined relative to the furthest existing cell

### Placement Algorithm

The `calculateHomePosition` function implements this approach:

1. The first player is placed near the center
2. For subsequent players:
   - Try up to 100 random positions with random orientations
   - Check that home zone doesn't block 8-space pawn paths
   - Ensure at least 2 pawns can clash at 6-space distance
   - Fall back to placement 6 spaces from furthest cell if needed

```javascript
// Example simplified algorithm
function findHomePosition(gameState) {
  // Try random positions
  for (let attempts = 0; attempts < 100; attempts++) {
    const position = generateRandomPosition();
    
    // Check if valid (not blocking 8-space pawn paths)
    if (isValidPosition(position, gameState, 8)) {
      // Check if enables clashing at 6 spaces
      if (hasPawnClash(position, gameState, 6)) {
        return position;
      }
    }
  }
  
  // Fallback - relative to furthest cell
  return calculateFallbackPosition(gameState);
}
```

### Pawn Clashing Logic

The system now uses controlled clashing:

- **Avoids Direct Blocking**: Pawns should not directly block each other's 8-space forward path
- **Enables Partial Clashing**: At least 2 pawns should be able to clash at 6 spaces forward
- **Orientation Awareness**: Takes into account the orientation of home zones (up, right, down, left)

## Benefits Over Spiral Layout

1. **Adaptability**: Better handles large player islands and irregular board shapes
2. **Balance**: Ensures some pawn interaction without excessive blocking
3. **Randomization**: Creates more varied gameplay experiences
4. **Conflict Control**: Limits excessive pawn clashing while ensuring some tactical interaction

## Integration with Gameplay

The controlled pawn clash positioning system affects several aspects of gameplay:

1. **Chess Movement**: Pawns have clear paths for initial movement but will encounter interesting tactical decisions around the 6-space mark
2. **Territory Building**: Players will need to build territory while being mindful of potential pawn clashes
3. **Island Growth**: As islands grow, players must consider how their expansion affects pawn movement paths

## Implementation Considerations

When working with the controlled pawn clash system:

1. **Board Initialization**: The home zone placement occurs during game initialization
2. **Player Addition**: When new players join, their home zones are positioned using this algorithm
3. **Client Rendering**: The client simply renders the cell data it receives; all positioning logic is server-side
4. **Test Tooling**: Testing tools should verify both the avoidance of 8-space blocking and the enablement of 6-space clashing

## Migration from Previous Approaches

For developers familiar with the previous spiral layout:

- Replace `calculateSpiralHomePosition` references with `calculateHomePosition`
- Update documentation and diagrams to reflect the new randomized approach
- Use the new exported functions: `calculateHomePosition` and `generateHomeZones` 