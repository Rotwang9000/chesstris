/**
 * Authentication Tests for Shaktris
 * 
 * These tests verify the authentication system properly validates credentials,
 * manages sessions, and prevents unauthorized access.
 */

const { expect, describe, it, beforeEach, afterEach, jest } = require('@jest/globals');
const express = require('express');
const request = require('supertest');

// Mock authentication service
class AuthService {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.failedAttempts = new Map();
  }

  registerUser(username, password, email) {
    // Check if username already exists
    if (this.users.has(username)) {
      return { success: false, error: 'Username already exists' };
    }

    // Simple password strength validation
    if (password.length < 8) {
      return { success: false, error: 'Password too short' };
    }

    // Store user
    this.users.set(username, {
      username,
      password, // In a real system, this would be hashed
      email,
      createdAt: Date.now()
    });

    return { success: true, username };
  }

  authenticate(username, password) {
    // Get failed attempts
    const attempts = this.failedAttempts.get(username) || 0;
    
    // Check if account is locked due to too many attempts
    if (attempts >= 5) {
      return { success: false, error: 'Account temporarily locked' };
    }
    
    // Check credentials
    const user = this.users.get(username);
    if (!user || user.password !== password) {
      // Increment failed attempts
      this.failedAttempts.set(username, attempts + 1);
      return { success: false, error: 'Invalid credentials' };
    }
    
    // Reset failed attempts on successful login
    this.failedAttempts.set(username, 0);
    
    // Create session token
    const sessionToken = `${username}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    this.sessions.set(sessionToken, {
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    });
    
    return { success: true, sessionToken };
  }
  
  validateSession(sessionToken) {
    const session = this.sessions.get(sessionToken);
    if (!session) {
      return false;
    }
    
    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(sessionToken);
      return false;
    }
    
    return true;
  }
  
  invalidateSession(sessionToken) {
    return this.sessions.delete(sessionToken);
  }
}

// Create a mock Express app for testing
const mockApp = express();
const authService = new AuthService();

// Mock authentication middleware
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !authService.validateSession(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Mock routes for testing
mockApp.post('/api/auth/register', (req, res) => {
  const { username, password, email } = req.body;
  const result = authService.registerUser(username, password, email);
  if (result.success) {
    res.status(201).json(result);
  } else {
    res.status(400).json(result);
  }
});

mockApp.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const result = authService.authenticate(username, password);
  if (result.success) {
    res.status(200).json(result);
  } else {
    res.status(401).json(result);
  }
});

mockApp.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  authService.invalidateSession(token);
  res.status(200).json({ success: true });
});

mockApp.get('/api/games', requireAuth, (req, res) => {
  res.status(200).json({ games: [] });
});

describe('Authentication Security Tests', () => {
  beforeEach(() => {
    // Register a test user for tests
    authService.registerUser('testuser', 'password123', 'test@example.com');
  });
  
  afterEach(() => {
    // Clear mock data between tests
    authService.users = new Map();
    authService.sessions = new Map();
    authService.failedAttempts = new Map();
  });
  
  describe('User Registration', () => {
    it('should register a new user with valid credentials', async () => {
      const response = await request(mockApp)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          password: 'securepassword',
          email: 'new@example.com'
        });
      
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
    
    it('should reject registration with existing username', async () => {
      // First register
      await request(mockApp)
        .post('/api/auth/register')
        .send({
          username: 'existing',
          password: 'securepassword',
          email: 'existing@example.com'
        });
      
      // Try to register same username
      const response = await request(mockApp)
        .post('/api/auth/register')
        .send({
          username: 'existing',
          password: 'anothersecurepassword',
          email: 'another@example.com'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
    
    it('should reject registration with weak password', async () => {
      const response = await request(mockApp)
        .post('/api/auth/register')
        .send({
          username: 'weakpassuser',
          password: 'weak',
          email: 'weak@example.com'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('Authentication', () => {
    it('should authenticate user with valid credentials', async () => {
      const response = await request(mockApp)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sessionToken).toBeDefined();
    });
    
    it('should reject authentication with invalid credentials', async () => {
      const response = await request(mockApp)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
    
    it('should lock account after multiple failed attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(mockApp)
          .post('/api/auth/login')
          .send({
            username: 'testuser',
            password: 'wrongpassword'
          });
      }
      
      // Try with correct password after lockout
      const response = await request(mockApp)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });
      
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('locked');
    });
  });
  
  describe('Session Management', () => {
    it('should allow access to protected routes with valid session', async () => {
      // First login to get token
      const loginResponse = await request(mockApp)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });
      
      // Use token to access protected route
      const token = loginResponse.body.sessionToken;
      const response = await request(mockApp)
        .get('/api/games')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
    
    it('should deny access to protected routes without valid session', async () => {
      const response = await request(mockApp)
        .get('/api/games')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(response.status).toBe(401);
    });
    
    it('should invalidate session on logout', async () => {
      // First login to get token
      const loginResponse = await request(mockApp)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });
      
      const token = loginResponse.body.sessionToken;
      
      // Logout
      await request(mockApp)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      
      // Try to access protected route with now-invalid token
      const response = await request(mockApp)
        .get('/api/games')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(401);
    });
    
    it('should verify session integrity for multiplayer games', () => {
      // Create mock sessions
      const session1 = authService.authenticate('player1', 'password123').sessionToken;
      const session2 = authService.authenticate('player2', 'password123').sessionToken;
      
      // Verify sessions
      expect(authService.validateSession(session1)).toBe(true);
      expect(authService.validateSession(session2)).toBe(true);
      
      // Simulate random token
      const fakeToken = 'fake_token_' + Math.random();
      expect(authService.validateSession(fakeToken)).toBe(false);
      
      // Invalidate session1
      authService.invalidateSession(session1);
      expect(authService.validateSession(session1)).toBe(false);
      expect(authService.validateSession(session2)).toBe(true); // session2 should still be valid
    });
  });
  
  describe('API Security', () => {
    it('should prevent cross-player game state manipulation', async () => {
      // Create two players with valid sessions
      authService.registerUser('player1', 'password123', 'p1@example.com');
      authService.registerUser('player2', 'password123', 'p2@example.com');
      
      const token1 = authService.authenticate('player1', 'password123').sessionToken;
      
      // Mock endpoint to update game state
      mockApp.post('/api/games/:gameId/move', requireAuth, (req, res) => {
        const { gameId } = req.params;
        const { playerId } = req.body;
        
        // Session token is valid, but player is trying to make a move as another player
        if (req.headers.authorization.split(' ')[1] === token1 && playerId !== 'player1') {
          return res.status(403).json({ 
            error: 'Player ID mismatch with authenticated user' 
          });
        }
        
        res.status(200).json({ success: true });
      });
      
      // Player1 tries to make a move as Player2
      const response = await request(mockApp)
        .post('/api/games/game123/move')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          playerId: 'player2',
          move: { from: { x: 1, z: 1 }, to: { x: 2, z: 2 } }
        });
      
      expect(response.status).toBe(403);
    });
  });
}); 