# Shaktris Test Migration Guide

## Migrating from Chai/Sinon to Jest

The Shaktris codebase is transitioning from Chai/Sinon to Jest for testing. This document explains the process and provides guidance for handling test issues.

## Why Migrate?

Jest provides:
- An all-in-one testing solution with assertions, mocking, and coverage
- Better integration with modern JavaScript/ES modules
- Simpler test setup and configuration
- Improved performance and parallelization

## Migration Tools

We've created several tools to help with the migration:

1. **Individual Test Converter**: `node scripts/convert-tests.js <file-path>`
   - Converts a single test file from Chai/Sinon to Jest syntax
   - Creates a new file with ".jest.js" extension

2. **Bulk Test Converter**: `node scripts/convert-all-tests.js`
   - Converts all test files in the project
   - Creates ".jest.js" versions of each file

3. **Jest Helpers**: `tests/jest-helpers.js`
   - Provides custom matchers that mimic Chai behavior
   - Includes functions for creating test proxies similar to Sinon

## Common Conversions

### Chai to Jest Assertions

| Chai                          | Jest                           |
|-------------------------------|--------------------------------|
| `expect(x).to.be.true`        | `expect(x).toBe(true)`         |
| `expect(x).to.be.false`       | `expect(x).toBe(false)`        |
| `expect(x).to.equal(y)`       | `expect(x).toBe(y)`            |
| `expect(x).to.deep.equal(y)`  | `expect(x).toEqual(y)`         |
| `expect(x).to.have.property(y)` | `expect(x).toHaveProperty(y)` |
| `expect(x).to.include(y)`     | `expect(x).toContain(y)`       |
| `expect(x).to.exist`          | `expect(x).toBeDefined()`      |
| `expect(x).to.be.null`        | `expect(x).toBeNull()`         |
| `expect(x).to.be.undefined`   | `expect(x).toBeUndefined()`    |

### Sinon to Jest Mocking

| Sinon                           | Jest                                |
|---------------------------------|-------------------------------------|
| `sinon.stub().returns(x)`       | `jest.fn().mockReturnValue(x)`      |
| `sinon.stub().resolves(x)`      | `jest.fn().mockResolvedValue(x)`    |
| `sinon.stub().rejects(x)`       | `jest.fn().mockRejectedValue(x)`    |
| `sinon.spy()`                   | `jest.fn()`                         |
| `stub.calledWith(x)`            | `mock.toHaveBeenCalledWith(x)`      |
| `stub.calledOnce`               | `expect(mock).toHaveBeenCalledTimes(1)` |
| `stub.called`                   | `expect(mock).toHaveBeenCalled()`   |
| `stub.notCalled`                | `expect(mock).not.toHaveBeenCalled()` |

### Timing and Clocks

| Sinon                           | Jest                                |
|---------------------------------|-------------------------------------|
| `sinon.useFakeTimers()`         | `jest.useFakeTimers()`              |
| `clock.tick(ms)`                | `jest.advanceTimersByTime(ms)`      |
| `clock.restore()`               | `jest.useRealTimers()`              |

## Module Import Changes

- Replace ES module imports with CommonJS requires
- Use Jest's globals directly: `const { expect } = require('@jest/globals')`

## Best Practices

1. **Modularize tests**: Break large test files into smaller, focused test files
2. **Use Jest helpers**: Import the helpers for custom assertions
3. **Match implementation**: Ensure mocks match the actual implementation
4. **Fix one file at a time**: Prioritize critical services and utilities

## Test Classification System

When migrating tests, classify them into these categories to help prioritize efforts:

### Importance Level

1. **Critical** - Core gameplay mechanics that directly affect player experience:
   - Tetromino placement and collision detection
   - Chess movement validation
   - Game state transitions
   - Row clearing mechanics
   - Island connectivity

2. **Important** - Features that significantly impact gameplay but aren't core mechanics:
   - Player management
   - Turn handling
   - Computer player difficulty
   - Board manipulation

3. **Nice-to-have** - Features that enhance the experience but aren't critical:
   - Sound effects
   - Animations
   - UI components
   - Visual effects

### Migration Difficulty

1. **Easy** - Self-contained modules with few dependencies:
   - Utility functions
   - Helper classes
   - Stand-alone modules

2. **Medium** - Modules with some dependencies that can be easily mocked:
   - Sound manager
   - UI components
   - Input handlers

3. **Hard** - Heavily integrated modules with complex dependencies:
   - Game state manager
   - Chess/tetromino integration
   - Network-dependent components

## Mocking Strategy

Creating effective mocks is crucial for testing components with complex dependencies. Follow these guidelines:

### When to Use Mocks

- When dependencies are complex or slow
- When testing edge cases that are hard to reproduce with real implementations
- When dependencies have side effects (network calls, file system, etc.)
- When you want to test a component in isolation

### Mock Implementation Guidelines

1. **Match the API** - Ensure your mock has the same methods and properties as the original
2. **Minimal Implementation** - Only implement what's needed for the test
3. **Capture Interactions** - Use Jest's mock functions to capture and verify calls
4. **Default Returns** - Provide sensible default return values
5. **Reuse Mocks** - Create standard mocks for commonly used components

### Example: Good Mock Implementation

```javascript
// Example of a good GameManager mock
const mockGameManager = {
  createGame: jest.fn().mockReturnValue({ gameId: 'test-game', success: true }),
  getGame: jest.fn().mockReturnValue({ 
    id: 'test-game', 
    players: {}, 
    board: [], 
    status: 'waiting' 
  }),
  addPlayer: jest.fn().mockReturnValue({ success: true, playerId: 'player-1' }),
  startGame: jest.fn().mockReturnValue({ success: true }),
  // Only implement methods that will be used in the test
};
```

## Handling ES Module Imports in Jest

One of the most common issues when migrating to Jest is handling ES module imports correctly. Here are key patterns to follow:

### Top-Level Imports

Jest requires imports to be at the top level of the file, not inside describe blocks or functions:

```javascript
// CORRECT:
import { functionToTest } from '../src/module.js';

describe('Module tests', () => {
  test('should work', () => {
    // Test code here
  });
});

// INCORRECT:
describe('Module tests', () => {
  import { functionToTest } from '../src/module.js'; // Will cause syntax error
  
  test('should work', () => {
    // Test code here
  });
});
```

### Dynamic Imports

If you need to import modules after mocks are set up, use dynamic imports:

```javascript
describe('Module with dependencies', () => {
  let moduleToTest;
  
  beforeAll(async () => {
    // Set up mocks first
    jest.mock('../src/dependency.js');
    
    // Then import the module
    const module = await import('../src/module-to-test.js');
    moduleToTest = module.default || module;
  });
  
  test('should work', () => {
    // Test code here
  });
});
```

### Mocking External Modules

Use Jest's manual mocking system for consistent module mocking:

```javascript
// Create __mocks__ directory next to the actual module
// __mocks__/external-module.js
export default {
  methodA: jest.fn().mockReturnValue('mocked value'),
  methodB: jest.fn()
};

// Then in your test
jest.mock('external-module');
import externalModule from 'external-module';
```

## Test Conversion Workflow

Follow this step-by-step process when converting a test from Chai/Sinon to Jest:

1. **Analyze the test file**
   - Identify dependencies and imports
   - Note assertions and mocking patterns
   - Evaluate test scope and complexity

2. **Create mock implementations**
   - Create mocks for dependencies
   - Store reusable mocks in a dedicated location

3. **Restructure imports**
   - Move ES module imports to the top level
   - Use dynamic imports if necessary

4. **Convert assertions**
   - Replace Chai assertions with Jest equivalents
   - Update chain assertions to use Jest's matchers

5. **Update mock function calls**
   - Replace Sinon stubs/spies with Jest mock functions
   - Update verification calls to use Jest's expect syntax

6. **Validate the test**
   - Run the test to verify it works
   - Address any errors or failed assertions
   - Check for proper cleanup in afterEach/afterAll

7. **Document decisions**
   - Note any compromises or special handling
   - Update the skipped tests log if applicable

## Skip Log Guidelines

When a test cannot be converted directly, proper documentation in the skip log is essential:

### Required Information

- **Test filename**: The full path to the skipped test
- **Classification**: Critical/Important/Nice-to-have
- **Difficulty**: Easy/Medium/Hard
- **Reason for skipping**: Detailed explanation
- **Should be revisited**: Yes/No
- **Alternative coverage**: Is this functionality tested elsewhere?
- **Mocked components**: List of components that were mocked rather than using real implementations

### Example Skip Log Entry

```
| tests/complex-feature.test.js | Critical | Hard | API changes in underlying module | Yes | Partially covered by integration tests | GameManager, BoardManager |
```

### When to Skip vs. When to Mock

- **Skip when**: 
  - The feature is deprecated
  - The API has completely changed
  - The test tests implementation details that are no longer relevant
  - The feature will be replaced soon

- **Mock when**:
  - The feature is important but has complex dependencies
  - The real implementation would make tests slow or flaky
  - You need to test specific edge cases
  - The dependencies have side effects

## Dealing with Failing Tests

Some tests may fail after conversion for various reasons:

1. **Missing implementation**: Test expects functionality that doesn't exist yet
2. **API changes**: The tested APIs have changed since tests were written
3. **Module issues**: ES module vs CommonJS conflicts 
4. **Import path issues**: Incorrect paths or file structure changes

For each failing test, you should:

1. Check if the tested functionality is still relevant
2. Verify the implementation matches the test's expectations
3. Update test expectations if API changes have occurred
4. Consider skipping tests for unimplemented features with `test.skip`

## Getting Help

If you're encountering issues with the test migration, please:

1. Check the Jest documentation: https://jestjs.io/docs/getting-started
2. Review the conversion patterns in `scripts/convert-tests.js`
3. Look at successfully converted test files as examples

## Next Steps

Once all tests are converted, we'll need to:

1. Replace original .test.js files with the .jest.js versions
2. Update CI/CD pipelines to run with Jest
3. Consider adding new tests for untested functionality 



# Comprehensive Test Assessment

Here's a complete list of all tests in the Shaktris project with ratings on their necessity:

## Core Gameplay Tests (Critical)

| Test File | Purpose | Necessity Rating (1-5) | Comments |
|-----------|---------|------------------------|----------|
| tests/gameplay/tetrominoPlacement.test | Tetromino placement logic | 5 | Critical for core gameplay |
| tests/gameplay/chessMovement.test | Chess movement rules | 5 | Critical for core mechanics |
| tests/gameplay/rowClearing.test | Row clearing mechanics | 5 | Essential game rule |
| tests/gameplay/kingCapture.test | King capture mechanics | 5 | Key victory condition |
| tests/gameplay/islandConnectivity.test | Connection to king validation | 5 | Fundamental rule |
| tests/gameplay/pawnPromotion.test | Pawn promotion after 8 moves | 4 | Important game feature |
| tests/gameplay/homeZoneDegradation.test | Home zone mechanics | 4 | Key defensive feature |
| tests/gameplay/turnSystem.test | Turn sequence validation | 4 | Core gameplay cycle |
| tests/gameplay/pathToKing.test | Path verification | 4 | Critical for piece placement |
| tests/gameplay/orphanedPieces.test | Orphaned piece handling | 4 | Needed for row clearing |

## Player Management Tests (Important)

| Test File | Purpose | Necessity Rating (1-5) | Comments |
|-----------|---------|------------------------|----------|
| tests/core/playerManager.test | Player management | 4 | Critical for multiplayer |
| tests/computer-player-difficulty.test | Computer player difficulty | 3 | Important for solo play |
| tests/gameplay/pauseTimeout.test | Player pause system | 3 | Nice for multiplayer UX |
| tests/gameplay/pieceAcquisition.test | Buying new pieces | 3 | Important gameplay feature |
| tests/gameplay/playerPause.test | Player pause mechanics | 3 | Useful multiplayer feature |

## State Management Tests (Important)

| Test File | Purpose | Necessity Rating (1-5) | Comments |
|-----------|---------|------------------------|----------|
| tests/core/gameState.test | Game state management | 5 | Critical for all gameplay |
| tests/server/game/GameManager.test | Game management | 4 | Important for multiplayer |
| tests/server/ChessManager.test | Chess management | 4 | Core rules management |
| tests/server/TetrominoManager.test | Tetromino management | 4 | Core rules management |
| tests/core/tetrominoManager.test | Tetromino generation | 4 | Key gameplay component |

## User Interface Tests (Less Critical)

| Test File | Purpose | Necessity Rating (1-5) | Comments |
|-----------|---------|------------------------|----------|
| tests/uiManager.test | UI management | 3 | Good for UX consistency |
| tests/gameRenderer.test | Game rendering | 3 | Important for visuals |
| tests/animations.test | Animation system | 2 | Enhances experience |
| tests/animator.test | Animation scheduling | 2 | Visual polish |
| tests/soundManager.test | Sound management | 2 | Enhances experience |

## Security Tests (Important)

| Test File | Purpose | Necessity Rating (1-5) | Comments |
|-----------|---------|------------------------|----------|
| tests/security/inputValidation.test | Input validation | 4 | Critical for security |
| tests/security/authentication.test | Authentication | 4 | Important for accounts |
| tests/security/antiCheat.test | Anti-cheat mechanisms | 3 | Good for fair play |

## Service Tests (Supporting)

| Test File | Purpose | Necessity Rating (1-5) | Comments |
|-----------|---------|------------------------|----------|
| tests/services/GameStateService.test | Game state service | 3 | Backend integration |
| tests/services/UserService.test | User management | 3 | Account features |
| tests/services/AnalyticsService.test | Analytics tracking | 2 | Nice for metrics |
| tests/services/TransactionService.test | Purchase handling | 3 | Important for monetization |
| tests/utils/sponsors.test | Sponsor system | 2 | Monetization feature |

## API and Example Tests (Optional)

| Test File | Purpose | Necessity Rating (1-5) | Comments |
|-----------|---------|------------------------|----------|
| tests/api-endpoints-test.js | API functionality | 3 | External integration |
| tests/api-test.js | Simple API tests | 2 | Basic API verification |
| tests/examples/example.test | Example tests | 1 | Educational purpose only |

## Refactored Approach to Testing

Rather than trying to fix all these tests at once, I recommend:

1. **Focus on critical gameplay tests first** (rated 4-5)
2. **Use simple Node.js test approach** for the most important ones
3. **Create minimal mocks** only when absolutely necessary
4. **Skip tests for purely cosmetic features** until core gameplay is solid

### Implementation Strategy:

1. Start with 5-8 essential tests covering core mechanics
2. Use the computer-difficulty-test.js pattern (plain Node.js tests)
3. Document skipped tests in the log with clear reasoning
4. Once core tests pass, gradually add more as needed

This approach aligns with your goal of focusing on game completion rather than getting bogged down in test configuration.
