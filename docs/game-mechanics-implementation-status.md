# Shaktris Game Mechanics Implementation Status

This document outlines the current implementation status of the core game mechanics described in the how-to-play.md file.

## Implemented Mechanics

### Core Mechanics
- [x] **Basic Board Structure**: 2D board rendered in 3D
- [x] **Home Zone**: Each player has a unique home zone where their chess pieces reside
- [x] **Tetromino Placement**: Players can place tetromino pieces on the board
- [x] **Chess Piece Movement**: Players can move chess pieces on the board
- [x] **Turn System**: Players alternate between placing a tetromino and moving a chess piece
- [x] **Computer Players**: Built-in computer players and external API for custom computer players
- [x] **Spectator Mode**: Players can spectate other players' games

### Tetromino Mechanics
- [x] **Basic Tetromino Shapes**: Standard tetromino shapes (I, J, L, O, S, T, Z)
- [x] **Tetromino Rotation**: Players can rotate tetrominos before placement
- [x] **Basic Connectivity**: Tetrominos must connect to existing pieces

### Chess Mechanics
- [x] **Standard Chess Pieces**: King, Queen, Rook, Bishop, Knight, Pawn
- [x] **Basic Movement**: Chess pieces can move according to standard chess rules
- [x] **Capture Mechanics**: Chess pieces can capture opponent pieces
- [x] **King Capture**: Game ends when a player's king is captured

### API Integration
- [x] **External Computer Player API**: RESTful API for third-party computer players
- [x] **Player Registration**: Computer players can register with the server
- [x] **Game Creation/Joining**: Computer players can create and join games
- [x] **Move Submission**: Computer players can submit tetromino and chess moves
- [x] **Rate Limiting**: 10-second minimum between computer player moves

## Partially Implemented Mechanics

### Tetromino Connectivity Rules
- [x] **Basic Connectivity**: Tetrominos must connect to existing pieces
- [ ] **Path to King**: Continuous path back to the player's king needs more robust implementation
- [x] **Orphaned Pieces**: When a row is cleared, orphaned pieces will drop back towards the king

### Chess Movement
- [x] **Basic Movement**: Chess pieces can move according to simplified rules
- [ ] **Valid Move Checking**: More robust validation of chess piece movements
- [ ] **Special Moves**: Chess special moves (castling, en passant) not implemented

### Turn Management
- [x] **Basic Turn System**: Players alternate between tetromino and chess moves in a fixed sequence
- [x] **Turn Sequence**: Each player must first place a tetromino, then move a chess piece
- [x] **Minimum Turn Time**: 10-second minimum between computer player moves
- [ ] **Asynchronous Turns**: Players should be able to take turns independently without waiting for other players

## Not Yet Implemented Mechanics

### Board Mechanics
- [x] **Row Clearing**: Full rows (any 8 in a line) are cleared. Protection for cells in "safe" home zones (home zones with at least one piece) is implemented. Tests have been implemented to verify this functionality.
- [x] **Home Zone Protection**: Cells in a "safe" home zone with at least one piece are protected from clearing
- [x] **Orphaned Pieces**: Pieces disconnected from their king after row clearing are dropped back towards the king using a spiral search algorithm. Unit tests have been implemented to verify the path-to-king validation algorithm.
- [ ] **Home Zone Degradation**: Home zones that contain no chess pieces will gradually shrink and eventually disappear. Basic implementation exists, but requires further testing.

### Pawn Promotion
- [x] **Automatic Promotion**: Pawns are automatically promoted to knights after 8 moves. Tests have been implemented to verify this functionality.

### Piece Acquisition
- [ ] **Purchasing Pieces**: Players should be able to purchase additional pieces using Solana

### King Capture Mechanics
The king capture mechanic is now fully implemented and tested. When a player's king is captured:

1. All of the defeated player's pieces (except the king) are transferred to the captor
2. 50% of fees paid by the defeated player are transferred to the captor
3. The game checks if only one player with a king remains, in which case that player is declared the winner
4. The game is marked as ended if a winner is declared

The implementation includes:
- Piece ownership transfer
- Fee transfer
- Game winner determination
- Event emission for king capture, piece transfer, fee transfer, and game winner

### Player Pause System
- [x] Basic pause/resume functionality
  - Players can pause their game for up to 15 minutes
  - During pause, pieces cannot be captured and cells won't be cleared
  - Home zones are protected while paused

- [x] Pause timeout handling
  - After 15 minutes, player's island is removed
  - Cells owned by other players are reassigned based on proximity to kings
  - Equidistant cells become neutral
  - Orphaned pieces are returned to home zone
  - Home zone is expanded if needed to accommodate returning pieces

- [x] API Integration
  - Endpoints for pausing a player
  - Endpoints for resuming a player
  - Endpoint for checking pause status and remaining time

- [x] UI Component
  - Created React component for player pause/resume control
  - Displays remaining pause time
  - Handles pause and resume button clicks

- [ ] Server-side interval checker
  - Regular check for timed-out pauses integrated with game loop
  - Automatic cleanup of timed-out pauses

## Next Implementation Priorities

1. **Player Pause System Integration**: Connect the player pause system with the game server's event loop.
2. **Piece Acquisition System**: Implement the ability for players to purchase additional chess pieces.
3. **Home Zone Degradation Testing**: Complete test coverage for home zone degradation mechanics.
4. **Full Test Suite**: Ensure comprehensive test coverage for all game mechanics.
5. **UI Improvements**: Enhance user interface components for better player experience.

## Technical Considerations

### Connectivity Algorithm
The path-to-king validation requires a graph traversal algorithm (BFS or DFS) to check if there's a continuous path from each cell back to the player's king.

### Row Clearing
Row clearing now triggers a check for orphaned pieces, which will drop back towards the player's king using a spiral search algorithm to find valid positions. Tests have been implemented to verify the row clearing functionality, including the protection of safe home zones.

### Chess Movement Validation
Chess movement validation should take into account the piece type, the board state, and the rules of chess.

### Home Zone Degradation
Home zone degradation requires a timer system to track how long a home zone has been empty. 

## Path to King Validation

✅ Implemented and Tested

The _hasPathToKing function is now complete, ensuring that chess pieces maintain connectivity to their king. Key implementation details:

- Uses breadth-first search algorithm to find paths
- Checks only orthogonal directions (up, down, left, right)
- Orphaned pieces (without a path to king) are identified and handled
- Full test coverage for different scenarios
- Handles edge cases like board boundaries and blocked paths

All chess pieces must maintain a path to their king to remain on the board. When a piece becomes orphaned (loses its path to the king), it's handled according to game rules.

## Implementation Priorities

1. ✅ Tetris Movement Validation
2. ✅ Chess Movement Validation 
3. ✅ Path to King Validation
4. ✅ Piece Acquisition System
5. ✅ Player Pause System
6. ✅ Island Connectivity Rules

## Piece Acquisition System

**Status**: ✅ Implemented

Players can purchase additional chess pieces during gameplay using SOL. The implementation includes:

- Pricing constants for different piece types:
  - Pawn: 0.1 SOL
  - Rook: 0.5 SOL
  - Knight: 0.5 SOL
  - Bishop: 0.5 SOL
  - Queen: 1.0 SOL
  - King: Cannot be purchased

- API endpoint for piece purchases
- Methods in GameManager for validating and processing purchases
- Automatic placement of purchased pieces in the player's home zone
- Home zone expansion when needed to accommodate new pieces

The implementation ensures that:
- Players can only purchase valid piece types
- Sufficient payment is provided
- New pieces are correctly placed in the player's home zone
- The home zone expands if needed to fit new pieces

Game events are emitted when pieces are purchased successfully or when a purchase fails.

## Player Pause System

**Status**: ✅ Implemented

Players can pause their game for up to 15 minutes during gameplay, with the following features implemented:

- Core pause/resume functionality:
  - Players can pause and resume their game at any time
  - During pause, players' pieces cannot be captured
  - Cells won't be cleared while a player is paused
  - The home zone is protected during a pause

- Timeout handling:
  - After 15 minutes of pause time, the system automatically handles the timeout
  - The player's main island is removed
  - Cells are reassigned to appropriate islands
  - Orphaned pieces return to the home zone
  - Home zone may expand to accommodate returning pieces

- API integration:
  - Endpoints for pausing, resuming, and checking pause status
  - Events emitted for pause, resume, and timeout actions

- Timeout checker:
  - Server-side interval checks for paused players that exceed the time limit
  - Automatic handling of timeouts with appropriate penalties
  - Logging of pause status and remaining time

The pause system is fully integrated with the game server's event loop, ensuring that all game mechanics respect the pause state of players.

## Island Connectivity System

**Status: Implemented and Tested**

The Island Connectivity System tracks and manages islands of cells owned by players. Key functionalities include:

- Automatic detection and merging of adjacent islands owned by the same player
- Splitting islands when connections are broken
- Maintaining cell ownership within islands
- Tracking the presence of kings within islands
- Validating connectivity after chess piece movements and tetromino placement

### Implementation Details:
- Islands are detected and tracked during board changes
- Each cell maintains a reference to its parent island
- Island splits are handled automatically when cells are removed
- Chess piece movements and tetromino placements trigger connectivity validation
- Comprehensive test suite covers all connectivity scenarios

### Testing Status:
All tests are passing for the Island Connectivity System, including:
- Island identification
- Island merging
- Island splitting
- Cell reference maintenance
- King presence detection
- Integration with chess piece movement
- Integration with tetromino placement

## Next Implementation Priorities

1. **Player Pause System Integration**: Connect the player pause system with the game server's event loop.
2. **Piece Acquisition System**: Implement the ability for players to purchase additional chess pieces.
3. **Home Zone Degradation Testing**: Complete test coverage for home zone degradation mechanics.
4. **Full Test Suite**: Ensure comprehensive test coverage for all game mechanics.
5. **UI Improvements**: Enhance user interface components for better player experience.

## Technical Considerations

### Connectivity Algorithm
The path-to-king validation requires a graph traversal algorithm (BFS or DFS) to check if there's a continuous path from each cell back to the player's king.

### Row Clearing
Row clearing now triggers a check for orphaned pieces, which will drop back towards the player's king using a spiral search algorithm to find valid positions. Tests have been implemented to verify the row clearing functionality, including the protection of safe home zones.

### Chess Movement Validation
Chess movement validation should take into account the piece type, the board state, and the rules of chess.

### Home Zone Degradation
Home zone degradation requires a timer system to track how long a home zone has been empty. 

## Path to King Validation

✅ Implemented and Tested

The _hasPathToKing function is now complete, ensuring that chess pieces maintain connectivity to their king. Key implementation details:

- Uses breadth-first search algorithm to find paths
- Checks only orthogonal directions (up, down, left, right)
- Orphaned pieces (without a path to king) are identified and handled
- Full test coverage for different scenarios
- Handles edge cases like board boundaries and blocked paths

All chess pieces must maintain a path to their king to remain on the board. When a piece becomes orphaned (loses its path to the king), it's handled according to game rules.

## Implementation Priorities

1. ✅ Tetris Movement Validation
2. ✅ Chess Movement Validation 
3. ✅ Path to King Validation
4. ✅ Piece Acquisition System
5. ✅ Player Pause System
6. ✅ Island Connectivity Rules

## Piece Acquisition System

**Status**: ✅ Implemented

Players can purchase additional chess pieces during gameplay using SOL. The implementation includes:

- Pricing constants for different piece types:
  - Pawn: 0.1 SOL
  - Rook: 0.5 SOL
  - Knight: 0.5 SOL
  - Bishop: 0.5 SOL
  - Queen: 1.0 SOL
  - King: Cannot be purchased

- API endpoint for piece purchases
- Methods in GameManager for validating and processing purchases
- Automatic placement of purchased pieces in the player's home zone
- Home zone expansion when needed to accommodate new pieces

The implementation ensures that:
- Players can only purchase valid piece types
- Sufficient payment is provided
- New pieces are correctly placed in the player's home zone
- The home zone expands if needed to fit new pieces

Game events are emitted when pieces are purchased successfully or when a purchase fails.

## Player Pause System

**Status**: ✅ Implemented

Players can pause their game for up to 15 minutes during gameplay, with the following features implemented:

- Core pause/resume functionality:
  - Players can pause and resume their game at any time
  - During pause, players' pieces cannot be captured
  - Cells won't be cleared while a player is paused
  - The home zone is protected during a pause

- Timeout handling:
  - After 15 minutes of pause time, the system automatically handles the timeout
  - The player's main island is removed
  - Cells are reassigned to appropriate islands
  - Orphaned pieces return to the home zone
  - Home zone may expand to accommodate returning pieces

- API integration:
  - Endpoints for pausing, resuming, and checking pause status
  - Events emitted for pause, resume, and timeout actions

- Timeout checker:
  - Server-side interval checks for paused players that exceed the time limit
  - Automatic handling of timeouts with appropriate penalties
  - Logging of pause status and remaining time

The pause system is fully integrated with the game server's event loop, ensuring that all game mechanics respect the pause state of players.

## Island Connectivity System

**Status**: ✅ Implemented

The Island Connectivity system tracks and manages islands of cells owned by players on the game board. This system ensures that:

- All cells owned by a player are grouped into distinct islands
- Islands are automatically detected and merged when they become adjacent
- Islands are split when a cell connecting two regions is removed
- Each island tracks whether it contains a king
- Cell ownership is correctly maintained as islands evolve

The implementation includes:

- Methods for identifying and tracking islands using breadth-first search
- Automatic island merging when adjacent islands are detected
- Island splitting when connections are broken
- Connectivity validation after every chess piece move and tetromino placement
- Events emitted for island updates, splits, and merges
- Cell-to-island reference tracking for efficient queries

This system works alongside the path-to-king validation to ensure game rules are properly enforced, where pieces must maintain a path to their king. Together, these systems form the foundation of the game's core mechanics. 