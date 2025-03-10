# Shaktris Dynamic Prototype

Shaktris is a multiplayer prototype that fuses elements of chess and Tetris on a dynamically expanding 2D board rendered in 3D. In this game, each player is assigned a unique "home zone" (an 8×2 area randomly placed, although within 8 to 12 squares of another home zone) where their chess pieces reside. Tetromino pieces fall from the sky (along the Z‑axis) and stick to the board only if at least one block lands adjacent to an existing cell. The chess pieces can then use this as part of the board. So they need to build up the board towards their opponent to be able to move pieces into a place where they can attack.
Full rows (any 8 in a line) are cleared, including any pieces on them, except for cells in a "safe" home zone that still has at least one piece. To encourage movement and clear abandoned zones, empty home zones degrade over time.

## Core Gameplay Mechanics

- **Tetris Piece Connectivity Rules:**  
  Tetris pieces will only stick to the board if:
  1. They are connected to other existing pieces
  2. There is a continuous path back to the player's king
  This forces players to build strategically from their king's position, preventing disconnected "islands" of pieces.
  When a row is cleared, orphaned pieces will drop back, towards the player's king.

- **Pawn Promotion:**  
  Pawns are automatically promoted to knights once they have moved 8 spaces forward, increasing their utility in the late game.

- **Asynchronous Turns:**  
  Each player has their own gameplay cycle:
  1. A tetris piece falls for the player to place
  2. After placing the piece, they can move one of their chess pieces
  3. Players don't need to wait for other players' turns
  4. A minimum 10-second turn length helps human players compete with others, especially computer-controlled opponents
  5. Different difficulty worlds adjust this timing to accommodate various skill levels

- **Piece Acquisition:**  
  Players can purchase additional pieces at any time using Solana:
  - 0.1 SOL for a pawn
  - 0.5 SOL for rooks, knights, or bishops
  - 1.0 SOL for a queen
  - Kings cannot be purchased

- **King Capture Mechanics:**  
  When a player captures an opponent's king:
  1. The victor gains ownership of all the opponent's remaining pieces
  2. 50% of the fees paid by the defeated player for extra pieces is awarded to the victor
  3. This represents a "ransom" to allow the king to escape (and the defeated player to start a new game)

- **Player Pause System:**  
  Players can temporarily pause the game:
  1. A player can freeze their pieces for up to 15 minutes
  2. During the pause, their pieces cannot be captured and their cells won't be cleared
  3. Their home zone is protected regardless of whether it contains pieces
  4. Players can resume their game at any time during the pause period
  5. If a player doesn't return within 15 minutes:
     - Their main island (connected to king) is removed from the board
     - Cells owned by other players on this island are reassigned based on proximity to kings
     - Equidistant cells become neutral "no-man's land" (grey cells)
     - Pieces not on the main island are returned to the home zone
     - The home zone is expanded if needed to accommodate all returning pieces
     - Any pieces that can't fit in the expanded home zone are lost
  6. The pause system allows for natural breaks while preventing disruption to other players

## Features

- **Multiplayer Support:**  
  Uses Socket.IO to allow many players to connect simultaneously.

- **Dynamic Board Expansion:**  
  The board grows on the X/Y axis as new players join, with home zones allocated sequentially.

- **Home Zones & Degradation:**  
  Each player's 8×2 home zone is safe from clearance as long as at least one square is occupied. Home zones degrade by one square (empty spaces first, then takes pieces away too) every few minutes, eventually disappearing.

- **Falling Tetrominoes:**  
  Tetromino pieces fall from above (Z‑axis) and stick to the board only if they land adjacent to an existing cell. Otherwise, they fall through and are discarded.

- **3D Rendering with Three.js:**  
  The board and falling pieces are rendered in 3D using Three.js (with OrbitControls for panning/zooming), but the gameplay itself occurs on the 2D X/Y plane.

## Project Structure

```
chess-tris-dynamic/
├── package.json         # Node.js project config and dependencies
├── server.js            # Node.js server (Express & Socket.IO)
└── public/
    ├── index.html       # Client HTML file (loads Three.js, OrbitControls, Socket.IO)
    └── main.js          # Client-side JavaScript (renders the board and falling pieces)
```

## Technical Details

### Core Board Logic

- **Board State:**  
  The board is represented as a 2D array of cells. Each cell contains information about:
  - Color (representing the player who owns it)
  - Player ID
  - Chess piece (if any)
  - Creation timestamp

- **Path Finding:**  
  A breadth-first search algorithm verifies connectivity between pieces and kings.
  This is used for:
  - Validating tetris piece placement
  - Handling orphaned pieces after row clearing
  - Managing island identification after pause expiration

- **Island Identification:**  
  Connected components are identified using a modified breadth-first search.
  This allows detecting separate "islands" of connected cells for each player.

### Gameplay Systems

- **Turn Management:**  
  - Each player has independent turn cycles
  - Cooldown periods between turns (configurable by difficulty)
  - Easy: 20 seconds, Normal: 10 seconds, Hard: 5 seconds
  - Turn state tracks both tetris piece placement and chess movement

- **Row Clearing:**  
  - Rows are cleared when all cells are filled
  - Protected cells (in safe home zones or from paused players) are preserved
  - Clearing triggers orphaned piece detection and relocation
  - Cells above cleared rows shift down

- **Piece Movement:**  
  - Chess piece movement follows standard chess rules
  - Pawns track their movement distance for promotion
  - Cannot capture pieces of paused players
  - Movement validates king-connectivity paths

- **Pause System Implementation:**  
  - Pause state stored in a Map with expiry times
  - Game loop checks for expired pauses
  - Pause expiry triggers complex island restructuring
  - Client notifications for all pause-related events

- **Economy System:**  
  - Solana transaction validation (simulated)
  - Purchase records for fee distribution
  - Fee calculation when kings are captured
  - Ownership transfer mechanisms

### Server-Client Communication

- **Socket.IO Events:**  
  - `boardUpdate`: Sends the current board state, falling piece, and paused players
  - `playerPaused`/`playerResumed`: Notifies of player pause status changes
  - `playerPauseExpired`: Indicates a player's pause has expired and their island removed
  - `pieceRelocated`: Notifies when a piece is moved after island removal
  - `pieceLost`: Notifies when a piece is lost due to lack of space
  - `piecePurchased`: Indicates a successful piece purchase
  - `feesAwarded`: Notifies of fee awards after king capture
  - `moveSuccess`/`moveFailure`: Indicates success/failure of chess moves
  - `placementSuccess`/`placementFailure`: Indicates success/failure of tetris placement

- **Client-to-Server Commands:**  
  - `movePiece`: Request to move a chess piece
  - `placePiece`: Request to place a tetris piece
  - `pauseGame`/`resumeGame`: Control pause state
  - `purchasePiece`: Buy new pieces with Solana
  - `setDifficulty`: Admin command to adjust game difficulty

## How It Works

### Server (server.js)
- **Board State:**  
  The board is represented as a 2D array of cells. Each cell contains either an empty object or if there is a useable cell there an object containing things like the colour, if any chess pieces are on it and the time it was created.

- **Home Zones:**  
  When a player connects, they are assigned a home zone (an 8×2 area along the bottom). Home zones are pre‑filled with chess pieces in a colour generated from the player's ID. They are protected from row clearance as long as at least one square remains filled or the player is paused.

- **Falling Tetrominoes:**  
  A tetromino (selected randomly from a predefined set) falls from a specified starting Z‑height. As it descends, the server checks if any block of the tetromino lands adjacent to an existing cell and has a path to the player's king. If so, it "sticks" and is locked into the board; otherwise, if it falls too far, it's discarded.

- **Row Clearance:**  
  A row is cleared if every cell is filled (unless the cell is in a safe home zone). When cleared, only non‑safe cells are removed, and rows above are shifted downward - each player maintains their starting direction which will be different to other players.

- **Home Zone Degradation:**  
  A timer periodically checks for home zones that shrink every few minutes, helping to clean up abandoned areas and encourage gameplay.

- **Real‑time Updates:**  
  The server broadcasts the updated board state, including the falling piece, home zones, and paused players to all connected clients via Socket.IO.

### Client (public/index.html & public/main.js)
- **Rendering:**  
  The client uses Three.js to render the board and falling tetrominoes in a 3D scene. The view is set up to look at the X/Y plane, with falling pieces rendered using their Z‑axis value.
  Pieces have the users username floating above them.
  Own pieces "Glow".
  Falling tetis pieces can be dragged around or use cursors
  Chess pieces can be clicked, the cells which are possible to move to are highlighted and then the destination is clicked on.

- **User Interface:**  
  An info panel displays a simple title message. Future work might include player controls and additional UI elements.

- **Real‑time Sync:**  
  The client listens for `boardUpdate` events from the server and updates the scene accordingly.

## Future Improvements

- **Player Controls:**  
  Extend the client to allow players to move their chess pieces or interact with the falling tetrominoes.

- **Enhanced UI:**  
  Add a scoreboard, player avatars, and more detailed game instructions.

- **Game Rules & Logic:**  
  Refine the collision detection, sticking logic, and home zone mechanics. Consider adding further game modes or dimensions.

- **Performance & Scalability:**  
  Optimise board rendering and network message handling to support a large number of concurrent players.

- **Sponsorship:**  
  The tetris pieces can be sponsored by an automated purchasing system. An image is shown on the cell and when a player lands or hovers on them an ad is shown.

- **Advertiser Bidding System:**  
  The game features a sophisticated bidding system for advertisers:
  1. Advertisers can upload a square image, provide a link and descriptive text (up to 64 characters)
  2. They place bids in SOL and specify the total number of cells they want to sponsor
  3. When a player's tetromino piece falls, it's sponsored by an advertiser based on bid ranking
  4. The highest bidder sponsors the first piece, second highest the second piece, and so on
  5. The advertiser's image appears on the tetromino cells
  6. When a player hovers over a sponsored cell, the advertiser's description is shown
  7. Clicking on a sponsored cell opens the advertiser's link in a new window
  8. The system tracks impressions and clicks for each advertiser
  9. Once an advertiser's cell quota is reached, they're removed from the rotation

- **Magic Potions:**  
  Users can purchase, or perhaps a sponsor can give away something.. they float on a cell and have to be collected by landing on the cell. Can be in game enhancements or discount tokens etc.

- **Paid Pieces:**  
  Connect your crypto wallet and you can buy extra pieces to play which come with their own cell that can be placed anywhere. if a paid piece takes another paid piece, you win half the total cost the other person paid.

- **AI Players:**  
  API is public so that computer and AI players can also join in.

- **Piece Customisation:**  
  You can design the pattern that your pieces have. 

## Testing Strategy

The codebase includes comprehensive tests for all major gameplay systems:

1. **Connectivity Tests:**
   - Tests for the path-to-king validation
   - Verification of orphaned piece handling
   - Island identification accuracy

2. **Pawn Promotion Tests:**
   - Movement tracking
   - Promotion trigger conditions
   - Direction-specific promotion logic

3. **Turn System Tests:**
   - Cooldown enforcement
   - Difficulty-based timing adjustments
   - Player state tracking

4. **Piece Purchase Tests:**
   - Solana transaction validation
   - Purchase restrictions
   - Fee tracking for king captures

5. **Pause System Tests:**
   - Pause/resume functionality
   - Expiration handling
   - Island removal and piece relocation
   - Home zone protection during pause

To run tests:
```bash
npm test               # Run all tests
npm run test:services  # Run database service tests
npm run test:core      # Run core gameplay tests
```

## Contributing

If you'd like to contribute, please fork the repository and submit a pull request with your proposed changes. Ensure that your code follows the existing style (using tabs, British English spellings, etc.) and includes comments where necessary.

## License

This project is provided as-is under the [MIT License](LICENSE).

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up the environment variables:
   - Copy `.env.example` to `.env`
   - Set appropriate values for each variable

4. Create required texture asset directories:
   ```bash
   mkdir -p public/img/textures
   ```

5. Ensure texture files are in the correct location:
   - Board texture: `public/img/textures/board.png`
   - Cell texture: `public/img/textures/cell.png`
   - Home zone texture: `public/img/textures/home_zone.png`

   If you don't have these files yet, you can use placeholder images during development.

## Running the Application

```bash
npm start
```

For development with hot reloading:

```bash
npm run dev
```

## Testing

The project uses Mocha for testing. We've implemented a custom ES module testing framework to handle mocking and stubbing:

```bash
npm test
```

### Test Database Setup

Tests run using separate MongoDB and Redis databases:

- MongoDB test database: `chesstris_test` 
- Redis test database: Database `1` (production uses `0`)

You can configure these in the `.env` file:

```
TEST_MONGO_URI=mongodb://localhost:27017/chesstris_test
TEST_REDIS_URI=redis://localhost:6379/1
```

### Redis Installation on Windows

Redis requires a Unix-like environment. On Windows, you can run Redis in one of two ways:

#### Option 1: Windows Subsystem for Linux (WSL2)

1. Enable WSL2 in Windows
2. Install Redis in WSL2:
   ```bash
   sudo apt-get update
   sudo apt-get install redis-server
   ```
3. Start Redis in WSL2:
   ```bash
   sudo service redis-server start
   ```

#### Option 2: Docker

1. Install Docker Desktop for Windows
2. Run Redis container:
   ```bash
   docker run --name redis -p 6379:6379 -d redis
   ```

### Testing with ES Modules

Since we use ES modules, we've created a custom testing framework for mocking and stubbing:

```javascript
// Import original modules
import * as OriginalModule from '../path/to/module.js';

// Create a proxy for mocking
const Module = createTestProxy(OriginalModule);

// Mock a function
Module.someFunction = () => 'mocked value';
```

See the `tests/examples/example.test.js` file for more examples.

## Architecture

Chess-Tris combines real-time gameplay with persistent data storage:

- **Redis** is used for real-time game state
- **MongoDB** is used for persistent storage
- **Socket.IO** handles real-time communication
- **Express** powers the web server

## Function Map and Test Coverage

The following is a map of key functions in the codebase and whether they have proper test coverage:

### Server-Side Functions (GameManager)

| Function | Description | Test Coverage |
|----------|-------------|---------------|
| `createGame()` | Creates a new game instance | ✅ Tested |
| `addPlayer()` | Adds a player to a game | ✅ Tested |
| `moveChessPiece()` | Handles chess piece movement | ✅ Tested |
| `placeTetrisPiece()` | Places tetris pieces on the board | ✅ Tested |
| `getGameState()` | Returns the current state of a game | ✅ Tested |
| `_expandBoard()` | Dynamically expands the game board | ✅ Tested |
| `_findFreeHomeZoneSpot()` | Finds a valid position for player home zones | ✅ Tested |
| `_createHomeZoneForPlayer()` | Creates a player's home zone with chess pieces | ✅ Tested |

### Client-Side Functions (Renderer)

| Function | Description | Test Coverage |
|----------|-------------|---------------|
| `init()` | Initializes the rendering engine | ❌ Not tested |
| `updateBoard()` | Updates the visual board based on game state | ❌ Not tested |
| `createFloatingCell()` | Creates the 3D representation of a cell | ❌ Not tested |
| `updateChessPieces()` | Updates chess piece positions | ❌ Not tested |
| `updateFallingTetromino()` | Animates the falling tetromino piece | ❌ Not tested |
| `addPotionToCell()` | Adds a potion effect to a cell | ❌ Not tested |
| `animatePotionsAndParticles()` | Animates potion effects | ❌ Not tested |
| `createPlayerNameLabel()` | Creates floating player name labels | ❌ Not tested |

### Session and Network Management

| Function | Description | Test Coverage |
|----------|-------------|---------------|
| `SessionManager.initSession()` | Initializes or loads player session | ❌ Not tested |
| `SessionManager.getSessionData()` | Returns current session data | ❌ Not tested |
| `Network.initSocket()` | Initializes WebSocket connection | ✅ Mocked for tests |
| `Network.emit()` | Sends data to the server | ✅ Mocked for tests |

### Important Implementation Notes

1. **Board Coordinates**: The game board uses a coordinate system where (0,0) is the top-left corner. X increases to the right, and Y increases downward.

2. **Home Zone Placement**: Home zones are placed with a minimum distance of 8-12 cells between them to ensure fair gameplay. The board expands dynamically as needed when new players join.

3. **Player Limits**: Each game supports up to 2048 players, though practical limits are much lower due to UI constraints.

4. **Tetris-First Gameplay**: Players must place tetris pieces to build the board before they can move chess pieces. This ensures a fair start where players need to expand from their home zone.

5. **Error Handling**: All rendering functions include error handling to prevent NaN values and ensure the game continues running even if individual rendering elements fail.

## Refactoring Recommendations

As the codebase has grown, some files like `renderer.js` have become too large and complex. Here's a proposed refactoring strategy:

### Refactoring the Renderer Module

The `renderer.js` file should be split into smaller modules based on functionality:

1. **renderer-core.js**: Core initialization, scene setup, animation loop
   - `init()`, `animate()`, `updateScene()`, `cleanup()`
   - Camera and controls setup
   - Main render loop

2. **renderer-board.js**: Board and cell rendering
   - `updateBoard()`, `createFloatingCell()`
   - Cell decoration functions
   - Board creation functions

3. **renderer-pieces.js**: Chess pieces visualization
   - `updateChessPieces()`, `addChessPiece()`
   - Piece movement animations
   - Player labels

4. **renderer-tetromino.js**: Tetris piece rendering
   - `updateFallingTetromino()`, `updateGhostPiece()`
   - Tetromino rotation and movement

5. **renderer-effects.js**: Visual effects and decorations
   - `addCellDecoration()`, `addPotionToCell()`
   - Particle effects, animations
   - Environment effects (clouds, skybox)

6. **renderer-utils.js**: Helper functions
   - `getFloatingHeight()`, `validateGeometryParams()`
   - Random generation utilities
   - Material management

### Implementation Strategy

1. Start by creating a new directory structure:
```
public/js/rendering/
├── index.js           # Main entry point that exports all modules
├── core.js            # Core renderer functionality
├── board.js           # Board rendering
├── pieces.js          # Chess pieces
├── tetromino.js       # Tetris pieces
├── effects.js         # Visual effects
└── utils.js           # Helper functions
```

2. Move functions to appropriate files, ensuring proper imports/exports
3. Update references throughout the codebase

## Automated Testing Strategy

Implementing automated tests for the renderer would bring several benefits:

1. **Ensure visual consistency** across changes
2. **Detect regressions** in rendering functionality
3. **Validate game rule implementation** in the visual layer

### Recommended Testing Approach

1. **Unit Tests for Utility Functions**:
   - Test geometry validation
   - Test coordinate calculations
   - Test random generators

2. **Integration Tests for Rendering Components**:
   - Test board generation with mock game states
   - Test chess piece placement and movement
   - Test Tetris piece rendering

3. **Visual Regression Tests**:
   - Capture screenshots of key game states
   - Compare against baseline images
   - Flag visual differences for review

### Test Implementation

```javascript
// Example test for geometry validation
import { validateGeometryParams } from '../public/js/rendering/utils.js';

describe('Geometry Validation', () => {
  test('should handle NaN values', () => {
    const params = { radius: NaN, height: 1 };
    const validated = validateGeometryParams(params);
    expect(validated.radius).toBe(0.2); // Default radius value
    expect(validated.height).toBe(1);   // Original valid value
  });

  test('should handle undefined values', () => {
    const params = { width: undefined, depth: 3 };
    const validated = validateGeometryParams(params);
    expect(validated.width).toBe(0.5);  // Default width value
    expect(validated.depth).toBe(3);    // Original valid value
  });
});
```

Implementing these testing strategies will make the codebase more robust and maintainable as the project continues to evolve.

## Debugging the Renderer

The Chesstris renderer has been refactored to be more robust and easier to debug. Here are some key features and debugging techniques:

### Test Page

A dedicated test page at `/test.html` provides a controlled environment for testing the renderer with simplified geometry and colors. This helps isolate rendering issues from game logic problems.

Features of the test page:
- Direct visualization of board coordinates with a checkerboard pattern
- Color-coded axes (Red=X, Green=Y, Blue=Z)
- Minimal test showing chess pieces at specific coordinates
- Camera controls for different viewing angles

### Debug Controls

Both the test page and main game include debug controls for easier navigation:
- Reset Camera: Returns to the default view
- Top View: Bird's eye view of the board
- Side View: Shows the board from the side

### Fallback Mechanisms

The renderer includes several fallback mechanisms to ensure it continues to work even if some components fail:

#### Texture Fallbacks
- Placeholder textures are automatically generated when image files are not found
- These placeholders include the name of the texture for easy identification
- High-contrast patterns make them easy to spot during debugging

#### Geometry Fallbacks
- Wireframe outlines make objects visible even if textures or lighting fail
- Text labels show coordinates and piece types

#### Direct Debug Mode
- A "Direct Test" button creates a scene with basic shapes to verify Three.js is working
- Helps identify if issues are with Three.js setup or with our renderer code

### Known Issues and Workarounds

#### Missing Texture Files
If you see 404 errors for texture files, ensure the following files exist:
- public/img/textures/board.png
- public/img/textures/cell.png
- public/img/textures/home_zone.png

The renderer will use placeholder textures if these files are missing.

#### API Errors
If you see errors related to the sponsors API, this is expected during development:
```
GET http://localhost:3020/api/sponsors/next 404 (Not Found)
```

The sponsors system is disabled by default in development mode. To enable it:
1. Set `SPONSORS_API_ENABLED = true` in `public/js/utils/sponsors.js`
2. Ensure your development server handles these API endpoints
