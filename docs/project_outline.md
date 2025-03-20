## Testing Strategy

### Current Testing Status

- ✅ **Sound Manager**: 17 tests passing - API and volume control functionality
- ✅ **Game Renderer**: 11 tests passing - Core functions, UI updates, game state management, board visualization
- 🔄 **UI Manager**: Test suite being expanded
- 🔄 **Game State Manager**: Test suite being expanded

### Recent Improvements

- Fixed container references in game renderer initialization
- Properly parameterized container usage throughout the rendering pipeline
- Exported UI update functions for better testability
- Added error handling for texture loading and UI updates
- Implemented missing updateBoardVisualization and updateGameEntities functions
- Added robust error handling in setGameState to prevent crashes
- Improved test mocking for the THREE.js environment

### Unit Testing

The project employs a comprehensive unit testing strategy using Jest. Key aspects of the testing approach include:

- **Module-level Tests**: Each major utility module has dedicated test files in the `tests` directory
- **Mock Dependencies**: External dependencies are mocked to ensure tests are isolated and deterministic
- **Code Coverage**: Test coverage is tracked using Jest's coverage tools to identify untested code paths
- **CI Integration**: Tests are automatically run as part of the continuous integration process

### Test Structure

The test files follow a consistent structure:

```
tests/
├── animator.test.js     - Tests for animation scheduling and sequencing
├── animations.test.js   - Tests for game visual effects and transitions
├── gameRenderer.test.js - Tests for 3D and 2D rendering capabilities
├── gameState.test.js    - Tests for game state management
├── setup.js             - Global test setup and mocks
├── soundManager.test.js - Tests for audio playback and control
└── uiManager.test.js    - Tests for UI component management
```

### Running Tests

Tests can be run using npm scripts:

- `npm test` - Run all tests
- `npm test tests/soundManager.test.js` - Run specific test file
- `npm run test:watch` - Run tests in watch mode for development
- `npm run test:coverage` - Generate coverage reports
- `npm test -- --coverage tests/gameRenderer.test.js` - Run coverage for specific file

### Testing Guidelines

When implementing new features, developers should:

1. Add appropriate unit tests for new functionality
2. Ensure tests cover both expected usage and error handling
3. Mock external dependencies to keep tests fast and isolated
4. Maintain or improve the overall code coverage 

### Fixed Runtime Errors

Several critical runtime errors were addressed in the game renderer:

1. **Missing Function: `updateBoardVisualization`** - This function was being called but was not defined, causing the game loop to crash. We implemented a robust version that:
   - Updates the board cells based on the current game state
   - Creates new cells as needed or updates existing ones
   - Handles cell properties like height, floating animation, and highlights
   - Includes proper error handling to prevent crashes

2. **Missing Function: `updateGameEntities`** - This function was being called but was not defined. We implemented functionality to:
   - Update tetrominos based on the current game state
   - Handle ghost piece visualization
   - Manage chess piece visualization, updating, and removal
   - Includes proper error handling to prevent crashes

3. **Error Handling: `setGameState`** - Added comprehensive error handling to prevent crashes when:
   - The 3D rendering environment is not fully initialized
   - Required functions are missing
   - The game state is invalid or missing required properties 