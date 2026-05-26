/**
 * gameState.js - Singleton Game State Module
 * 
 * This module provides a centralised place to store and manage game state
 * that can be imported and shared across different files.
 */

// Create a singleton instance of the game state
const gameState = {
	lastGameTime: 0,
	players: {},
	chessPieces: [],
	board: { cells: {} },
	selectedPiece: null,
	phase: 'unknown',
	localPlayerId: null,
	currentPlayer: null, // Will be set in initialise()
	debugMode: false,
	activeTetromino: null,
	tetrominoList: [],
	hoveredCell: { x: -1, y: -1, z: -1 },
	gameOver: false,
	inMultiplayerMode: false,
	showChessControls: false,
	canPlaceTetromino: true,
	selectedTetrominoIndex: -1,
	// Theme flags
	autoRotateCamera: true,
	hasSnow: true,
	showTetrisGhost: true,
	isPaused: false,
	// Camera positioning
	pendingCameraReset: null,
	fpsHistory: [],
	// Player tracking
	hoveredPlayer: null,
	error: null,
	currentTetromino: null,
	boardCenter: { x: 0, y: 0, z: 0 },
	isProcessingHardDrop: false,
	// Game state
	turnPhase: 'tetris',
	inProgress: false,
	paused: false,
	score: 0,
	level: 1,
	gameStarted: false,
	orientation: 0,
	// Tetromino settings
	TETROMINO_START_HEIGHT: 10,
	// Movement queue system
	tetrominoMovementQueue: [],
	isProcessingMovementQueue: false,
	lastMovementTime: 0,
	pendingRender: false,
	// Movement deltas for relative movement
	movementDelta: { x: 0, z: 0, y: 0, rotation: 0 },
	// Active power-up orbs streamed from the server. Mutated in
	// place by the network-event handlers. The renderer reads it
	// every frame and the player-bar UI uses it to flag
	// "incoming pickup near you" hints.
	powerUps: [],
	// Captured-piece basket for the local player (private; server
	// sends it via a per-socket `captured_basket` event on join /
	// after every capture / redeem).
	capturedBasket: [],
	// Banked promotion credits for the local player. Each entry:
	// `{ id, originalX, originalZ, createdAt }`. Server pushes them
	// via `promotion_credits` (full list) and `promotion_credit_added`
	// (single new credit). Redeemed via `redeem_promotion`.
	promotionCredits: []
};

/**
 * Generate a random player ID
 * @returns {string} Random player ID
 */
function generateRandomPlayerId() {
	return 'player_' + Math.random().toString(36).substring(2, 10);
}

/**
 * Initialise the game state with default values
 */
function initialise() {
	// Set current player to a random ID initially
	gameState.currentPlayer = generateRandomPlayerId();
	
	// Check if in development mode
	const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
	if (isDevMode) {
		console.log("Development mode detected: enabling debug features");
		gameState.debugMode = true;
	}
	
	console.log('Game state has been initialised');
}

/**
 * Reset game state to initial values
 */
function reset() {
	// Save debug mode value to restore it later
	const wasDebugMode = gameState.debugMode;
	
	// Reset core game properties
	gameState.turnPhase = 'tetris';
	gameState.inProgress = false;
	gameState.paused = false;
	gameState.score = 0;
	gameState.level = 1;
	
	// Initialize empty board
	gameState.board = {
		cells: {}
	};
	
	// Clear any existing tetromino
	gameState.currentTetromino = null;
	
	// Set initial center position
	gameState.boardCenter = { x: 0, y: 0, z: 0 };
	
	// Reset camera position
	if (gameState.camera) {
		gameState.camera.position.set(0, 15, 20);
		gameState.camera.lookAt(0, 0, 0);
	}
	
	// Restore debug mode if it was enabled before reset
	gameState.debugMode = wasDebugMode;
	
	console.log('Game state has been reset');
}

/**
 * Window (ms) during which a locally-moved piece's position is trusted
 * over the server snapshot. The server may broadcast a chessPieces array
 * that still reflects the *pre-move* world for one or two ticks; without
 * this guard the user sees their piece flick back to the source square
 * and then forward again as the snapshots catch up.
 */
const OPTIMISTIC_POSITION_TTL_MS = 2500;

/**
 * Smart-merge the incoming chessPieces array with the local one so that
 * pieces we just optimistically moved keep their client-side position
 * until the server confirms the move. Without this, the `Object.assign`
 * below would clobber `position` on every `game_update` arriving during
 * the brief window between the client-side animation finishing and the
 * server broadcasting the new authoritative state.
 *
 * The caller can hint at an in-flight piece via `gameState.inFlightMove`
 * — that takes precedence. As a safety net we also preserve any local
 * piece whose `clientMovedAt` stamp is recent and disagrees with the
 * server position; this catches edge cases like delayed acks.
 */
function mergeChessPieces(localPieces, serverPieces, inFlight, now) {
	if (!Array.isArray(serverPieces)) return localPieces;
	if (!Array.isArray(localPieces) || localPieces.length === 0) {
		return serverPieces;
	}

	const localById = new Map();
	for (const lp of localPieces) {
		if (lp && lp.id) localById.set(String(lp.id), lp);
	}

	const inFlightId = inFlight?.pieceId ? String(inFlight.pieceId) : null;
	const inFlightFresh = inFlight && (
		!Number.isFinite(inFlight.startedAt)
		|| (now - inFlight.startedAt) < OPTIMISTIC_POSITION_TTL_MS
	);

	const merged = [];
	for (const sp of serverPieces) {
		if (!sp || !sp.id) {
			merged.push(sp);
			continue;
		}
		const idStr = String(sp.id);
		const local = localById.get(idStr);

		// Hold the optimistic position for the in-flight piece until the
		// server snapshot catches up to (toX, toZ).
		if (inFlightId && idStr === inFlightId && inFlightFresh) {
			const targetX = Number(inFlight.toX);
			const targetZ = Number(inFlight.toZ);
			const serverX = Number(sp.position?.x);
			const serverZ = Number(sp.position?.z);
			if (serverX !== targetX || serverZ !== targetZ) {
				merged.push({ ...sp, position: { x: targetX, z: targetZ } });
				continue;
			}
		}

		// Generic recency guard: any piece the client marked "I just
		// moved this" within the TTL trusts the local position unless
		// the server has already caught up.
		if (local && Number.isFinite(local.clientMovedAt)
			&& (now - local.clientMovedAt) < OPTIMISTIC_POSITION_TTL_MS) {
			const lx = Number(local.position?.x);
			const lz = Number(local.position?.z);
			const sx = Number(sp.position?.x);
			const sz = Number(sp.position?.z);
			if (Number.isFinite(lx) && Number.isFinite(lz) && (lx !== sx || lz !== sz)) {
				merged.push({
					...sp,
					position: { x: lx, z: lz },
					clientMovedAt: local.clientMovedAt,
				});
				continue;
			}
		}

		merged.push(sp);
	}
	return merged;
}

/**
 * Update the game state with new data
 * @param {Object} data - The new game state data
 */
function update(data) {
	if (!data) return;
	
	const newData = data;
	
	// Preserve client-managed properties that should NOT be overwritten by server
	// turnPhase is managed by the client (tetris/chess phase transitions)
	// currentTetromino is managed locally during gameplay
	const preservedTurnPhase = gameState.turnPhase;
	const preservedCurrentTetromino = gameState.currentTetromino;
	const preservedInProgress = gameState.inProgress;

	// Smart-merge chess pieces BEFORE Object.assign so we don't clobber
	// any optimistic local positions. See mergeChessPieces() above.
	if (Array.isArray(newData.chessPieces)) {
		newData.chessPieces = mergeChessPieces(
			gameState.chessPieces,
			newData.chessPieces,
			gameState.inFlightMove,
			Date.now(),
		);
	}
	
	Object.assign(gameState, newData);
	
	// Restore client-managed properties (don't let server overwrite them)
	if (preservedInProgress) {
		// Only preserve turnPhase if game is in progress (player has started playing)
		gameState.turnPhase = preservedTurnPhase;
		// Don't overwrite currentTetromino with server data during gameplay
		if (preservedCurrentTetromino && !newData.currentTetromino) {
			gameState.currentTetromino = preservedCurrentTetromino;
		}
	}

	// Normalise powerUps so the renderer always sees an array. The
	// server includes them in every full game_update payload; sparse
	// deltas don't carry them but the periodic full updates do.
	if (Array.isArray(newData.powerUps)) {
		gameState.powerUps = newData.powerUps.slice();
	} else if (!Array.isArray(gameState.powerUps)) {
		gameState.powerUps = [];
	}
	if (Array.isArray(newData.capturedBasket)) {
		gameState.capturedBasket = newData.capturedBasket.slice();
	} else if (!Array.isArray(gameState.capturedBasket)) {
		gameState.capturedBasket = [];
	}
	if (Array.isArray(newData.promotionCredits)) {
		gameState.promotionCredits = newData.promotionCredits.slice();
	} else if (!Array.isArray(gameState.promotionCredits)) {
		gameState.promotionCredits = [];
	}
	
	// Make sure gameStarted flag is set if we have board data
	const _hasCells = gameState.board?.cells && (function() { for (const _ in gameState.board.cells) return true; return false; })();
	if (_hasCells) {
		gameState.gameStarted = true;
		if (gameState.chessPieces.length > 0) {
			gameState.orientation = gameState.chessPieces[0].orientation;
		}
	}

	// Infer _hasPlacedTetromino from board state so reconnecting players
	// don't get false-positive first-placement rules on the client.
	if (!gameState._hasPlacedTetromino && gameState.board?.cells && gameState.localPlayerId) {
		const pid = String(gameState.localPlayerId);
		for (const cell of Object.values(gameState.board.cells)) {
			const items = Array.isArray(cell) ? cell : (cell?.contents || []);
			if (items.some(i => i && String(i.player) === pid && i.type === 'tetromino')) {
				gameState._hasPlacedTetromino = true;
				break;
			}
		}
	}
}

// Initialise the game state
initialise();

// Export the singleton instance and its methods
export default gameState;
export { reset, update, initialise };
