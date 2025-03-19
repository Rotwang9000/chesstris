# Shaktris Architecture

## Overview

Shaktris follows a modular architecture with clear separation of concerns. The game is built using modern web technologies and follows a component-based design pattern.

## Core Components

### Client-Side Architecture

The client-side code is organized into several modules:

#### Core Game Logic

- **Game State Manager** (`gameStateManager.js`): 
  - Manages the game state and coordinates game logic
  - Handles state transitions (menu, playing, paused, etc.)
  - Provides callbacks for state changes
  - Coordinates with network for multiplayer functionality

- **Tetromino Manager** (`tetrominoManager.js`):
  - Handles tetromino creation, movement, and placement
  - Manages the tetromino queue and held piece
  - Implements tetromino physics and collision detection
  - Provides methods for rotating, moving, and dropping pieces

- **Chess Piece Manager** (`chessManager.js`):
  - Manages chess piece movement and captures
  - Implements chess rules and valid move detection
  - Handles special moves like castling and pawn promotion
  - Tracks piece positions and state

#### Frontend Utilities

- **Network Utility** (`network.js`):
  - Manages Socket.IO communication with the server
  - Handles connection, reconnection, and disconnection events
  - Provides methods for sending and receiving game data
  - Implements callbacks for various game events

- **Session Manager** (`sessionManager.js`):
  - Handles player session data, including player ID and username
  - Manages user settings and preferences
  - Tracks game statistics and history
  - Persists data in local storage

- **Input Controller** (`inputController.js`):
  - Handles keyboard and mouse input
  - Provides customizable key bindings
  - Manages input modes for different game states
  - Implements event-based input handling

- **Sound Manager** (`soundManager.js`):
  - Manages audio playback and settings
  - Supports both Web Audio API and HTML5 Audio
  - Provides volume controls for master, music, and SFX
  - Implements fallback sound generation

- **UI Manager** (`uiManager.js`):
  - Manages UI components and interactions
  - Creates and displays dialogs, notifications, and menus
  - Handles theme switching (light/dark mode)
  - Provides callbacks for UI events

- **Game Renderer** (`gameRenderer.js`):
  - Provides rendering for both 2D and 3D modes
  - Manages canvas and animation loop
  - Handles window resizing and rendering settings
  - Implements cleanup for resource management

- **Game Integration** (`gameIntegration.js`):
  - Coordinates all game components
  - Manages game initialization and cleanup
  - Handles game loop and timing
  - Integrates all managers into a cohesive game experience

#### Rendering

The game supports both 2D and 3D rendering modes:

- **3D Rendering**: Uses Three.js for 3D graphics
  - Implements camera controls and lighting
  - Renders the game board, pieces, and effects in 3D
  - Provides visual feedback for game actions

- **2D Rendering**: Uses Canvas API for 2D graphics
  - Implements a simpler, more performant rendering option
  - Maintains visual consistency with the 3D mode
  - Suitable for lower-end devices

### Server-Side Architecture

The server-side code is organized into several modules:

- **Main Server** (`server.js`): 
  - Express.js server with Socket.IO integration
  - Handles HTTP requests and WebSocket connections
  - Serves static files and manages game sessions

- **Game Management**:
  - Manages game sessions and player connections
  - Handles game state synchronization
  - Validates game actions and enforces rules
  - Broadcasts game events to connected players

## Data Flow

1. **Input Handling**:
   - User input is captured by the Input Controller
   - Input is translated into game actions
   - Actions are passed to the appropriate manager

2. **Game Logic**:
   - Game State Manager coordinates game logic
   - Tetromino Manager and Chess Piece Manager handle specific game mechanics
   - Game state is updated based on actions and rules

3. **Rendering**:
   - Game Renderer receives updated game state
   - Renders the game state to the screen
   - Provides visual feedback for game actions

4. **Networking**:
   - Network Utility sends game actions to the server
   - Server validates actions and updates game state
   - Server broadcasts updates to all connected players
   - Network Utility receives updates and updates local game state

## Communication Patterns

### Client-Server Communication

- **Socket.IO Events**: Real-time game state updates and player actions
  - `join_game`: Player joins a game session
  - `tetromino_placed`: Player places a tetromino
  - `chess_move`: Player moves a chess piece
  - `game_update`: Server sends updated game state

### Inter-Module Communication

- **Event-Based**: Modules communicate through events and callbacks
  - State changes trigger callbacks in other modules
  - Game actions trigger events that other modules can listen for

- **Direct Method Calls**: Some modules expose methods that other modules can call directly
  - UI Manager exposes methods for showing dialogs and notifications
  - Sound Manager exposes methods for playing sounds

## Initialization Sequence

1. **DOM Ready**: The main entry point (`main.js`) is executed when the DOM is ready
2. **Module Initialization**: Each module is initialized in sequence
   - Session Manager
   - Sound Manager
   - UI Manager
   - Input Controller
   - Game Renderer
   - Game State Manager
   - Game Integration
3. **Network Connection**: The game connects to the server if auto-connect is enabled
4. **Game Start**: The game transitions to the menu state and is ready for player interaction

## Cleanup Sequence

1. **Before Unload**: The cleanup function is called before the page is unloaded
2. **Module Cleanup**: Each module's cleanup method is called
   - Game Integration
   - Game Renderer
   - Sound Manager
   - Network Utility
3. **Resource Release**: All resources are released to prevent memory leaks

## Error Handling

- **Graceful Degradation**: The game can function with reduced features if certain components fail
- **Error Notifications**: UI Manager displays error notifications to the user
- **Fallback Mechanisms**: Alternative implementations are used when primary ones fail
- **Reconnection Logic**: Network Utility attempts to reconnect if the connection is lost 