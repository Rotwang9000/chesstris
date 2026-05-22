/**
 * 7-bag tetromino randomisation (client side).
 *
 * Mirrors the same scheme used on the server (`server/game/TetrominoManager.js`).
 * Each player keeps a personal bag of the seven piece types; pieces are
 * drawn without replacement, then the bag is refilled and reshuffled.
 *
 * The bag and the "next" piece live on `gameState` itself so they
 * survive renders without any module-level state of our own.
 */

const TETROMINO_TYPES = Object.freeze(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);

/** Fisher–Yates shuffle of a fresh copy of the 7 piece types. */
export function createShuffledTetrominoBag() {
	const bag = TETROMINO_TYPES.slice();
	for (let i = bag.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[bag[i], bag[j]] = [bag[j], bag[i]];
	}
	return bag;
}

/**
 * Pop the next piece from the player's bag (refilling first if
 * necessary).  Returns the type string ('I', 'J', …).
 */
export function drawFromBag(gameState) {
	if (!Array.isArray(gameState.tetrominoBag) || gameState.tetrominoBag.length === 0) {
		gameState.tetrominoBag = createShuffledTetrominoBag();
	}
	const next = gameState.tetrominoBag.shift();
	if (gameState.tetrominoBag.length === 0) {
		gameState.tetrominoBag = createShuffledTetrominoBag();
	}
	return next;
}

/**
 * Advance the bag: returns the type of the new "current" tetromino
 * after rolling the existing `nextTetromino` into the active slot and
 * drawing a new look-ahead piece.
 */
export function rollBagForward(gameState) {
	if (!gameState.nextTetromino) {
		gameState.nextTetromino = drawFromBag(gameState);
	}
	const currentType = gameState.nextTetromino;
	gameState.nextTetromino = drawFromBag(gameState);
	return currentType;
}

export { TETROMINO_TYPES };
