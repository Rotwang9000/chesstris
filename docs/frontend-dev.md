# Frontend Developer Guide for Shaktris

## Overview

This guide provides essential information for frontend developers working on the Shaktris project. Shaktris is a multiplayer game combining elements of chess and Tetris with a 3D/2D rendering system.

## Project Architecture

The frontend is structured as follows:

1. **Core Game Logic**: Implemented in JavaScript modules in `public/js/core/`
2. **Rendering System**: 
   - 3D rendering via Three.js in `public/js/utils/gameRenderer.js`
   - 2D fallback rendering via Canvas API
3. **Networking**: Socket.io implementation in `public/js/utils/network.js`
4. **React Components**: Limited React components in `client/src/components/`
5. **Utility Modules**: Various utility functions in `public/js/utils/`

## Core Game Mechanics

The backend has successfully implemented the following core gameplay mechanics:

### 1. Board and Home Zone Management
- Each player has a unique 8×2 home zone where chess pieces initially reside
- Home zones are randomly placed on the board within 8-12 squares of another home zone
- Empty home zones degrade over time (implementation complete in backend)
- The board dynamically expands as players add pieces
- Home zones may expand to accommodate returning pieces when needed

### 2. Tetromino Placement
- **✓ FULLY IMPLEMENTED**: Z-axis logic for tetromino placement:
  - When a tetromino reaches Z=1, if there's a cell underneath, it explodes/disintegrates
  - When a tetromino reaches Z=0 with an adjacent cell with path to king, it sticks and becomes cells
  - Otherwise it continues falling and fades away
- Tetrominos only stick if at least one block lands adjacent to an existing cell with a path to the player's king
- Tetrominos are used to build pathways toward opponents

### 3. Chess Movement
- After placing a tetromino, players can move one chess piece
- **✓ FULLY IMPLEMENTED**: Pawn promotion to knight after 8 moves forward
- Captured pieces are removed from the board
- King capture mechanics include transferring ownership of the defeated player's pieces
- Captor receives 50% of the SOL spent by the defeated player on additional pieces

### 4. Connectivity Rules
- All cells must maintain a continuous path back to the player's king
- Orphaned pieces (those without a path to king) are returned to the home zone
- The "Island Connectivity System" tracks and manages groups of cells owned by players
- **✓ FULLY IMPLEMENTED**: Row clearing - any 8 cells in a line are cleared (not requiring full rows)
- Islands can split and merge based on board changes
- Protected home zones are excluded from row clearing
- Orphaned pieces drop back toward player's king when islands are split

### 5. Player Pause System
- **✓ FULLY IMPLEMENTED**: Players can pause for up to 15 minutes
- During pause, pieces can't be captured and cells won't be cleared
- After timeout, penalties are applied including removing the player's main island
- Orphaned pieces are returned to the home zone
- Home zones are protected during pauses even if empty

### 6. Piece Acquisition
- **✓ FULLY IMPLEMENTED**: Players can purchase additional pieces using SOL with correct pricing:
  - Pawn: 0.1 SOL
  - Rook/Knight/Bishop: 0.5 SOL
  - Queen: 1.0 SOL
  - Kings cannot be purchased
- New pieces are placed in the player's home zone

### 7. Asynchronous Turns
- **✓ FULLY IMPLEMENTED**: Each player has their own independent turn cycle
- Players don't wait for other players' turns
- **✓ FULLY IMPLEMENTED**: Minimum turn timing based on difficulty:
  - Easy computer players: 15 seconds
  - Medium computer players: 10 seconds
  - Hard computer players: 5 seconds
  - Human players: 10-second minimum
- Turn consists of placing a tetromino followed by moving a chess piece
- Multiple players can be in different phases of their turns simultaneously

## Frontend Implementation Requirements

### 1. 3D Game Board Visualization
- Implement a 3D board visualization where:
  - X-Z plane is the chess board (X for horizontal, Z for depth)
  - Y-axis is used for tetromino falling animation (height)
  - Use standard Three.js coordinate system for consistency
- Use Y-axis for tetromino falling animation, specifically showing:
  - Tetrominos falling from above along Y-axis
  - Disintegration at Y=1 when overlapping existing cells
  - Attachment at Y=0 when adjacent to existing cells
  - Continued falling when no valid connection
- The board should appear to float in the sky with a Russian historical theme
- Implement camera controls to allow spectating other players
- Provide visual distinction for home zones and their degradation states

### 2. Tetromino Interaction
- Show the next tetromino in a preview area
- Allow rotation and horizontal movement before placement
- Visualize valid placement areas (cells adjacent to existing pieces with path to king)
- Show falling animation along Z-axis with different behavior at Z=1 and Z=0
- Implement visual feedback for successful placement or disintegration
- Provide clear indication of path-to-king connectivity requirements

### 3. Chess Piece Movement
- Implement drag-and-drop for chess pieces
- Highlight valid movement options based on chess rules
- Provide visual cues for capture, path to king, and promotion
- Ensure clear ownership indication (color/style per player)
- Animate pawn-to-knight promotion after 8 moves with celebratory effect
- Include an indicator showing pawn's progress toward promotion (e.g., 5/8 moves)

### 4. Player Status UI
- Display current game status including:
  - Player list with active/paused status
  - Time remaining for paused players
  - Home zone status and degradation warnings
  - Available pieces and purchase options
  - Score/captured pieces
  - Current turn phase (tetromino or chess move)
  - Turn timer with difficulty-based timing indicators (easy/medium/hard)
  - Player difficulty level indicators for computer players

### 5. Event Visualization
- Implement visual effects for key game events:
  - Row clearing animation (when 8 cells in a line)
  - Home zone degradation (gradual visual decay)
  - King capture ceremony with ownership transfer visuals
  - Orphaned pieces returning to home zone
  - Island splits and merges
  - Home zone expansion when pieces return

### 6. Networking
- Use the existing Socket.io implementation in `public/js/utils/network.js`
- Handle game events including:
  - homeZoneDegraded
  - homeZoneRemoved
  - playerPaused
  - playerResumed
  - playerPauseTimeout
  - piecePurchased
  - piecePurchaseFailed
  - islandSplit
  - islandMerged
  - gameStarted
  - playerPausedTimeout
  - kingCaptured
  - ownershipTransferred
  - rowCleared
  - turnStarted
  - turnEnded
  - pawnPromoted
  - difficultyChanged

### 7. Pause/Resume Controls
- Use existing `PauseControl.jsx` component
- Show countdown timer for remaining pause time (15-minute limit)
- Provide visual indicators for paused players (grayed out pieces)
- Warn players before automatic timeout occurs
- Visualize pause protection for pieces and home zones

### 8. Wallet Integration
- Implement Solana wallet connection
- Create UI for piece purchases with correct pricing
- Show transaction status and confirmation
- Display purchase history and available balance
- Visualize reward transfers when kings are captured (50% of defeated player's spent SOL)

### 9. Asynchronous Turn System UI
- Implement turn phase indicator (tetromino or chess move)
- Display turn timer with difficulty-based minimum indicators:
  - Easy (15s): Longer visual indicator
  - Medium (10s): Standard visual indicator
  - Hard (5s): Shorter visual indicator
- Provide clear visual distinction between player's turn and opponents' turns
- Show upcoming tetromino queue
- Indicate when players can skip chess moves if no valid moves are available

### 10. Computer Player Difficulty Visualization
- Create visual indicators showing computer player difficulty levels
- Implement different animations/effects based on difficulty
- Display expected move timing information
- Show difficulty selection UI when adding computer players

## Technical Stack

The current implementation uses:
- **Frontend Framework**: Combination of vanilla JS and React components
- **3D Rendering**: Three.js
- **2D Fallback**: Canvas API
- **Networking**: Socket.io
- **Build System**: No specific bundler in place yet

## Development Workflow

1. Run `npm install` to install dependencies
2. Run `npm run dev` to start the development server
3. Make changes to the appropriate files
4. Test your changes in the browser at `http://localhost:3020`

## Testing Requirements

1. **Tetromino Z-axis Logic**: Test all scenarios for tetromino placement:
   - Disintegration at Z=1 when cell underneath
   - Attachment at Z=0 with adjacent cell and path to king
   - Falling through when no valid connection

2. **Pawn Promotion**: Verify pawn promotion after exactly 8 moves forward
   - Test counter implementation
   - Test direction-specific counting
   - Verify knight transformation animation

3. **Difficulty-based Timing**: Test all difficulty levels
   - Easy (15s): Computer moves slower
   - Medium (10s): Standard timing
   - Hard (5s): Computer moves faster
   - Human (10s minimum): Enforced minimum wait

4. **Row Clearing**: Test clearing with exactly 8 cells in a line
   - Verify that home zones are properly excluded
   - Test orphaned piece behavior after clearing

5. **King Capture**: Test the complete king capture ceremony
   - Verify piece ownership transfer
   - Test 50% fee reward transfer
   - Validate visual effects

## Next Steps

1. Complete the 3D board visualization with Z-axis behavior for tetrominos
2. Implement tetromino preview and placement with connectivity visualization
3. Enhance chess piece movement visualization and promotion animations
4. Develop comprehensive player status UI with difficulty indicators
5. Implement visual effects for game events and island connectivity
6. Connect to backend WebSocket API with complete event handling
7. Complete wallet integration with purchase and reward systems
8. Polish the user interface and environmental theme

## Resources

- Three.js Documentation: https://threejs.org/docs/
- Socket.io Documentation: https://socket.io/docs/
- Solana Web3.js Documentation: https://solana-labs.github.io/solana-web3.js/

---

The backend has implemented robust systems for game mechanics including island connectivity, pause functionality, piece acquisition and difficulty-based timing. Your frontend implementation should focus on making these systems intuitive and visually engaging for players while ensuring accurate representation of the game state.