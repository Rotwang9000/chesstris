# Home Zone Positioning System

## Overview

The home zone positioning system in Shaktris uses a deterministic spiral pattern to place each player's home zone in relation to other players. This approach ensures that:

1. Player home zones are positioned in a clear, predictable pattern
2. Each player's pawn will clash with adjacent players after exactly 8 moves
3. The game board expands efficiently as needed to accommodate additional players
4. All players have equal strategic advantage/disadvantage

## Implementation Details

### Spiral Pattern

Players are positioned in a clockwise spiral pattern:
- First player is at the center of the board
- Subsequent players are placed in a clockwise spiral pattern (right, down, left, up)
- Each home zone is positioned exactly 16 cells away from the previous player's home zone

The exact pattern follows this sequence:
1. Player 1: Center
2. Player 2: 16 cells to the right (+X) of Player 1
3. Player 3: 16 cells below (+Z) Player 2
4. Player 4: 16 cells to the left (-X) of Player 3
5. Player 5: 16 cells above (-Z) Player 4
6. Player 6: 16 cells to the right (+X) of Player 5
...and so on in a spiral pattern

### Key Components

1. **Constants.js**
   - `HOME_ZONE_SIZE`: Set to 5, defining the dimensions of each home zone
   - `HOME_ZONE_DISTANCE`: Set to 16, the exact distance for an 8-move pawn clash
   - `SPIRAL_DIRECTIONS`: Array of direction vectors defining the spiral pattern

2. **GameUtilities.js - findHomeZonePosition function**
   - Places the first player's home zone at the center of the board
   - Calculates each subsequent player's position based on the spiral pattern
   - Ensures the board expands as needed to accommodate new home zones
   - Handles board expansion in both positive and negative directions

3. **BoardManager.js - expandBoard function**
   - Updates to support expansion in any direction (left, right, top, bottom)
   - Maintains proper coordinates when the board expands in negative directions
   - Tracks game origin coordinates to handle negative coordinate spaces

## Mathematical Properties

- **Distance Between Players**: The Manhattan distance between adjacent players is always 16 cells, ensuring that pawns will clash after exactly 8 moves.
- **Board Efficiency**: The spiral pattern efficiently utilizes space, minimizing the number of empty cells on the board.
- **Scalability**: The pattern can accommodate any number of players, with the board expanding dynamically as needed.

## Testing

A test file (`server/test/home-zone-spiral-test.js`) has been created to verify the implementation. This test:
1. Creates a game with 8 players to showcase the full spiral pattern
2. Visualizes the board with home zone positions
3. Calculates and verifies the Manhattan distances between home zones
4. Identifies the pawn clash points between adjacent players

## Benefits

1. **Predictable Layout**: Players can anticipate where other players will be positioned relative to their own home zone.
2. **Balanced Starting Positions**: All players have equal opportunity and strategic positioning.
3. **Consistent Gameplay**: The exact 8-move pawn clash creates consistent confrontation points.
4. **Scalable Design**: The system works equally well for 2 players or 2000+ players.
5. **Visual Clarity**: The spiral pattern creates a visually appealing and understandable game layout.

## Future Enhancements

Potential future enhancements could include:
- Alternative home zone patterns for different game variants
- Custom distance settings for different game modes
- Visualization tools to help players understand the board layout
- Advanced board expansion algorithms to optimize memory usage for very large games 