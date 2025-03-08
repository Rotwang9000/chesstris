const { validateUsername } = require('../username');

describe('validateUsername', () => {
	test('should accept valid usernames', () => {
		const validUsernames = [
			'Player123',
			'cool_player',
			'test-user',
			'abc123',
			'Player_123-test'
		];

		validUsernames.forEach(username => {
			const result = validateUsername(username);
			expect(result.isValid).toBe(true);
			expect(result.sanitised).toBe(username);
			expect(result.error).toBeNull();
		});
	});

	test('should reject empty or non-string inputs', () => {
		const invalidInputs = [
			'',
			null,
			undefined,
			123,
			{},
			[]
		];

		invalidInputs.forEach(input => {
			const result = validateUsername(input);
			expect(result.isValid).toBe(false);
			expect(result.sanitised).toBeNull();
			expect(result.error).toBe('Username must be a non-empty string');
		});
	});

	test('should reject usernames that are too short', () => {
		const result = validateUsername('ab');
		expect(result.isValid).toBe(false);
		expect(result.sanitised).toBeNull();
		expect(result.error).toBe('Username must be at least 3 characters long');
	});

	test('should reject usernames that are too long', () => {
		const longUsername = 'a'.repeat(21);
		const result = validateUsername(longUsername);
		expect(result.isValid).toBe(false);
		expect(result.sanitised).toBeNull();
		expect(result.error).toBe('Username must be no longer than 20 characters');
	});

	test('should reject usernames with invalid characters', () => {
		const invalidUsernames = [
			'Player@123',
			'test user',
			'player!name',
			'user#name',
			'player$123'
		];

		invalidUsernames.forEach(username => {
			const result = validateUsername(username);
			expect(result.isValid).toBe(false);
			expect(result.sanitised).toBeNull();
			expect(result.error).toBe('Username can only contain letters, numbers, underscores, and hyphens');
		});
	});

	test('should trim whitespace but reject if other invalid characters exist', () => {
		const result = validateUsername('  player@123  ');
		expect(result.isValid).toBe(false);
		expect(result.sanitised).toBeNull();
		expect(result.error).toBe('Username can only contain letters, numbers, underscores, and hyphens');
	});

	test('should accept usernames after trimming whitespace if otherwise valid', () => {
		const result = validateUsername('  Player123  ');
		expect(result.isValid).toBe(true);
		expect(result.sanitised).toBe('Player123');
		expect(result.error).toBeNull();
	});
}); 