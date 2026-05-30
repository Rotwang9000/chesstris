/**
 * Tetromino spawn logic — picking a fresh piece from the bag, deciding
 * where it appears above the board, and creating its initial data object.
 *
 * Lives separately from `rendering.js` so the spawn pipeline can run
 * before any Three.js context is established (e.g., during server
 * reconciliation on reconnect).
 */

import { boardFunctions } from '../boardFunctions.js';
import { fetchNextSponsor } from '../../utils/sponsors.js';
import { getShape } from './shapes.js';
import { rollBagForward } from './bag.js';
import { isValidTetrominoPosition, isTetrominoAdjacentToExistingCells } from './validation.js';
import { updateNextTetrominoDisplay } from './nextPiece.js';

const MAX_LATERAL_OFFSET = 6;
const MIN_FORWARD_DISTANCE = 1;
const MAX_FORWARD_DISTANCE = 20;
const MAX_CANDIDATES = 6;
const SPAWN_HEIGHT = 10;

const KING_DIRECTIONS = Object.freeze({
	0: { x: 0, z: 1 },
	1: { x: 1, z: 0 },
	2: { x: 0, z: -1 },
	3: { x: -1, z: 0 },
});

function buildLateralOffsets(maxAbs) {
	const offsets = [0];
	for (let i = 1; i <= maxAbs; i++) offsets.push(i, -i);
	return offsets;
}

/**
 * Find a sensible spawn location for the given shape, relative to the
 * player's king. Returns `{ x, z, heightAboveBoard }` or `null` if the
 * king cannot be located.
 */
export function determineInitialTetrominoPosition(gameState, shapeOverride = null) {
	const currentPlayer = gameState.currentPlayer;
	const kingPiece = boardFunctions.getPlayersKing(gameState, currentPlayer, false);
	if (!kingPiece) return null;

	const kingPosition = { x: kingPiece.position.x, z: kingPiece.position.z };
	const kingOrientation = kingPiece.orientation ?? 0;
	const kingDirection = KING_DIRECTIONS[kingOrientation] || KING_DIRECTIONS[0];

	const rightVector = {
		x: -kingDirection.z,
		z: kingDirection.x,
	};

	const shapeToTest = Array.isArray(shapeOverride)
		? shapeOverride
		: (gameState.currentTetromino?.shape || null);
	if (!shapeToTest) {
		console.warn('Tetromino: No shape available for spawn search; using a 1x1 fallback.');
	}
	const collisionShape = shapeToTest || [[1]];

	const lateralOffsets = buildLateralOffsets(MAX_LATERAL_OFFSET);
	const candidates = [];

	const tryAddCandidate = (posX, posZ, requireAdjacency) => {
		if (!isValidTetrominoPosition(gameState, collisionShape, { x: posX, z: posZ })) return false;
		if (requireAdjacency && !isTetrominoAdjacentToExistingCells(gameState, collisionShape, posX, posZ)) return false;
		candidates.push({ x: posX, z: posZ });
		return true;
	};

	for (let forwardDistance = MIN_FORWARD_DISTANCE; forwardDistance <= MAX_FORWARD_DISTANCE; forwardDistance++) {
		for (const lateralOffset of lateralOffsets) {
			const testX = kingPosition.x + (rightVector.x * lateralOffset) + (kingDirection.x * forwardDistance);
			const testZ = kingPosition.z + (rightVector.z * lateralOffset) + (kingDirection.z * forwardDistance);
			if (tryAddCandidate(Math.round(testX), Math.round(testZ), true) && candidates.length >= MAX_CANDIDATES) {
				forwardDistance = MAX_FORWARD_DISTANCE + 1;
				break;
			}
		}
	}

	if (candidates.length === 0) {
		for (let forwardDistance = MIN_FORWARD_DISTANCE; forwardDistance <= MAX_FORWARD_DISTANCE; forwardDistance++) {
			for (const lateralOffset of lateralOffsets) {
				const testX = kingPosition.x + (rightVector.x * lateralOffset) + (kingDirection.x * forwardDistance);
				const testZ = kingPosition.z + (rightVector.z * lateralOffset) + (kingDirection.z * forwardDistance);
				if (tryAddCandidate(Math.round(testX), Math.round(testZ), false) && candidates.length >= MAX_CANDIDATES) {
					forwardDistance = MAX_FORWARD_DISTANCE + 1;
					break;
				}
			}
		}
	}

	const chosen = candidates.length > 0
		? candidates[Math.floor(Math.random() * candidates.length)]
		: { x: kingPosition.x, z: kingPosition.z };

	console.log(`Initial tetromino spawn selected: (${chosen.x}, ${chosen.z}) candidates=${candidates.length}`);

	return {
		x: chosen.x,
		z: chosen.z,
		heightAboveBoard: SPAWN_HEIGHT,
	};
}

/**
 * Build a tetromino of the requested type at the best spawn location.
 * Returns `null` when no spawn location can be found (e.g., king missing
 * from the game state).
 */
export function initializeNewTetromino(gameState, type) {
	const shape = getShape(type);
	const initialPosition = determineInitialTetrominoPosition(gameState, shape);
	console.log('Initial tetromino position', initialPosition);
	if (!initialPosition) {
		console.log('Tetromino: No initial position found, returning null');
		return null;
	}

	const tetromino = {
		type,
		shape,
		// Rotation index (0..3) matching the server's
		// `TETROMINO_SHAPES[type][rotation]`. The server discards the
		// client `shape` and rebuilds from `(type, rotation)`, so
		// keeping this in sync with the rotated matrix is critical —
		// otherwise rotated pieces validate connectivity against the
		// canonical un-rotated cells. See processRotate().
		rotation: 0,
		position: { x: initialPosition.x, z: initialPosition.z },
		heightAboveBoard: initialPosition.heightAboveBoard,
		sponsor: null,
		// Fall state, stored ON the tetromino so it's naturally
		// per-piece and survives any cross-module reference shuffling
		// (no module-scope timers to get out of sync). Per the user
		// spec:
		//   "the piece hovered until a key was pressed, then it would
		//    drop a bit every second or so… the drop should pause
		//    half a second if they move it… these delays should
		//    happen concurrently"
		//
		// - `fallStarted` is flipped to `true` by the first manual
		//   move/rotate/hard-drop in `movementQueue.js`.
		// - `lastMoveTime` is stamped on every manual move so the
		//   0.5 s pause runs in parallel with the 1 s fall rhythm.
		// - `lastFallTime` is set the first tick the game loop sees
		//   `fallStarted`, and after every auto-fall.
		fallStarted: false,
		lastMoveTime: 0,
		lastFallTime: 0,
	};

	fetchNextSponsor()
		.then(sponsor => {
			if (!sponsor) return;
			tetromino.sponsor = sponsor;
			console.log('Sponsor attached to tetromino:', sponsor.name);
		})
		.catch(err => console.warn('Could not fetch sponsor for tetromino:', err));

	return tetromino;
}

/**
 * Roll the bag forward, update the HUD preview, and spawn the new
 * "current" tetromino on `gameState`.  Returns the new piece (or
 * `null` if no spawn location is available).
 */
export function initializeNextTetromino(gameState) {
	const currentType = rollBagForward(gameState);
	updateNextTetrominoDisplay(gameState.nextTetromino, gameState);
	console.log(`Initializing new tetromino of type ${currentType}. Next tetromino will be ${gameState.nextTetromino}`);
	return initializeNewTetromino(gameState, currentType);
}
