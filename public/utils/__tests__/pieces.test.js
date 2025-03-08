const {
	getValidMoves,
	movePiece,
	createChessPiece,
	spawnFallingPiece,
	lockFallingPiece,
	rotateFallingPiece
} = require('../pieces');

describe('Chess Piece Functions', () => {
	describe('getValidMoves', () => {
		const mockBoard = {
			'0,0': { type: 'cell', piece: { id: 'piece1', playerId: 'player1' } },
			'1,0': { type: 'cell' },
			'1,1': { type: 'cell', piece: { id: 'piece2', playerId: 'player2' } }
		};

		test('should return valid moves for pawn', () => {
			const pawn = {
				type: 'pawn',
				x: 0,
				y: 0,
				playerId: 'player1'
			};

			const moves = getValidMoves(pawn, 'player1', mockBoard);
			expect(moves).toContainEqual({ x: 1, y: 0, type: 'move' });
			expect(moves).toContainEqual({ x: 1, y: 1, type: 'attack' });
		});

		test('should return valid moves for knight', () => {
			const knight = {
				type: 'knight',
				x: 0,
				y: 0,
				playerId: 'player1'
			};

			const moves = getValidMoves(knight, 'player1', mockBoard);
			expect(moves).toContainEqual({ x: 2, y: 1, type: 'move' });
			expect(moves).toContainEqual({ x: 1, y: 2, type: 'move' });
		});
	});

	describe('movePiece', () => {
		let mockBoard;
		let mockPlayers;

		beforeEach(() => {
			mockBoard = {
				'0,0': { type: 'cell', piece: { id: 'piece1', playerId: 'player1', x: 0, y: 0 } },
				'1,0': { type: 'cell' },
				'1,1': { type: 'cell', piece: { id: 'piece2', playerId: 'player2', x: 1, y: 1 } }
			};

			mockPlayers = {
				'player1': {
					pieces: [{ id: 'piece1', playerId: 'player1', x: 0, y: 0 }]
				},
				'player2': {
					pieces: [{ id: 'piece2', playerId: 'player2', x: 1, y: 1 }]
				}
			};
		});

		test('should move piece to empty cell', () => {
			const result = movePiece('piece1', 1, 0, 'player1', mockBoard, mockPlayers);
			expect(result.success).toBe(true);
			expect(mockBoard['1,0'].piece.id).toBe('piece1');
			expect(mockBoard['0,0'].piece).toBeNull();
		});

		test('should capture opponent piece', () => {
			const result = movePiece('piece1', 1, 1, 'player1', mockBoard, mockPlayers);
			expect(result.success).toBe(true);
			expect(mockBoard['1,1'].piece.id).toBe('piece1');
			expect(mockPlayers.player2.pieces).toHaveLength(0);
		});
	});
});

describe('Tetris Piece Functions', () => {
	describe('spawnFallingPiece', () => {
		test('should create valid tetromino', () => {
			const piece = spawnFallingPiece(24, 24);
			expect(piece).toHaveProperty('type');
			expect(piece).toHaveProperty('blocks');
			expect(piece).toHaveProperty('color');
			expect(piece).toHaveProperty('x');
			expect(piece).toHaveProperty('y');
			expect(piece).toHaveProperty('z');
		});

		test('should spawn piece within board bounds', () => {
			const piece = spawnFallingPiece(10, 10);
			const maxX = Math.max(...piece.blocks.map(b => b.x + piece.x));
			const maxY = Math.max(...piece.blocks.map(b => b.y + piece.y));
			expect(maxX).toBeLessThan(10);
			expect(maxY).toBeLessThan(10);
		});
	});

	describe('lockFallingPiece', () => {
		let mockBoard;
		let fallingPiece;

		beforeEach(() => {
			mockBoard = {
				'0,0': { type: 'cell' }
			};

			fallingPiece = {
				type: 'I',
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 }
				],
				color: 0x00ffff,
				x: 1,
				y: 0,
				z: 0
			};
		});

		test('should lock piece when adjacent to existing cell', () => {
			const result = lockFallingPiece(fallingPiece, mockBoard);
			expect(result).toBe(true);
			expect(mockBoard['1,0']).toBeDefined();
			expect(mockBoard['2,0']).toBeDefined();
		});

		test('should not lock isolated piece', () => {
			fallingPiece.x = 5;
			const result = lockFallingPiece(fallingPiece, mockBoard);
			expect(result).toBe(false);
			expect(mockBoard['5,0']).toBeUndefined();
		});
	});

	describe('rotateFallingPiece', () => {
		test('should rotate piece 90 degrees clockwise', () => {
			const piece = {
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 0, y: 1 }
				],
				x: 5,
				y: 5
			};

			const rotated = rotateFallingPiece(piece, 24, 24);
			expect(rotated.blocks).toContainEqual({ x: 0, y: 0 });
			expect(rotated.blocks).toContainEqual({ x: 0, y: 1 });
			expect(rotated.blocks).toContainEqual({ x: -1, y: 0 });
		});

		test('should keep piece within board bounds after rotation', () => {
			const piece = {
				blocks: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 2, y: 0 }
				],
				x: 23,
				y: 23
			};

			const rotated = rotateFallingPiece(piece, 24, 24);
			const maxX = Math.max(...rotated.blocks.map(b => b.x + rotated.x));
			const maxY = Math.max(...rotated.blocks.map(b => b.y + rotated.y));
			expect(maxX).toBeLessThan(24);
			expect(maxY).toBeLessThan(24);
		});
	});
}); 