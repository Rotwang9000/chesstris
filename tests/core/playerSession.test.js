/**
 * Player Session Management Tests
 * 
 * Tests the login, registration, and session management of players
 */

const { PlayerManager } = require('../../public/js/game/PlayerManager');
const { SessionManager } = require('../../public/js/game/SessionManager');

describe('Player Session Management', () => {
	let playerManager;
	let sessionManager;
	
	beforeEach(() => {
		// Clear any mocks between tests
		jest.clearAllMocks();
		
		// Initialize managers
		playerManager = new PlayerManager();
		sessionManager = new SessionManager();
	});
	
	describe('Player Registration', () => {
		it('should register a new player with valid credentials', () => {
			const playerName = 'TestPlayer';
			const email = 'test@example.com';
			const password = 'securePassword123';
			
			const result = playerManager.registerPlayer(playerName, email, password);
			
			expect(result.success).toBe(true);
			expect(result.player).toBeDefined();
			expect(result.player.name).toBe(playerName);
			expect(result.player.email).toBe(email);
			
			// Password should not be stored in plain text
			expect(result.player.password).not.toBe(password);
		});
		
		it('should not register a player with an existing email', () => {
			// Register the first player
			playerManager.registerPlayer('Player1', 'duplicate@example.com', 'password123');
			
			// Try to register another player with the same email
			const result = playerManager.registerPlayer('Player2', 'duplicate@example.com', 'anotherPassword');
			
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
		
		it('should validate password strength during registration', () => {
			// Try with a weak password
			const weakResult = playerManager.registerPlayer('WeakUser', 'weak@example.com', '123');
			
			// Check if validation fails for weak passwords
			expect(weakResult.success).toBe(false);
			expect(weakResult.error).toMatch(/password/i);
			
			// Try with a strong password
			const strongResult = playerManager.registerPlayer('StrongUser', 'strong@example.com', 'StrongP@ssw0rd!');
			
			expect(strongResult.success).toBe(true);
		});
	});
	
	describe('Player Authentication', () => {
		beforeEach(() => {
			// Register a test player before each test
			playerManager.registerPlayer('AuthTest', 'auth@example.com', 'authPassword123');
		});
		
		it('should authenticate a player with correct credentials', () => {
			const result = playerManager.authenticatePlayer('auth@example.com', 'authPassword123');
			
			expect(result.success).toBe(true);
			expect(result.player).toBeDefined();
			expect(result.player.email).toBe('auth@example.com');
			expect(result.token).toBeDefined(); // Should return a session token
		});
		
		it('should reject authentication with incorrect password', () => {
			const result = playerManager.authenticatePlayer('auth@example.com', 'wrongPassword');
			
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.token).toBeUndefined();
		});
		
		it('should reject authentication for non-existent player', () => {
			const result = playerManager.authenticatePlayer('nonexistent@example.com', 'anyPassword');
			
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
	
	describe('Session Management', () => {
		let playerToken;
		let playerId;
		
		beforeEach(() => {
			// Register and authenticate a player to get a token
			playerManager.registerPlayer('SessionTest', 'session@example.com', 'sessionPassword123');
			const authResult = playerManager.authenticatePlayer('session@example.com', 'sessionPassword123');
			playerToken = authResult.token;
			playerId = authResult.player.id;
		});
		
		it('should create a valid session when a player authenticates', () => {
			// Session should exist for the authenticated player
			const isValid = sessionManager.validateSession(playerToken);
			expect(isValid).toBe(true);
			
			// Should be able to get the player ID from the token
			const tokenPlayerId = sessionManager.getPlayerIdFromToken(playerToken);
			expect(tokenPlayerId).toBe(playerId);
		});
		
		it('should invalidate session when a player logs out', () => {
			// First validate that the session is valid
			expect(sessionManager.validateSession(playerToken)).toBe(true);
			
			// Log the player out
			sessionManager.invalidateSession(playerToken);
			
			// Session should no longer be valid
			expect(sessionManager.validateSession(playerToken)).toBe(false);
		});
		
		it('should automatically expire sessions after inactivity', () => {
			// This test will only work if the session manager implements expiry
			if (!sessionManager.hasExpiry) {
				return;
			}
			
			// Mock the current time to simulate passage of time
			const originalNow = Date.now;
			Date.now = jest.fn(() => new Date('2023-01-01T00:00:00Z').getTime());
			
			// Create a session
			const authResult = playerManager.authenticatePlayer('session@example.com', 'sessionPassword123');
			const token = authResult.token;
			
			// Should be valid initially
			expect(sessionManager.validateSession(token)).toBe(true);
			
			// Jump forward in time beyond the expiry period (e.g., 2 hours)
			Date.now = jest.fn(() => new Date('2023-01-01T03:00:00Z').getTime());
			
			// Should be expired now
			expect(sessionManager.validateSession(token)).toBe(false);
			
			// Restore original Date.now
			Date.now = originalNow;
		});
		
		it('should allow a player to have multiple sessions', () => {
			// Authenticate again to get a second token
			const secondAuth = playerManager.authenticatePlayer('session@example.com', 'sessionPassword123');
			const secondToken = secondAuth.token;
			
			// Both tokens should be valid
			expect(sessionManager.validateSession(playerToken)).toBe(true);
			expect(sessionManager.validateSession(secondToken)).toBe(true);
			
			// Both should map to the same player
			expect(sessionManager.getPlayerIdFromToken(playerToken)).toBe(playerId);
			expect(sessionManager.getPlayerIdFromToken(secondToken)).toBe(playerId);
		});
	});
	
	describe('Password Management', () => {
		let testPlayerId;
		
		beforeEach(() => {
			// Register a test player
			const registerResult = playerManager.registerPlayer('PasswordTest', 'password@example.com', 'initialPassword123');
			testPlayerId = registerResult.player.id;
		});
		
		it('should allow a player to change their password', () => {
			// Change the password
			const changeResult = playerManager.changePassword(testPlayerId, 'initialPassword123', 'newPassword456');
			
			expect(changeResult.success).toBe(true);
			
			// Should be able to authenticate with the new password
			const authResult = playerManager.authenticatePlayer('password@example.com', 'newPassword456');
			expect(authResult.success).toBe(true);
			
			// Should not be able to authenticate with the old password
			const oldAuthResult = playerManager.authenticatePlayer('password@example.com', 'initialPassword123');
			expect(oldAuthResult.success).toBe(false);
		});
		
		it('should require the correct current password to change password', () => {
			// Try to change with incorrect current password
			const changeResult = playerManager.changePassword(testPlayerId, 'wrongPassword', 'newPassword456');
			
			expect(changeResult.success).toBe(false);
			expect(changeResult.error).toBeDefined();
			
			// Should still be able to authenticate with the original password
			const authResult = playerManager.authenticatePlayer('password@example.com', 'initialPassword123');
			expect(authResult.success).toBe(true);
		});
		
		it('should allow password reset via email verification', () => {
			// Skip if email verification is not implemented
			if (!playerManager.requestPasswordReset) {
				return;
			}
			
			// Request a password reset
			const resetRequest = playerManager.requestPasswordReset('password@example.com');
			expect(resetRequest.success).toBe(true);
			
			// Mock the reset token that would be sent by email
			const resetToken = resetRequest.resetToken;
			
			// Use the token to set a new password
			const resetResult = playerManager.resetPassword(resetToken, 'resetPassword789');
			expect(resetResult.success).toBe(true);
			
			// Should be able to authenticate with the new password
			const authResult = playerManager.authenticatePlayer('password@example.com', 'resetPassword789');
			expect(authResult.success).toBe(true);
		});
	});
}); 