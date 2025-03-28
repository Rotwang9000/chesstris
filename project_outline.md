# Shaktris Project Outline

## Completed Components

### Core Game Logic
- [x] Game state manager
- [x] Tetromino manager
- [x] Chess piece manager
- [x] Board manager
  - [x] Sparse board architecture implementation
  - [x] Dynamic board expansion
  - [x] Efficient cell lookup
- [x] Game rules implementation
- [x] Implement basic game mechanics
  - [x] Tetris piece placement
  - [x] Chess piece movement
  - [x] Turn management
  - [x] Tetromino movement limits (3 horizontal units per vertical unit)
  - [x] Skip chess move when no valid moves available

### Backend Services
- [x] Basic Express.js server
- [x] Socket.IO integration
- [x] Game state synchronization
- [x] Basic computer player implementation
- [x] External computer player API
- [x] API documentation for third-party developers
- [x] Computer player test framework
- [x] Computer player setup tools

### Frontend Utilities
- [x] UI manager
- [x] Sound manager
- [x] Input controller
- [x] Network utility
- [x] Session manager

### Rendering
- [x] 3D renderer (Three.js)
- [x] 2D renderer (Canvas API)
- [x] Renderer compatibility layer
- [x] Skybox and environmental elements
- [x] Chess piece rendering
- [x] Tetromino rendering

### Developer Tools
- [x] Computer player API documentation
- [x] Example computer player implementations
- [x] Computer player setup script
- [x] Multi-player testing tools
- [x] Callback server example
- [x] API troubleshooting guide
- [x] Frontend integration guide for computer players
- [x] API testing utilities
- [x] Game mechanics implementation status tracker

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
- [x] Row clearing mechanics
- [x] Orphaned pieces handling after row clearing
- [x] Pawn promotion after 8 moves
- [x] Home zone degradation
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
- [ ] Refactor core game logic for better separation of concerns
- [ ] Improve test coverage
- [ ] Standardize error handling
- [ ] Documentation improvements

### Infrastructure
- [ ] Containerization (Docker)
- [ ] CI/CD pipeline
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

3. **Sponsor Tetris Pieces**
   - Create system for bidding on sponsored tetromino appearances
   - Implement rotation of sponsored pieces based on bid amount
   - Add analytics for sponsor exposure
   - Create admin interface for sponsor management

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

## Testing Strategy
- Unit tests for all core components
- Integration tests for subsystem interactions
- End-to-end tests for complete gameplay flows
- Performance testing for 3D rendering
- Usability testing with focus groups