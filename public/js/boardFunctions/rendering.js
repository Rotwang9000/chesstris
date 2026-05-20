/**
 * Board + chess-piece rendering helpers.
 *
 * `renderBoard` rebuilds the cell meshes in-place against
 * `gameState.board.cells`, re-using existing meshes where possible and
 * disposing anything that no longer corresponds to a cell.
 *
 * `createChessPiece` builds a single chess piece group via
 * `chessPieceCreator.js`.
 *
 * Both functions are intentionally side-effecting on the THREE scene
 * graph — they're called from the main game loop / re-render hooks.
 */

import { findBoardCentreMarker, translatePosition } from '../centreBoardMarker.js';
import { createChessPiece as createChessPieceFromCreator } from '../chessPieceCreator.js';
import { extractChessPiecesFromCells } from './pieces.js';
import { getPlayerColor } from './colours.js';

function ensureRenderCache(THREE) {
	if (!ensureRenderCache._cache) {
		const cache = {};
		cache.cellGeometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
		cache.cellEdgesGeometry = new THREE.EdgesGeometry(cache.cellGeometry);
		cache.cellEdgeMaterials = {
			default: new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.15, depthTest: false }),
			home: new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.2, depthTest: false }),
			tetromino: new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.2, depthTest: false }),
		};
		cache.materials = Object.create(null);
		// Three-puff cloud geometry shared across every cell. The
		// individual puffs are slightly offset in `createCloudPuff`.
		cache.cloudGeometry = new THREE.SphereGeometry(0.55, 12, 10);
		cache.cloudMaterial = new THREE.MeshStandardMaterial({
			color: 0xffffff,
			roughness: 1.0,
			metalness: 0.0,
			transparent: true,
			opacity: 0.88,
			emissive: 0xfafaff,
			emissiveIntensity: 0.08,
		});
		ensureRenderCache._cache = cache;
	}
	return ensureRenderCache._cache;
}

/**
 * Build a fluffy 3-puff cloud anchored beneath a cell. The cloud is a
 * floppy `THREE.Group` of three spheres at a deterministic but
 * varied offset; we cache by cell key so re-renders don't churn.
 */
function createCloudPuff(THREE, renderCache, x, z) {
	const group = new THREE.Group();
	const seed = ((x * 73856093) ^ (z * 19349663)) >>> 0;
	const r1 = ((seed & 0xff) / 255 - 0.5) * 0.25;
	const r2 = (((seed >> 8) & 0xff) / 255 - 0.5) * 0.25;
	const r3 = (((seed >> 16) & 0xff) / 255 - 0.5) * 0.25;

	const puffA = new THREE.Mesh(renderCache.cloudGeometry, renderCache.cloudMaterial);
	puffA.position.set(-0.32 + r1, -0.45, 0.06 + r2);
	puffA.scale.set(0.95, 0.55, 0.95);
	group.add(puffA);

	const puffB = new THREE.Mesh(renderCache.cloudGeometry, renderCache.cloudMaterial);
	puffB.position.set(0.30 + r2, -0.40, -0.08 + r3);
	puffB.scale.set(1.0, 0.62, 1.0);
	group.add(puffB);

	const puffC = new THREE.Mesh(renderCache.cloudGeometry, renderCache.cloudMaterial);
	puffC.position.set(0.02 + r3, -0.55, -0.05 + r1);
	puffC.scale.set(1.15, 0.5, 1.15);
	group.add(puffC);

	group.userData = {
		type: 'cloudPuff',
		parentCellKey: `${x},${z}`,
		isStatic: true,
	};
	return group;
}

function classifyCell(cellData) {
	let isHomeZone = false;
	let homePlayer = null;
	let tetrominoPlayer = null;

	if (Array.isArray(cellData)) {
		const homeZone = cellData.find(item => item && item.type === 'home');
		if (homeZone) { isHomeZone = true; homePlayer = homeZone.player; }
		const tet = cellData.find(item => item && item.type === 'tetromino');
		if (tet) tetrominoPlayer = tet.player;
	} else if (cellData && typeof cellData === 'object') {
		if (cellData.type === 'home' || cellData.homeZone) {
			isHomeZone = true;
			homePlayer = cellData.player;
		}
		if (cellData.type === 'tetromino' || cellData.tetromino) {
			tetrominoPlayer = cellData.player;
		}
	}
	return { isHomeZone, homePlayer, tetrominoPlayer };
}

function isCellDisconnected(gameState, x, z, owner) {
	if (!owner) return false;
	const map = gameState?.disconnectedSince;
	if (!map || typeof map !== 'object') return false;
	const key = `${owner}:${x},${z}`;
	return Number.isFinite(map[key]);
}

function chooseAppearance(classification, gameState, x, z) {
	const { isHomeZone, homePlayer, tetrominoPlayer } = classification;
	if (isHomeZone) {
		const decaying = isCellDisconnected(gameState, x, z, homePlayer);
		return {
			kind: 'home',
			color: getPlayerColor(homePlayer, gameState, 'home'),
			roughness: 0.7,
			metalness: 0.3,
			transparent: decaying,
			opacity: decaying ? 0.55 : 1.0,
			decaying,
		};
	}
	if (tetrominoPlayer) {
		const decaying = isCellDisconnected(gameState, x, z, tetrominoPlayer);
		return {
			kind: 'tetromino',
			color: getPlayerColor(tetrominoPlayer, gameState, 'tetromino'),
			roughness: 0.55,
			metalness: 0.1,
			transparent: decaying,
			opacity: decaying ? 0.5 : 1.0,
			decaying,
		};
	}
	if (gameState && gameState.retroMode) {
		const isWhite = (x + z) % 2 === 0;
		return {
			kind: 'default',
			color: isWhite ? 0x001a00 : 0x002200,
			roughness: 0.9,
			metalness: 0,
			transparent: false,
			opacity: 1.0,
		};
	}
	const isWhite = (x + z) % 2 === 0;
	return {
		kind: 'default',
		color: isWhite ? 0xEDE8D5 : 0x5A7D5A,
		roughness: 0.45,
		metalness: 0.05,
		transparent: false,
		opacity: 1.0,
	};
}

function applyAppearance(mesh, appearance, gameState, THREE) {
	const { color, kind, roughness, metalness, transparent, opacity } = appearance;
	if (mesh.material && mesh.material.color) {
		mesh.material.color.setHex(color);
		mesh.material.roughness = roughness;
		mesh.material.metalness = metalness;
		mesh.material.transparent = transparent;
		mesh.material.opacity = opacity;
		if (gameState && gameState.retroMode && kind !== 'default') {
			mesh.material.emissive = new THREE.Color(color);
			mesh.material.emissiveIntensity = 0.4;
		} else if (mesh.material.emissive) {
			mesh.material.emissive.setHex(0x000000);
			mesh.material.emissiveIntensity = 0;
		}
		mesh.material.needsUpdate = true;
	}
	mesh.castShadow = !(gameState && gameState.retroMode);
	mesh.receiveShadow = !(gameState && gameState.retroMode);
}

function getOrCreateMaterial(renderCache, appearance, gameState, THREE) {
	const retro = !!(gameState && gameState.retroMode && appearance.kind !== 'default');
	const decaying = !!appearance.decaying;
	const matKey = `${appearance.color}-${appearance.kind}-${retro}-${appearance.opacity}-${decaying ? 'd' : 'n'}`;
	if (renderCache.materials[matKey]) return renderCache.materials[matKey];

	const matOpts = {
		color: appearance.color,
		roughness: appearance.roughness,
		metalness: appearance.metalness,
		transparent: appearance.transparent,
		opacity: appearance.opacity,
	};
	if (retro) {
		matOpts.emissive = new THREE.Color(appearance.color);
		matOpts.emissiveIntensity = 0.4;
	}
	if (decaying) {
		matOpts.emissive = new THREE.Color(0xff3333);
		matOpts.emissiveIntensity = 0.35;
	}
	const material = new THREE.MeshStandardMaterial(matOpts);
	renderCache.materials[matKey] = material;
	return material;
}

export function renderBoard(gameState, boardGroup, _createFloatingIsland, THREE) {
	const startTime = performance.now();
	const centreMark = findBoardCentreMarker(gameState);
	const centerX = centreMark.x;
	const centerZ = centreMark.z;
	if (gameState.board) gameState.board.centreMarker = { x: centerX, z: centerZ };

	const renderCache = ensureRenderCache(THREE);

	const existingCells = Object.create(null);
	const existingClouds = Object.create(null);
	if (boardGroup && boardGroup.children) {
		for (const child of boardGroup.children) {
			if (!child || !child.userData) continue;
			if (child.userData.type === 'cell') {
				const pos = child.userData.position;
				if (!pos || pos.x === undefined || pos.z === undefined) continue;
				existingCells[`${pos.x},${pos.z}`] = child;
			} else if (child.userData.type === 'cloudPuff' && child.userData.parentCellKey) {
				existingClouds[child.userData.parentCellKey] = child;
			}
		}
	}

	const processedCells = Object.create(null);
	let cellsCreated = 0;
	let cellsRemoved = 0;
	let cellsReused = 0;

	// Floating-cloud aesthetic only applies to the normal/default
	// render profile. Retro is a flat CRT board; cute already has its
	// own space-themed star/heart bed underneath, so we don't pile
	// puffy clouds on top of either of them.
	const renderProfile = gameState
		? (gameState.renderProfile
			|| (gameState.retroMode ? 'retro'
				: gameState.lowQuality ? 'cute'
					: 'normal'))
		: 'normal';
	const cloudsEnabled = renderProfile === 'normal';

	if (gameState.board && gameState.board.cells) {
		for (const key of Object.keys(gameState.board.cells)) {
			const [x, z] = key.split(',').map(Number);
			if (Number.isNaN(x) || Number.isNaN(z)) continue;

			const cellKey = `${x},${z}`;
			processedCells[cellKey] = true;
			const cellData = gameState.board.cells[key];
			if (cellData === null || cellData === undefined) continue;

			const classification = classifyCell(cellData);
			const appearance = chooseAppearance(classification, gameState, x, z);
			const absPos = translatePosition({ x, z }, gameState, true);
			const existingCell = existingCells[cellKey];

			if (existingCell) {
				existingCell.userData.data = cellData;
				existingCell.userData.kind = appearance.kind;
				existingCell.userData.processed = true;
				existingCell.rotation.set(0, 0, 0);
				existingCell.position.set(absPos.x, 0, absPos.z);
				applyAppearance(existingCell, appearance, gameState, THREE);
				cellsReused++;
			} else {
				try {
					const material = getOrCreateMaterial(renderCache, appearance, gameState, THREE);
					const newCell = new THREE.Mesh(renderCache.cellGeometry, material);
					newCell.castShadow = !(gameState && gameState.retroMode);
					newCell.receiveShadow = !(gameState && gameState.retroMode);
					newCell.rotation.set(0, 0, 0);
					newCell.position.set(absPos.x, 0, absPos.z);
					newCell.userData = {
						type: 'cell',
						position: { x, z },
						data: cellData,
						kind: appearance.kind,
						processed: true,
						isStatic: true,
					};
					boardGroup.add(newCell);
					cellsCreated++;
				} catch (error) {
					console.error(`Error creating cell at (${x}, ${z}):`, error);
				}
			}

			// Hover-cloud under each cell (normal profile only). We only
			// hide it on decaying cells so a "fading away" cell visually
			// loses its support — otherwise it looks frozen mid-air.
			if (cloudsEnabled && !appearance.decaying) {
				let cloud = existingClouds[cellKey];
				if (!cloud) {
					cloud = createCloudPuff(THREE, renderCache, x, z);
					boardGroup.add(cloud);
				}
				cloud.position.set(absPos.x, 0, absPos.z);
				cloud.userData.processed = true;
			} else {
				const cloud = existingClouds[cellKey];
				if (cloud) {
					boardGroup.remove(cloud);
					delete existingClouds[cellKey];
				}
			}
		}
	}

	if (boardGroup && boardGroup.children) {
		const cellsToRemove = [];
		const cloudsToRemove = [];
		for (const child of boardGroup.children) {
			if (!child || !child.userData) continue;
			if (child.userData.type === 'cell' && child.userData.position) {
				const childKey = `${child.userData.position.x},${child.userData.position.z}`;
				if (!processedCells[childKey]) cellsToRemove.push(child);
			}
			if (child.userData.type === 'cloudPuff' && child.userData.parentCellKey) {
				if (!processedCells[child.userData.parentCellKey] || !cloudsEnabled) {
					cloudsToRemove.push(child);
				}
			}
		}
		for (const cell of cellsToRemove) {
			boardGroup.remove(cell);
			if (cell.material) {
				if (Array.isArray(cell.material)) cell.material.forEach(m => m && m.dispose());
				else cell.material.dispose();
			}
			if (cell.geometry && cell.geometry !== renderCache.cellGeometry) cell.geometry.dispose();
			cellsRemoved++;
		}
		for (const cloud of cloudsToRemove) boardGroup.remove(cloud);
	}

	if (gameState.chessPieces === undefined || gameState.chessPieces.length === 0) {
		gameState.chessPieces = extractChessPiecesFromCells(gameState);
	}

	const endTime = performance.now();
	if (gameState?.debugMode) {
		console.log(`Board rendering: ${(endTime - startTime).toFixed(1)}ms — ${cellsCreated} created, ${cellsReused} reused, ${cellsRemoved} removed`);
	}

	return {
		cellsCreated,
		cellsReused,
		cellsRemoved,
		totalCells: cellsCreated + cellsReused,
		centerX,
		centerZ,
		renderTime: endTime - startTime,
	};
}

const PIECE_NAMES = ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'];

function normalisePieceType(pieceType) {
	if (typeof pieceType === 'string') return pieceType.toUpperCase();
	if (typeof pieceType === 'number') {
		const code = pieceType > 10 ? pieceType % 10 : pieceType;
		return PIECE_NAMES[code - 1] || 'PAWN';
	}
	return 'PAWN';
}

export function createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE) {
	const centreMark = findBoardCentreMarker(gameState);
	if (gameState.board) gameState.board.centreMarker = { x: centreMark.x, z: centreMark.z };

	try {
		const type = normalisePieceType(pieceType);
		const playerStr = playerIdent || 'unknown_player';
		const isLocalPlayer = String(playerStr) === String(ourPlayerIdent)
			|| String(playerStr) === String(gameState.myPlayerId);
		const playerColor = getPlayerColor(playerStr, gameState);

		const pieceGroup = createChessPieceFromCreator(
			gameState, x, z, type, playerStr,
			{ orientation, color: playerColor, isLocalPlayer },
		);

		if (!pieceGroup) throw new Error('Chess piece creator failed to return a piece');

		const absPos = translatePosition({ x, z }, gameState, true);
		pieceGroup.position.set(absPos.x, 0, absPos.z);
		if (!pieceGroup.userData || !pieceGroup.userData.type) {
			pieceGroup.userData = {
				type: 'chessPiece',
				pieceType: type,
				player: playerStr,
				originalPlayer: playerIdent,
				position: { x, z },
				visible: true,
				color: playerColor,
			};
		}

		pieceGroup.traverse(child => {
			if (!child.isMesh) return;
			child.castShadow = true;
			child.receiveShadow = true;
			child.visible = true;
			if (child.material) child.material.needsUpdate = true;
		});
		pieceGroup.visible = true;
		return pieceGroup;
	} catch (err) {
		console.error('Error creating chess piece:', err);

		const fallbackGroup = new THREE.Group();
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		const playerColor = getPlayerColor(playerIdent, gameState);
		const fallbackMaterial = new THREE.MeshStandardMaterial({
			color: playerColor, roughness: 0.6, metalness: 0.3,
		});
		const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
		fallbackMesh.position.y = 0.4;
		fallbackGroup.add(fallbackMesh);

		const absPos = translatePosition({ x, z }, gameState, true);
		fallbackGroup.position.set(absPos.x, 0, absPos.z);
		fallbackGroup.visible = true;
		return fallbackGroup;
	}
}
