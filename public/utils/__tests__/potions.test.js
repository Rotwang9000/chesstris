const {
	addPotionToTetromino,
	applyPotionEffect,
	getPotionEffectDuration,
	cleanupExpiredPotions
} = require('../potions');

describe('Potion Functions', () => {
	describe('addPotionToTetromino', () => {
		test('should add potion to tetromino with 10% chance', () => {
			// Mock Math.random to always return 0.05 (less than 0.1)
			const originalRandom = Math.random;
			Math.random = jest.fn(() => 0.05);

			const piece = { type: 'I', blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
			const result = addPotionToTetromino(piece);
			expect(result.potion).toBeDefined();
			expect(result.potion.data.type).toBeDefined();
			expect(result.potion.blockIndex).toBeLessThan(piece.blocks.length);

			Math.random = originalRandom;
		});

		test('should not add potion with 90% chance', () => {
			// Mock Math.random to always return 0.95 (greater than 0.1)
			const originalRandom = Math.random;
			Math.random = jest.fn(() => 0.95);

			const piece = { type: 'I', blocks: [] };
			const result = addPotionToTetromino(piece);
			expect(result.potion).toBeUndefined();

			Math.random = originalRandom;
		});
	});

	describe('applyPotionEffect', () => {
		let mockPlayer;
		let mockHomeZones;

		beforeEach(() => {
			mockPlayer = {
				id: 'player1',
				pieces: [
					{ id: 'piece1', type: 'pawn' },
					{ id: 'piece2', type: 'knight' }
				],
				specialAbilities: {}
			};

			mockHomeZones = {
				'player1': { width: 8, height: 2 }
			};
		});

		test('should apply speed potion effect', () => {
			const potion = { type: 'speed' };
			applyPotionEffect(potion, mockPlayer);
			expect(mockPlayer.specialAbilities.speedUntil).toBeDefined();
			expect(mockPlayer.specialAbilities.speedUntil).toBeGreaterThan(Date.now());
		});

		test('should apply jump potion effect', () => {
			const potion = { type: 'jump' };
			applyPotionEffect(potion, mockPlayer);
			expect(mockPlayer.specialAbilities.jumpUntil).toBeDefined();
			expect(mockPlayer.specialAbilities.jumpUntil).toBeGreaterThan(Date.now());
		});

		test('should apply shield potion effect', () => {
			const potion = { type: 'shield' };
			applyPotionEffect(potion, mockPlayer);
			const shieldedPiece = mockPlayer.pieces.find(p => p.shielded);
			expect(shieldedPiece).toBeDefined();
			expect(shieldedPiece.shielded).toBe(true);
		});

		test('should apply grow potion effect', () => {
			const potion = { type: 'grow' };
			applyPotionEffect(potion, mockPlayer, mockHomeZones);
			expect(mockHomeZones.player1.width).toBe(9);
		});

		test('should handle invalid potion type', () => {
			const potion = { type: 'invalid' };
			expect(() => applyPotionEffect(potion, mockPlayer)).not.toThrow();
		});
	});

	describe('getPotionEffectDuration', () => {
		test('should return correct duration for different potion types', () => {
			expect(getPotionEffectDuration('speed')).toBe(30000); // 30 seconds
			expect(getPotionEffectDuration('jump')).toBe(60000);  // 1 minute
			expect(getPotionEffectDuration('shield')).toBe(120000); // 2 minutes
		});

		test('should return default duration for unknown potion type', () => {
			expect(getPotionEffectDuration('unknown')).toBe(60000); // Default 1 minute
		});
	});

	describe('cleanupExpiredPotions', () => {
		let mockPlayer;

		beforeEach(() => {
			mockPlayer = {
				specialAbilities: {
					speedUntil: Date.now() - 1000, // Expired
					jumpUntil: Date.now() + 1000,  // Not expired
					shieldUntil: Date.now() - 500  // Expired
				},
				pieces: [
					{ id: 'piece1', shielded: true },
					{ id: 'piece2', shielded: true }
				]
			};
		});

		test('should remove expired potion effects', () => {
			cleanupExpiredPotions(mockPlayer);
			expect(mockPlayer.specialAbilities.speedUntil).toBeUndefined();
			expect(mockPlayer.specialAbilities.jumpUntil).toBeDefined();
			expect(mockPlayer.specialAbilities.shieldUntil).toBeUndefined();
		});

		test('should remove shields from pieces when shield effect expires', () => {
			cleanupExpiredPotions(mockPlayer);
			expect(mockPlayer.pieces.every(p => !p.shielded)).toBe(true);
		});

		test('should keep active effects', () => {
			cleanupExpiredPotions(mockPlayer);
			expect(mockPlayer.specialAbilities.jumpUntil).toBeDefined();
			expect(mockPlayer.specialAbilities.jumpUntil).toBeGreaterThan(Date.now());
		});
	});
}); 