/**
 * Tests for server/game/Constants.js
 * Validates all constants match the player's bible.
 */

const {
	BOARD_SETTINGS,
	PLAYER_SETTINGS,
	PIECE_PRICES,
	GAME_RULES,
	TETROMINO_SHAPES,
	CHESS_PIECE_POSITIONS,
} = require('../../server/game/Constants');

describe('Constants — bible compliance', () => {
	test('board settings match bible', () => {
		expect(BOARD_SETTINGS.HOME_ZONE_WIDTH).toBe(8);
		expect(BOARD_SETTINGS.HOME_ZONE_HEIGHT).toBe(2);
		expect(BOARD_SETTINGS.MAX_PLAYERS_PER_GAME).toBe(2048);
		expect(BOARD_SETTINGS.DEFAULT_CELL_SIZE).toBe(1);
		expect(BOARD_SETTINGS.HOME_ZONE_DEGRADATION_INTERVAL).toBe(150000);
	});

	test('player cooldowns match bible', () => {
		expect(PLAYER_SETTINGS.CHESS_MOVE_COOLDOWN_MS).toBe(750);
		expect(PLAYER_SETTINGS.TETROMINO_PLACEMENT_COOLDOWN_MS).toBe(1500);
	});

	test('game rules match bible', () => {
		expect(GAME_RULES.REQUIRED_CELLS_FOR_ROW_CLEARING).toBe(8);
		expect(GAME_RULES.PAWN_PROMOTION_DISTANCE).toBe(9);
		expect(GAME_RULES.AUTO_QUEEN_TIMEOUT_MS).toBe(15000);
		expect(GAME_RULES.SUICIDAL_PAWN_DELAY_MS).toBe(3000);
		expect(GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS).toBe(500);
		expect(GAME_RULES.SIMULTANEOUS_CAPTURE_WINDOW_MS).toBe(1000);
		expect(GAME_RULES.KING_DUEL_TIMEOUT_MS).toBe(10000);
		expect(GAME_RULES.KING_DUEL_GRID_COLS).toBe(4);
		expect(GAME_RULES.KING_DUEL_GRID_ROWS).toBe(2);
		expect(GAME_RULES.KING_DUEL_MAX_ROUNDS).toBe(5);
	});

	test('piece prices match bible', () => {
		expect(PIECE_PRICES.PAWN).toBe(0.1);
		expect(PIECE_PRICES.ROOK).toBe(0.5);
		expect(PIECE_PRICES.KNIGHT).toBe(0.5);
		expect(PIECE_PRICES.BISHOP).toBe(0.5);
		expect(PIECE_PRICES.QUEEN).toBe(1.0);
		expect(PIECE_PRICES.KING).toBeUndefined();
	});

	test('GAME_RULES is frozen', () => {
		expect(Object.isFrozen(GAME_RULES)).toBe(true);
	});

	test('PIECE_PRICES is frozen', () => {
		expect(Object.isFrozen(PIECE_PRICES)).toBe(true);
	});

	test('seven standard tetromino shapes exist', () => {
		const shapes = Object.keys(TETROMINO_SHAPES);
		expect(shapes).toEqual(expect.arrayContaining(['I', 'O', 'T', 'S', 'Z', 'J', 'L']));
		expect(shapes).toHaveLength(7);
	});

	test('each tetromino shape has 4 rotations', () => {
		for (const [name, rotations] of Object.entries(TETROMINO_SHAPES)) {
			expect(rotations).toHaveLength(4);
		}
	});

	test('chess piece positions include all standard pieces', () => {
		expect(CHESS_PIECE_POSITIONS.KING).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.QUEEN).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.ROOK1).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.ROOK2).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.KNIGHT1).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.KNIGHT2).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.BISHOP1).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.BISHOP2).toBeDefined();
		expect(CHESS_PIECE_POSITIONS.PAWNS).toHaveLength(8);
	});
});
