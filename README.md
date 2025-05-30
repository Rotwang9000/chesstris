# Shaktris - Chess + Tetris = Awesome.

Shaktris is an innovative hybrid game combining the strategic elements of chess with the spatial puzzle mechanics of Tetris. Players build their territory using Tetris pieces and move chess pieces to capture opponents.

A unique multiplayer game that combines elements of chess and Tetris on a dynamically expanding board.

(Chesstris was taken - Schack and similar sounding words is often a name for chess in some countries)

## Overview

Shaktris is a multiplayer prototype that fuses elements of chess and Tetris on a dynamically expanding 2D board rendered in 3D.
 In this game, each player is assigned a unique "home zone" where their chess pieces reside. Tetromino pieces fall from the sky (the 3rd dimension) and stick to the board only if at least one block lands adjacent to an existing cell which has a route back to the player's king. 
The chess pieces can then use this as part of the board, allowing players to build up the board towards their opponent to be able to move pieces into a place where they can attack.
Just as in tetris though, any 8 cells in a row (except for the home cells) will disappear along with any chess pieces which were using them.

A users home cells can spawn perpendicular to others home cells, but they will always appear where there is pawn clash... ie. a pawn who moves 8 places forward can always clash with another players pawns that have also moved 8 spaces forward.

## Development Status

All core gameplay mechanics have been implemented and are ready for testing. See [Implementation Status Report](docs/implementation-status.md) for details on what has been implemented and what needs further work.

### TO DO
Add ID to all cells. 
Generic frontend animation so when backend gives a different position to a cell it will animate the move, spawn or explode


### Recently Implemented Features

- **Multi-Object Cell Structure**: Cells now store arrays of objects, allowing multiple elements (tetrominos, chess pieces, home zones) to occupy the same position, enabling more complex gameplay interactions
- **Sparse Board Architecture**: Replaced fixed-size 2D array with a sparse data structure that automatically expands as needed, allowing for unlimited board growth and more efficient memory usage
- **React Frontend**: Modern component-based UI with React and Three.js for 3D visualization 
- **Y-axis Logic**: Full 3D tetromino placement with proper explosion mechanics at Y=1
- **Pawn Promotion**: Automatic promotion to knight after 8 spaces forward
- **Asynchronous Turns**: Each player has their own turn cycle with minimum 10-second intervals
- **King Capture**: Complete transfer of pieces and fees when a king is captured
- **XZ-Y Coordinate System**: Updated coordinate system for more intuitive 3D gameplay with clear terminology:
  - X-axis: Horizontal movement left/right across the board
  - Y-axis: Vertical movement up/down (dropping from the sky)
  - Z-axis: Horizontal movement forward/backward (towards/away from the camera)
  This system makes game mechanics more intuitive and prevents confusion in the tetromino movement code.
- **Enhanced Tetromino Placement**: Improved tetromino placement with server validation, animations, and adjacency checking
- **Visual Feedback**: Added drop animations and explosion effects for tetromino interactions
- **Simplified Player Colors**: Implemented a clear red/blue-green color scheme to distinguish local player (red) from opponents (blue-green), enhancing visibility and gameplay clarity
- **Interactive Piece Highlighting**: Added animated glow effects when hovering over player names in the player bar
- **Robust Error Handling**: Improved Three.js rendering stability with comprehensive resource cleanup and null checking to prevent console errors
- **Networked Player Detection**: Enhanced player identification system to correctly distinguish local player from opponents

### Frontend Components

The React frontend includes several key components:
- **Game Board**: 3D visualization of the game board with Three.js
- **Tetromino System**: Displays and manages tetromino placement along the Y-axis
- **Turn Indicator**: Shows turn status with difficulty-based timing visualization
- **Pawn Promotion Modal**: Interface for selecting a piece when a pawn is promoted
- **Row Clearing Visualizer**: Animates row clearing when 8 cells are aligned

### Testing

We've implemented a comprehensive test suite using Jest to validate core game components:

- **Sound Manager**: Tested features include sound loading, playback, volume control, and error handling
- **UI Manager**: Tests for component creation, event handling, and UI state management
- **Game State Manager**: Verification of state transitions, event handling, and game logic

Many tests are currently in development as we stabilize the codebase. To run the tests:

```
npm test
```

We're in the process of migrating from Chai/Sinon to Jest for testing. See [Test Migration Guide](TEST-MIGRATION.md) for details on how to convert tests and use the new tools.

### Test Migration Tools

We've developed several tools to help with the migration process:

```bash
# Convert a single test file
node scripts/convert-tests.js <file-path>

# Convert all test files
node scripts/convert-all-tests.js

# Fix Jest import issues in converted files
node scripts/fix-jest-imports.js

# Verify a single converted test file
node scripts/verify-single-test.js <file-path>

# Verify and replace all passing converted tests
node scripts/verify-and-replace-tests.js [--dry-run] [--verbose] [--force]

# Run the entire migration process
node scripts/migrate-tests.js [--convert] [--fix] [--verify] [--replace] [--force] [--verbose]
```

See the [Test Migration Guide](TEST-MIGRATION.md) and [Test Migration Summary](docs/test-migration-summary.md) for more details.

Current testing metrics:
- 37 passing tests across key modules
- Full test conversion infrastructure in place
- Automated tools for validation and replacement

We're continuously improving test coverage to ensure reliable gameplay mechanics.

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm (v6+)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/shaktris.git
   cd shaktris
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up the client:
   ```
   npm run setup:client
   ```

4. Start the development server:
   ```
   npm run dev
   ```
   
   Or use the combined setup and start script:
   ```
   npm run setup-and-start
   ```

5. Access the game:
   - Development Mode: http://localhost:3020/ (serves files from public directory)
   - Legacy 2D Mode: http://localhost:3020/2d

## Development vs Production Modes

The server automatically detects whether it's running in development or production mode:

- **Development Mode**: Serves static files from the `public` directory
- **Production Mode**: Serves the React application from the `client/build` directory

To explicitly set the mode:
```
# For development
$env:NODE_ENV="development"; npm run dev  # PowerShell
NODE_ENV=development npm run dev          # Bash

# For production
$env:NODE_ENV="production"; npm run dev   # PowerShell
NODE_ENV=production npm run dev           # Bash
```

## Game Rules

1. **Objective**: Capture other kings while protecting your own
2. **Turn Order**: Each player follows their own asynchronous turn sequence:
   - First place a Tetris piece on the board
   - Then move a chess piece
   - Players don't need to wait for other players' turns
   - A minimum 10-second turn length helps human players compete with others
3. **Building Territory**: Tetris pieces must connect to your existing territory
4. **Chess Movement**: Chess pieces can only move on built territory, of any player

## Core Gameplay Mechanics

- **Tetris Piece Connectivity Rules:**  
  Tetris pieces will only stick to the board if:
  1. They are connected to other existing pieces .. it's like they have magnetic edges so as they go past a cell, they will stick and become cells themselves at the same level as other cells.
  2. There is a continuous path back to the player's king
  This forces players to build strategically from their king's position, preventing disconnected "islands" of pieces.
  When a row is cleared, orphaned pieces will drop back, towards the player's king.
  If any part of the tetris piece lands ON another cell, the whole piece will disintegrate to nothing
  If it is not adjacent to a cell as it reaches board height it will just fall through the sky and fade away.

- **Orphaned Pieces Handling:**  
  Pieces that become disconnected from their king (have no valid path to the king) are considered "orphaned" and are removed from the board. This can happen when:
  1. A row is cleared that contained cells forming the only path to the king
  2. An opponent's move breaks the connectivity of your pieces
  3. Your king is captured or moved, leaving pieces with no valid connection
  The orphaned pieces system ensures that all chess pieces must maintain a strategic connection to their king, adding another layer of tactical depth to gameplay.

- **Pawn Promotion:**  
  Pawns are automatically promoted to knights once they have moved 8 spaces forward, increasing their utility in the late game.

- **Asynchronous Turns:**  
  Each player has their own gameplay cycle:
  1. A tetris piece falls for the player to place
  2. After placing the piece, they can move one of their chess pieces
  3. Players don't need to wait for other players' turns
  4. A minimum 10-second turn length helps human players compete with others, especially computer-controlled opponents


## Features

- **Hybrid Gameplay**: Combines chess strategy with Tetris building mechanics
- **Multiplayer Support**: Play against friends or computer opponents
- **Computer Players**: Built-in AI with multiple difficulty levels
- **External Computer Player API**: Create your own AI to play the game
- **3D and 2D Rendering**: Choose your preferred visual style
- **3D and 2D Rendering Modes:** Choose between a beautiful 3D rendered game board or a classic 2D view for lower-end devices.
- **Multiplayer Support:** Play against friends or AI opponents.
- **Computer Players:** Automatic computer player joins when you start a game alone, providing an opponent even when no other players are available.
- **Spectator Mode:** Watch other players' games in real-time by pressing Ctrl+S and selecting a player to spectate.
- **Full Window Rendering:** The game occupies the entire browser window for an immersive experience.
- **Customizable Settings:** Adjust game speed, volume, and visual settings to your preference.
- **Responsive Design:** Play on desktop or mobile devices with a responsive UI.

## Technical Details

Shaktris is built using modern web technologies:

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **3D Rendering:** Three.js
- **2D Rendering:** Canvas API
- **Networking:** Socket.IO for real-time multiplayer
- **Server:** Node.js with Express
- **Board Architecture:** Sparse data structure that tracks occupied cells by coordinates without artificial size limits
- **Coordinate System:** Standard Three.js coordinate system where:
  - X-axis runs horizontally across the board (left to right)
  - Z-axis runs vertically on the board (top to bottom)  
  - Y-axis represents height (tetrominos fall along the Y-axis)

## Project Structure

The project follows a modular architecture:

- **Server:** Handles game state synchronization and player connections
- **Client:** Manages rendering, input, and local game state
- **Utilities:** Modular components for sound, UI, networking, etc.


## Computer Player Development

Shaktris features a robust API for developing computer players. To get started:

1. Run the setup script:
   ```
   npm run setup:computer-player
   ```

2. Explore the example implementations in the `examples/` directory

3. Read the comprehensive API documentation in `docs/computer-player-api.md`

4. Test your computer player:
   ```
   npm run test:computer-players
   ```

## Available Scripts

- `npm run dev` - Start development server
- `npm test` - Run tests
- `npm run setup:computer-player` - Set up computer player development environment
- `npm run test:computer-players` - Test computer player implementations
- `npm run run:computer-players` - Run multiple computer players for testing
- `npm run run:callback-server` - Run example callback server
- `npm run run:simple-player` - Run example simple computer player

## Project Structure

- `server.js` - Main server entry point
- `src/` - Core game logic
- `public/` - Frontend assets and client-side code
- `examples/` - Example computer player implementations
- `tests/` - Test suites
- `docs/` - Documentation
- `scripts/` - Utility scripts

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Chess and Tetris for inspiring this hybrid game concept
- The open-source community for providing excellent tools and libraries

## Recent Updates

### Home Zone Spiral Pattern
- Implemented deterministic home zone positioning in a clockwise spiral pattern
- First player's home zone is placed at the center of the board
- Subsequent players are placed in a spiral pattern (right, down, left, up) 
- Each home zone is positioned exactly 16 cells away from the previous player's home zone
- Ensures pawns will clash after exactly 8 moves (at the midpoint between home zones)
- Board dynamically expands in any direction as needed to accommodate new players
- Added visualization and testing tools for verifying the spiral pattern
- Full documentation available in docs/home-zone-positioning.md

### Modular Code Refactoring
- Completely restructured the codebase for improved maintainability and testability
- Split the monolithic GameManager.js into specialized modules:
  - BoardManager: Handles board operations, row clearing, and cell management
  - TetrominoManager: Manages tetromino generation, validation, and placement
  - ChessManager: Controls chess piece movement, validation, and captures
  - IslandManager: Tracks island connectivity and handles disconnected islands
  - PlayerManager: Manages player registration, actions, and state
  - ComputerPlayerManager: Controls computer player behavior and AI
  - GameUtilities: Provides shared utility functions
  - Constants: Centralizes game constants and configuration
- Improved dependency injection and class relationships
- Added comprehensive tests for the modular system
- Maintained backward compatibility with existing API endpoints
- Enhanced error handling and logging throughout the system

### Coordinate System Reorientation
- Changed from XY-Z to XZ-Y coordinate system for more intuitive 3D gameplay
- The X-axis still runs horizontally across the board (left to right)
- The Z-axis now runs vertically on the board (top to bottom)
- The Y-axis represents height/depth (into/out of the screen)
- Updated all game logic to use the new coordinate system
- Documentation and tests have been updated to reflect the new system

### Island Connectivity System
- Implemented robust island tracking and management
- Islands are automatically detected, merged, and split as the board evolves
- Each island tracks whether it contains a king
- Cell ownership is maintained during island transformations
- Events are emitted for island updates, splits, and merges
- Island connectivity validation runs after every chess move and tetromino placement

### Piece Acquisition System
- Players can now purchase additional chess pieces during gameplay using SOL
- Implemented pricing for different piece types (pawns, rooks, knights, bishops, queens)
- Added API endpoints for piece purchases
- New pieces are automatically placed in the player's home zone
- Home zone expands if needed to accommodate new pieces

### Player Pause System Enhancements
- Added automatic timeout checking for paused players
- Server-side interval monitors player pause durations
- Players exceeding the 15-minute maximum pause time face penalties:
  - Main island removal
  - Orphaned pieces return to home zone
  - Home zone may expand to accommodate returning pieces
- Comprehensive test suite for pause timeout functionality

### Bug Fixes
- Fixed the `_generateRandomColor` function to provide visually distinct player colours
- Implemented proper error handling for piece placement in home zones
- Enhanced logging system with timestamps for better debugging
- Resolved issues with path-to-king validation

## Player Pause System

Shaktris includes a player pause system that allows players to temporarily pause their game for up to 15 minutes. During the pause, their pieces cannot be captured, their cells won't be cleared, and their home zone is protected.

- **Pause/Resume API**: The game provides REST API endpoints for pausing and resuming games, as well as checking pause status.
- **Pause Timeout Handling**: If a player doesn't return within 15 minutes, their main island is removed from the board, and their orphaned pieces are returned to their home zone if possible.
- **UI Integration**: The frontend includes a PauseControl component that displays the pause status and allows players to pause and resume their game.

## Developer Documentation

### Frontend Development

The Shaktris frontend is being redeveloped to improve performance, maintainability, and user experience. The following documentation is available for frontend developers:

- **[Frontend Developer Guide](docs/frontend-dev.md)**: Core mechanics, implementation requirements, and technical recommendations
- **[Frontend Component Model](docs/frontend-component-model.md)**: Component architecture, specifications, and implementation strategies

### Getting Started with Frontend Development

1. Review the frontend documentation in the `docs` directory
2. Explore the existing implementation in `client/src` and `public/js`
3. Run `npm run dev` to start the development server
4. Make changes to components following the guidelines in the component model

The frontend uses a combination of React components and vanilla JavaScript with Three.js for 3D rendering.

## Notes for things TO DO! 
Faux historical russian theme
Custom chess pieces + marketplace for these (sold in sol. 10% commission)
Sponsor tetris pieces + marketplace for. Bid amount and number of uses. Highest bidder 1st piece then 2nd bidder for 2nd piece and so forth.
2D version will show ghost piece in place when tetris piece falling along with either a visualisation or Y countdown. 

## Unit Testing

The project includes comprehensive unit tests for the major modules. Tests are written using Jest and can be found in the `tests` directory.

### Running Tests

To run the tests, use the following command:

```bash
npm test
```

### Test Coverage

The unit tests cover the following modules:

- **Game State Manager**: Tests for state initialization, updates, and event handling
- **UI Manager**: Tests for UI component creation, state handling, and theme management
- **Animations**: Tests for various game animations, including particle effects and transitions
- **Animator**: Tests for animation scheduling, updates, and sequence management
- **Sound Manager**: Tests for audio playback, volume control, and resource management

### Writing New Tests

When adding new features, please include appropriate unit tests. Follow these guidelines:

1. Create a new test file in the `tests` directory if testing a new module
2. Follow the existing pattern of using Jest's `describe` and `test` functions
3. Mock external dependencies to isolate the code being tested
4. Test both success cases and error handling

# Chesstris

A multiplayer game that combines elements of chess and Tetris.

## Testing

The project includes both Jest tests and Node.js native tests:

### Node.js Tests

Run the Node.js tests with:

```
npm run test:node
```

These tests focus on core gameplay mechanics:
- Tetromino placement
- Chess piece movement
- Row clearing
- Home zone spiral placement
- King capture and territory acquisition

### Jest Tests

Run the Jest tests with:

```
npm test
```

Or run specific test categories:

```
npm run test:gameplay
npm run test:core
npm run test:ui
npm run test:server
```

## Installation

Clone the repository and install dependencies:

```
git clone https://github.com/yourusername/chesstris.git
cd chesstris
npm install
```

## Development

Start the development server:

```
npm run dev
```

## License

[MIT](LICENSE)

## Board Structure

Shaktris now uses a dynamic sparse cell-based board structure rather than a traditional 2D array:

- Cells are stored in a key-value map using coordinates as keys (`"x,z"`)
- Only occupied cells are tracked, allowing for infinite board expansion
- No fixed size or boundaries - the board grows dynamically as needed
- Supports non-rectangular layouts like the spiral pattern for home zones

For more details, see [Spiral Board Layout Documentation](docs/spiral-board-layout.md).

## Features

- Combined Tetris and Chess gameplay
- Multiplayer support
- Dynamic board that grows as the game progresses
- Spiral layout enabling unlimited players
- Chess pieces that can move and capture
- Tetromino drops that create new territory

## Development

### Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Architecture

The game has a client-server architecture:

- Frontend: Three.js for 3D rendering
- Backend: Server for game state management
- Communication: WebSockets for real-time updates

Server-side code handles all game logic and board state, while the client simply renders what the server provides.

## Cell Content System

The game now supports multiple items in each cell. Each cell can contain:

- Chess pieces
- Tetromino blocks
- Home zone markers
- And other game elements

### Cell Structure

Cells are now structured as objects with a `contents` array:

```javascript
{
  contents: [
    { type: 'chess', player: 1, chessPiece: { type: 'PAWN', player: 1 } },
    { type: 'homeZone', player: 1 }
  ],
  position: { x: 5, z: 7 }
}
```

### Accessing Cell Contents

Use the `extractCellContent` helper function to retrieve specific content types:

```javascript
const chessContent = boardFunctions.extractCellContent(cellData, 'chess');
const homeZoneContent = boardFunctions.extractCellContent(cellData, 'homeZone');
```

## Chess Piece Creation

The game includes a chess piece creator module for rendering chess pieces with proper positioning and appearance.

### Default Pieces

Default geometric pieces are provided for all standard chess pieces:
- Pawns, Rooks, Knights, Bishops, Queens, Kings
- Each piece has a distinct shape and appearance
- Pieces are colored based on the player (blue for player 1, red for player 2)

### Custom Models

Players can register custom models for chess pieces:

```javascript
// Load a custom model and register it
modelLoader('models/custom-king.glb', (model) => {
  chessPieceCreator.registerCustomModel(1, 'KING', model);
});
```

Use the `loadCustomModels` function to load multiple models:

```javascript
chessPieceCreator.loadCustomModels(modelLoader, {
  player1: {
    king: 'models/p1-king.glb',
    queen: 'models/p1-queen.glb'
  },
  player2: {
    king: 'models/p2-king.glb',
    queen: 'models/p2-queen.glb'
  }
});
```