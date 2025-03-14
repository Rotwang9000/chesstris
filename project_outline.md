# Chesstris Project Outline

## Overview

Chesstris is a unique game that combines elements of chess and Tetris on a dynamically expanding board. Players manage falling tetrominos while strategically moving chess pieces to capture opponents' pieces.

## Core Architecture

### Client-Side Components

#### Game Manager (`gameManager.js`)
- **Purpose**: Central coordinator for the game
- **Responsibilities**:
  - Initializing game components
  - Managing game state
  - Coordinating rendering and updates
  - Handling game loop
  - Processing input events

#### Tetromino Manager (`tetrominoManager.js`)
- **Purpose**: Handles all tetromino-related functionality
- **Responsibilities**:
  - Creating and spawning tetrominos
  - Moving and rotating tetrominos
  - Checking for collisions
  - Locking tetrominos to the board
  - Managing the bag of upcoming pieces
  - Providing ghost pieces for placement preview

#### Chess Piece Manager (`chessPieceManager.js`)
- **Purpose**: Manages all chess piece functionality
- **Responsibilities**:
  - Creating and placing chess pieces
  - Moving chess pieces according to chess rules
  - Validating chess moves
  - Handling captures
  - Managing home zones
  - Providing board state information

#### Renderer System
- **Purpose**: Handles visual representation of the game
- **Components**:
  - `renderer.js`: Main facade for rendering
  - `renderer2d.js`: 2D canvas-based rendering
  - `renderer3d.js`: 3D Three.js-based rendering
  - Modules for specific rendering tasks (board, pieces, effects)

### Server-Side Components

#### Game Server (`server.js`)
- **Purpose**: Manages multiplayer functionality
- **Responsibilities**:
  - Handling player connections
  - Synchronizing game state
  - Processing player actions
  - Managing game rooms

#### Game Manager (`server/game/GameManager.js`)
- **Purpose**: Server-side game logic
- **Responsibilities**:
  - Managing game state
  - Processing player actions
  - Validating moves
  - Handling game events

## Data Flow

1. **Input Handling**:
   - User input is captured by `inputController.js`
   - Input is translated into game actions
   - Actions are passed to the appropriate manager

2. **Game State Updates**:
   - Managers update their internal state
   - Changes are reflected in the central game state
   - Network events are triggered for multiplayer

3. **Rendering**:
   - Game state is passed to the renderer
   - Renderer updates the visual representation
   - UI elements are updated

4. **Network Synchronization**:
   - State changes are sent to the server
   - Server validates and broadcasts changes
   - Clients receive and apply updates

## Key Interfaces

### Game State
The game state object is the central data structure that contains:
- Board state (cells, pieces)
- Tetromino information (current, next, held)
- Chess piece positions and states
- Player information (score, level)
- Game status (paused, game over)

### Rendering Interface
The rendering system provides a consistent API for both 2D and 3D modes:
- `init(mode)`: Initialize the renderer
- `render(gameState)`: Render the current game state
- `resize()`: Handle window resizing
- `cleanup()`: Clean up resources

## Recent Improvements

### Board Rendering
- Enhanced board rendering with proper cell creation
- Improved handling of board data from `ChessPieceManager`
- Added fallback rendering for when board data is unavailable
- Fixed infinite loop in board creation that was causing the game to hang

### Game State Management
- Improved getter functions for accessing game components
- Enhanced error handling and logging
- Added fallback mechanisms for component failures
- Fixed circular dependencies between modules

### Rendering System
- Fixed mode switching between 2D and 3D
- Improved rendering of game elements
- Enhanced error handling in rendering pipeline
- Ensured proper initialization of both 2D and 3D rendering modes

### Cleanup
- Removed old files that were causing conflicts
- Fixed circular dependencies between modules
- Improved error handling to prevent cascading failures
- Added proper logging to aid in debugging

## Future Enhancements

### Gameplay
- Advanced chess piece abilities
- Special tetromino effects
- Power-ups and special moves

### Technical
- WebGL performance optimizations
- Mobile touch controls improvements
- Offline mode enhancements

### Multiplayer
- Spectator mode
- Tournament system
- Replay functionality



Below is an outline of the Shaktris codebase that lists the major directories and files, the primary functions or classes defined in them, and a note on whether they're actively used in the application and if tests exist for them. (For brevity, many auxiliary files—like styles, images, and documentation—are noted without functions.)

---

**1. .cursor/**  
 • **rules/**  
  – **ps.mdc**  
   • *Purpose:* General rule configuration (no functions/classes)  
   • *Usage:* Used for code‐/cursor-related tooling (not part of runtime)  
   • *Tests:* N/A  
  – **shaktris.mdc**  
   • *Purpose:* Project‐specific rule definitions  
   • *Usage:* Informational/configuration only  
   • *Tests:* N/A  
  – **testfiles.mdc**  
   • *Purpose:* Rules for test file handling  
   • *Usage:* Affects test file treatment  
   • *Tests:* N/A

---

**2. Root Files**  
 • **.gitignore**  
  – *Usage:* Specifies files to ignore by Git  
  – *Tests:* N/A  
 • **.mocharc.json**  
  – *Usage:* Mocha testing configuration (used during test runs)  
  – *Tests:* Config file for tests  
 • **jest.setup.js**  
  – *Usage:* Jest setup for running tests  
  – *Tests:* Used by Jest  
 • **nodemon.json**  
  – *Usage:* Development tool configuration (auto-reloading)  
  – *Tests:* N/A  
 • **package.json**  
  – *Usage:* Dependency and script definitions for the whole project  
  – *Tests:* N/A  
 • **project_outline.md**  
  – *Usage:* Documentation outlining project structure  
  – *Tests:* N/A  
 • **README.md**  
  – *Usage:* High-level project documentation  
  – *Tests:* N/A

---

**3. client/**  
 **3.1 src/**  
  • **App.jsx**  
   – *Content:* Defines the main React functional component `App()`  
   – *Usage:* Entry point for the client UI  
   – *Tests:* Likely indirectly tested via integration/UI tests  
  • **components/**  
   – **EnergyMeter.css**  
    • *Usage:* Styles for the EnergyMeter component  
   – **EnergyMeter.jsx**  
    • *Content:* React component `EnergyMeter` with helper functions such as  
     – `getEnergyColor()`  
     – `formatTimeUntilNextPoint()`  
    • *Usage:* Displays the player's energy; part of the UI  
    • *Tests:* No dedicated tests found; may be indirectly covered  
   – **PauseControl.css**  
    • *Usage:* Styles for the PauseControl component  
   – **PauseControl.jsx**  
    • *Content:* React component `PauseControl`  
     – Functions: `formatTimeRemaining()`, `handlePauseClick()`, `checkPauseCooldown()`  
    • *Usage:* Manages game pause/resume functionality  
    • *Tests:* Likely indirectly tested (see gameplay tests)  
   – **UpdateNotification.css**  
    • *Usage:* Styles for update notifications  
   – **UpdateNotification.jsx**  
    • *Content:* React component `UpdateNotification` that displays update messages  
    • *Usage:* Shows in-app update info; integrated with updateService  
    • *Tests:* No dedicated tests noted, but functionality is exercised in overall UI tests  
  • **services/**  
   – **socketService.js**  
    • *Content:* Creates and exports the Socket.IO connection along with helper functions:  
     – `connect()`, `disconnect()`, `emit()`, `on()`  
    • *Usage:* Central to real-time communication in the client  
    • *Tests:* Likely indirectly tested via integration tests; no dedicated unit tests noted  
   – **updateService.js**  
    • *Content:* Defines the `UpdateService` class with methods such as:  
     – `setupSocketListeners()`, `startCountdown()`, `clearCountdown()`, `formatTimeRemaining()`, and handlers for update/restart events  
    • *Usage:* Provides update notifications to `UpdateNotification`  
    • *Tests:* Not explicitly unit-tested; functionality is exercised via update notifications

---

**4. docs/**  
 • Contains various markdown documents (e.g. `backup-guide.md`, `deployment-guide.md`, etc.)  
  – *Usage:* Project documentation and developer guides  
  – *Tests:* N/A

---

**5. middleware/**  
 • **csrfProtection.js**  
  – *Content:* Express middleware function for CSRF protection  
  – *Usage:* Applied on server routes for security  
  – *Tests:* Not directly unit-tested; behavior verified via integration tests  
 • **rateLimit.js**  
  – *Content:* Middleware for rate limiting  
  – *Usage:* Protects server endpoints from abuse  
  – *Tests:* Likely indirectly tested

---

**6. public/**  
 • **2D/index.html**  
  – *Usage:* HTML entry for 2D mode rendering  
 • **assets/textures/**  
  – *Usage:* Image files (board, cell, home_zone) for rendering textures  
 • **auto-test.html, basic_chess_test.html, chess_test.html, debug-client.html, debug.html**  
  – *Usage:* HTML pages for manual testing and debugging  
 • **img/**  
  – *Usage:* Icons and manifest files (used in UI and mobile settings)  
 • **index.html**  
  – *Usage:* Main HTML file for 3D client mode  
 • **js/** (a large directory with multiple subfolders)  
  – **config/constants.js**  
   • *Content:* Exports constants used throughout the game  
   • *Usage:* Imported by core modules  
  – **core/**  
   • **chessPieceManager.js**  
    – *Content:* Functions/classes managing chess piece logic  
    – *Usage:* Critical to chess piece movement/captures  
    – *Tests:* Covered by tests in `tests/core/` (e.g. playerManager.test.js may reference it)  
   • **constants.js**  
    – *Usage:* Shared constants for game logic  
   • **gameManager.js**  
    – *Content:* Core functions managing game flow and state updates  
    – *Usage:* Central to game logic; referenced by GameIntegration and server GameManager  
    – *Tests:* Tested in server tests (`tests/server/game/GameManager.test.js`)  
   • **gameState.js**  
    – *Content:* Manages client-side game state  
    – *Usage:* Widely used in game logic  
    – *Tests:* Has dedicated tests in the tests directory  
   • **inputController.js**  
    – *Content:* Handles user input  
    – *Usage:* Used in game to translate controls into actions  
   • **playerManager.js**  
    – *Content:* Functions for managing player state and interactions  
    – *Usage:* Core to multiplayer functionality  
    – *Tests:* Covered by tests (see `tests/core/playerManager.test.js`)  
   • **tetrominoManager.js**  
    – *Content:* Manages creation and movement of tetromino pieces  
    – *Usage:* Critical to Tetris-style gameplay  
    – *Tests:* Tested in `tests/core/tetrominoManager.test.js`  
  – **examples/example.js**  
   • *Usage:* Demonstrative/example code  
  – **game/**  
   • **GameIntegration.js**  
    – *Content:* Integrates game logic with rendering  
    – *Usage:* Called during game initialization  
   • **gameState.js**  
    – *Usage:* Alternative or supplemental game state logic  
  – **lib/**  
   • Contains third‑party libraries (e.g. OrbitControls.js, three.module.js)  
  – **main.js**  
   • *Usage:* Main client entry point; bootstraps rendering and game logic  
  – **old-for-reference/renderer.js**  
   • *Usage:* Deprecated renderer; not in active use  
  – **physics/**  
   • **TetrominoRenderer.js**  
    – *Content:* Renders falling tetromino pieces in the physics simulation  
    – *Usage:* Used in physics tests and gameplay  
   • **tetromino.js**  
    – *Content:* Defines tetromino-related classes/functions  
    – *Usage:* Core to tetromino management; tested in tetrominoManager tests  
  – **physics_test.js**  
   • *Usage:* Test file for physics-related code  
  – **rendering/**  
   • **compatibility.js**  
    – *Usage:* Ensures API consistency across rendering modes  
   • **index.js, renderer.js, renderer3d.js**  
    – *Usage:* Main modules for rendering the game in 3D; renderer3d.js is used for 3D mode  
   • **modules/** (submodules for rendering)  
    – **board.js** – Renders the game board (used by the renderer; indirectly tested)  
    – **core.js** – Core rendering functions  
    – **effects.js** – Visual effects functions  
    – **pieces.js** – Functions to render chess pieces  
    – **tetromino.js** – Functions to render tetromino pieces (matches tetrominoManager logic)  
    – **utils.js** – Miscellaneous rendering utilities  
   • **test.js**  
    – *Usage:* Test file for rendering modules  
  – **services/sessionManager.js**  
   • *Usage:* Manages client-side session data  
  – **session/sessionManager.js**  
   • *Usage:* Another session management module (possibly a duplicate or alternative)  
  – **test-utils.js**  
   • *Usage:* Utility functions used in client-side tests  
  – **ui/**  
   • **debugPanel.js** – UI component for debugging (used in the debug panel; indirectly tested)  
   • **marketplaceUI.js** – UI elements for marketplace features  
   • **uiManager.js** – Manages overall UI state and components  
   • **walletManager.js** – Handles wallet-related functionality (used in marketplace integration)  
  – **utils/**  
   • Various helper modules:  
    – **OrbitControls.bridge.js, OrbitControls.js, browser-texture-generator.js, controls/OrbitControls.js** – Assist with Three.js controls  
    – **helpers.js** – General utilities; used throughout the code  
    – **network-patch.js, network.js, socket.js** – Network utilities; complement socketService.js  
    – **soundManager.js** – Manages sound playback  
    – **sponsors.js** – Handles sponsor-related information  
    – **texture-generator.js** – Generates textures on the fly  
    – **themes.js** – Defines theme settings for the UI  
    – **three.js, three.js.bridge, three.module.js, uuid.js** – Library files and helpers  
 • **public/main.js**  
  – *Usage:* Alternate client entry point (if used by a different HTML file)  
 • Various HTML files (e.g. physics_basic.html, renderer_test.html, etc.)  
  – *Usage:* Test/demo pages for different modules (manual testing)  
 • **public/styles.css**  
  – *Usage:* Global CSS styles  
 • **public/utils/**  
  – **__tests__/** (contains test files such as board.test.js, game.test.js, marketplace.test.js, etc.)  
   • *Usage:* Unit tests for utility modules  
  – **marketplace.js, payments.js, sponsors.js, themes.js, username.js**  
   • *Usage:* Helper modules for marketplace, payments, sponsor info, themes, and username management  
   • *Tests:* Their tests are located in the __tests__ folder

---

**7. scripts/**  
 • **convert-tests-to-esm.js**  
  – *Usage:* Script to convert test files to ES module format (development tool)  
  – *Tests:* N/A  
 • **migration.js**  
  – *Usage:* Script for database or code migration tasks  
  – *Tests:* N/A

---

**8. Server Files (Root and server/)**  
 • **server.js (root)**  
  – *Content:* Main server entry point that sets up Express, Socket.IO, and the game loop  
   – Functions include:  
    – `spawnFallingPiece()`  
    – `lockFallingPiece()`  
    – `clearFullRows()`  
    – `gameLoop()`  
  – *Usage:* Central to running the game server  
  – *Tests:* Core functionality is exercised via tests in the tests folder  
 • **server/**  
  – **database/**  
   • **index.js** – Sets up database connections; used by server services  
   • **models/**  
    – **Advertiser.js, Analytics.js, Game.js, Transaction.js, User.js**  
     • *Usage:* Database models used in services and API routes  
     • *Tests:* Likely covered by tests in `tests/services/`  
  – **game/GameManager.js**  
   • *Content:* Class `GameManager` that manages game state, players, board updates, etc.  
   • *Usage:* Core game logic on the server  
   • *Tests:* Tested in `tests/server/game/GameManager.test.js`  
  – **middleware/**  
   • **adminAuth.js, auth.js**  
    – *Usage:* Middleware functions applied to secure routes  
    – *Tests:* Indirectly tested via integration  
  – **routes/**  
   • **advertiser.js, api.js, auth.js, game.js, payments.js, stats.js, transaction.js**  
    – *Usage:* Define REST API endpoints for various functionalities  
    – *Tests:* Some endpoints are covered by tests in the tests folder  
  – **services/**  
   • **payments.js**  
    – *Content:* Handles payment processing logic on the server  
    – *Usage:* Called by payment-related routes  
    – *Tests:* Has tests in `server/services/__tests__/payments.test.js`

---

**9. services/** (at root)  
 • **AnalyticsService.js**  
  – *Content:* Provides analytics functionality for the game  
  – *Usage:* Integrated into server operations  
  – *Tests:* Covered by `tests/services/AnalyticsService.test.js`  
 • **index.js**  
  – *Usage:* Aggregates and exports services for the application  
  – *Tests:* Indirectly used

---

**10. src/**  
 • **README.md**  
  – *Usage:* Documentation for the src module  
 • **package.json**  
  – *Usage:* Package configuration for src (if managed separately)  
 • **playerControls.mjs**  
  – *Content:* Module for handling player input/control logic  
  – *Usage:* Used by the game to process player actions  
  – *Tests:* No dedicated tests noted  
 • **server.js**  
  – *Usage:* Alternate server entry point (possibly for a different environment)  
  – *Tests:* Functionality overlaps with the main server.js

---

**11. tests/**  
 • **README.md**  
  – *Usage:* Provides guidance on running tests  
 • **basic.test.js**  
  – *Usage:* Basic sanity tests for the project  
 • **core/**  
  – **example.test.js** – Tests for example core functionality  
  – **gameState.test.js** – Tests for game state management (covers client and server logic)  
  – **playerManager.test.js** – Tests for player management functionality  
  – **tetrominoManager.test.js** – Tests for tetromino creation/movement  
 • **example.test.js & examples/example.test.js**  
  – *Usage:* Example tests demonstrating module usage  
 • **gameplay/**  
  – **connectivity.test.js** – Tests network connectivity and Socket.IO interactions  
  – **orphanedPieces.test.js** – Ensures tetromino pieces that don't stick are handled correctly  
  – **pawnPromotion.test.js** – Tests chess pawn promotion logic  
  – **piecePurchase.test.js** – Tests in-game purchasing of pieces  
  – **playerPause.test.js** – Tests pause/resume functionality  
  – **turnSystem.test.js** – Tests turn-based mechanics  
 • **helpers.js, mockFetch.js, mockSocket.js**  
  – *Usage:* Provide mocks and helpers for testing  
 • **security/**  
  – **antiCheat.test.js, authentication.test.js, inputValidation.test.js**  
   – *Usage:* Tests for various security features  
 • **server/game/GameManager.test.js**  
  – *Usage:* Tests for the server-side `GameManager` class  
 • **services/**  
  – **AnalyticsService.test.js, GameStateService.test.js, TransactionService.test.js, UserService.test.js**  
   – *Usage:* Unit tests for respective server services  
 • **setup-jest.js, setup.js, testHelpers.js, testUtils.js**  
  – *Usage:* Configuration and helper files for running tests  
 • **utils/sponsors.test.js**  
  – *Usage:* Tests for the sponsors utility module

