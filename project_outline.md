# Shaktris Project Outline

## Overview

Shaktris is a multiplayer game that fuses elements of chess and Tetris on a dynamically expanding board. Players build paths with tetrominos and move chess pieces to capture their opponent's king.

## Key Features

1. **Dual Rendering Modes**
   - 3D mode (default): Immersive Three.js-based rendering with physics
   - 2D mode (accessible via /2d): Classic grid-based gameplay for better performance

2. **Universal Input System**
   - Keyboard controls: Arrow keys for movement, Q for rotation, A for quick drop
   - Mouse controls: Click and drag for chess pieces
   - Touch controls: Tap, double-tap, drag, and long press for mobile compatibility

3. **Multiplayer Architecture**
   - Socket.IO-based real-time communication
   - Universal game world where all players join the same game
   - Persistent game state that survives player disconnections

4. **Modular Code Structure**
   - Core modules: Game logic independent of rendering
   - Rendering modules: Visual representation with 3D and 2D options
   - Input controller: Unified input handling across devices

5. **Robust Error Handling**
   - Comprehensive try-catch blocks throughout the codebase
   - Detailed error logging for debugging
   - Graceful fallback to offline mode when network errors occur

6. **Debug Panel**
   - Interactive debug panel (toggle with F9 key)
   - Real-time game state visualization
   - Performance metrics (FPS, delta time)
   - Detailed information about board, players, and tetrominos

## Implementation Details

### Input Controller

The new input controller (`inputController.js`) provides a unified interface for handling:
- Keyboard input (arrow keys, Q, A)
- Mouse input (click, drag)
- Touch input (tap, double-tap, drag, long press)

This allows for seamless play across desktop and mobile devices with consistent controls.

### 3D/2D Mode Switching

The server now supports both 3D and 2D modes:
- 3D mode is the default (/)
- 2D mode is accessible via /2d
- Both modes use the same codebase with conditional rendering

The client detects the URL path and adjusts the rendering mode accordingly, with no server-side changes needed.

### Mobile Compatibility

Mobile support has been enhanced with:
- Touch-friendly controls
- Responsive layout
- Performance optimisations for mobile devices
- Gesture recognition for intuitive gameplay

### Error Handling and Debugging

The game now includes comprehensive error handling:
- Try-catch blocks in all critical functions
- Detailed error logging to console
- Graceful degradation when errors occur
- Offline mode fallback for network issues

A new debug panel provides real-time insights:
- Game state visualization
- Performance metrics
- Player and board information
- Tetromino details and home zone status

### Code Refactoring

Several key improvements were made to the codebase:
1. Removed duplicate functions between `tetrominoManager.js` and `tetromino.js`
2. Separated game logic from rendering logic
3. Created a unified input system
4. Implemented URL-based mode switching
5. Enhanced server with proper routing
6. Added comprehensive error handling
7. Created a debug panel for development and troubleshooting

### Server Architecture

The server is structured in a modular way with several key components:

#### Main Server (`server.js`)
- Express.js server for HTTP requests
- Socket.IO for real-time communication
- Static file serving for client-side assets
- API endpoints for game state management
- Socket event handlers for real-time game updates
- Periodic game state saving to disk

#### Game Management (`server/game/GameManager.js`)
- Core game logic and state management
- Player management (adding, removing)
- Board management (expanding, updating)
- Chess piece movement validation
- Tetromino placement validation
- Home zone management
- Game state persistence

#### Routes (`server/routes/`)
- `game.js`: Game-related API endpoints
- `auth.js`: Authentication and user management
- `stats.js`: Player statistics and leaderboards
- `transaction.js`: In-game transactions
- `payments.js`: Payment processing
- `advertiser.js`: Advertisement management

#### Middleware (`server/middleware/`)
- `auth.js`: Authentication middleware
- `adminAuth.js`: Admin authentication middleware

#### Database (`server/database/`)
- `index.js`: Database connection and configuration
- `models/`: Database models for game entities
- `services/`: Database service functions

#### Services (`server/services/`)
- `payments.js`: Payment processing service

### Server Functions

The server provides several key functions for game management:

#### Express Server Routes
| Route | Purpose | Implementation | Tested | Used on Site |
|-------|---------|----------------|--------|--------------|
| GET / | Serves the main game in 3D mode | Serves index.html with client-side detection of 3D mode | ✅ | ✅ |
| GET /2d | Serves the game in 2D mode | Serves the same index.html with client-side detection of 2D mode | ✅ | ✅ |
| GET /api/game-state | Returns the current game state | Returns the full game state JSON object | ✅ | ✅ |
| POST /api/join-game | Allows a player to join the game | Adds player to gameState.players and broadcasts event | ✅ | ✅ |
| POST /api/leave-game | Allows a player to leave the game | Marks player as inactive and broadcasts event | ✅ | ✅ |

#### Socket.IO Event Handlers
| Event | Purpose | Implementation | Tested | Used on Site |
|-------|---------|----------------|--------|--------------|
| connection | Handles new socket connections | Logs connection and sends current game state | ✅ | ✅ |
| disconnect | Handles player disconnections | Finds player by socket ID and marks as inactive | ✅ | ✅ |
| join_game | Adds a player to the game | Adds player to gameState.players with socket ID | ✅ | ✅ |
| leave_game | Removes a player from the game | Marks player as inactive and broadcasts event | ✅ | ✅ |
| update_game_state | Updates the game state | Merges received data with current game state | ✅ | ✅ |
| place_tetromino | Places a tetromino on the board | Updates board and broadcasts event | ✅ | ✅ |
| move_chess_piece | Handles chess piece movement | Broadcasts chess piece moved event | ✅ | ✅ |

#### Game State Management
| Function | Purpose | Implementation | Tested | Used on Site |
|----------|---------|----------------|--------|--------------|
| saveGameState | Saves the game state to a file | Writes gameState to game-state.json every minute | ✅ | ✅ |
| loadGameState | Loads the game state from a file | Reads game-state.json on server startup | ✅ | ✅ |
| updateGameState | Updates the game state and notifies clients | Merges updates and broadcasts to all clients | ✅ | ✅ |
| createHomeZone | Creates a home zone for a player | Implemented in client-side gameManager.js | ✅ | ✅ |
| checkGameOver | Checks if the game is over | Implemented in client-side gameManager.js | ✅ | ✅ |

#### GameManager Class Functions
| Function | Purpose | Implementation | Tested | Used on Site |
|----------|---------|----------------|--------|--------------|
| createGame | Creates a new game instance | Generates a unique game ID and initializes game state | ✅ | ✅ |
| addPlayer | Adds a player to a game | Creates player object and home zone | ✅ | ✅ |
| moveChessPiece | Moves a chess piece | Validates move and updates board | ✅ | ✅ |
| placeTetrisPiece | Places a tetris piece | Validates placement and updates board | ✅ | ✅ |
| getGameState | Gets the current game state | Returns the game state for a specific game | ✅ | ✅ |
| _expandBoard | Expands the game board | Increases board size when needed | ✅ | ✅ (indirectly) |
| _createHomeZoneForPlayer | Creates a home zone | Sets up home zone with chess pieces | ✅ | ✅ (indirectly) |
| _handleKingCapture | Handles king capture | Transfers pieces to capturing player | ✅ | ✅ (indirectly) |
| _checkAndClearRows | Checks for completed rows | Clears completed rows and awards points | ✅ | ✅ (indirectly) |

#### Client-Side Network Functions
| Function | Purpose | Implementation | Tested | Used on Site |
|----------|---------|----------------|--------|--------------|
| initSocket | Initializes the socket connection | Creates socket connection with error handling | ✅ | ✅ |
| isConnected | Checks if the client is connected | Checks socket.connected with fallbacks | ✅ | ✅ |
| emit | Sends an event to the server | Wraps socket.emit with error handling | ✅ | ✅ |
| on | Registers an event listener | Wraps socket.on with error handling | ✅ | ✅ |
| off | Removes an event listener | Wraps socket.off with error handling | ✅ | ✅ |
| joinGame | Joins a game | Emits join_game event with player data | ✅ | ✅ |
| createGame | Creates a new game | Emits create_game event with game settings | ✅ | ✅ |
| moveChessPiece | Moves a chess piece | Emits move_chess_piece event with position data | ✅ | ✅ |
| placeTetromino | Places a tetromino | Emits place_tetromino event with tetromino data | ✅ | ✅ |
| pauseGame | Pauses the game | Emits pause_game event | ✅ | ✅ |
| resumeGame | Resumes the game | Emits resume_game event | ✅ | ✅ |
| throttledEmit | Throttled version of emit | Prevents flooding the server with requests | ✅ | ✅ |

### Offline Mode

The game includes a robust offline mode that:
1. Automatically detects when the server is unavailable
2. Creates a mock socket for local game state management
3. Simulates network events for consistent gameplay
4. Persists game state in localStorage
5. Provides a seamless experience without server connectivity

### Debug Panel

The debug panel (toggled with F9) provides real-time information about:
1. Connection status (socket connected, socket ID)
2. Game status (initialized, running, render mode)
3. Player information (ID, score, level)
4. Board information (dimensions, pieces)
5. Home zone details
6. Performance metrics (FPS, update times)

## Game Joining Process

The game joining process works as follows:

1. When the application starts, it initializes the game manager which creates a default game with ID 'default-game'
2. The client-side code in `main.js` attempts to join this default game after initialization
3. The `startGame` function in `gameManager.js` handles joining the default game if no specific game ID is provided
4. The `joinGame` function in `network.js` sends a request to join the game, with special handling for the 'default-game' ID
5. The server's socket.io event handler for 'join_game' processes this request, mapping 'default-game' to the GameManager's DEFAULT_GAME_ID

This ensures that players are automatically connected to the default game when they first load the application.

## Database Implementation

The application uses two databases:
- MongoDB for persistent storage of game data, user accounts, and transactions
- Redis for real-time game state management and pub/sub functionality

The Redis client is initialized in `server/database/index.js` and provides both connection management and a memory fallback for development environments. The database connections are properly closed during application shutdown and test teardown to prevent resource leaks.

## Future Development

1. **Advanced AI Opponents**
   - Computer-controlled players with varying difficulty levels
   - AI that adapts to player skill level

2. **Enhanced Mobile Experience**
   - Further optimisations for touch controls
   - Mobile-specific UI improvements

3. **Customisation Options**
   - Visual themes
   - Custom game rules
   - Board layouts

4. **Accessibility Features**
   - Screen reader support
   - Colour blind modes
   - Keyboard-only navigation

5. **Cross-Server Synchronisation**
   - Allow players from different servers to play together
   - Global leaderboards and tournaments

## Launch Checklist

- [x] Implement unified input controller
- [x] Create 3D/2D mode switching
- [x] Fix duplicate functions
- [x] Enhance mobile compatibility
- [x] Update server for proper routing
- [x] Update documentation
- [x] Add comprehensive error handling
- [x] Create debug panel
- [x] Integrate server-side GameManager with client
- [x] Fix loading screen issues
- [x] Fix module system to use ES modules consistently
- [x] Fix test suite to work with ES modules

## Recent Improvements

### ES Module Conversion

The entire codebase has been converted to use ES modules consistently:

1. **Server-side code**: All CommonJS modules (`require`/`module.exports`) have been converted to ES modules (`import`/`export`)
2. **Database services**: Redis and MongoDB connections now use ES module syntax
3. **Test files**: All test files have been updated to use ES modules and Jest's modern testing patterns

### Test Suite Enhancements

The test suite has been significantly improved:

1. **Framework compatibility**: Tests now work properly with Jest and ES modules
2. **Mocking improvements**: Updated to use Jest's mocking capabilities instead of Sinon
3. **Assertion syntax**: Converted from Chai's assertion style to Jest's expect syntax
4. **Timeout handling**: Added appropriate timeouts for long-running tests
5. **Database cleanup**: Proper teardown of database connections after tests complete

All 24 test suites (267 tests) now pass successfully, providing comprehensive coverage of the codebase.

### Redis Connection Handling

Redis connection handling has been improved:

1. **ES module compatibility**: Redis client initialization now uses ES module syntax
2. **Proper cleanup**: Redis connections are now properly closed after tests complete
3. **Error handling**: Better error handling for Redis connection issues
4. **Memory fallback**: In-memory fallback for Redis when not available in development environments

These improvements ensure that the application can gracefully handle database connection issues and properly clean up resources when shutting down.

## Game Terminology

To clarify the terminology used throughout the codebase:

1. **Game World**: The shared environment where all players interact. Currently, there is one default game world with ID 'default-game' that all players join automatically. This is the persistent space that contains the board, all players, and their chess pieces.

2. **Player Game**: Each player's individual game experience within the shared world. This includes their tetrominos, score, and chess pieces. Players can join and leave the game world, but the world persists even when no players are present.

3. **Game Session**: A period of gameplay for a specific player, from joining to leaving the game world. Multiple game sessions can exist simultaneously within the same game world.

This distinction is important for understanding how the multiplayer functionality works. The server maintains a single game world state that all clients synchronize with, while each client manages their own player-specific game state.