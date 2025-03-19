# Shaktris Frontend Component Model

This document outlines the component architecture for the Shaktris frontend, providing a blueprint for developers to follow when implementing or refactoring the user interface.

## Component Hierarchy

```
App
├── GameContainer
│   ├── GameBoard
│   │   ├── BoardGrid
│   │   ├── HomeZones
│   │   ├── ChessPieces
│   │   └── Tetrominos
│   ├── PlayerControls
│   │   ├── TetrominoPreview
│   │   ├── TetrominoControls
│   │   ├── ChessMoveIndicator
│   │   └── PauseControl
│   ├── GameInfo
│   │   ├── PlayerList
│   │   ├── ScoreBoard
│   │   ├── GameTimer
│   │   └── GameMessages
│   └── CameraControls
├── ShopPanel
│   ├── PieceShop
│   ├── WalletStatus
│   └── TransactionHistory
├── SettingsPanel
│   ├── DisplaySettings
│   ├── SoundSettings
│   └── ControlSettings
└── ChatPanel
    ├── ChatLog
    └── ChatInput
```

## Component Specifications

### Core Components

#### GameBoard
- **Responsibility**: Renders the 3D board and all game elements
- **State**: Board dimensions, cell states
- **Subcomponents**: BoardGrid, HomeZones, ChessPieces, Tetrominos
- **Technologies**: Three.js

#### PlayerControls
- **Responsibility**: Provides user controls for game actions
- **State**: Current tetromino, rotation, position, valid moves
- **Subcomponents**: TetrominoPreview, TetrominoControls, ChessMoveIndicator, PauseControl
- **Technologies**: React + Three.js for previews

#### GameInfo
- **Responsibility**: Displays game status and player information
- **State**: Player status, scores, time remaining
- **Subcomponents**: PlayerList, ScoreBoard, GameTimer, GameMessages
- **Technologies**: React

### UI Components

#### PauseControl
- **Responsibility**: Allows players to pause/resume their game
- **State**: Paused status, remaining pause time
- **Props**: 
  - `isPaused` (boolean)
  - `remainingPauseTime` (number in seconds)
  - `onPauseToggle` (function)
- **Technologies**: React

#### TetrominoPreview
- **Responsibility**: Shows the next tetromino in the queue
- **State**: Next tetromino shape and colour
- **Props**:
  - `nextTetromino` (object with shape and colour data)
- **Technologies**: Three.js or Canvas

#### ChessMoveIndicator
- **Responsibility**: Highlights valid chess moves
- **State**: Selected piece, valid moves
- **Props**:
  - `selectedPiece` (object with piece data)
  - `validMoves` (array of valid move positions)
- **Technologies**: Three.js overlay or DOM elements

### Shop Components

#### PieceShop
- **Responsibility**: Interface for purchasing additional chess pieces
- **State**: Available pieces, prices, player's balance
- **Props**:
  - `availablePieces` (array of purchasable pieces)
  - `playerBalance` (number)
  - `onPurchase` (function)
- **Technologies**: React + Solana wallet integration

#### WalletStatus
- **Responsibility**: Displays wallet connection status and balance
- **State**: Connection status, SOL balance
- **Props**:
  - `isConnected` (boolean)
  - `balance` (number)
  - `walletAddress` (string)
- **Technologies**: React + Solana wallet SDK

## Data Flow

1. **Socket Events → Game State**: Server events update the central game state
2. **Game State → Components**: Component props are derived from game state
3. **User Input → Game Actions**: User interactions dispatch actions to the game state
4. **Game Actions → Socket Events**: Actions are sent to the server via sockets

## Implementation Strategy

### Phase 1: Core Rendering
- Implement GameBoard with basic 3D rendering
- Set up camera controls and board visualization
- Create placeholder components for UI elements

### Phase 2: Game State Integration
- Connect components to the game state via socket events
- Implement tetromino falling and placement logic
- Implement chess piece movement and validation

### Phase 3: UI Enhancement
- Add visual polish to all UI components
- Implement animations for game events
- Add sound effects and background music

### Phase 4: Wallet Integration
- Connect to Solana wallet
- Implement piece purchasing functionality
- Add transaction history and management

## Technical Considerations

### Performance Optimization
- Use object pooling for frequently created/destroyed objects
- Implement level-of-detail rendering for large boards
- Use instanced rendering for similar objects (e.g., tetromino blocks)

### Accessibility
- Include high-contrast mode
- Add keyboard controls alongside mouse interactions
- Implement screen reader compatibility

### Cross-Browser Compatibility
- Test on Chrome, Firefox, Safari, and Edge
- Provide Canvas fallback for browsers without WebGL
- Use responsive design for different screen sizes

## Style Guide

### Visual Style
- **Theme**: Russian historical sky castle
- **Colour Palette**: 
  - Primary: #2C3E50 (Dark Blue)
  - Secondary: #E74C3C (Red)
  - Accent: #F1C40F (Yellow)
  - Background: #ECF0F1 (Light Grey)
- **Typography**:
  - Headings: "Playfair Display" (serif)
  - Body: "Roboto" (sans-serif)

### Animation Guidelines
- Use easing functions for smooth transitions
- Keep animations under 300ms for UI elements
- Use more elaborate animations for game events (500-1000ms)
- Provide option to reduce animations for performance

## Testing Strategy

- **Unit Tests**: Test individual component rendering and state management
- **Integration Tests**: Test component interactions and data flow
- **Visual Regression Tests**: Ensure UI consistency across updates
- **Performance Tests**: Measure FPS and memory usage with large game states

## Documentation

Each component should include:
- Purpose and usage examples
- Props and state documentation
- Performance considerations
- Event handlers and callbacks 