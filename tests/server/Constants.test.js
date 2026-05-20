/**
 * Tests for server/game/Constants.js
 *
 * The values here must agree with `docs/players-bible.md`. If you change one,
 * change the other.
 */

const {
	BOARD_SETTINGS,
	PLAYER_SETTINGS,
	PIECE_PRICES,
	GAME_RULES,
	TETROMINO_SHAPES,
	TETROMINO_TYPES,
	CHESS_PIECE_POSITIONS,
	DIFFICULTY_SETTINGS,
} = require('../../server/game/Constants');

describe('Constants — bible compliance', () => {
	test('board settings match bible', () => {
		expect(BOARD_SETTINGS.HOME_ZONE_WIDTH).toBe(8);
		expect(BOARD_SETTINGS.HOME_ZONE_HEIGHT).toBe(2);
		expect(BOARD_SETTINGS.HOME_ZONE_DISTANCE).toBe(16);
		expect(BOARD_SETTINGS.MAX_PLAYERS_PER_GAME).toBe(32);
		expect(BOARD_SETTINGS.HOME_ZONE_DEGRADATION_INTERVAL).toBe(300_000);
	});

	test('spiral directions have 4 right-angle steps', () => {
		expect(BOARD_SETTINGS.SPIRAL_DIRECTIONS).toHaveLength(4);
		const sumX = BOARD_SETTINGS.SPIRAL_DIRECTIONS.reduce((a, d) => a + d.x, 0);
		const sumZ = BOARD_SETTINGS.SPIRAL_DIRECTIONS.reduce((a, d) => a + d.z, 0);
		expect(sumX).toBe(0);
		expect(sumZ).toBe(0);
	});

	test('player cooldowns match bible', () => {
		expect(PLAYER_SETTINGS.CHESS_MOVE_COOLDOWN_MS).toBe(500);
		expect(PLAYER_SETTINGS.TETROMINO_PLACEMENT_COOLDOWN_MS).toBe(800);
	});

	test('difficulty intervals match bible', () => {
		expect(DIFFICULTY_SETTINGS.EASY.minMoveInterval).toBe(15_000);
		expect(DIFFICULTY_SETTINGS.MEDIUM.minMoveInterval).toBe(10_000);
		expect(DIFFICULTY_SETTINGS.HARD.minMoveInterval).toBe(5_000);
	});

	test('game rules match bible', () => {
		expect(GAME_RULES.REQUIRED_CELLS_FOR_ROW_CLEARING).toBe(8);
		expect(GAME_RULES.PAWN_PROMOTION_DISTANCE).toBe(9);
		expect(GAME_RULES.AUTO_QUEEN_TIMEOUT_MS).toBe(15_000);
		expect(GAME_RULES.SUICIDAL_PAWN_DELAY_MS).toBe(3_000);
		expect(GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS).toBe(500);
		expect(GAME_RULES.SIMULTANEOUS_CAPTURE_WINDOW_MS).toBe(1_000);
		expect(GAME_RULES.KING_DUEL_TIMEOUT_MS).toBe(10_000);
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

	test('BOARD_SETTINGS is frozen', () => {
		expect(Object.isFrozen(BOARD_SETTINGS)).toBe(true);
	});

	test('seven standard tetromino shapes exist', () => {
		const shapes = Object.keys(TETROMINO_SHAPES);
		expect(shapes).toEqual(expect.arrayContaining(['I', 'O', 'T', 'S', 'Z', 'J', 'L']));
		expect(shapes).toHaveLength(7);
		expect(TETROMINO_TYPES).toHaveLength(7);
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
