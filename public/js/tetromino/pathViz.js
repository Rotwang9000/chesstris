/**
 * Tetromino → king path visualisation.
 *
 * `hasPathToKing` runs a BFS over the player's owned territory to find a
 * route from a board cell to that player's king (matching the server's
 * orthogonal-only island rules).
 *
 * `updatePathVisualization` is called from the animation loop; it
 * simulates the in-flight tetromino into the board's cell map and finds
 * the shortest path under each occupied tetromino cell, then asks
 * `highlightPathToKing` to draw a translucent path overlay.
 */

import { getTHREE } from '../gameContext.js';
import { boardFunctions } from '../boardFunctions.js';

const PATH_VIZ_THROTTLE_MS = 250;

let lastPosKey = null;
let lastPosTime = 0;

/**
 * BFS pathfind from (startX, startZ) to the player's king through their
 * owned territory.  Returns the path array, or `false` if unreachable.
 */
export function hasPathToKing(gameState, startX, startZ, playerId) {
	if (!gameState || !gameState.board || !gameState.board.cells) {
		console.error('Invalid board state in hasPathToKing');
		return false;
	}

	const playerStr = String(playerId);

	const cellHasKing = (cell) => {
		if (!cell) return false;
		const isKing = (item) => {
			if (!item || item.type !== 'chess') return false;
			const pt = String(item.pieceType || '').toUpperCase();
			return pt === 'KING' && String(item.player) === playerStr;
		};
		if (Array.isArray(cell)) return cell.some(isKing);
		if (typeof cell === 'object' && Array.isArray(cell.contents)) return cell.contents.some(isKing);
		const legacyType = String(cell.type || '').toLowerCase();
		return legacyType === 'king' && String(cell.player) === playerStr;
	};

	const cellIsOwnedTerritory = (cell) => {
		if (!cell) return false;
		const isOwnedItem = (item) => item
			&& String(item.player) === playerStr
			&& (item.type === 'home' || item.type === 'tetromino' || item.type === 'chess');
		if (Array.isArray(cell)) return cell.some(isOwnedItem);
		if (typeof cell === 'object' && Array.isArray(cell.contents)) return cell.contents.some(isOwnedItem);
		return isOwnedItem(cell);
	};

	let kingX = -1;
	let kingZ = -1;
	for (const [key, cell] of Object.entries(gameState.board.cells)) {
		if (cellHasKing(cell)) {
			[kingX, kingZ] = key.split(',').map(Number);
			break;
		}
	}
	if (kingX === -1 || kingZ === -1) return false;

	const queue = [{ x: startX, z: startZ, path: [[startX, startZ]] }];
	const visited = new Set([`${startX},${startZ}`]);
	const directions = [
		{ dx: -1, dz: 0 },
		{ dx: 1, dz: 0 },
		{ dx: 0, dz: -1 },
		{ dx: 0, dz: 1 },
	];

	while (queue.length > 0) {
		const { x, z, path } = queue.shift();
		if (x === kingX && z === kingZ) return path;

		for (const { dx, dz } of directions) {
			const newX = x + dx;
			const newZ = z + dz;
			const key = `${newX},${newZ}`;
			if (visited.has(key)) continue;

			const cell = gameState.board.cells[key];
			if (!cellIsOwnedTerritory(cell) && !(newX === kingX && newZ === kingZ)) continue;

			visited.add(key);
			queue.push({ x: newX, z: newZ, path: [...path, [newX, newZ]] });
		}
	}

	return false;
}

function getTetrominoColor(tetrominoType, gameState) {
	let color = 0xffff00;
	if (boardFunctions && boardFunctions.getPlayerColor) {
		try {
			color = boardFunctions.getPlayerColor(tetrominoType, gameState, true);
		} catch (err) {
			console.warn('Error using centralised color function for path:', err);
		}
	}
	if (color === 0xcccccc) {
		switch (tetrominoType) {
			case 'I': color = 0x00ffff; break;
			case 'J': color = 0x0000ff; break;
			case 'L': color = 0xff8000; break;
			case 'O': color = 0xffff00; break;
			case 'S': color = 0x00ff00; break;
			case 'T': color = 0x800080; break;
			case 'Z': color = 0xff0000; break;
			default:  color = 0xffff00; break;
		}
	}
	return color;
}

export function updatePathVisualization(gameState) {
	if (!gameState || !gameState.currentTetromino || !gameState.currentPlayer) {
		highlightPathToKing(gameState, null);
		return;
	}

	const tetromino = gameState.currentTetromino;
	const shape = tetromino.shape;
	const posX = Math.round(tetromino.position.x);
	const posZ = Math.round(tetromino.position.z);

	const posKey = `${posX},${posZ}`;
	const now = performance.now();
	if (posKey === lastPosKey && now - lastPosTime < PATH_VIZ_THROTTLE_MS) return;
	lastPosKey = posKey;
	lastPosTime = now;

	const srcCells = gameState.board?.cells || {};
	const simulatedCells = { ...srcCells };

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				simulatedCells[`${posX + x},${posZ + z}`] = {
					type: 'tetromino',
					player: gameState.currentPlayer,
				};
			}
		}
	}

	const simulatedBoard = { ...gameState.board, cells: simulatedCells };
	let bestPath = null;

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const tempGameState = { ...gameState, board: simulatedBoard };
				const path = hasPathToKing(tempGameState, posX + x, posZ + z, gameState.currentPlayer);
				if (path && (!bestPath || path.length < bestPath.length)) {
					bestPath = path;
				}
			}
		}
	}

	highlightPathToKing(gameState, bestPath, getTetrominoColor(tetromino.type, gameState));
}

export function highlightPathToKing(gameState, path, color = 0x00ccff) {
	if (!gameState) return;
	const THREE = getTHREE();

	if (Array.isArray(gameState.pathHighlights)) {
		for (const highlight of gameState.pathHighlights) {
			if (gameState.scene) gameState.scene.remove(highlight);
			if (highlight.geometry) highlight.geometry.dispose();
			if (highlight.material) highlight.material.dispose();
		}
	}
	gameState.pathHighlights = [];

	if (!path || path.length === 0 || !gameState.scene) return;

	const highlightMaterial = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.25,
		side: THREE.DoubleSide,
		depthWrite: false,
	});

	for (const [x, z] of path) {
		const geometry = new THREE.PlaneGeometry(0.9, 0.9);
		geometry.rotateX(-Math.PI / 2);
		const highlight = new THREE.Mesh(geometry, highlightMaterial);
		highlight.position.set(x + 0.5, 0.12, z + 0.5);
		highlight.renderOrder = 1;
		gameState.scene.add(highlight);
		gameState.pathHighlights.push(highlight);
	}
}

export function animateWithPathVisualization(gameState) {
	if (typeof globalThis.animate === 'function') {
		globalThis.animate();
	}
	const state = gameState || (typeof window !== 'undefined' ? window.gameState : null);
	if (state && state.currentTetromino) {
		updatePathVisualization(state);
	}
}

/**
 * Hook the path visualisation into the global animation loop on DOM
 * ready.  Preserves the existing `window.animate` while extending it.
 */
export function installAnimationHook() {
	if (typeof document === 'undefined') return;

	document.addEventListener('DOMContentLoaded', () => {
		setTimeout(() => {
			if (typeof window.animate === 'function' && !window.pathVisualizationHooked) {
				const originalAnimate = window.animate;
				window.animate = function patchedAnimate() {
					originalAnimate();
					if (window.gameState && window.gameState.currentTetromino) {
						updatePathVisualization(window.gameState);
					}
				};
				window.pathVisualizationHooked = true;
				console.log('Path visualisation integrated with animation loop');
			}
		}, 1000);
	});
}
