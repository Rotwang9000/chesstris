/**
 * 7-bag tetromino randomisation (client side).
 *
 * The server deals the real pieces (see dealer.js). This local bag only
 * stands in until the first deal arrives, e.g. while offline.
 * Pieces are drawn without replacement, then the bag is refilled and
 * reshuffled.
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

export { TETROMINO_TYPES };
