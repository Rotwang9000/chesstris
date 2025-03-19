# Shaktris - Chess + Tetris = Awesome.

Shaktris is an innovative hybrid game combining the strategic elements of chess with the spatial puzzle mechanics of Tetris. Players build their territory using Tetris pieces and move chess pieces to capture opponents.

A unique multiplayer game that combines elements of chess and Tetris on a dynamically expanding board.

(Chesstris was taken - Schack and similar sounding words is often a name for chess in some countries)

## Overview

Shaktris is a multiplayer prototype that fuses elements of chess and Tetris on a dynamically expanding 2D board rendered in 3D.
 In this game, each player is assigned a unique "home zone" where their chess pieces reside. Tetromino pieces fall from the sky (the 3rd dimension) and stick to the board only if at least one block lands adjacent to an existing cell which has a route back to the player's king. 
The chess pieces can then use this as part of the board, allowing players to build up the board towards their opponent to be able to move pieces into a place where they can attack.
Just as in tetris though, any 8 cells in a row (except for the home cells) will disappear along with any chess pieces which were using them.

## Development Status

All core gameplay mechanics have been implemented and are ready for testing. See [Implementation Status Report](docs/implementation-status.md) for details on what has been implemented and what needs further work.

### Recently Implemented Features

- **React Frontend**: Modern component-based UI with React and Three.js for 3D visualization 
- **Z-axis Logic**: Full 3D tetromino placement with proper explosion mechanics at Z=1
- **Pawn Promotion**: Automatic promotion to knight after 8 spaces forward
- **Asynchronous Turns**: Each player has their own turn cycle with minimum 10-second intervals
- **King Capture**: Complete transfer of pieces and fees when a king is captured

### Frontend Components

The React frontend includes several key components:
- **Game Board**: 3D visualization of the game board with Three.js
- **Tetromino System**: Displays and manages tetromino placement along the Z-axis
- **Turn Indicator**: Shows turn status with difficulty-based timing visualization
- **Pawn Promotion Modal**: Interface for selecting a piece when a pawn is promoted
- **Row Clearing Visualizer**: Animates row clearing when 8 cells are aligned

### Testing

Tests have been added to verify the implementation of all core gameplay mechanics:
- Z-axis tetromino placement tests
- Pawn promotion tests
- Asynchronous turns timing tests
- Row clearing tests
- King capture mechanics tests

Run tests with: `npm test`

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

## Testing

Comprehensive test coverage is implemented for core game mechanics:

```
npm test                  # Run all tests
npm test tests/gameplay   # Run gameplay mechanics tests
```

### Test Coverage

The following game mechanics have test coverage:

- **Row Clearing**: Tests verify that rows are cleared correctly when 8 or more cells are filled, that cells in safe home zones are protected, and that multiple rows can be cleared at once.
- **Orphaned Pieces**: Tests confirm that the path-to-king validation algorithm correctly identifies pieces connected to and disconnected from the king.
- **Pawn Promotion**: Tests ensure pawns are promoted to knights after exactly 8 moves and that the promotion event is emitted correctly.
- **Turn System**: Tests verify that players correctly alternate between tetromino and chess moves.

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

#Notes for things 
Faux historical russian theme
Custom chess pieces + marketplace for these (sold in sol. 10% commission)
Sponsor tetris pieces + marketplace for. Bid amount and number of uses. Highest bidder 1st piece then 2nd bidder for 2nd piece and so forth.