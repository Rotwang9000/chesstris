/**
 * Chess Piece Creator — shared material library and helpers.
 *
 * Houses default colours, the cached enhanced-material set, piece-type
 * mapping, and helpers that the various piece builders consume.
 */

import { getTHREE } from '../gameContext.js';

// Global scaling factor applied by the orchestrator when wrapping custom
// glTF models. Kept here so every piece variant agrees on the value.
export const PIECE_SCALE = 2.0;

// Numeric ⇄ string mapping used everywhere we need to refer to a piece
// type. Forward and reverse keys are deliberate so callers can use either.
export const PIECE_TYPE_MAP = {
	1: 'PAWN',
	2: 'ROOK',
	3: 'KNIGHT',
	4: 'BISHOP',
	5: 'QUEEN',
	6: 'KING',
	PAWN: 1,
	ROOK: 2,
	KNIGHT: 3,
	BISHOP: 4,
	QUEEN: 5,
	KING: 6,
};

// Default flat colours used when an enhanced material has not yet been
// initialised or as a fallback for missing values.
export const DEFAULT_COLORS = {
	self: 0x6B0F1A,
	other: 0x2A3038,
};

// Cached materials shared between every chess-piece instance. They are
// populated lazily by `initMaterials` to avoid touching `THREE` at module
// load.
export const ENHANCED_MATERIALS = {
	self: { primary: null, secondary: null, accent: null },
	other: { primary: null, secondary: null, accent: null },
};

// Per-side custom-model cache. Populated externally when GLTF models are
// loaded for a specific piece type. Kept in this module so all consumers
// share the same map.
export const customModels = {
	self: {},
	other: {},
};

/**
 * Lazy-initialise the imperial / opponent material palettes.
 * Safe to call repeatedly — subsequent invocations are a no-op.
 */
export function initMaterials() {
	const THREE = getTHREE();
	if (ENHANCED_MATERIALS.self.primary !== null) return;

	ENHANCED_MATERIALS.self.primary = new THREE.MeshStandardMaterial({
		color: 0x6B0F1A, roughness: 0.38, metalness: 0.2,
	});
	ENHANCED_MATERIALS.self.secondary = new THREE.MeshStandardMaterial({
		color: 0xB08D57, roughness: 0.28, metalness: 0.45,
	});
	ENHANCED_MATERIALS.self.accent = new THREE.MeshStandardMaterial({
		color: 0xD4AF37, roughness: 0.2, metalness: 0.7,
	});

	ENHANCED_MATERIALS.other.primary = new THREE.MeshStandardMaterial({
		color: 0x2A3038, roughness: 0.55, metalness: 0.08,
	});
	ENHANCED_MATERIALS.other.secondary = new THREE.MeshStandardMaterial({
		color: 0x4B5563, roughness: 0.5, metalness: 0.1,
	});
	ENHANCED_MATERIALS.other.accent = new THREE.MeshStandardMaterial({
		color: 0x94A3B8, roughness: 0.45, metalness: 0.15,
	});
}

/**
 * Build a fresh `{ primary, secondary, accent }` material trio for the
 * given side (`'self'` or `'other'`). Always returns valid materials,
 * synthesising replacements if an entry has been corrupted.
 */
export function createSafeMaterials(materialKey) {
	const THREE = getTHREE();
	const defaultColor = DEFAULT_COLORS[materialKey] ?? 0xCCCCCC;
	const materials = ENHANCED_MATERIALS[materialKey] || {
		primary: new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.7, metalness: 0.3 }),
		secondary: new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.7, metalness: 0.3 }),
		accent: new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.7, metalness: 0.3 }),
	};

	for (const key in materials) {
		if (typeof materials[key] !== 'object' || materials[key] === null) {
			const color = typeof materials[key] === 'number' ? materials[key] : defaultColor;
			materials[key] = new THREE.MeshStandardMaterial({
				color, roughness: 0.7, metalness: 0.3,
			});
		}
	}
	return materials;
}
