# GameManager Refactoring Plan

## Overview

We need to break down the large `GameManager.js` file into multiple smaller, focused modules to improve maintainability, reduce file size, and make it easier to test individual components.

## Module Structure

1. **GameManager.js** - Core class that orchestrates and delegates to other modules
2. **BoardManager.js** - Handles board creation, expansion, and cell operations
3. **TetrominoManager.js** - Handles tetromino placement, validation, and related logic
4. **ChessManager.js** - Handles chess piece movement, validation, and related logic
5. **PlayerManager.js** - Handles player registration, tracking, and management
6. **IslandManager.js** - Handles island connectivity, splitting, and joining logic
7. **ComputerPlayerManager.js** - Handles computer player operations
8. **GameUtilities.js** - Contains shared utility functions
9. **Constants.js** - Contains game constants and configuration values

## Module Responsibilities

### GameManager.js
- Initialization and game creation/destruction
- Public API methods for client interaction
- Delegating to specialized managers
- Maintaining core game state (games Map)

### BoardManager.js
- Board creation and expansion
- Row clearing logic
- Board validation
- Island tracking

### TetrominoManager.js
- Tetromino shape definitions
- Tetromino rotation logic
- Tetromino placement validation
- Tetromino falling and collision detection using the XZ-Y coordinate system

### ChessManager.js
- Chess piece movement rules
- Chess piece validation
- Pawn promotion
- King capture logic

### PlayerManager.js
- Player registration and removal
- Player state management
- Home zone creation and management
- Player pause system

### IslandManager.js
- Island detection and tracking
- Island merging and splitting
- Path-to-king validation
- Island handling during row clearing

### ComputerPlayerManager.js
- Computer player registration
- API token management
- Computer player move generation
- External computer player interface

### GameUtilities.js
- Random ID generation
- Color generation
- Position generation
- Other shared utility functions

### Constants.js
- Game configuration values
- Default settings
- Piece prices
- Timing constants

## Implementation Approach

1. **Identify Dependencies**: Map out dependencies between methods to organize them into coherent modules
2. **Create Base Classes**: Start with empty class structures and constants files
3. **Move Code in Stages**: Transfer methods group by group, updating dependencies
4. **Update Imports/Exports**: Ensure proper module exports and imports
5. **Add Tests**: Create unit tests for each module
6. **Validate**: Ensure game functionality remains intact after refactoring

## Testing Strategy

1. Create test fixtures for each module
2. Write unit tests for core functionality in each module
3. Create integration tests for interactions between modules
4. Implement end-to-end tests for complete game flows

## Backward Compatibility

Maintain the same public API to ensure compatibility with existing client code:
- All public methods of GameManager should remain available
- Internal refactoring should be transparent to external code

## XZ-Y Coordinate System Validation

Throughout the refactoring, ensure that:
1. All board access uses `board[z][x]` instead of `board[y][x]`
2. Method parameters are consistently ordered as (x, z, y) where applicable
3. All coordinate references align with the XZ-Y system

## Benefits

1. **Maintainability**: Smaller files with focused responsibilities
2. **Testability**: Easier to write unit tests for specific functionality
3. **Performance**: Potential for improved performance with better organization
4. **Collaboration**: Multiple developers can work on different modules
5. **Extensibility**: Easier to extend specific aspects of the game 