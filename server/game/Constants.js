/**
 * Centralised game constants for Tetches.
 *
 * `docs/players-bible.md` is the canonical reference for the *meaning* of these
 * values. When changing a tunable here, update the bible too.
 */

// ── Board / world settings ─────────────────────────────────────────────────
const BOARD_SETTINGS = Object.freeze({
	// How many players may share a single game/world.
	// The default mode is a single continuous shared world; this is a
	// generous safety cap, not a target. Each player adds 16 chess pieces
	// plus territory, so very large numbers become slow.
	MAX_PLAYERS_PER_GAME: 32,

	// Home zone size (in cells). One row of major pieces + one row of pawns.
	HOME_ZONE_WIDTH: 8,
	HOME_ZONE_HEIGHT: 2,

	// Spacing between adjacent home zones in the spiral placement pattern.
	// 16 cells means pawns from facing home zones clash after exactly 8
	// forward moves — which is the strategic sweet spot the rules assume.
	HOME_ZONE_DISTANCE: 16,

	// How long a home zone may be idle before its markers convert to normal
	// owned terrain (cells/pieces are preserved; only the protection is lost).
	HOME_ZONE_DEGRADATION_INTERVAL: 300_000, // 5 min — long enough that
	// a player reading the chat or thinking about their next move isn't
	// silently kneecapped by losing their safe home zone behind their back.

	// Spiral pattern used by `BoardGenerator.calculateHomePosition`. Each
	// step is a right angle from the previous one (right, down, left, up).
	SPIRAL_DIRECTIONS: [
		{ x: 1, z: 0 },
		{ x: 0, z: 1 },
		{ x: -1, z: 0 },
		{ x: 0, z: -1 },
	],
});

// ── Player settings ────────────────────────────────────────────────────────
const PLAYER_SETTINGS = Object.freeze({
	// Real-time anti-spam cooldowns. The server is authoritative; clients may
	// animate "phases" for UX but the server rejects spammy actions.
	CHESS_MOVE_COOLDOWN_MS: 500,
	TETROMINO_PLACEMENT_COOLDOWN_MS: 800,

	// Scoring
	POINTS_PER_ROW: 100,
	POINTS_PER_TETROMINO_CELL: 10,
});

// ── AI / computer-player difficulty ────────────────────────────────────────
const DIFFICULTY_SETTINGS = Object.freeze({
	EASY:   { name: 'easy',   displayName: 'Novice',   minMoveInterval: 15_000 },
	MEDIUM: { name: 'medium', displayName: 'Standard', minMoveInterval: 10_000 },
	HARD:   { name: 'hard',   displayName: 'Expert',   minMoveInterval:  5_000 },
});

// ── Piece purchases (Solana) ───────────────────────────────────────────────
const PIECE_PRICES = Object.freeze({
	PAWN:   0.1,
	ROOK:   0.5,
	KNIGHT: 0.5,
	BISHOP: 0.5,
	QUEEN:  1.0,
	// Kings cannot be purchased.
});

// ── Tetromino shapes (4 rotations each, top-down) ──────────────────────────
const TETROMINO_SHAPES = Object.freeze({
	I: [
		[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
		[[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
		[[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
		[[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
	],
	O: [
		[[1, 1], [1, 1]],
		[[1, 1], [1, 1]],
		[[1, 1], [1, 1]],
		[[1, 1], [1, 1]],
	],
	T: [
		[[0, 1, 0], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 1], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 1], [0, 1, 0]],
		[[0, 1, 0], [1, 1, 0], [0, 1, 0]],
	],
	S: [
		[[0, 1, 1], [1, 1, 0], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 1], [0, 0, 1]],
		[[0, 0, 0], [0, 1, 1], [1, 1, 0]],
		[[1, 0, 0], [1, 1, 0], [0, 1, 0]],
	],
	Z: [
		[[1, 1, 0], [0, 1, 1], [0, 0, 0]],
		[[0, 0, 1], [0, 1, 1], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 0], [0, 1, 1]],
		[[0, 1, 0], [1, 1, 0], [1, 0, 0]],
	],
	J: [
		[[1, 0, 0], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 1], [0, 1, 0], [0, 1, 0]],
		[[0, 0, 0], [1, 1, 1], [0, 0, 1]],
		[[0, 1, 0], [0, 1, 0], [1, 1, 0]],
	],
	L: [
		[[0, 0, 1], [1, 1, 1], [0, 0, 0]],
		[[0, 1, 0], [0, 1, 0], [0, 1, 1]],
		[[0, 0, 0], [1, 1, 1], [1, 0, 0]],
		[[1, 1, 0], [0, 1, 0], [0, 1, 0]],
	],
});

const TETROMINO_TYPES = Object.freeze(Object.keys(TETROMINO_SHAPES));

// ── Chess piece starting positions (relative to home zone top-left) ────────
const CHESS_PIECE_POSITIONS = Object.freeze({
	KING:    { x: 4, z: 0 },
	QUEEN:   { x: 3, z: 0 },
	BISHOP1: { x: 2, z: 0 },
	BISHOP2: { x: 5, z: 0 },
	KNIGHT1: { x: 1, z: 0 },
	KNIGHT2: { x: 6, z: 0 },
	ROOK1:   { x: 0, z: 0 },
	ROOK2:   { x: 7, z: 0 },
	PAWNS: [
		{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 },
		{ x: 4, z: 1 }, { x: 5, z: 1 }, { x: 6, z: 1 }, { x: 7, z: 1 },
	],
});

// ── Game rules ─────────────────────────────────────────────────────────────
const GAME_RULES = Object.freeze({
	// 8 consecutive owned cells along either axis triggers a row clear.
	REQUIRED_CELLS_FOR_ROW_CLEARING: 8,

	// Pawns may promote after this much net forward distance from their
	// starting row (orientation-aware). The player chooses Q/R/B/N or
	// auto-promotes to Queen after the timeout.
	PAWN_PROMOTION_DISTANCE: 9,
	AUTO_QUEEN_TIMEOUT_MS: 15_000,

	// On king capture, defeated player's pawns become suicidal:
	// after a 3s pause they self-destruct one every 0.5s.
	SUICIDAL_PAWN_DELAY_MS: 3_000,
	SUICIDAL_PAWN_INTERVAL_MS: 500,

	// Two players capturing each other's kings within this window enter a
	// King's Duel mini-game instead of resolving both captures.
	SIMULTANEOUS_CAPTURE_WINDOW_MS: 1_000,
	KING_DUEL_TIMEOUT_MS: 10_000,
	KING_DUEL_GRID_COLS: 4,
	KING_DUEL_GRID_ROWS: 2,
	KING_DUEL_MAX_ROUNDS: 5,
});

module.exports = {
	BOARD_SETTINGS,
	PLAYER_SETTINGS,
	DIFFICULTY_SETTINGS,
	PIECE_PRICES,
	TETROMINO_SHAPES,
	TETROMINO_TYPES,
	CHESS_PIECE_POSITIONS,
	GAME_RULES,
};
