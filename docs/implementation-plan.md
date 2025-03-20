# Shaktris Implementation Plan

This document outlines the step-by-step plan to transform Shaktris from its current state into a fully playable game as described in the specification. The plan is divided into phases with specific tasks, expected outcomes, and testing criteria.

## Phase 1: Core Functionality Fixes (1 Week)

### 1.1 WebSocket Connection Fix ✅
- [x] Update client network module to use Socket.IO instead of native WebSockets
- [x] Add support for dynamic loading of Socket.IO client
- [x] Improve error handling and reconnection logic

### 1.2 Game Start Functionality ✅
- [x] Implement `startGame` handler on the server
- [x] Fix Play button functionality in the UI
- [x] Create event listeners for the game initialization flow
- [x] Add proper game state transition to PLAYING state

### 1.3 Basic Game Loop ⚠️
- [x] Ensure tetromino generation works correctly
- [x] Implement turn management with 10-second minimum intervals
- [x] Add visual indicators for the current turn phase
- [ ] Verify chess piece placement and movement

### 1.4 Game State Persistence
- [ ] Implement proper saving and loading of game state
- [ ] Add auto-save functionality at critical game events
- [ ] Create error recovery mechanisms to prevent data loss
- [ ] Test state synchronization between server and clients

## Phase 2: Core Gameplay Mechanics (2 Weeks)

### 2.1 Tetromino Placement System ⚠️
- [ ] Implement Y-axis tetromino falling mechanics
- [ ] Create visualization for the falling process
- [x] Add ghost piece preview for landing position
- [x] Implement magnetic edge attachment logic
- [ ] Create visual effects for piece attachment/disintegration
- [ ] Create path-to-king validation for new cells

### 2.2 Chess Movement System
- [ ] Implement proper chess piece movement rules for all piece types
- [ ] Add validation for territory movement restrictions
- [ ] Create visual highlights for valid moves
- [ ] Implement piece capture mechanics
- [ ] Add special case for king capture and game outcomes

### 2.3 Row Clearing Mechanics
- [ ] Implement detection for 8 cells in a row
- [ ] Create animation for row clearing
- [ ] Handle orphaned pieces after row clearing
- [ ] Implement home cell protection logic
- [ ] Test all edge cases for row clearing

## Phase 3: Player Experience (2 Weeks)

### 3.1 Home Zone System
- [ ] Implement spiral pattern for home zone placement
- [ ] Create visual indicators for home zones
- [ ] Add home zone degradation for empty zones
- [ ] Implement expanded home zones for returning pieces

### 3.2 Pause System
- [ ] Create UI for pause functionality
- [ ] Implement 15-minute timeout for paused players
- [ ] Add countdown timer for paused players
- [ ] Implement consequences for timeout (main island removal, etc.)
- [ ] Test edge cases like multiple players pausing

### 3.3 Computer Players
- [ ] Implement basic computer player AI
- [ ] Create different difficulty levels
- [ ] Add personality traits for computer players
- [ ] Implement computer player move calculation
- [ ] Create visual indicators for computer player turns

## Phase 4: User Interface (1 Week)

### 4.1 Game Board Visualization
- [ ] Optimize 3D rendering performance
- [ ] Improve lighting and shadows for better depth perception
- [ ] Add camera controls for player perspective
- [ ] Create visual effects for game events
- [ ] Implement board expansion as needed

### 4.2 Player Feedback
- [ ] Add notifications for important game events
- [ ] Create visual and audio feedback for player actions
- [ ] Implement warning indicators for negative events
- [ ] Add turn timer visualization
- [ ] Create game status display

### 4.3 Player Controls
- [ ] Optimize controls for mouse and keyboard
- [ ] Add touch support for mobile devices
- [ ] Create shortcut keys for common actions
- [ ] Implement drag-and-drop for chess piece movement
- [ ] Add tetromino rotation and movement controls

## Phase 5: Monetization & Polish (2 Weeks)

### 5.1 Piece Acquisition System
- [ ] Create UI for piece purchases
- [ ] Implement SOL-based payment system
- [ ] Add new piece placement logic
- [ ] Create visual effects for new pieces
- [ ] Test payment flow and validation

### 5.2 Custom Pieces Marketplace
- [ ] Design system for custom chess pieces
- [ ] Implement 3D model loading for custom pieces
- [ ] Create marketplace interface
- [ ] Add commission system (10%)
- [ ] Implement inventory management

### 5.3 Russian Theme
- [ ] Create themed chess pieces
- [ ] Design Russian-inspired environment
- [ ] Add themed sound effects and music
- [ ] Implement visual style throughout the UI
- [ ] Test theme consistency across all game screens

## Implementation Details

### Fix for Play Button Issue

The current issue with the Play button not working appears to be due to a missing server-side handler for the `startGame` event. The client code sends a `startGame` event to the server, but there is no corresponding handler on the server side.

#### Client-side code:
```javascript
// public/js/utils/gameStateManager.js
export function startGame(options = {}) {
  network.send('startGame', options);
  setState(GAME_STATES.PLAYING);
}
```

#### Required server-side implementation:
```javascript
// server.js (to be added)
socket.on('startGame', (options, callback) => {
  const player = players.get(playerId);
  if (!player) {
    if (callback) callback({ success: false, error: 'Player not found' });
    return;
  }
  
  let gameId = player.gameId;
  
  // Create a new game if player is not in one
  if (!gameId) {
    gameId = createNewGame();
    player.gameId = gameId;
    socket.join(gameId);
  }
  
  const game = games.get(gameId);
  if (!game) {
    if (callback) callback({ success: false, error: 'Game not found' });
    return;
  }
  
  // Start the game
  game.state.status = 'playing';
  game.state.startTime = Date.now();
  
  // Add a computer player if there's only one human player
  if (game.players.length === 1 && !options.noComputer) {
    addComputerPlayer(gameId);
  }
  
  // Send initial game state to all players
  io.to(gameId).emit('game_started', {
    gameId: gameId,
    players: game.players.map(id => ({
      id: id,
      name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
      isComputer: computerPlayers.has(id)
    })),
    state: game.state
  });
  
  if (callback) callback({ success: true, gameId: gameId });
  console.log(`Game ${gameId} started by player ${playerId}`);
});
```

## Testing Strategy

For each phase of implementation, we will follow this testing approach:

1. **Unit Testing**: Each component will have unit tests to verify its functionality in isolation.
2. **Integration Testing**: Components will be tested together to ensure they work correctly as a system.
3. **End-to-End Testing**: The entire game flow will be tested to ensure a smooth user experience.
4. **Performance Testing**: The game will be tested for performance issues, especially in 3D rendering.
5. **Cross-Browser Testing**: The game will be tested on different browsers to ensure compatibility.
6. **Mobile Testing**: Touch controls and responsive design will be tested on mobile devices.

## Success Criteria

The implementation will be considered successful when:

1. Players can start a new game with the Play button.
2. Tetrominos can be placed according to the connectivity rules.
3. Chess pieces can move according to chess rules on built territory.
4. Rows clear correctly when 8 cells are aligned.
5. Home zones work as specified, including degradation.
6. The pause system functions with the 15-minute timeout.
7. Computer players provide a challenging opponent.
8. The game has a consistent Russian theme.
9. The monetization features are implemented and functional.
10. The game runs smoothly with acceptable performance.

## Conclusion

This implementation plan provides a structured approach to transforming Shaktris into a fully playable game. By following this plan, we can ensure that all aspects of the game are implemented correctly and provide an enjoyable experience for players.

The immediate focus should be on fixing the Play button functionality by implementing the missing server-side handler for the `startGame` event. Once that is complete, we can proceed with implementing the core gameplay mechanics. 