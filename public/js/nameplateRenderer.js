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

import { getTHREE, getScene, getRenderer, getCamera, getGameState } from './gameContext.js';
import { vikingActive } from './edition.js';
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
	const look = nameplateLook();
	const FONT = look.font;
	const SUBFONT = look.subfont;

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
	const radius = look.radius === 'pill' ? (panelHeight - 4) / 2 : look.radius;
	ctx.fillStyle = look.fill;
	roundRect(ctx, 2, 2, panelWidth - 4, panelHeight - 4, radius);
	ctx.fill();
	ctx.strokeStyle = look.border || colour;
	ctx.lineWidth = look.borderWidth;
	ctx.stroke();
	if (look.rim) {
		ctx.strokeStyle = look.rim;
		ctx.lineWidth = 1.5;
		roundRect(ctx, 5, 5, panelWidth - 10, panelHeight - 10, Math.max(0, radius - 3));
		ctx.stroke();
	}

	// Colour dot + player name in near-white.
	const nameLeft = (panelWidth - (nameWidth + swatch + swatchGap)) / 2;
	const nameMid = PANEL_PADDING + NAME_PX / 2;
	ctx.beginPath();
	if (look.squareSwatch) ctx.rect(nameLeft, nameMid - swatch / 2, swatch, swatch);
	else ctx.arc(nameLeft + swatch / 2, nameMid, swatch / 2, 0, Math.PI * 2);
	ctx.fillStyle = colour;
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = look.swatchRim;
	ctx.stroke();

	ctx.font = FONT;
	ctx.fillStyle = look.ink;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(name, nameLeft + swatch + swatchGap, nameMid + 1);

	// Capture strip
	if (subText) {
		ctx.font = SUBFONT;
		ctx.fillStyle = look.subInk;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		ctx.fillText(subText, panelWidth / 2, PANEL_PADDING + NAME_PX + 8);
	}

	return { canvas, width: panelWidth, height: panelHeight };
}

/**
 * The nameplate's look follows the render profile (and the edition):
 * normal is dark glass rimmed in the player's colour; cute a soft
 * cream pill in a rounded face; retro a black phosphor box in green
 * monospace; the Viking edition's normal look dark wood with a gilt
 * hairline. `key` goes into the repaint signature.
 */
function nameplateLook() {
	const root = typeof document !== 'undefined' ? document.documentElement : null;
	const profile = root?.dataset?.renderProfile || 'normal';
	const viking = root?.dataset?.edition === 'viking';
	if (profile === 'retro') {
		const mono = '"Courier New", ui-monospace, Menlo, monospace';
		return {
			key: 'retro', font: `700 ${NAME_PX}px ${mono}`, subfont: `700 ${SUB_PX}px ${mono}`,
			radius: 0, fill: 'rgba(0, 8, 2, 0.9)', border: '#00ff41', borderWidth: 3, rim: null,
			squareSwatch: true, swatchRim: '#00ff41', ink: '#00ff41', subInk: '#7dff9c',
		};
	}
	if (profile === 'cute') {
		const round = '"Nunito", "Varela Round", "Arial Rounded MT Bold", ui-rounded, ' + FONT_STACK;
		return {
			key: 'cute', font: `800 ${NAME_PX}px ${round}`, subfont: `700 ${SUB_PX}px ${round}`,
			radius: 'pill', fill: 'rgba(255, 250, 244, 0.94)', border: null, borderWidth: 5, rim: null,
			squareSwatch: false, swatchRim: 'rgba(60, 40, 80, 0.55)', ink: '#3b2a4a', subInk: '#6a4a7a',
		};
	}
	if (viking) {
		return {
			key: 'viking', font: FONT, subfont: SUBFONT,
			radius: 8, fill: 'rgba(44, 29, 16, 0.88)', border: null, borderWidth: 4, rim: 'rgba(233, 196, 106, 0.45)',
			squareSwatch: false, swatchRim: 'rgba(246, 223, 160, 0.9)', ink: '#f6ecd2', subInk: '#ecd08c',
		};
	}
	return {
		key: 'normal', font: FONT, subfont: SUBFONT,
		radius: PANEL_RADIUS, fill: 'rgba(12, 14, 24, 0.82)', border: null, borderWidth: 4, rim: 'rgba(255, 255, 255, 0.18)',
		squareSwatch: false, swatchRim: 'rgba(255, 255, 255, 0.85)', ink: '#f7f4ec', subInk: '#f6e7c1',
	};
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
	return `${name}|${colour}|${captures}|${nameplateLook().key}`;
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
	const clamp = vikingLabelClamp();
	for (const visual of nameplateVisuals.values()) {
		const baseY = NAMEPLATE_HEIGHT_ABOVE_KING;
		visual.sprite.position.y = baseY + Math.sin(t) * NAMEPLATE_BOB_AMPLITUDE;
		if (clamp) {
			clampLabel(visual, clamp);
			if (clamp.viking) clearOfHud(visual, clamp);
		} else if (visual.clamped) {
			visual.sprite.scale.set(visual.width * WORLD_PER_PX, visual.height * WORLD_PER_PX, 1);
			visual.sprite.material.opacity = 1;
			visual.clamped = false;
		}
	}
}

const _hudV = { v: null };
/**
 * Viking edition: a label that would sit under the HUD (the title, the
 * NEXT PIECE panel, the Longship / Skip buttons, the strip of buttons, a
 * painting) fades out instead of showing ghosted through it. Checked a
 * few times a second at the label's corners and centre.
 */
function clearOfHud(visual, { camera, worldPerPxAt1 }) {
	const now = Date.now();
	if (!visual.hudAt || now - visual.hudAt > 200) {
		visual.hudAt = now;
		visual.underHud = labelUnderHud(visual, camera, worldPerPxAt1);
	}
	const m = visual.sprite.material;
	const want = visual.underHud ? 0 : 1;
	m.opacity += (want - m.opacity) * 0.25;
	if (Math.abs(want - m.opacity) < 0.01) m.opacity = want;
}

function labelUnderHud(visual, camera, worldPerPxAt1) {
	const THREE = getTHREE();
	const el = getRenderer()?.domElement;
	if (!THREE || !el || typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return false;
	const r = el.getBoundingClientRect();
	if (!_hudV.v) _hudV.v = new THREE.Vector3();
	const v = _hudV.v;
	visual.sprite.getWorldPosition(v);
	const d = camera.position.distanceTo(v);
	v.project(camera);
	if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return false;
	const cx = r.left + (v.x + 1) / 2 * r.width;
	const cy = r.top + (1 - v.y) / 2 * r.height;
	const hw = (visual.sprite.scale.x / (worldPerPxAt1 * d)) / 2;
	const hh = (visual.sprite.scale.y / (worldPerPxAt1 * d)) / 2;
	const card = document.getElementById('tetches-painting');
	const cardBox = card && card.classList.contains('tp-visible') ? card.getBoundingClientRect() : null;
	for (const [dx, dy] of [[0, 0], [-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]]) {
		const x = cx + dx * hw, y = cy + dy * hh;
		if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true;   // clipped by the screen edge
		if (cardBox && x > cardBox.left && x < cardBox.right && y > cardBox.top && y < cardBox.bottom) return true;
		const top = document.elementFromPoint(x, y);
		if (top && top !== el && !el.contains(top) && top !== document.body && top !== document.documentElement) return true;
	}
	return false;
}

/**
 * Viking edition: a name label never grows past a fixed height on
 * screen. The labels are world-sized, so in any close view of a ship
 * they used to swell into billboards over a third of the screen. (The
 * standard game keeps its world-sized labels.)
 */
function vikingLabelClamp() {
	let live = false;
	try { live = vikingActive(getGameState()); } catch (_e) { live = false; }
	const camera = getCamera();
	const el = getRenderer()?.domElement;
	const h = el ? (el.clientHeight || el.height) : 0;
	if (!camera || !camera.isPerspectiveCamera || !(h > 0)) return null;
	// (the standard game too, more loosely: the CHECK! close-up, and any
	// zoom right in, blew its label up past the width of a phone)
	const maxPx = live ? Math.max(22, Math.min(34, h * 0.045)) : Math.max(26, Math.min(40, h * 0.045));
	return { camera, worldPerPxAt1: (2 * Math.tan((camera.fov * Math.PI / 180) / 2)) / (h * (camera.zoom || 1)), maxPx, viking: live };
}

const _camW = { v: null, s: null };
function clampLabel(visual, { camera, worldPerPxAt1, maxPx }) {
	const baseW = visual.width * WORLD_PER_PX;
	const baseH = visual.height * WORLD_PER_PX;
	// (world positions: the camera can sit inside a rig)
	const THREE = getTHREE();
	let d;
	if (THREE && typeof camera.getWorldPosition === 'function') {
		if (!_camW.v) { _camW.v = new THREE.Vector3(); _camW.s = new THREE.Vector3(); }
		camera.getWorldPosition(_camW.v);
		visual.sprite.getWorldPosition(_camW.s);
		d = _camW.v.distanceTo(_camW.s);
	} else {
		d = camera.position.distanceTo(visual.sprite.position);
	}
	const k = Math.min(1, (maxPx * worldPerPxAt1 * d) / (baseH || 1));
	visual.sprite.scale.set(baseW * k, baseH * k, 1);
	visual.clamped = true;
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
