# Shaktris

A multiplayer game that combines elements of chess and Tetris on a dynamically expanding board.

## Overview

Shaktris is a unique game that fuses the strategic elements of chess with the block-dropping mechanics of Tetris. Players build paths with tetrominos and move chess pieces to capture their opponent's king.

## Features

- **Dual Rendering Modes**: 3D (default) and 2D (accessible via /2d)
- **Universal Input System**: Keyboard, mouse, and touch controls
- **Multiplayer Architecture**: Socket.IO-based real-time communication
- **Modular Code Structure**: Separation of game logic and rendering
- **Robust Error Handling**: Comprehensive try-catch blocks and fallback mechanisms
- **Debug Panel**: Toggle with F9 key for real-time game state visualization

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

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

3. Start the server:
   ```
   node server.js
   ```

4. Open your browser and navigate to:
   - 3D Mode: http://localhost:3020
   - 2D Mode: http://localhost:3020/2d

## Architecture

### Client-Side

The client-side code is organized into several modules:

- **Core**: Game logic independent of rendering
  - `gameManager.js`: Coordinates game flow and components
  - `gameState.js`: Manages the client-side game state
  - `tetrominoManager.js`: Handles tetromino creation and movement
  - `chessPieceManager.js`: Manages chess piece movement and captures
  - `inputController.js`: Unified input handling across devices

- **Rendering**: Visual representation with 3D and 2D options
  - `renderer.js`: Main rendering module
  - `compatibility.js`: Ensures consistent API across rendering modes
  - `3d/`: Three.js-based 3D rendering
  - `2d/`: Canvas-based 2D rendering

- **Utils**: Helper functions and utilities
  - `network.js`: Socket.IO communication
  - `network-patch.js`: Enhanced network functionality with fallbacks
  - `helpers.js`: General utility functions

- **UI**: User interface components
  - `uiManager.js`: Manages UI elements and screens
  - `debugPanel.js`: Interactive debug panel (toggle with F9)

### Server-Side

The server-side code is organized into several modules:

- **Main Server** (`server.js`): Express.js server with Socket.IO integration
- **Game Management** (`server/game/GameManager.js`): Core game logic and state management
- **Routes** (`server/routes/`): API endpoints for game functionality
- **Middleware** (`server/middleware/`): Authentication and request processing
- **Database** (`server/database/`): Database connection and models
- **Services** (`server/services/`): Additional services like payments

### Server-Client Integration

The server and client communicate through:

1. **Socket.IO Events**: Real-time game state updates and player actions
2. **REST API Endpoints**: Game state retrieval and player management

The `GameManager` class on the server handles:
- Player management (adding, removing)
- Board management (expanding, updating)
- Chess piece movement validation
- Tetromino placement validation
- Home zone management
- Game state persistence

## Offline Mode

The game includes a robust offline mode that:
1. Automatically detects when the server is unavailable
2. Creates a mock socket for local game state management
3. Simulates network events for consistent gameplay
4. Persists game state in localStorage
5. Provides a seamless experience without server connectivity

## Debug Panel

The debug panel (toggled with F9) provides real-time information about:
1. Connection status (socket connected, socket ID)
2. Game status (initialized, running, render mode)
3. Player information (ID, score, level)
4. Board information (dimensions, pieces)
5. Home zone details
6. Performance metrics (FPS, update times)

## Controls

- **Arrow Keys**: Move tetromino/chess piece
- **Q**: Rotate tetromino
- **A**: Quick drop tetromino
- **S**: Hold tetromino
- **Space**: Hard drop tetromino
- **P**: Pause game
- **F9**: Toggle debug panel
- **Mouse**: Click and drag chess pieces
- **Touch**: Tap, double-tap, drag, and long press for mobile

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Three.js for 3D rendering
- Socket.IO for real-time communication
- Express.js for server-side routing

## Development

### Module System

The project uses ES modules throughout. All JavaScript files are treated as ES modules, which means:

1. Use `import` and `export` instead of `require` and `module.exports`
2. Include the `.js` extension when importing local files
3. Use `import.meta.url` instead of `__dirname` or `__filename`

### Testing

The project uses Jest for testing with ES modules support. All tests have been converted to use ES modules instead of CommonJS.

#### Running Tests

To run all tests:

```bash
npm test
```

To run a specific test file:

```bash
npm test -- path/to/test/file.test.js
```

For example, to run the tetrominoManager tests:

```bash
npm test -- tests/core/tetrominoManager.test.js
```

To run tests with verbose output:

```bash
npm test -- --verbose
```

#### Debugging Tests

If tests are not exiting properly, you can use the `--detectOpenHandles` flag to identify the issue:

```bash
npm test -- --detectOpenHandles
```

For more detailed information about test failures, use the `--verbose` flag:

```bash
npm test -- --verbose
```

#### Test Structure

Tests are organized by module and functionality:

- `tests/core/`: Tests for core game logic
- `tests/gameplay/`: Tests for gameplay mechanics
- `tests/security/`: Tests for security features
- `tests/services/`: Tests for server-side services
- `tests/utils/`: Tests for utility functions

Each test file focuses on a specific component or service, with test suites structured to test both happy paths and edge cases.

#### Mock Implementations

Tests use Jest's mocking capabilities to isolate components:

```javascript
// Example of mocking a function
const mockFunction = jest.fn();
mockFunction.mockReturnValue(expectedValue);

// Example of spying on a function
const spy = jest.spyOn(object, 'method');
```

#### Test Coverage

The test suite includes 24 test files with 267 passing tests, providing comprehensive coverage of the codebase.

### Recent Improvements

#### ES Module Conversion

The entire codebase has been converted to use ES modules consistently:

1. All CommonJS modules (`require`/`module.exports`) have been converted to ES modules (`import`/`export`)
2. Database services (Redis and MongoDB connections) now use ES module syntax
3. Test files have been updated to use ES modules and Jest's modern testing patterns

#### Test Suite Enhancements

The test suite has been significantly improved:

1. **Framework compatibility**: Tests now work properly with Jest and ES modules
2. **Mocking improvements**: Updated to use Jest's mocking capabilities instead of Sinon
3. **Assertion syntax**: Converted from Chai's assertion style to Jest's expect syntax
4. **Timeout handling**: Added appropriate timeouts for long-running tests
5. **Database cleanup**: Proper teardown of database connections after tests complete

#### Redis Connection Handling

Redis connection handling has been improved:

1. **ES module compatibility**: Redis client initialization now uses ES module syntax
2. **Proper cleanup**: Redis connections are now properly closed after tests complete
3. **Error handling**: Better error handling for Redis connection issues
4. **Memory fallback**: In-memory fallback for Redis when not available in development environments

These improvements ensure that the application can gracefully handle database connection issues and properly clean up resources when shutting down.

## Database Setup

### MongoDB
The application uses MongoDB for persistent storage. Make sure you have MongoDB installed and running, or use the provided connection string to connect to a remote MongoDB instance.

### Redis
The application uses Redis for real-time game state management and pub/sub functionality. Make sure you have Redis installed and running, or the application will fall back to an in-memory implementation for development environments.

#### Redis on Windows
If you're running on Windows, you can install Redis using:
- Windows Subsystem for Linux (WSL)
- Docker
- [Memurai](https://www.memurai.com/) (Redis-compatible Windows server)

## Game Joining

When you start the application, it automatically creates a default game world with ID 'default-game'. Players are automatically connected to this shared world when they first load the application.

### Game Terminology

To clarify the terminology used throughout the codebase:

1. **Game World**: The shared environment where all players interact. Currently, there is one default game world with ID 'default-game' that all players join automatically. This is the persistent space that contains the board, all players, and their chess pieces.

2. **Player Game**: Each player's individual game experience within the shared world. This includes their tetrominos, score, and chess pieces. Players can join and leave the game world, but the world persists even when no players are present.

3. **Game Session**: A period of gameplay for a specific player, from joining to leaving the game world. Multiple game sessions can exist simultaneously within the same game world.

If you want to create or join a different game world, you can use the UI controls to do so, but the default experience is to join the shared 'default-game' world.
