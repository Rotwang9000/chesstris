/**
 * Player nameplate renderer.
 *
 * Draws a small floating sprite above each king on the board. The
 * sprite's text is the owning player's display name and its
 * border/text colour matches the player's piece colour so spectators
 * can tell at a glance who owns which side.
 *
 * The same machinery doubles as a "captured-pieces legend" for
 * spectator mode — when the local player is observing, the nameplate
 * also lists the player's current captured-piece silhouette count
 * (e.g. `Alice  ♛x1 ♞x2`).
 *
 * Lifecycle mirrors `powerUpRenderer.js`:
 *   • `syncNameplates(chessPieces, players, options)` reconciles
 *     the visible sprites with the live king list. Cheap O(n) over
 *     the (at most a few dozen) kings.
 *   • `animateNameplates(timeSec, camera)` makes the sprites
 *     gently bob and always face the camera.
 *   • `disposeNameplateVisuals()` clears state on a hard restart.
 *
 * Implemented with `THREE.Sprite` + `CanvasTexture` because that
 * works with the project's existing renderer setup without pulling
 * in `CSS2DRenderer` (which would require its own DOM mount).
 */

import { getTHREE, getScene, getRenderer } from './gameContext.js';
import { translatePosition } from './centreBoardMarker.js';
import { isCellVisibleInCurrentView } from './battle/battleRules.js';

const NAMEPLATE_GROUP_NAME = 'nameplate-overlay';
const NAMEPLATE_HEIGHT_ABOVE_KING = 2.4;
const NAMEPLATE_BOB_AMPLITUDE = 0.08;
const NAMEPLATE_BOB_FREQ_HZ = 0.4;
const PANEL_PADDING = 16;
const PANEL_RADIUS = 14;
const NAME_PX = 34;
const SUB_PX = 24;
const FONT_STACK = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT = `700 ${NAME_PX}px ${FONT_STACK}`;
const SUBFONT = `600 ${SUB_PX}px ${FONT_STACK}`;
// Canvas pixels per layout pixel. The sprite is often magnified when
// the camera zooms in, so paint well above screen resolution and let
// mipmaps handle the far end — a 1× canvas was visibly blurry.
const SUPERSAMPLE = 3;
// World units per layout pixel.
const WORLD_PER_PX = 0.012;

// Captured-piece glyphs used in the spectator legend strip.
const PIECE_GLYPHS = Object.freeze({
	PAWN: '\u265F',
	KNIGHT: '\u265E',
	BISHOP: '\u265D',
	ROOK: '\u265C',
	QUEEN: '\u265B',
	KING: '\u265A',
});

// kingId -> { sprite, texture, canvas, lastSignature }
const nameplateVisuals = new Map();

function getOrCreateGroup(scene, THREE) {
	let group = scene.getObjectByName(NAMEPLATE_GROUP_NAME);
	if (!group) {
		group = new THREE.Group();
		group.name = NAMEPLATE_GROUP_NAME;
		scene.add(group);
	}
	return group;
}

/**
 * Pick the foreground colour for the text label based on the player's
 * piece colour. Falls back to a friendly cream so dark / missing
 * colours still read against the panel background. Mirrors the
 * `normaliseColour` helper in `unifiedPlayerBar.js` — kept inline
 * here so the renderer doesn't reach into UI code.
 */
function resolvePlayerColour(player) {
	const FALLBACK = '#ffeebb';
	if (!player) return FALLBACK;
	const raw = player.color;
	if (raw === null || raw === undefined || raw === '') return FALLBACK;
	if (typeof raw === 'number') {
		if (!Number.isFinite(raw)) return FALLBACK;
		return '#' + (raw & 0xFFFFFF).toString(16).padStart(6, '0');
	}
	if (typeof raw !== 'string') return FALLBACK;
	const trimmed = raw.trim();
	if (!trimmed) return FALLBACK;
	if (trimmed.startsWith('#')) return trimmed;
	if (/^0x[0-9a-f]{6}$/i.test(trimmed)) return '#' + trimmed.slice(2);
	if (/^[0-9a-f]{6}$/i.test(trimmed)) return '#' + trimmed;
	return trimmed;
}

/**
 * Draw the nameplate to an offscreen canvas. Returns the texture-
 * ready bitmap and its rendered dimensions.
 */
function paintCanvas(name, colour, captures) {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return { canvas, width: 0, height: 0 };

	// Measure first so we can size the canvas. We do an off-DOM
	// measure with the same fonts; the panel rects are based on
	// the measured text.
	ctx.font = FONT;
	const nameMetrics = ctx.measureText(name);
	const nameWidth = nameMetrics.width;
	const subText = captures
		? captures
		: '';
	ctx.font = SUBFONT;
	const subMetrics = subText ? ctx.measureText(subText) : { width: 0 };
	const subWidth = subMetrics.width;

	const swatch = 14;   // colour dot before the name
	const swatchGap = 10;
	const innerWidth = Math.max(nameWidth + swatch + swatchGap, subWidth);
	const panelWidth = Math.ceil(innerWidth + PANEL_PADDING * 2);
	const panelHeight = subText
		? NAME_PX + 8 + SUB_PX + PANEL_PADDING * 2
		: NAME_PX + PANEL_PADDING * 2;

	canvas.width = panelWidth * SUPERSAMPLE;
	canvas.height = panelHeight * SUPERSAMPLE;
	ctx.scale(SUPERSAMPLE, SUPERSAMPLE);

	// Panel — dark glass with the player's colour as a border, so the
	// label stays readable whatever the colour (dark bot colours used
	// to vanish when they were also the text colour).
	ctx.fillStyle = 'rgba(12, 14, 24, 0.82)';
	roundRect(ctx, 2, 2, panelWidth - 4, panelHeight - 4, PANEL_RADIUS);
	ctx.fill();
	ctx.strokeStyle = colour;
	ctx.lineWidth = 4;
	ctx.stroke();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
	ctx.lineWidth = 1.5;
	roundRect(ctx, 5, 5, panelWidth - 10, panelHeight - 10, PANEL_RADIUS - 3);
	ctx.stroke();

	// Colour dot + player name in near-white.
	const nameLeft = (panelWidth - (nameWidth + swatch + swatchGap)) / 2;
	const nameMid = PANEL_PADDING + NAME_PX / 2;
	ctx.beginPath();
	ctx.arc(nameLeft + swatch / 2, nameMid, swatch / 2, 0, Math.PI * 2);
	ctx.fillStyle = colour;
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
	ctx.stroke();

	ctx.font = FONT;
	ctx.fillStyle = '#f7f4ec';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(name, nameLeft + swatch + swatchGap, nameMid + 1);

	// Capture strip
	if (subText) {
		ctx.font = SUBFONT;
		ctx.fillStyle = '#f6e7c1';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		ctx.fillText(subText, panelWidth / 2, PANEL_PADDING + NAME_PX + 8);
	}

	return { canvas, width: panelWidth, height: panelHeight };
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

/**
 * Build a compact capture string like "♛x1 ♞x2" from the player's
 * captured basket. The server broadcasts a per-player
 * `capturedSummary` ({TYPE: count}) for everyone in the players
 * list; the local player additionally has `capturedBasket` (full
 * detail) on gameState. We prefer the summary because it's available
 * for every player, not just the local one.
 */
function buildCaptureSummary(player) {
	const summary = player && typeof player.capturedSummary === 'object'
		? player.capturedSummary
		: null;
	if (summary) {
		const parts = [];
		for (const [type, count] of Object.entries(summary)) {
			if (!count) continue;
			const upper = String(type).toUpperCase();
			if (!PIECE_GLYPHS[upper]) continue;
			parts.push(`${PIECE_GLYPHS[upper]}x${count}`);
		}
		if (parts.length) return parts.join('  ');
	}
	const basket = Array.isArray(player?.capturedBasket) ? player.capturedBasket : null;
	if (!basket || basket.length === 0) return '';
	const counts = new Map();
	for (const entry of basket) {
		const type = String(entry?.type || '').toUpperCase();
		if (!PIECE_GLYPHS[type]) continue;
		counts.set(type, (counts.get(type) || 0) + 1);
	}
	const parts = [];
	for (const [type, count] of counts.entries()) {
		parts.push(`${PIECE_GLYPHS[type]}x${count}`);
	}
	return parts.join('  ');
}

/**
 * Compute the cache signature for a king — we only repaint the
 * canvas when something the viewer would see has changed (name,
 * colour, capture summary). Position changes are handled separately
 * by the per-frame positioner.
 */
function buildSignature(name, colour, captures) {
	return `${name}|${colour}|${captures}`;
}

/** Mipmapped, anisotropic texture so the label stays crisp at any zoom. */
function makeTexture(THREE, canvas) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.generateMipmaps = true;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.magFilter = THREE.LinearFilter;
	const renderer = getRenderer();
	if (renderer && renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') {
		texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
	}
	texture.needsUpdate = true;
	return texture;
}

function buildSprite(THREE, name, colour, captures) {
	const { canvas, width, height } = paintCanvas(name, colour, captures);
	const texture = makeTexture(THREE, canvas);
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	});
	const sprite = new THREE.Sprite(material);
	// Aspect-preserving scale — sprites in Three.js are unit-sized
	// so we scale by the canvas aspect ratio.
	sprite.scale.set(width * WORLD_PER_PX, height * WORLD_PER_PX, 1);
	// Render above almost everything else.
	sprite.renderOrder = 999;
	return { sprite, texture, canvas, width, height };
}

function positionSprite(sprite, kingPiece, gameState) {
	const pos = kingPiece.position || kingPiece;
	const x = pos.x ?? kingPiece.x ?? 0;
	const z = pos.z ?? kingPiece.z ?? 0;
	const abs = translatePosition({ x, z }, gameState, true);
	sprite.position.set(abs.x, NAMEPLATE_HEIGHT_ABOVE_KING, abs.z);
}

/**
 * Reconcile nameplate sprites with the current king set.
 *
 * @param {Array<Object>} chessPieces - From `gameState.chessPieces`.
 * @param {Object<string, Object>} players - `gameState.players` or the
 *   broadcasted players list keyed by id.
 * @param {Object} [options]
 * @param {boolean} [options.showCaptures] - When true, the second
 *   row of each nameplate shows the player's captured-piece count.
 *   Defaults to false (HUD shows it; nameplate stays tidy).
 * @param {Object} [options.gameState] - Used for translatePosition.
 *   Falls back to the imported singleton via getScene's owner.
 */
export function syncNameplates(chessPieces, players, options = {}) {
	const THREE = getTHREE();
	const scene = getScene();
	if (!THREE || !scene || !Array.isArray(chessPieces)) return;
	const group = getOrCreateGroup(scene, THREE);
	const gameState = options.gameState || null;
	const showCaptures = !!options.showCaptures;

	const seenIds = new Set();
	for (const piece of chessPieces) {
		if (!piece) continue;
		const type = String(piece.type || '').toUpperCase();
		if (type !== 'KING') continue;
		// View isolation: kings outside the local player's current view
		// (other battles' arenas, or the world while seated in a battle)
		// must not float as orphan labels on the horizon — their cells
		// and piece meshes are already culled by the same rule.
		const kx = piece.position?.x ?? piece.x;
		const kz = piece.position?.z ?? piece.z;
		if (gameState && Number.isFinite(kx) && Number.isFinite(kz)
			&& !isCellVisibleInCurrentView(gameState, kx, kz)) continue;
		seenIds.add(piece.id);

		const playerId = piece.player;
		const player = players ? players[playerId] : null;
		const name = (player?.name || `Player_${String(playerId).slice(0, 6)}`).slice(0, 24);
		const colour = resolvePlayerColour(player);
		const captures = showCaptures ? buildCaptureSummary(player) : '';
		const signature = buildSignature(name, colour, captures);

		let visual = nameplateVisuals.get(piece.id);
		if (!visual) {
			visual = buildSprite(THREE, name, colour, captures);
			visual.lastSignature = signature;
			group.add(visual.sprite);
			nameplateVisuals.set(piece.id, visual);
		} else if (visual.lastSignature !== signature) {
			// Repaint canvas in-place — cheaper than re-allocating.
			const repainted = paintCanvas(name, colour, captures);
			visual.canvas = repainted.canvas;
			visual.width = repainted.width;
			visual.height = repainted.height;
			visual.texture.image = repainted.canvas;
			visual.texture.needsUpdate = true;
			visual.sprite.scale.set(repainted.width * WORLD_PER_PX, repainted.height * WORLD_PER_PX, 1);
			visual.lastSignature = signature;
		}
		positionSprite(visual.sprite, piece, gameState);
	}

	// Reap visuals whose king has been captured / removed.
	for (const [id, visual] of nameplateVisuals) {
		if (seenIds.has(id)) continue;
		group.remove(visual.sprite);
		visual.texture.dispose();
		if (visual.sprite.material) visual.sprite.material.dispose();
		nameplateVisuals.delete(id);
	}
}

/**
 * Gentle vertical bob; called once per frame. The position offset is
 * applied on top of the base sprite position so the
 * `syncNameplates`-set anchor is preserved.
 */
export function animateNameplates(timeSec) {
	if (!Number.isFinite(timeSec)) return;
	const t = timeSec * Math.PI * 2 * NAMEPLATE_BOB_FREQ_HZ;
	for (const visual of nameplateVisuals.values()) {
		const baseY = NAMEPLATE_HEIGHT_ABOVE_KING;
		visual.sprite.position.y = baseY + Math.sin(t) * NAMEPLATE_BOB_AMPLITUDE;
	}
}

export function disposeNameplateVisuals() {
	const scene = getScene();
	if (scene) {
		const group = scene.getObjectByName(NAMEPLATE_GROUP_NAME);
		if (group) {
			for (const visual of nameplateVisuals.values()) {
				group.remove(visual.sprite);
				visual.texture?.dispose();
				visual.sprite.material?.dispose();
			}
			if (group.parent) group.parent.remove(group);
		}
	}
	nameplateVisuals.clear();
}
