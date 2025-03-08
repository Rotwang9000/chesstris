const {
	isInBounds,
	hasValidCell,
	getAdjacentCells,
	isCellInSafeHomeZone,
	clearFullRows
} = require('../board');

describe('Board Functions', () => {
	describe('isInBounds', () => {
		test('should return true for valid coordinates', () => {
			expect(isInBounds(0, 0)).toBe(true);
			expect(isInBounds(5, 5)).toBe(true);
			expect(isInBounds(23, 23)).toBe(true);
		});

		test('should return false for out-of-bounds coordinates', () => {
			expect(isInBounds(-1, 0)).toBe(false);
			expect(isInBounds(0, -1)).toBe(false);
			expect(isInBounds(24, 0)).toBe(false);
			expect(isInBounds(0, 24)).toBe(false);
		});
	});

	describe('hasValidCell', () => {
		const mockBoard = {
			'0,0': { type: 'cell' },
			'1,1': { type: 'empty' },
			'2,2': { type: 'cell' }
		};

		test('should return true for valid cells', () => {
			expect(hasValidCell(0, 0, mockBoard)).toBe(true);
			expect(hasValidCell(2, 2, mockBoard)).toBe(true);
		});

		test('should return false for empty or non-existent cells', () => {
			expect(hasValidCell(1, 1, mockBoard)).toBe(false);
			expect(hasValidCell(3, 3, mockBoard)).toBe(false);
		});
	});

	describe('getAdjacentCells', () => {
		const mockBoard = {
			'0,0': { type: 'cell' },
			'1,0': { type: 'cell' },
			'0,1': { type: 'cell' }
		};

		test('should return all adjacent valid cells', () => {
			const adjacent = getAdjacentCells(0, 0, mockBoard);
			expect(adjacent).toHaveLength(2);
			expect(adjacent).toContainEqual({ x: 1, y: 0 });
			expect(adjacent).toContainEqual({ x: 0, y: 1 });
		});

		test('should return empty array for isolated cell', () => {
			const adjacent = getAdjacentCells(5, 5, mockBoard);
			expect(adjacent).toHaveLength(0);
		});
	});

	describe('isCellInSafeHomeZone', () => {
		const mockHomeZones = {
			'player1': { x: 0, y: 0, width: 8, height: 2 }
		};

		const mockBoard = {
			'0,0': { type: 'cell', piece: { id: 'piece1' } }
		};

		test('should return true for cell in safe home zone', () => {
			expect(isCellInSafeHomeZone(0, 0, mockBoard, mockHomeZones)).toBe(true);
		});

		test('should return false for cell outside home zone', () => {
			expect(isCellInSafeHomeZone(10, 10, mockBoard, mockHomeZones)).toBe(false);
		});

		test('should return false for empty home zone', () => {
			const emptyBoard = {};
			expect(isCellInSafeHomeZone(0, 0, emptyBoard, mockHomeZones)).toBe(false);
		});
	});

	describe('clearFullRows', () => {
		let mockBoard;
		let mockPlayers;

		beforeEach(() => {
			mockBoard = {};
			mockPlayers = {
				'player1': {
					pieces: [
						{ id: 'piece1', x: 0, y: 0 },
						{ id: 'piece2', x: 1, y: 0 }
					]
				}
			};

			// Create a full row
			for (let x = 0; x < 8; x++) {
				mockBoard[`${x},0`] = {
					type: 'cell',
					piece: x < 2 ? mockPlayers.player1.pieces[x] : null
				};
			}
		});

		test('should clear full rows except safe home zones', () => {
			const mockHomeZones = {
				'player1': { x: 0, y: 0, width: 2, height: 1 }
			};

			clearFullRows(mockBoard, mockPlayers, mockHomeZones);

			// Check that home zone cells remain
			expect(mockBoard['0,0']).toBeDefined();
			expect(mockBoard['1,0']).toBeDefined();

			// Check that other cells were cleared
			expect(mockBoard['2,0']).toBeUndefined();
			expect(mockBoard['7,0']).toBeUndefined();
		});

		test('should update player pieces when clearing rows', () => {
			const mockHomeZones = {};
			clearFullRows(mockBoard, mockPlayers, mockHomeZones);

			expect(mockPlayers.player1.pieces).toHaveLength(0);
		});
	});
}); 