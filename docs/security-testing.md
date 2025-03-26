# Security Testing in Shaktris

This document outlines the security testing approach and anti-cheat mechanisms implemented in Shaktris.

## Overview

Shaktris incorporates comprehensive security testing to ensure that the game is resistant to common attack vectors, including:

1. **Anti-cheat mechanisms** to prevent players from manipulating the game state
2. **Authentication security** to protect user accounts and sessions
3. **Input validation** to prevent code injection and other malicious inputs

## Test Suite Structure

The security test suite is located in the `tests/security` directory and consists of three main components:

### 1. Anti-Cheat Tests (`antiCheat.test.js`)

These tests verify that the game properly validates and rejects attempts to cheat, including:

- **Move Validation**: Ensures chess pieces can only move according to chess rules
- **Rate Limiting**: Prevents rapid-fire actions that could overwhelm the server
- **Game State Manipulation Prevention**: Blocks attempts to directly modify game state
- **Time-Based Validation**: Enforces turn timing rules and prevents time manipulation
- **Client Consistency Checks**: Verifies that client and server states match
- **Replay Attack Prevention**: Blocks attempts to replay previously valid actions

### 2. Authentication Tests (`authentication.test.js`)

These tests ensure that the authentication system correctly:

- **User Registration**: Validates user credentials during account creation
- **Authentication**: Properly authenticates users with valid credentials
- **Session Management**: Manages user sessions securely
- **Account Locking**: Implements account lockout after multiple failed attempts
- **API Security**: Prevents cross-player game state manipulation

### 3. Input Validation Tests (`inputValidation.test.js`)

These tests verify that all user inputs are properly validated and sanitized:

- **Parameter Validation**: Ensures game IDs and other parameters are valid
- **Username Validation**: Checks that usernames follow security requirements
- **Board Position Validation**: Validates that positions are within bounds
- **Chess Move Validation**: Ensures moves are properly structured
- **Tetromino Placement Validation**: Validates tetromino placements
- **Injection Attack Prevention**: Tests string sanitization for XSS prevention

## Anti-Cheat Mechanisms

Shaktris implements several anti-cheat mechanisms to ensure fair play:

### Chess Piece Validation

- All chess piece movements must follow standard chess rules
- The backend validates each move against the current board state
- Pieces can only move to valid positions based on their type
- The server tracks and validates the player's turn order

### Game State Integrity

- Critical game state is maintained server-side
- Client requests are validated against the server state
- State transitions are logged for anomaly detection
- Home zones and chess pieces are protected from unauthorized manipulation

### Data Structure Validation

- Chess pieces are stored in board cells for validation
- The system checks that pieces are placed in legal positions
- Cell structure integrity is verified after each action

### Rate Limiting and Timing Controls

- Actions are rate-limited to prevent spam
- Turn timing is enforced to ensure fair play
- The server tracks action timestamps to detect time manipulation

### Session Management

- User sessions are securely managed
- Each action is validated against the user's session
- Session tokens expire after a set period
- Cross-player action prevention stops players from acting on behalf of others

## Running the Security Tests

To run the security tests, use the following command:

```bash
npm run test:security
```

Or run all tests including security:

```bash
npm test
```

## Adding New Security Tests

When adding new features, consider potential security implications and add appropriate tests:

1. For new API endpoints, add input validation tests
2. For new game mechanics, add anti-cheat tests
3. For user-related features, add authentication tests

Follow the existing patterns in the security test files and ensure that tests cover both valid and invalid scenarios.

## Best Practices

When working with security-sensitive code:

- Always validate input on the server side, never trust client data
- Use parameterized queries for database operations
- Implement proper error handling that doesn't leak sensitive information
- Apply the principle of least privilege for all operations
- Sanitize outputs to prevent XSS attacks
- Keep dependencies updated to avoid known vulnerabilities

## Security Reporting

If you discover a security vulnerability, please report it to the team via email at security@shaktris.com rather than opening a public issue. 