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
import { createCellInstancer } from './cellInstancer.js';

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
		// Flat foam splash sitting at the water surface beneath each
		// cell. The geometry was previously a sphere, which made the
		// "cloud" look puffy and broke the floating-in-sea aesthetic
		// the rest of the scene is going for — we now use a circle
		// laid flat so it reads as wave foam swirling around the
		// island base.
		cache.cloudGeometry = new THREE.CircleGeometry(0.7, 18);
		cache.cloudGeometry.rotateX(-Math.PI / 2);
		cache.cloudMaterial = new THREE.MeshBasicMaterial({
			color: 0xF6FBFF,
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
			side: THREE.DoubleSide,
		});

		// Island bases (rock pillars) were removed at the user's
		// request — cells now float directly on the water. The cache
		// entries are retained as `null` so older code that still
		// references them just no-ops instead of throwing.
		cache.islandBaseGeometry = null;
		cache.islandBaseMaterial = null;
		// (Disabled island base style kept here so its tuning is
		// recoverable if we ever want to put the pillars back.)
		cache.__legacyIslandBaseStyle = {
			color: 0x6b4a2b,
			roughness: 0.95,
			metalness: 0.0,
			flatShading: true,
		};

		ensureRenderCache._cache = cache;
	}
	return ensureRenderCache._cache;
}

/**
 * Build a sea-foam splash anchored beneath a cell at the water
 * surface. Replaces the old fluffy cloud puff so cells read as
 * islands floating on the sea rather than blocks sitting on a
 * raincloud.
 *
 * The mesh is still tagged with the legacy `cloudPuff` userData
 * type so the cleanup code that prunes orphaned cells/clouds in
 * `renderBoard` keeps working.
 */
function createCloudPuff(THREE, renderCache, x, z) {
	const group = new THREE.Group();
	const seed = ((x * 73856093) ^ (z * 19349663)) >>> 0;
	const r1 = ((seed & 0xff) / 255 - 0.5) * 0.18;
	const r2 = (((seed >> 8) & 0xff) / 255 - 0.5) * 0.18;
	const r3 = (((seed >> 16) & 0xff) / 255 - 0.5) * 0.18;

	// `WATER_SURFACE_Y` mirrors the water plane in scene.js — keep
	// these in sync if the sea height ever moves.
	const WATER_SURFACE_Y = -0.45;

	// Island base meshes were removed; cells now float directly on
	// the sea, so the only thing this group contributes is the
	// foam splash drawn at the water surface beneath the cell.

	const main = new THREE.Mesh(renderCache.cloudGeometry, renderCache.cloudMaterial);
	main.position.set(0, WATER_SURFACE_Y, 0);
	main.scale.set(1.0 + r1 * 0.5, 1, 0.8 + r2 * 0.4);
	main.rotation.y = ((seed & 0xff) / 255) * Math.PI;
	main.renderOrder = 2;
	group.add(main);

	const wisp = new THREE.Mesh(renderCache.cloudGeometry, renderCache.cloudMaterial);
	wisp.position.set(0.18 + r2, WATER_SURFACE_Y + 0.02, -0.12 + r3);
	wisp.scale.set(0.45, 1, 0.3);
	wisp.rotation.y = ((seed >> 8) & 0xff) / 255 * Math.PI;
	wisp.renderOrder = 2;
	group.add(wisp);

	group.userData = {
		type: 'cloudPuff',
		parentCellKey: `${x},${z}`,
		isStatic: true,
		isCellFoam: true,
		basePulse: 0.85 + ((seed >> 16) & 0xff) / 255 * 0.25,
		pulseSpeed: 0.18 + ((seed >> 8) & 0xff) / 255 * 0.18,
		pulsePhase: ((seed & 0xff) / 255) * Math.PI * 2,
	};
	return group;
}

function classifyCell(cellData) {
	let isHomeZone = false;
	let homePlayer = null;
	let tetrominoPlayer = null;
	let isExHome = false;

	if (Array.isArray(cellData)) {
		const homeZone = cellData.find(item => item && item.type === 'home');
		if (homeZone) { isHomeZone = true; homePlayer = homeZone.player; }
		const tet = cellData.find(item => item && item.type === 'tetromino');
		if (tet) {
			tetrominoPlayer = tet.player;
			if (tet.fromHomeZone === true) isExHome = true;
		}
	} else if (cellData && typeof cellData === 'object') {
		if (cellData.type === 'home' || cellData.homeZone) {
			isHomeZone = true;
			homePlayer = cellData.player;
		}
		if (cellData.type === 'tetromino' || cellData.tetromino) {
			tetrominoPlayer = cellData.player;
		}
	}
	return { isHomeZone, homePlayer, tetrominoPlayer, isExHome };
}

function isCellDisconnected(gameState, x, z, owner) {
	if (!owner) return false;
	const map = gameState?.disconnectedSince;
	if (!map || typeof map !== 'object') return false;
	const key = `${owner}:${x},${z}`;
	return Number.isFinite(map[key]);
}

/**
 * Checkerboard darkening. Bishops only travel on squares of one
 * colour, so the player needs to be able to read the board parity
 * at a glance — even when every cell is covered in tetromino
 * terrain. We lightly darken cells where `(x + z) % 2 === 1` by
 * scaling each RGB channel down. The factor 0.86 is enough to be
 * visible but not so much that home / tetromino colours change
 * recognisably.
 */
const CHECKER_DARKEN = 0.86;

function darkenForChecker(color, x, z) {
	if (((x + z) & 1) === 0) return color;
	const r = Math.round(((color >> 16) & 0xff) * CHECKER_DARKEN);
	const g = Math.round(((color >> 8) & 0xff) * CHECKER_DARKEN);
	const b = Math.round((color & 0xff) * CHECKER_DARKEN);
	return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function chooseAppearance(classification, gameState, x, z) {
	const { isHomeZone, homePlayer, tetrominoPlayer, isExHome } = classification;
	if (isExHome && tetrominoPlayer) {
		return {
			kind: 'exhome',
			color: darkenForChecker(getPlayerColor(tetrominoPlayer, gameState, 'tetromino'), x, z),
			roughness: 0.5,
			metalness: 0.05,
			transparent: true,
			opacity: 0.72,
			decaying: false,
		};
	}
	if (isHomeZone) {
		const decaying = isCellDisconnected(gameState, x, z, homePlayer);
		return {
			kind: 'home',
			color: darkenForChecker(getPlayerColor(homePlayer, gameState, 'home'), x, z),
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
			color: darkenForChecker(getPlayerColor(tetrominoPlayer, gameState, 'tetromino'), x, z),
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

	// ── Instanced terrain ────────────────────────────────────────────
	// Plain opaque cells collapse into a single InstancedMesh (one draw
	// call) instead of one mesh each. Cells that need per-cell behaviour a
	// shared material can't express — decaying, transparent/ex-home,
	// retro, or sponsored (an ad decal is parented to the cell) — stay as
	// individual meshes so clicks, ads and the decay VFX keep working.
	// `gameState.disableCellInstancing` is an escape hatch: instant
	// fallback to the per-cell mesh path if anything ever misbehaves.
	const instancingOn = !(gameState && gameState.disableCellInstancing)
		&& !(gameState && gameState.retroMode);
	let opaqueInstancer = null;
	let exhomeInstancer = null;
	if (instancingOn) {
		// Recreate if we've never built one, the board group was swapped,
		// or our mesh was detached from it (e.g. a debug "Reset Board"
		// clears every child) — otherwise we'd write into an orphan mesh
		// that's no longer in the scene and the cells would vanish.
		const liveMesh = gameState.__cellInstancer
			&& typeof gameState.__cellInstancer.getMesh === 'function'
			&& gameState.__cellInstancer.getMesh();
		const needNew = !gameState.__cellInstancer
			|| gameState.__cellInstancerOwner !== boardGroup
			|| !liveMesh
			|| liveMesh.parent !== boardGroup;
		if (needNew) {
			if (gameState.__cellInstancer && typeof gameState.__cellInstancer.dispose === 'function') {
				gameState.__cellInstancer.dispose();
			}
			if (gameState.__cellInstancerExhome && typeof gameState.__cellInstancerExhome.dispose === 'function') {
				gameState.__cellInstancerExhome.dispose();
			}
			// Two buckets: opaque plain cells, and the semi-transparent
			// ex-home terrain (a fixed 0.72 opacity it shares board-wide).
			// Decaying / sponsored / retro cells still fall through to
			// individual meshes (handled below).
			gameState.__cellInstancer = createCellInstancer(
				THREE, boardGroup, renderCache.cellGeometry, { name: 'instancedCells' });
			gameState.__cellInstancerExhome = createCellInstancer(
				THREE, boardGroup, renderCache.cellGeometry,
				{ name: 'instancedCellsExhome', transparent: true, opacity: 0.72, roughness: 0.5, metalness: 0.05 });
			gameState.__cellInstancerOwner = boardGroup;
		}
		opaqueInstancer = gameState.__cellInstancer;
		exhomeInstancer = gameState.__cellInstancerExhome;
	} else {
		// Profile flipped to a non-instanced mode (e.g. retro) — empty both
		// buffers so no stale instanced cells linger under the individual
		// meshes we're about to (re)create.
		if (gameState.__cellInstancer) gameState.__cellInstancer.rebuild([]);
		if (gameState.__cellInstancerExhome) gameState.__cellInstancerExhome.rebuild([]);
	}
	const sponsoredKeys = (gameState && Array.isArray(gameState.sponsoredCellKeys))
		? new Set(gameState.sponsoredCellKeys) : null;
	const opaqueCellList = [];
	const exhomeCellList = [];
	// Keys rendered as INDIVIDUAL meshes this pass. Any individual cell
	// mesh whose key is absent here (gone, or now instanced) is pruned in
	// the cleanup sweep below.
	const individualKeys = Object.create(null);

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

			// Route each cell to the right bucket. Sponsored cells always
			// stay individual (an ad decal is parented to the mesh). Decaying
			// cells stay individual (animated red emissive + fading opacity).
			const notSponsored = !(sponsoredKeys && sponsoredKeys.has(cellKey));
			const isExhome = appearance.kind === 'exhome';
			const canInstanceOpaque = instancingOn && notSponsored && !isExhome
				&& appearance.opacity === 1.0 && !appearance.transparent && !appearance.decaying;
			const canInstanceExhome = instancingOn && notSponsored && isExhome
				&& !appearance.decaying;

			if (canInstanceOpaque) {
				opaqueCellList.push({
					pos: { x, z },
					absX: absPos.x,
					absZ: absPos.z,
					color: appearance.color,
				});
			} else if (canInstanceExhome) {
				exhomeCellList.push({
					pos: { x, z },
					absX: absPos.x,
					absZ: absPos.z,
					color: appearance.color,
				});
			} else {
				individualKeys[cellKey] = true;
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
			}

			// Hover-cloud under each cell (normal profile only). We only
			// hide it on decaying cells so a "fading away" cell visually
			// loses its support — otherwise it looks frozen mid-air. Foam
			// is independent of whether the cell itself is instanced.
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

	if (opaqueInstancer) opaqueInstancer.rebuild(opaqueCellList);
	if (exhomeInstancer) exhomeInstancer.rebuild(exhomeCellList);

	if (boardGroup && boardGroup.children) {
		const cellsToRemove = [];
		const cloudsToRemove = [];
		for (const child of boardGroup.children) {
			if (!child || !child.userData) continue;
			if (child.userData.type === 'cell' && child.userData.position) {
				const childKey = `${child.userData.position.x},${child.userData.position.z}`;
				// Prune an individual cell mesh if its cell is gone OR it is
				// now rendered by the instancer (key absent from individualKeys).
				if (!individualKeys[childKey]) cellsToRemove.push(child);
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

	// Only back-fill from the board when the server has never sent a
	// `chessPieces` array. Re-extracting when the list is empty
	// resurrects ghost pieces from stale chess markers left on cells.
	if (!Array.isArray(gameState.chessPieces)) {
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
