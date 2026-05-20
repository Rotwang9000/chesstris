/**
 * Chess Piece Creator — orchestrator.
 *
 * Public entry points:
 *   - createChessPiece(gameState, x, z, type, player, options): the main
 *     factory used by the renderer. Dispatches to the correct piece
 *     family based on the current render profile (cute / retro /
 *     imperial Russian) and the supplied colour overrides.
 *   - getChessPiece(type, player, isLocalPlayer): legacy lookup that
 *     also caches the built piece per side.
 *   - createPiece(type, color, orientation, THREE): simple geometric
 *     piece used by the AI / debug paths.
 *
 * The heavy lifting is split into dedicated modules under
 * `./chessPieceCreator/`.
 */

import { getTHREE } from './gameContext.js';
import {
	PIECE_SCALE,
	PIECE_TYPE_MAP,
	DEFAULT_COLORS,
	ENHANCED_MATERIALS,
	customModels,
	initMaterials,
	createSafeMaterials,
} from './chessPieceCreator/materials.js';
import { createRetroLetterPiece, createCutePiece } from './chessPieceCreator/specialModes.js';
import {
	buildRussianPiece,
	createRussianPawnPiece,
	createRussianRookPiece,
	createRussianKnightPiece,
	createRussianBishopPiece,
	createRussianQueenPiece,
	createRussianKingPiece,
} from './chessPieceCreator/russianPieces.js';
import { createPiece } from './chessPieceCreator/simplePieces.js';
import { ensureValidMaterials, createFallbackPiece } from './chessPieceCreator/validation.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function pieceTypeName(num) { return PIECE_TYPE_MAP[num] || 'PAWN'; }

function attachUserData(group, { pieceTypeName: name, pieceTypeNum, player, x, z, customColor, extras = {} }) {
	group.userData = {
		type: 'chess',
		pieceType: name,
		pieceTypeNum,
		player,
		position: { x, z },
		originalPosition: { x, z },
		color: customColor,
		...extras,
	};
	group.visible = true;
	return group;
}

// ── Main factory ────────────────────────────────────────────────────────────

/**
 * Create a chess piece at the specified position.
 *
 * @param {Object} gameState The current game state (used for render-profile detection).
 * @param {number} x Board X coordinate.
 * @param {number} z Board Z coordinate.
 * @param {string|number} pieceType Either a numeric type (1-6) or canonical name.
 * @param {string} player Player identifier (used for local-vs-opponent styling).
 * @param {Object} [options] Optional `{ orientation, color, isLocalPlayer }`.
 * @returns {THREE.Group} A Three.js group containing the piece geometry.
 */
export function createChessPiece(gameState, x, z, pieceType, player, options = {}) {
	const THREE = getTHREE();
	const pieceTypeNum = typeof pieceType === 'string'
		? PIECE_TYPE_MAP[pieceType] || 1
		: pieceType;
	const name = pieceTypeName(pieceTypeNum);
	const isLocalPlayer = options.isLocalPlayer !== undefined
		? options.isLocalPlayer
		: (gameState.localPlayerId === player || gameState.myPlayerId === player);
	const customColor = options.color;
	const materialKey = isLocalPlayer ? 'self' : 'other';

	if (gameState.retroMode || gameState.renderProfile === 'retro') {
		return createRetroLetterPiece(THREE, pieceTypeNum, name, player, x, z, isLocalPlayer, customColor);
	}
	if (gameState.lowQuality || gameState.renderProfile === 'cute') {
		return createCutePiece(THREE, pieceTypeNum, name, player, x, z, isLocalPlayer, customColor);
	}

	try {
		const pieceGroup = new THREE.Group();
		const cacheKey = materialKey;
		const customModel = customModels[cacheKey][pieceTypeNum];

		if (customModel) {
			const model = customModel.clone();
			model.scale.set(0.4 * PIECE_SCALE, 0.4 * PIECE_SCALE, 0.4 * PIECE_SCALE);
			model.position.y = 0.1;
			model.visible = true;
			model.traverse(child => {
				if (!child.isMesh) return;
				child.visible = true;
				if (customColor !== undefined) {
					if (!child.material) {
						child.material = new THREE.MeshStandardMaterial({
							color: customColor, roughness: 0.7, metalness: 0.3,
						});
					} else if (Array.isArray(child.material)) {
						for (const material of child.material) {
							if (material) material.color.setHex(customColor);
						}
					} else {
						child.material.color.setHex(customColor);
					}
				}
				child.castShadow = true;
				child.receiveShadow = true;
			});
			pieceGroup.add(model);
		} else {
			let materials = null;
			if (customColor !== undefined) {
				initMaterials();
				materials = createSafeMaterials(materialKey);
				materials.primary.color.setHex(customColor);
				materials.secondary.color.setHex(customColor);
				materials.accent.color.setHex(customColor);
			}
			const pieceMesh = buildRussianPiece(pieceTypeNum, materialKey, isLocalPlayer, materials);
			pieceMesh.visible = true;
			pieceGroup.add(pieceMesh);
		}

		if (options.orientation !== undefined) {
			pieceGroup.rotation.y = (options.orientation * Math.PI) / 2;
		}

		return attachUserData(pieceGroup, {
			pieceTypeName: name,
			pieceTypeNum,
			player,
			x,
			z,
			customColor,
		});
	} catch (error) {
		console.error('Error creating chess piece:', error);
		const fallbackGroup = createFallbackPiece(materialKey) || new THREE.Group();
		return attachUserData(fallbackGroup, {
			pieceTypeName: name,
			pieceTypeNum,
			player,
			x,
			z,
			customColor,
			extras: { isErrorFallback: true },
		});
	}
}

// ── Legacy getChessPiece (cached by side) ───────────────────────────────────

/**
 * Get a chess piece mesh based on piece type and player.
 *
 * Caches one built mesh per side so subsequent lookups for the same
 * type and side return a fresh clone.
 */
export function getChessPiece(type, player, isLocalPlayer = false) {
	const THREE = getTHREE();
	if (!THREE) {
		console.error('THREE.js not available in getChessPiece');
		return null;
	}

	let materialKey;
	if (player === 'self' || player === 'other') {
		materialKey = player;
	} else {
		materialKey = isLocalPlayer ? 'self' : 'other';
	}

	try {
		const cache = customModels[materialKey] || (customModels[materialKey] = {});
		if (cache[type]) {
			const model = cache[type].clone();
			ensureValidMaterials(model);
			return model;
		}

		const pieceTypeNum = PIECE_TYPE_MAP[String(type).toUpperCase()]
			|| (typeof type === 'number' ? type : 1);
		const chessPiece = buildRussianPiece(pieceTypeNum, materialKey, isLocalPlayer);
		ensureValidMaterials(chessPiece);
		cache[type] = chessPiece.clone();
		return chessPiece;
	} catch (error) {
		console.error(`Error creating chess piece (${type} for ${materialKey}):`, error);
		return createFallbackPiece(materialKey);
	}
}

// ── Re-exports for the rest of the app ──────────────────────────────────────

export { initMaterials, PIECE_TYPE_MAP, DEFAULT_COLORS, ENHANCED_MATERIALS };
export {
	createRussianPawnPiece,
	createRussianRookPiece,
	createRussianKnightPiece,
	createRussianBishopPiece,
	createRussianQueenPiece,
	createRussianKingPiece,
};
export { createPiece };

// ── Default export: legacy public API ──────────────────────────────────────

export default {
	createChessPiece,
	createPiece,
	initMaterials,
	getChessPiece,
	PIECE_TYPE_MAP,
	DEFAULT_COLORS,
	ENHANCED_MATERIALS,
};
