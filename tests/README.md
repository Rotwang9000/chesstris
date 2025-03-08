# Chesstris Tests

This directory contains tests for the Chesstris game. The tests are organized by module to ensure the functionality of each component is working correctly.

## Running the Tests

To run all tests:

```bash
npm test
```

To run specific test groups:

```bash
# Run only service tests
npm run test:services

# Run only core game logic tests 
npm run test:core

# Generate test coverage report
npm run test:coverage
```

## Test Structure

The tests are organized as follows:

```
tests/
├── core/                  # Tests for core game logic
│   ├── gameState.test.js
│   ├── playerManager.test.js
│   └── tetrominoManager.test.js
├── services/              # Tests for database services
│   ├── GameStateService.test.js
│   ├── UserService.test.js
│   └── TransactionService.test.js
└── README.md              # This file
```

## Writing Tests

When writing tests, follow these guidelines:

1. **Keep tests small and focused**: Each test should test a single functionality.
2. **Use descriptive names**: Test names should clearly describe what is being tested.
3. **Follow AAA pattern**: Arrange, Act, Assert.
4. **Mock external dependencies**: Use sinon to mock external dependencies like databases.
5. **Isolate tests**: Each test should be independent of others.

Example:

```javascript
describe('UserService', () => {
  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      // Arrange - set up the test
      const userData = { username: 'test', password: 'password' };
      
      // Act - call the method being tested
      const result = await userService.registerUser(userData);
      
      // Assert - verify the result
      expect(result).to.have.property('token');
      expect(result.user).to.have.property('username', 'test');
    });
  });
});
```

## Setting Up Test Environment

Before running tests, make sure:

1. You have installed all development dependencies: `npm install`
2. Environment variables are properly set up (use `.env.test` for test-specific variables)
3. Test databases are available (tests use mocked databases by default)

## Generating Test Coverage Reports

Code coverage reports help identify untested parts of the codebase:

```bash
npm run test:coverage
```

This will generate a coverage report in the `coverage` directory. Open `coverage/index.html` in a browser to view the report. 