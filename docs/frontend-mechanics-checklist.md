# Frontend Mechanics Implementation Checklist

This checklist verifies that all core gameplay mechanics from the how-to-play document are properly addressed in the frontend implementation.

## Board and Home Zone Management

- [ ] Visualize 8×2 home zones with distinct player ownership
- [ ] Show random placement within 8-12 squares of other zones
- [ ] Display home zone degradation states with visual decay
- [ ] Represent dynamic board expansion as players add pieces
- [ ] Visualize home zone expansion when pieces return
- [ ] Indicate "safe" home zones that won't be cleared during row clearing

## Tetromino Mechanics (Z-axis Logic ✓ Implemented on Backend)

- [ ] Implement falling tetrominos along Z-axis
- [ ] Visualize adjacency requirement for placement
- [ ] Show path-to-king requirement for placement
- [ ] Animate disintegration when landing ON another cell (at Z=1)
- [ ] Visualize attachment to board at Z=0 when adjacent to cells
- [ ] Show tetrominos falling through and fading when no valid connection
- [ ] Display upcoming tetromino in preview area
- [ ] Allow rotation and horizontal movement before placement
- [ ] Highlight valid placement areas during movement

## Chess Movement (Pawn Promotion ✓ Implemented on Backend)

- [ ] Implement chess piece movement with valid move highlighting
- [ ] Animate pawn promotion to knight after 8 moves forward
- [ ] Display pawn move counter (e.g., 5/8 moves toward promotion)
- [ ] Visualize piece captures with appropriate effects
- [ ] Represent king capture with ownership transfer ceremony
- [ ] Show captured pieces being removed from the board
- [ ] Implement drag-and-drop mechanics for piece movement
- [ ] Display skipping chess move when no valid moves available

## Connectivity System (Row Clearing ✓ Implemented on Backend)

- [ ] Visualize continuous paths from cells to king
- [ ] Animate orphaned pieces returning to home zone
- [ ] Represent island tracking with visual distinctions
- [ ] Show island splits and merges with animations
- [ ] Visualize row clearing when 8 cells in a line are filled
- [ ] Exempt safe home zones from row clearing
- [ ] Animate cells reconnecting to different kings when islands change

## Asynchronous Turn System (Difficulty-based Timing ✓ Implemented on Backend)

- [ ] Display turn phase indicator (tetromino or chess move)
- [ ] Implement difficulty-based turn timers:
  - [ ] Easy computer players (15s timer)
  - [ ] Medium computer players (10s timer)
  - [ ] Hard computer players (5s timer)
  - [ ] Human players (10s minimum)
- [ ] Visualize different players in different turn phases simultaneously
- [ ] Indicate player's own turn vs. opponents' turns
- [ ] Display upcoming tetromino queue
- [ ] Show turn cycle: tetromino placement → chess move → next tetromino

## Player Pause System (✓ Implemented on Backend)

- [ ] Implement pause/resume controls with 15-minute countdown
- [ ] Visualize paused players with grayed-out pieces
- [ ] Show protection of pieces and cells during pause
- [ ] Display warnings before automatic timeout
- [ ] Animate main island removal after timeout
- [ ] Visualize orphaned pieces returning to home zone after timeout
- [ ] Show home zone expansion if needed for returning pieces

## Piece Acquisition (✓ Implemented on Backend)

- [ ] Implement Solana wallet connection UI
- [ ] Create piece purchase interface with correct pricing:
  - [ ] Pawn: 0.1 SOL
  - [ ] Rook/Knight/Bishop: 0.5 SOL
  - [ ] Queen: 1.0 SOL
  - [ ] Kings (disabled/unavailable)
- [ ] Show transaction status and confirmation
- [ ] Visualize new pieces being added to home zone
- [ ] Display purchase history and available balance
- [ ] Represent 50% fee transfer upon king capture

## Event Visualization

- [ ] Create row clearing animation
- [ ] Implement home zone degradation effects
- [ ] Design king capture ceremony
- [ ] Visualize orphaned pieces returning to home zone
- [ ] Animate island splits and merges
- [ ] Show home zone expansion
- [ ] Represent piece ownership transfers
- [ ] Visualize board expansion

## User Interface

- [ ] Display player list with status indicators
- [ ] Show time remaining for paused players
- [ ] Visualize home zone status and warnings
- [ ] List available pieces and purchase options
- [ ] Display score and captured pieces
- [ ] Implement camera controls for player and spectator views
- [ ] Create Russian historical sky theme
- [ ] Add visual polish and environmental effects

## Computer Player Difficulty UI

- [ ] Create visual indicators for different difficulty levels
- [ ] Implement difficulty selection UI when adding computer players
- [ ] Display expected move timing for each difficulty
- [ ] Use distinct visual styles based on difficulty level
- [ ] Show current difficulty level in player status panel
- [ ] Allow changing difficulty for existing computer players (if supported by backend)

## Networking

- [ ] Handle all game events via Socket.io:
  - [ ] homeZoneDegraded
  - [ ] homeZoneRemoved
  - [ ] playerPaused
  - [ ] playerResumed
  - [ ] playerPauseTimeout
  - [ ] piecePurchased
  - [ ] piecePurchaseFailed
  - [ ] islandSplit
  - [ ] islandMerged
  - [ ] gameStarted
  - [ ] playerPausedTimeout
  - [ ] kingCaptured
  - [ ] ownershipTransferred
  - [ ] rowCleared
  - [ ] turnStarted
  - [ ] turnEnded
  - [ ] pawnPromoted
  - [ ] difficultyChanged
- [ ] Implement error handling and reconnection logic
- [ ] Ensure proper game state synchronization

## Testing Requirements

- [ ] Test tetromino Z-axis logic in all scenarios:
  - [ ] Disintegration at Z=1 with cell underneath
  - [ ] Attachment at Z=0 with adjacent cell and path to king
  - [ ] Falling through when no valid connection
- [ ] Verify pawn promotion after exactly 8 moves forward
- [ ] Test difficulty-based timing for all player types
- [ ] Validate row clearing with exactly 8 cells in a line
- [ ] Test king capture and ownership transfer
- [ ] Verify pause system protection and timeout

## Accessibility and Performance

- [ ] Implement keyboard controls
- [ ] Create high-contrast mode
- [ ] Add screen reader support
- [ ] Optimize rendering for large boards
- [ ] Implement performance monitoring
- [ ] Provide Canvas fallback for browsers without WebGL
- [ ] Create colorblind-friendly player distinctions 