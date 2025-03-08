const {
	addPlayer,
	degradeHomeZones,
	applyPotionEffect,
	generatePlayerColor
} = require('../game');

describe('Game Management Functions', () => {
	describe('addPlayer', () => {
		test('should create new player with valid data', () => {
			const result = addPlayer('socket123', 'TestPlayer');
			expect(result.player).toHaveProperty('id', 'socket123');
			expect(result.player).toHaveProperty('username', 'TestPlayer');
			expect(result.player).toHaveProperty('color');
			expect(result.player).toHaveProperty('pieces');
			expect(result.zone).toHaveProperty('x');
			expect(result.zone).toHaveProperty('y');
			expect(result.zone).toHaveProperty('width', 8);
			expect(result.zone).toHaveProperty('height', 2);
		});

		test('should assign default username if none provided', () => {
			const result = addPlayer('socket123');
			expect(result.player.username).toMatch(/^Player/);
		});

		test('should create initial chess pieces', () => {
			const result = addPlayer('socket123');
			expect(result.player.pieces).toHaveLength(16); // 8 pawns + 8 other pieces
			expect(result.player.pieces.filter(p => p.type === 'pawn')).toHaveLength(8);
		});
	});

	describe('degradeHomeZones', () => {
		let mockHomeZones;
		let mockBoard;
		let mockPlayers;

		beforeEach(() => {
			mockHomeZones = {
				'player1': { x: 0, y: 0, width: 8, height: 2 },
				'player2': { x: 10, y: 0, width: 8, height: 2 }
			};

			mockBoard = {
				'0,0': { type: 'cell', piece: { id: 'piece1' } }
			};

			mockPlayers = {
				'player1': { pieces: [{ id: 'piece1' }] },
				'player2': { pieces: [] }
			};
		});

		test('should not degrade zone with pieces', () => {
			degradeHomeZones(mockHomeZones, mockBoard, mockPlayers);
			expect(mockHomeZones.player1.width).toBe(8);
		});

		test('should degrade empty zone', () => {
			degradeHomeZones(mockHomeZones, mockBoard, mockPlayers);
			expect(mockHomeZones.player2.width).toBeLessThan(8);
		});

		test('should remove zone when fully degraded', () => {
			mockHomeZones.player2.width = 1;
			degradeHomeZones(mockHomeZones, mockBoard, mockPlayers);
			expect(mockHomeZones.player2).toBeUndefined();
		});
	});

	describe('applyPotionEffect', () => {
		let mockPlayer;

		beforeEach(() => {
			mockPlayer = {
				id: 'player1',
				pieces: [
					{ id: 'piece1', type: 'pawn' },
					{ id: 'piece2', type: 'knight' }
				],
				specialAbilities: {}
			};
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
			expect(mockPlayer.pieces.some(p => p.shielded)).toBe(true);
		});

		test('should apply grow potion effect', () => {
			const mockHomeZones = {
				'player1': { width: 8, height: 2 }
			};
			const potion = { type: 'grow' };
			applyPotionEffect(potion, mockPlayer, mockHomeZones);
			expect(mockHomeZones.player1.width).toBe(9);
		});
	});

	describe('generatePlayerColor', () => {
		test('should generate valid hex color', () => {
			const color = generatePlayerColor();
			expect(color).toBeGreaterThanOrEqual(0);
			expect(color).toBeLessThanOrEqual(0xFFFFFF);
		});

		test('should generate different colors for different calls', () => {
			const colors = new Set();
			for (let i = 0; i < 100; i++) {
				colors.add(generatePlayerColor());
			}
			expect(colors.size).toBeGreaterThan(1);
		});
	});
}); 