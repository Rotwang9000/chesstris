/**
 * Tetromino rendering — Three.js mesh creation for both the active
 * tetromino and its ghost piece.
 *
 * Object lifetime is managed by the shared pool in `./pool.js`.
 * Every block we add to a scene group exposes a `dispose()` method (or
 * its parent group does) so the cleanup helpers below can return the
 * mesh to the pool when the tetromino is removed.
 */

import { getTHREE, getPlayerColors } from '../gameContext.js';
import { boardFunctions } from '../boardFunctions.js';
import { translatePosition } from '../centreBoardMarker.js';
import { tetrominoPool } from './pool.js';
import { validatePlacementLocally } from './validation.js';

const PLAYER_COLORS = getPlayerColors();

// Traffic-light ghost: the landing outline doubles as a legality signal.
// New players' single biggest stumble was dropping a piece one square too
// far, watching it silently dissolve, and not knowing why — the ghost now
// answers "will this stick?" before they commit.
const GHOST_VALID_COLOUR = 0x00dd66;   // green — drop here and it places
const GHOST_INVALID_COLOUR = 0xff3344; // red — drop here and it dissolves
const GHOST_VALID_OPACITY = 0.5;
const GHOST_INVALID_OPACITY = 0.65;

// Standard Tetris colour palette, indexed by piece type.
const PIECE_COLOURS = Object.freeze({
	I: 0x00ffff, // cyan
	J: 0x0000ff, // blue
	L: 0xff8000, // orange
	O: 0xffff00, // yellow
	S: 0x00ff00, // green
	T: 0x800080, // purple
	Z: 0xff0000, // red
});

const FALLBACK_COLOUR = 0xcccccc;
const UNKNOWN_COLOUR = 0x888888;

/**
 * Pick a colour for a tetromino block. The falling piece belongs to
 * the LOCAL player, so it is painted with the player's own territory
 * colour (warm wood in the world, blended seat colour in a battle) —
 * exactly what the blocks will look like once placed. Previously the
 * SHAPE LETTER ('L', 'O', …) was fed into the player-colour hash,
 * which painted every falling piece an arbitrary cyan/green.
 */
function resolveColour(playerType, gameState) {
	const localId = gameState?.localPlayerId || gameState?.myPlayerId || null;
	if (localId && boardFunctions && typeof boardFunctions.getPlayerColor === 'function') {
		try {
			const c = boardFunctions.getPlayerColor(localId, gameState, 'tetromino');
			if (c && c !== FALLBACK_COLOUR) return c;
		} catch (err) {
			console.warn('Error using centralised colour function, falling back:', err);
		}
	}

	if (typeof playerType === 'number') {
		return PLAYER_COLORS[playerType] ?? FALLBACK_COLOUR;
	}
	if (typeof playerType === 'string') {
		return PIECE_COLOURS[playerType] ?? UNKNOWN_COLOUR;
	}
	return FALLBACK_COLOUR;
}

function applyBlockMaterial(block, color, { isGhost, isRetro }) {
	if (!block.material) return;
	const THREE = getTHREE();
	block.material.color.setHex(color);
	block.material.transparent = isGhost;
	block.material.opacity = isGhost ? 0.3 : 1.0;
	block.material.wireframe = isGhost || isRetro;
	if (isRetro && !isGhost) {
		block.material.emissive = new THREE.Color(color);
		block.material.emissiveIntensity = 0.6;
	} else {
		block.material.emissive = new THREE.Color(0x000000);
		block.material.emissiveIntensity = 0;
	}
	block.material.needsUpdate = true;
}

/**
 * Create one positioned block group containing a pooled mesh.  The
 * returned group exposes `dispose()` so callers can release pooled
 * resources cleanly.
 */
export function createTetrominoBlock(x, z, playerType, isGhost = false, heightAboveBoard = 0, gameState = null) {
	const THREE = getTHREE();
	const block = tetrominoPool.getTetrominoBlock();

	const absPos = translatePosition({ x, z }, gameState, true);
	const color = resolveColour(playerType, gameState);

	applyBlockMaterial(block, color, {
		isGhost,
		isRetro: !!gameState?.retroMode,
	});

	const heightPos = isGhost ? 0.1 : (0.6 + heightAboveBoard);
	block.position.set(0, heightPos, 0);
	block.castShadow = !isGhost;
	block.receiveShadow = !isGhost;
	block.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType,
		position: { x, z },
		heightAboveBoard,
		pooledObject: true,
	};

	const blockGroup = new THREE.Group();
	blockGroup.add(block);
	blockGroup.position.set(absPos.x, 0, absPos.z);
	blockGroup.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType,
		position: { x, z },
		heightAboveBoard,
		pooledMesh: block,
	};
	blockGroup.dispose = function () {
		if (this.children.length > 0) {
			const mesh = this.children[0];
			tetrominoPool.returnTetrominoBlock(mesh);
			this.remove(mesh);
		}
	};

	return blockGroup;
}

/** Minimal placeholder mesh used by external code that just wants a quick visual stand-in. */
export function createTetrominoMesh(tetrominoData) {
	const THREE = getTHREE();
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const material = new THREE.MeshBasicMaterial({ color: tetrominoData?.color || 0x000000 });
	return new THREE.Mesh(geometry, material);
}

/**
 * Render the current tetromino into `gameState.tetrominoGroup`.
 * Returns `true` on success.
 */
export function renderTetromino(gameState) {
	if (!gameState || !gameState.currentTetromino || !gameState.tetrominoGroup) {
		console.warn('Cannot render tetromino: missing required objects', gameState);
		return false;
	}

	try {
		while (gameState.tetrominoGroup.children.length > 0) {
			const child = gameState.tetrominoGroup.children[0];
			if (child.dispose) child.dispose();
			gameState.tetrominoGroup.remove(child);
		}
		gameState.ghostPieceGroup = null;

		const tetromino = gameState.currentTetromino;
		const shape = tetromino.shape;
		const heightAboveBoard = tetromino.heightAboveBoard || 0;
		const absPos = translatePosition(tetromino.position, gameState, true);

		const THREE = getTHREE();
		const shapeGroup = new THREE.Group();
		shapeGroup.position.set(absPos.x, heightAboveBoard, absPos.z);

		const color = resolveColour(tetromino.type, gameState);

		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] !== 1) continue;
				const block = tetrominoPool.getTetrominoBlock();
				applyBlockMaterial(block, color, { isGhost: false, isRetro: false });
				block.position.set(x, 0, z);
				block.castShadow = true;
				block.receiveShadow = true;
				block.userData = {
					type: 'tetrominoBlock',
					playerType: tetromino.type,
					relativePosition: { x, z },
					position: { x, z },
					heightAboveBoard,
					pooledObject: true,
				};
				shapeGroup.add(block);
			}
		}

		shapeGroup.userData.renderedColour = color;
		gameState.tetrominoGroup.add(shapeGroup);
		gameState.currentTetrominoShapeGroup = shapeGroup;

		if (gameState.showTetrisGhost && heightAboveBoard > 0) {
			renderGhostPiece(gameState, tetromino);
		}

		if (window.renderer && window.scene && window.camera) {
			window.renderer.render(window.scene, window.camera);
		}
		return true;
	} catch (error) {
		console.error('Error rendering tetromino:', error);
		return false;
	}
}

/**
 * Repaint the current falling piece if the player's resolved colour
 * has changed since it was rendered. Player records (and battle seat
 * colours) often arrive AFTER the piece is first drawn — without this
 * the piece keeps the provisional colour until the player moves it.
 */
export function refreshTetrominoColourIfStale(gameState) {
	const group = gameState?.currentTetrominoShapeGroup;
	const tetromino = gameState?.currentTetromino;
	if (!group || !tetromino) return false;
	const colour = resolveColour(tetromino.type, gameState);
	if (group.userData.renderedColour === colour) return false;
	for (const block of group.children) {
		applyBlockMaterial(block, colour, { isGhost: false, isRetro: !!gameState?.retroMode });
	}
	group.userData.renderedColour = colour;
	return true;
}

/**
 * Draw an outline-only ghost piece at y=0 directly under the current
 * tetromino.  Skipped if the tetromino is already at board level.
 *
 * The ghost is colour-coded by placement legality at the current (x, z):
 * green = the drop will place, red = it will dissolve (collision, not
 * touching your territory, or no path back to your king). Validity is
 * re-evaluated on every re-render, i.e. after each move/rotate.
 */
function renderGhostPiece(gameState, tetromino) {
	const currentHeight = tetromino.position.y || tetromino.heightAboveBoard || 0;
	if (currentHeight <= 0) return;

	const ghostPos = { x: tetromino.position.x, y: 0, z: tetromino.position.z };
	const absPos = translatePosition(ghostPos, gameState, true);

	let wouldPlace = true;
	try {
		wouldPlace = validatePlacementLocally(tetromino, gameState);
	} catch (err) {
		// Validation is a UI hint only — on error keep the optimistic
		// colour rather than scare the player; the server still decides.
		console.warn('Ghost validity check failed:', err);
	}
	const color = wouldPlace ? GHOST_VALID_COLOUR : GHOST_INVALID_COLOUR;
	const opacity = wouldPlace ? GHOST_VALID_OPACITY : GHOST_INVALID_OPACITY;

	const THREE = getTHREE();
	const ghostGroup = new THREE.Group();
	ghostGroup.position.set(absPos.x, 0.1, absPos.z);

	for (let z = 0; z < tetromino.shape.length; z++) {
		for (let x = 0; x < tetromino.shape[z].length; x++) {
			if (tetromino.shape[z][x] !== 1) continue;
			const block = tetrominoPool.getTetrominoBlock();
			if (block.material) {
				block.material.color.setHex(color);
				block.material.transparent = true;
				block.material.opacity = opacity;
				block.material.wireframe = true;
				block.material.wireframeLinewidth = 2;
				if (block.material.emissive) {
					block.material.emissive.setHex(color);
					block.material.emissiveIntensity = 0.4;
				}
				block.material.needsUpdate = true;
			}
			block.position.set(x, 0, z);
			block.castShadow = false;
			block.receiveShadow = false;
			block.userData = {
				type: 'ghostBlock',
				playerType: tetromino.type,
				relativePosition: { x, z },
				position: { x, z },
				heightAboveBoard: 0,
				pooledObject: true,
			};
			ghostGroup.add(block);
		}
	}

	gameState.tetrominoGroup.add(ghostGroup);
	gameState.ghostPieceGroup = ghostGroup;
}

/** Returns all pooled meshes inside `group` to the pool; disposes anything else. */
function disposeGroupChildren(group) {
	if (!group || !group.children) return;
	while (group.children.length > 0) {
		const child = group.children[0];
		group.remove(child);
		if (child.userData && child.userData.pooledObject) {
			tetrominoPool.returnTetrominoBlock(child);
			continue;
		}
		if (child.geometry) child.geometry.dispose();
		if (child.material) {
			if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
			else child.material.dispose();
		}
	}
}

export function cleanupCurrentTetromino(gameState) {
	if (!gameState?.currentTetromino || !gameState?.tetrominoGroup) return;
	disposeGroupChildren(gameState.tetrominoGroup);
	gameState.currentTetromino = null;
	gameState.currentTetrominoShapeGroup = null;
	gameState.ghostPieceGroup = null;
}

export function cleanupGhostPiece(gameState) {
	const tetrominoGroup = gameState?.tetrominoGroup;
	const ghostGroup = gameState?.ghostPieceGroup;
	if (!ghostGroup || !tetrominoGroup) return;
	disposeGroupChildren(ghostGroup);
	tetrominoGroup.remove(ghostGroup);
	gameState.ghostPieceGroup = null;
}

/**
 * Move the existing shape group to a new logical board position
 * without re-creating any meshes. Returns `true` if the move was
 * applied directly.
 */
export function moveShapeGroup(gameState, newBoardPos) {
	if (!gameState?.currentTetrominoShapeGroup) return false;
	const absPos = translatePosition(newBoardPos, gameState, true);
	gameState.currentTetrominoShapeGroup.position.x = absPos.x;
	gameState.currentTetrominoShapeGroup.position.z = absPos.z;
	return true;
}

/** Synchronise the visual position of the current tetromino + ghost. */
export function synchronizeCenterPositions(gameState) {
	if (!gameState || !gameState.currentTetromino) return;
	const tetromino = gameState.currentTetromino;
	const heightAboveBoard = tetromino.heightAboveBoard || 0;
	const absPos = translatePosition(tetromino.position, gameState, true);
	if (gameState.currentTetrominoShapeGroup) {
		gameState.currentTetrominoShapeGroup.position.set(absPos.x, heightAboveBoard, absPos.z);
	}
	if (gameState.ghostPieceGroup) {
		gameState.ghostPieceGroup.position.set(absPos.x, 0, absPos.z);
	}
}

export function preloadTetrominoBlocks(count = 50) {
	tetrominoPool.preloadTetrominoBlocks(count);
}
