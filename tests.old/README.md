# Chesstris Tests

This directory contains tests for the Chesstris game. The tests are organized by module to ensure the functionality of each component is working correctly.

## Current Test Status

We currently have functional tests for:

- **Sound Manager**: 17 passing tests covering initialization, sound loading, playback, volume control, music management, and error handling
- **UI Manager**: Tests for component management, UI elements, and event handling (in progress)
- **Game State Manager**: Tests for state transitions and game logic (in progress)

We're actively developing and improving our test suite as we stabilize the codebase.

## Running the Tests

To run all tests:

```bash
npm test
```

To run specific tests files:

```bash
# Run only sound manager tests
npm test tests/soundManager.test.js
```

## Test Structure

The tests are organized as follows:

```
tests/
├── uiManager.test.js      # Tests for the UI manager
├── soundManager.test.js   # Tests for the sound system
├── gameState.test.js      # Tests for game state management
├── setup.js               # Common setup for all tests
├── mocks/                 # Mock implementations for testing
└── README.md              # This file
```

## Writing Tests

When writing tests, follow these guidelines:

1. **Keep tests small and focused**: Each test should test a single functionality.
2. **Use descriptive names**: Test names should clearly describe what is being tested.
3. **Follow AAA pattern**: Arrange, Act, Assert.
4. **Mock external dependencies**: Use Jest mocks to mock external dependencies.
5. **Isolate tests**: Each test should be independent of others.

Example:

```javascript
describe('SoundManager', () => {
  describe('playSound', () => {
    it('should play a sound successfully', async () => {
      // Arrange - set up the test
      await soundManager.loadSound('test', 'path/to/sound.mp3');
      
      // Act - call the method being tested
      const result = soundManager.play('test');
      
      // Assert - verify the result
      expect(result).toBe(true);
      expect(soundManager.getSound('test').play).toHaveBeenCalled();
    });
  });
});
```

## Setting Up Test Environment

Before running tests, make sure:

1. You have installed all development dependencies: `npm install`
2. The Jest test environment is properly configured in `tests/setup.js`
3. Mocks are available for any external dependencies

## Troubleshooting Tests

If you encounter issues with the tests:

1. Check the Jest configuration in `jest.config.js`
2. Verify that all necessary mocks are properly implemented in `tests/setup.js`
3. Look for any environment-specific issues (DOM simulation, localStorage access, etc.)

## Future Test Development

Our testing strategy going forward will focus on:

1. **Expanding Sound Manager Tests**:
   - Add tests for edge cases and error conditions
   - Test integration with other game components

2. **Improving UI Manager Tests**:
   - Complete component rendering tests
   - Test event handling and state updates
   - Add tests for UI animations and transitions

3. **Completing Game State Manager Tests**:
   - Test all game state transitions
   - Validate chess move rules
   - Test tetromino placement logic
   - Ensure proper handling of multiplayer scenarios

4. **Test Infrastructure Improvements**:
   - Enhance mocking to better simulate browser environment
   - Create reusable test fixtures for common game states
   - Implement snapshot testing for UI components
   - Add visual regression testing for 3D components

By following this plan, we aim to achieve robust test coverage for all critical game components while maintaining flexibility for ongoing development. 