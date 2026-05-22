# 04 Changelog Feb Mar 2026

> Part of the [Tetches project outline](README.md). Feb 2026 refactors and fix passes.

## Major Refactoring (Feb 2026)

### enhanced-gameCore.js Modularisation
Split the 4135-line monolith `enhanced-gameCore.js` into focused modules:
- **gameContext.js** (119 lines) — Shared state: getter/setter functions for scene, camera, renderer, controls, groups; breaks circular dependencies
- **rendererManager.js** (154 lines) — WebGL renderer creation with multi-strategy fallback; **fixed GPU context leak** (failed renderers now disposed to prevent "Error creating WebGL context" crashes)
- **inputManager.js** (246 lines) — Keyboard, mouse, and touch input handlers
- **chessInteraction.js** (543 lines) — Chess piece selection, raycasting, valid-move highlighting, move animation, server communication
- **uiOverlays.js** (351 lines) — Pawn promotion dialog, king battle overlay, King's Duel mini-game
- **gameLoop.js** (320 lines) — requestAnimationFrame loop, performance monitoring, scene validation
- **enhanced-gameCore.js** (1088 lines) — Slim coordinator with re-exports for backward compatibility

Files still needing refactoring (over 1500 lines): `tetromino.js` (3462), `boardFunctions.js` (2673), `gameRenderer.js` (2223), `chessPieceCreator.js` (1727)

### CI/CD Pipeline (Feb 2026)
- **Jenkins** running in Docker on port 8090 with Node.js 21 baked in
- **Jenkinsfile**: multibranch pipeline — checkout → install → lint → test → deploy
- **Staging**: `Develop` branch auto-deploys to `/var/www/tetches.staging` (port 3661, staging.tetches.com)
- **Production**: `main` branch requires manual approval, deploys to `/var/www/tetches.live` (port 3666, tetches.com)
- **PM2** manages Node.js processes; deploy-watcher cron restarts after Jenkins deploys

### Server Game Logic Fixes (Feb 2026)
- **King capture fully implemented** (`ChessManager._handleKingCapture`):
  - Non-pawn pieces transfer ownership to the captor
  - Pawns become suicidal (3 s delay, then detonate one per 0.5 s, destroying cells)
  - Island decay runs after all pawns detonate
  - Territory transfers to captor; king goes to prison
  - `capturedStyles` tracked for defeated player colour adoption
- **Detonation rules refined**:
  - Pawn detonation always destroys the detonated cell (including home cells)
  - Last remaining king can self-destruct, collapsing all owned territory inward
  - King self-destruct FX now runs in 500ms distance layers (farthest first, king last)
  - Server now reinforces king support cells so a lone king never floats on void
- **Eliminated session handling**:
  - Players eliminated by final king detonation now get a fresh identity on refresh, allowing immediate re-entry to the persistent shared world
- **Live world integrity maintenance**:
  - Startup + periodic integrity sweeps repair stale persisted-world states
  - Disconnected islands now decay reliably even in long-running existing worlds
  - Island decay emits a dedicated client event for sand-dissolve cell FX
- **3 AI opponents** (Novice / Standard / Expert) now spawn in the global game with different difficulty levels and move intervals
- **Exit game button fixed** — `networkManager.js` was missing the `exitGame` export; now wired correctly
- **Animation performance caps** — island decay and king detonation animations are capped (max 40 cells / 3 s for decay; max 12 per layer / 20 layers / 8 s for king detonation) to prevent display hangs on slower browsers
- **Path highlight flashing fixed** — `highlightPathToKing` now uses a throttled update (250 ms), shallow board clone instead of `JSON.parse(JSON.stringify(...))`, and a cyan colour instead of yellow to avoid the "flashing yellow line" artefact
- **Chess move terrain preservation** — the `chess_move` socket handler (both human and AI) now preserves tetromino terrain when a piece moves, instead of destroying the entire source cell
- **AI king capture fixed** — AI now calls `executeKingCapture` instead of `endGame`, correctly transferring pieces and territory
- **Auto-reconnection** — `NetworkManagerClass` now attempts exponential-backoff reconnection (up to 8 attempts) after unexpected disconnects, with toast notifications for the player
- **Hot-path logging reduced** — removed per-cell `console.log` calls in `boardFunctions.js`, `extractCellContent`, and `unifiedPlayerBar.js` that were degrading frame rate
- **Hard drop collision fix** — `processHardDrop` now uses `checkTetrominoCollision` (which correctly allows placement on home-zone-only cells) instead of a stricter inline check
- **Tetromino adjacency fix** — home-zone cells now count as adjacent territory for all placements (not just first), and `String()` coercion is used for player ID comparisons throughout `TetrominoManager` and `IslandManager` to prevent type-mismatch rejections
- **Stale player cleanup** — the integrity sweep now removes chess pieces and board cells belonging to players no longer in the game
- **Join-state self-heal** — if an existing player rejoins with missing core state (no home zone/pieces/owned cells), the server now rehydrates that player in-place instead of leaving them in a broken state
- **Renderer hard-fail fallback** — when WebGL context creation fails, client init now redirects to 2D mode (`/index-2d.html`) to preserve playability on low-capability browsers
- **Move highlight caching** — `chessInteraction.js` now caches shared `RingGeometry` and materials for move highlights instead of allocating per-move
- **Hot-path logging removed** — removed per-frame `console.log` calls from tetromino rendering and king position logging
- **Double gravity bug fixed** — `BoardManager.clearRow` no longer calls `_makePiecesFallTowardsKing` (the parent `checkAndClearRows` already does)
- **Pawn promotion uses net forward distance** — tracks `forwardDistance` per pawn instead of total `moveCount`, so sideways/backwards moves don't count
- **Missing constants added** — `SUICIDAL_PAWN_INTERVAL_MS` (500 ms), `AUTO_QUEEN_TIMEOUT_MS` (15 s)
- **GAME_RULES and PIECE_PRICES frozen** with `Object.freeze` to prevent runtime mutation
- **Island detection visited-set bug fixed** — plain-key contamination no longer causes multi-player islands to be skipped
- **AI balance threshold fixed** — `ComputerPlayerManager` now uses `Math.min(...PIECE_PRICES)` (0.1) instead of hardcoded `10`
- **All pieces initialised with** `moveCount: 0` and `forwardDistance: 0`
- **Removed `KING_CAPTURE_GRACE_MOVES`** unused constant

### Server Test Suite
- Real tests against actual server modules (not mocks):
  - `tests/server/Constants.test.js` — validates all constants against bible
  - `tests/server/BoardManager.test.js` — cell CRUD, row clearing on both
    axes, home zone protection, gravity towards king
  - `tests/server/ChessManager.test.js` — piece init, all piece movements,
    castling, pawn promotion, king capture with transfer + suicidal pawns
  - `tests/server/IslandManager.test.js` — BFS path to king, island detection,
    disconnected removal
  - `tests/server/staticAssets.test.js`, `clientImports.test.js` — frontend
    bundle/import sanity
- 94 server-side tests, all passing (May 2026).

## Recently Fixed (Feb 2026)

### Critical Bug Fixes
- [x] ComputerPlayerManager: Fixed sparse board compatibility (was using `game.board[0].length`)
- [x] ComputerPlayerManager: Fixed `MOVE_INTERVAL` → `minMoveInterval` property name mismatch
- [x] ComputerPlayerManager: Added missing `PIECE_PRICES` import
- [x] IslandManager: Rewrote `detectIslands()` and `_findConnectedCells()` for sparse board
- [x] IslandManager: Fixed `_processDisconnectedIslands()` to use sparse board cells
- [x] ChessManager: Added pawn 2-space first move to `isValidChessMove()` (was only in internal validator)
- [x] ChessManager: Added 2-space pawn check to `hasValidChessMoves()` for AI move availability

### Visual Overhaul
- [x] Replaced additive blending highlight system with subtle ring indicators (no more white blowout)
- [x] Rewrote `pieceHighlightManager.js` — flat coloured rings, no globals on window
- [x] Improved scene lighting: balanced hemisphere/sun/rim lights, removed duplicate setup
- [x] Changed board cell geometry from 0.9 cubes to 0.94x0.35 flat tiles (chess-board style)
- [x] Updated board colours: cream (#EDE8D5) and sage green (#5A7D5A) checkerboard
- [x] Reduced cloud puff density and opacity (20% coverage, 0.18 opacity)
- [x] Toned down cell edge outlines (15% opacity, grey instead of black)
- [x] Reduced camera FOV from 75 to 50 (eliminates fish-eye distortion)
- [x] Changed fog to exponential (FogExp2) for more natural depth

### Camera System
- [x] Rewrote `setupCamera.js` — clean module with named constants
- [x] Camera fly-to retries automatically when king not yet loaded (up to 6 retries, 500ms apart)
- [x] Smooth easeOutCubic animation with quadratic Bezier arc
- [x] Wired Reset Camera button in index.html to `resetCameraForGameplay()`
- [x] Exported `resetCamera()` from enhanced-gameCore.js for UI access

## In Progress

### Computer Players
- [x] Built-in computer player algorithms (basic)
- [x] External computer player API
- [x] API rate limiting for fair play
- [x] Computer player test framework
- [ ] Enhanced computer player difficulty levels
- [ ] Strategic AI improvements
- [ ] Computer player tournament system
- [ ] Leaderboards for computer players

### Multiplayer Features
- [x] Spectator mode
- [ ] Improved player synchronization
- [ ] Lobby system
- [ ] Match history
- [ ] Player profiles

### Game Mechanics
- [x] Basic chess piece movement
- [x] Basic tetromino movement and rotation
- [x] Tetromino connectivity rules (path to king)
- [x] Client/server tetromino validation parity (collision + first-placement rules)
- [x] Row clearing mechanics
- [x] Orphaned pieces handling after row clearing
- [x] Pawn promotion after 9 moves (player choice: Queen/Rook/Bishop/Knight)
- [x] Home zone degradation (inactive home markers convert to normal terrain; occupied cells are preserved)
- [x] Chess legal-move square highlights (client)
- [x] Castling (king + rook, works in all orientations)
- [x] King capture → piece/territory transfer, suicidal pawns, island decay
- [x] King's Duel mini-game for simultaneous king captures (4×2 grid)
- [x] Session cookie persistence (tetches_player_id, 5-min grace period)
- [x] Game start flow: overview → click start → camera fly → tetromino appears
- [ ] Piece Designer (create/save custom piece styles)
- [ ] Captured-style switching UI (trophy colours from defeated opponents)
- [ ] Advanced chess piece abilities
- [ ] Special tetromino effects
- [ ] Power-ups and special moves
- [ ] Game modes (timed, survival, etc.)

### UI/UX
- [x] Basic game screens (menu, game, pause)
- [x] Notifications system
- [x] Dialog system
- [x] Full window game rendering
- [ ] Responsive design improvements
- [ ] Mobile controls optimization
- [ ] Accessibility features
- [ ] Tutorial system

## Future Plans

### Performance Optimization
- [ ] Asset loading optimization
- [ ] Rendering performance improvements
- [ ] Network traffic optimization
- [ ] Memory usage optimization

### Content Expansion
- [ ] Piece Designer: player-created piece styles (create, save, sell/trade)
- [ ] Marketplace for custom piece styles (public/utils/marketplace.js is placeholder)
- [ ] Additional chess piece types
- [ ] Custom tetromino shapes
- [ ] Themed game boards
- [ ] Cosmetic customizations

### Community Features
- [x] Spectator mode
- [ ] Global leaderboards
- [ ] Friend system
- [ ] Tournament support

## Technical Debt

### Code Quality
- [ ] Refactor oversized client files (tetromino.js ~3500 lines, boardFunctions.js ~2700 lines)
- [ ] Improve test coverage
- [ ] Standardize error handling
- [ ] Documentation improvements

### Infrastructure
- [x] CI/CD pipeline (Jenkins in Docker, port 8090, Jenkinsfile-driven)
- [x] Deployment scripts (staging → port 3661, production → port 3666)
- [x] PM2 ecosystem config for process management
- [ ] Monitoring and logging
- [ ] Scalability improvements

## Development Priorities

### Short-term (1-2 weeks)
1. Complete external computer player API implementation
2. Enhance computer player algorithms
3. Implement core game mechanics (connectivity rules, row clearing, etc.)
4. Create a basic test framework for computer players

### Medium-term (1-2 months)
1. Improve game stability and performance
2. Develop frontend components to visualize computer player actions
3. Implement tournament system for computer players
4. Enhance game mechanics (chess piece abilities, tetromino effects)

### Long-term (3+ months)
1. Launch public API for third-party developers
2. Create visual editor for computer player development
3. Implement advanced gameplay features
4. Full UI/UX redesign based on user feedback

## Development Workflow

### Environment Setup
1. Clone repository
2. Install dependencies with `npm install`
3. Start development server with `npm run dev`
4. Access 3D mode at http://localhost:3020/
5. Access 2D mode at http://localhost:3020/2d

### Testing
- Run Jest tests with `npm test`
- Run Node.js tests with `npm run test:node`
- Run specific test categories with `npm run test:gameplay`, `npm run test:core`, etc.
- Run specific tests with `npm test tests/soundManager.test.js`
- Current test coverage:
  - Core Gameplay: Fully tested with Node.js native tests
    - Tetromino placement
    - Chess movement
    - Row clearing
    - Home zone spiral placement
    - King capture and territory acquisition
  - Sound Manager: 17 passing tests (sound loading, playback, volume control)
  - UI Manager: Basic component testing in progress
  - Game State Manager: Basic state management testing in progress

## Testing Strategy

### Current Testing Focus
- **Native Node.js Tests**: Core gameplay testing with minimal mocks using Node.js assert module
- **Jest Tests for UI Components**: Using Jest and Testing Library for UI components
- **Unit Testing Core Utilities**: Sound manager, UI manager, and game state manager
- **Component Isolation**: Tests are designed to isolate components from their dependencies
- **Targeted Testing**: Focusing on the most critical and stable parts of the system first
- **Jest + JSDOM**: Using Jest as the test runner with JSDOM for browser environment simulation

### Testing Approach
1. **Minimise Mocks**: Use minimal mocks only when necessary to isolate components
2. **Focus on Core Gameplay First**: Prioritise testing critical gameplay mechanics
3. **Start with Stable Utilities**: Begin testing with the most stable utility modules
4. **Mock External Dependencies**: Use Jest mocks to isolate components during testing
5. **Incremental Coverage**: Gradually expand test coverage as components stabilise
6. **Prioritise Core Functionality**: Focus on critical gameplay mechanics and user-facing features

### Testing Challenges
- Browser API simulation (localStorage, Audio, Canvas)
- Three.js integration testing
- Asynchronous game state management
- Module interdependencies

### Next Steps in Testing
- Complete sound manager tests
- Expand UI manager test coverage
- Implement tests for game state transitions
- Create test fixtures for common game scenarios
- ✅ Implemented orphaned pieces tests - verifying proper handling when pieces lose connectivity to king
- Test defensive pawn positioning strategies at clash points

### Deployment
- Build production version with `npm run build`
- Deploy to staging with `npm run deploy:staging`
- Deploy to production with `npm run deploy:production`

## Architecture Notes

### Board Architecture
- Sparse data structure tracks only occupied cells by coordinates
- No artificial board size limits, expands dynamically as players build outward
- Efficient cell lookup with Map-based structure (`x,z` coordinate keys)
- Boundary tracking allows for dynamic rendering of visible board area
- Improved memory usage by only storing occupied cells

### Module System
- Core game logic is separated from rendering and network code
- Each module has a clear responsibility and API
- Dependency injection is used to avoid tight coupling

### State Management
- Central game state is maintained on the server
- Client state is synchronized with server state
- State updates are propagated to all clients in real-time

### Rendering Pipeline
- 3D rendering uses Three.js with optimized geometries
- 2D rendering uses Canvas API with efficient drawing techniques
- Both rendering modes share the same game state

### Network Protocol
- WebSocket-based communication for real-time updates
- RESTful API for game management and computer player integration
- Efficient binary protocol for game state synchronization

### Computer Player Integration
- External computer players connect via RESTful API
- Asynchronous turn system allows players to act independently
- Each player follows their own tetromino-chess move sequence
- Minimum 10-second delay between moves enforced by the server
- Computer players can be implemented in any language that supports HTTP requests
- [x] Computer player API
  - [x] Documentation
  - [x] Example implementations
  - [x] Movement validation
  - [x] Turn sequence enforcement
  - [x] Tetromino movement limits

## Development Roadmap

### Completed Core Systems:
- [x] Basic Game Flow
- [x] Chess Piece Movement
- [x] Tetromino Placement
- [x] Player Turn Management
- [x] Island Connectivity System - tracks and manages islands of cells owned by players
- [x] Player Pause System - allows players to pause for up to 15 minutes with timeout handling
- [x] Piece Acquisition System - enables players to purchase additional chess pieces
- [x] Row Clearing - full rows are cleared with protection for cells in "safe" home zones
- [x] Home Zone Protection - cells in a home zone with at least one piece are protected
- [x] King Capture Mechanics - captures transfer ownership of pieces and fees

### In Progress:
- [x] Home Zone Degradation - empty home zones degrade over time
- [ ] Full Test Suite Completion - ensuring comprehensive test coverage

### Upcoming:
- [ ] Spectator Mode Enhancements
- [ ] UI Improvements
- [ ] Solana Integration for Piece Purchases
- [ ] Performance Optimizations
- [ ] Documentation Updates

## Development Plan

### Priority 1: Core Technical Infrastructure
1. **WebSocket Connection Fix** ✓
   - Updated client-side network implementation to use Socket.IO instead of native WebSockets
   - Added support for dynamic loading of Socket.IO client if not available
   - Improved error handling and reconnection logic

2. **Game State Synchronization**
   - Ensure game state is properly synchronized between server and clients
   - Implement proper event propagation for all game actions
   - Create unit tests for network synchronization

3. **3D Rendering Optimization**
   - Improve performance of the 3D game board rendering
   - Implement level-of-detail for distant pieces
   - Add proper shadows and lighting for better visual cues

### Priority 2: Core Gameplay Mechanics
1. **Tetromino Placement Mechanics**
   - Visualize the Y-axis countdown for falling tetrominos
   - Add ghost piece functionality to show where pieces will land
   - Implement proper collision detection for adjacent pieces
   - Create visual effects for tetromino "sticking" to adjacent cells

2. **Chess Movement Validation**
   - Ensure all chess piece movements follow proper rules
   - Validate that pieces can only move on built territory
   - Implement proper king capture mechanics
   - Add visual indicators for valid moves

3. **Row Clearing Mechanics**
   - Implement proper detection of 8 cells in a row
   - Create visual effects for row clearing
   - Handle orphaned pieces correctly after row clearing
   - Ensure home cells are properly protected

### Priority 3: Player Experience
1. **Player Pause System**
   - Implement 15-minute timeout for paused players
   - Create UI for pause status
   - Handle pause timeout consequences (main island removal, etc.)

2. **Computer Players**
   - Improve AI decision-making algorithms
   - Implement different difficulty levels
   - Add personality traits to computer players
   - Create visual indicators for computer player turns

3. **Home Zone Mechanics**
   - Implement proper spiral pattern for home zone placement
   - Add visual indicators for home zones
   - Create degradation effects for empty home zones
   - Ensure proper king capture mechanics with home zones

### Priority 4: Monetization Features
1. **Piece Acquisition System**
   - Implement SOL-based purchases for additional pieces
   - Create UI for piece acquisition
   - Add visual effects for new pieces
   - Implement proper placement of purchased pieces

2. **Custom Chess Pieces Marketplace**
   - Develop 3D models for alternative chess pieces
   - Create system for uploading and selling custom pieces
   - Implement commission system (10%)
   - Add inventory management for purchased pieces

3. **Sponsor Tetris Pieces** ✓ COMPLETED
   - ✓ Create system for bidding on sponsored tetromino appearances
   - ✓ Implement rotation of sponsored pieces based on bid amount
   - ✓ Add analytics for sponsor exposure (impressions, clicks, CTR)
   - ✓ Create admin interface for sponsor management (/admin/advertisers)
   - ✓ Advertiser registration page with Solana wallet integration (/advertise)
   - ✓ Floating banner ad component for top-right corner
   - ✓ Sponsor display on tetromino placement

### Priority 5: Polish and Extras
1. **Russian Theme Implementation**
   - Develop faux historical Russian visuals for the board
   - Create themed chess pieces
   - Add appropriate sound effects and music
   - Implement themed backgrounds and environments

2. **Mobile Optimization**
   - Optimize UI for touchscreen controls
   - Implement responsive design for different screen sizes
   - Create mobile-specific control schemes
   - Test performance on various mobile devices

3. **Documentation and Tutorials**
   - Create comprehensive gameplay guides
   - Develop interactive tutorials
   - Improve API documentation for computer player development
   - Add tooltips and help sections to UI

## Implementation Timeline
- **Phase 1 (2 weeks)**: Core Technical Infrastructure
- **Phase 2 (3 weeks)**: Core Gameplay Mechanics
- **Phase 3 (2 weeks)**: Player Experience
- **Phase 4 (3 weeks)**: Monetization Features
- **Phase 5 (2 weeks)**: Polish and Extras

## Recently Fixed (Feb 2026 — Second Pass)

### Visual Fixes
- Removed ALL remaining additive blending glow (move highlights, tetromino glow spheres, particles)
- Reduced emissive intensity across chess pieces, fallback pieces, tetromino blocks, and clouds to near-zero
- Pieces are now clearly visible without white blowout

### Game Logic Fixes
- **Wireframe ghost persisting**: `cleanupCurrentTetromino()` now called after successful placement instead of just nulling the reference
- **Turn phase stuck on chess**: Removed 7 local code paths that forced `turnPhase = 'chess'`; only the server response now controls phase transitions
- **Auto-skip chess phase**: When server reports `hasValidMoves: false`, client transitions to tetris and spawns new tetromino immediately
- **New tetromino after chess move**: Explicit tetromino spawn added after successful chess move completes
- **Pawn path obstruction**: `_isPathClear` now only blocks on chess pieces, not on empty board cells with tetromino blocks

### Server Bug Fixes
- **TetrominoManager.hasAdjacentCell**: Rewrote from 2D array access (`game.board[0].length`) to sparse board iteration
- **ChessManager.validateChessMove**: Fixed `targetCell.player` to properly check array contents for friendly chess pieces
- **ChessManager pawn diagonal capture**: Fixed to search cell array for enemy chess pieces
- **ChessManager._checkPawnPromotion**: Fixed `cell.chessPiece.type` to find chess item in cell array
- **ChessManager.executeChessMove capture detection**: Rewritten to search `chessPieces` array directly instead of relying on `targetCell` type check
- **ChessManager._isPathClear**: Only chess pieces block sliding piece paths (not board cells with tetromino blocks)
- **BoardManager._makePiecesFallTowardsKing**: Fully implemented (was placeholder) — shifts cells towards player king after row clearing

### UX Improvements
- **Mode toggle**: "Cute" mode now switches lighting/fog in place without page reload
- **Camera fly-to**: Added one-off trigger on first game update with chess pieces — resolves race condition where king wasn't found during early setup

## Recently Fixed (Feb 2026 — Third Pass)

### Visual Overhaul
- **White haze eliminated**: Removed cloud puffs beneath cells, sky cloud clusters, flat cloud planes, and all remaining additive blending
- **Chess pieces redesigned**: Ivory/cream with gold accents for local player, dark walnut for opponents; pieces scaled 2x for visibility
- **Board cells → cubes**: Cells are now proper 0.94³ cubes instead of flat 0.35-height tiles
- **Cell colours**: Warm wood tones (burlywood/tan for player, hashed blues/greens for opponents) instead of garish red/blue
- **Sparse cloud bed**: Soft white cloud puffs at y=-2.5 beneath the board for a floating-island aesthetic
- **Highlight rings**: Reduced from double ring + glow to a single thin gold ring; no more white/red glow

### Gameplay Fixes
- **Pawn 2-square first move**: Fixed in all three locations — client `getChessPieceMoveSets`, server `_validateMoveByPieceType`, and server `isValidChessMove` (also fixed `cell.length` typo → `midCell.length`)
- **Pawn orientation**: Server `_validateMoveByPieceType` no longer hardcodes `direction = 1`; uses piece orientation for forward vector
- **Client tetromino placement**: Simplified adjacency check to trust any owned cell (including home markers) without `_hasPlacedTetromino` flag confusion; server remains authoritative

### Mode Toggle
- **Background switching**: Mode toggle now removes starfield, cute shapes, cloud bed, and sky clouds before re-applying the new profile's background colour, fog, and lighting

## Recently Fixed (Feb 2026 — Fourth Pass)

### Visuals
- **White tube artefact removed**: `scene.createBoard()` now clears old decorative meshes and no longer creates per-cell white decorative island pillars.
- **Cloud bed tuned down**: Moved lower (`y=-4.5`), reduced density and opacity to prevent bright silhouettes around the board.
- **Local piece quality path fixed**: `updateChessPieces` now renders local-player pieces with the detailed Russian constructors instead of the simpler placeholder `createPiece()` path.
- **Russian imperial style restored**: Local piece materials updated to deep lacquer red + gilt accents; opponents remain simpler/darker for speed.

### Gameplay / AI
- **Global AI inactivity fixed**: On global game creation, the AI opponent now starts its action loop immediately (`startComputerPlayerActions`), so the visible AI set actually plays.

### UI
- **Players sidebar affordance improved**: Added additional click targets for toggling (header title + header), and raised tab z-index so overlays/banners do not block interaction.

## Recently Fixed (Feb 2026 — Fifth Pass)

### Critical Gameplay Bugs
- **Chess moves no longer destroy board cells**: `ChessManager.executeChessMove` previously did `delete game.board.cells[key]` when a piece moved away, destroying the tetromino/home content underneath. Now it strips only the chess entry from the cell array and appends to the destination cell without overwriting. This was the root cause of AI pieces "floating in the air with no cell underneath."
- **Island decay now fires after row clears**: `TetrominoManager.processTetrisPiece` now calls `islandManager.checkForIslandsAfterRowClear(game)` after rows are cleared, and `islandManager.updateIslandsAfterTetrominoPlacement` after every placement. Disconnected territory is now properly removed.

### Visuals
- **White cylinder artefact fixed**: The invisible raycast hitbox material on chess pieces now sets `colorWrite: false`, preventing GPU artefacts from a zero-opacity mesh with `depthTest: false`.
- **Piece art pass (local player)**: All five Russian-themed piece constructors in `chessPieceCreator.js` rewritten for the local player with significantly more ornate geometry:
  - **King**: Two tiers of crown points with pearl tips, large onion dome, thick imperial cross with orb, decorative base and mid-column bands.
  - **Queen**: Wide kokoshnik crown rim, 8 tall pointed merlons with pearls, central onion dome, mini imperial cross, base studs.
  - **Bishop**: Tall onion dome with pronounced lower bulge, diagonal slit across dome face, full Orthodox cross (3 bars), orb and finial sphere.
  - **Knight**: Curved neck from stacked tapered sections, elongated cranium, tapered muzzle with nostrils, pointed ears, mane ridges, visible eye.
  - **Pawn**: Taller body with collar ring, squashed head, finial point on top, base decoration ring.
  - Opponent pieces remain intentionally cheap (low-poly silhouettes).

### UI
- **Phantom players in sidebar fixed**: `unifiedPlayerBar.updateUnifiedPlayerBar` now matches the local player by ID (not name), preventing ghost entries when `localStorage` player name drifts from server state. Removed logic that fabricated random player IDs.

### Documentation
- **Player's Bible created**: `docs/players-bible.md` — definitive game-rules reference derived entirely from server code. Covers board structure, home zones, turn structure, tetromino placement rules, row clearing, chess movement, island decay, AI behaviour, scoring, and all key constants.

## Recently Fixed (Feb 2026 — Sixth Pass)

### Rules and Game Logic
- **Pawn promotion distance-based**: Promotion now triggers after 13 forward moves (`PAWN_PROMOTION_DISTANCE = 13`) instead of at `board.maxZ`. Players are shown a choice dialog (Queen/Rook/Bishop/Knight) with a 15-second auto-promote to Queen.
- **King capture transfers ownership**: Capturing a king now transfers all the defeated player's chess pieces and territory to the captor, rather than ending the game. This creates a snowball effect encouraging aggressive play.
- **Tetromino explode fallback**: When a tetromino explodes, the client now checks for valid chess moves and transitions to chess phase if available; otherwise gives a new tetromino immediately (prevents soft-locks).
- **Row clearing home-zone behaviour confirmed**: Home-zone cells correctly reset the consecutive count to zero (code was already correct, documented in bible).

### Session and Identity
- **Session cookie persistence**: Server now generates a persistent UUID player ID (stored as `tetches_player_id` cookie, 30-day expiry). On reconnect, the server matches the cookie and restores the player to their game. A 5-minute grace period prevents immediate removal on disconnect.
- **Exit Game button**: Added with confirmation dialog warning about losing game data if player code not stored. Clears cookie and reloads.
- **Player Code visibility**: Sidebar now includes an explicit `Player Code` field with copy button; bottom warning opens the panel and focuses the code.
- **Terminology cleanup**: UI now uses **World** for the shared global board and reserves **Player Code/session** for personal continuity.

### Game Start Flow
- **Camera starts neutral**: `setCameraToOverview()` runs before tutorial, placing camera in a high overview.
- **Tetromino waits for camera**: First tetromino only spawns AFTER the fly-to-player animation completes (via `onComplete` callback threaded through `flyToPosition` → `moveToPlayerZone` → `resetCameraForGameplay`).

### Player's Bible
- Major rewrite of `docs/players-bible.md` incorporating user corrections: cells do not coexist, home cells break row count, pawn promotion is distance-based with choice, king capture transfers pieces, explode->chess fallback, session identity, game start flow, edge cases.

