/**
 * Longships on the battle board (Viking edition).
 *
 * A ship is a board cell (`{type:'ship'}` item, see shipLayout.js and
 * server/battle/shipRules.js). `renderBoard` hands every visible ship cell
 * to {@link syncShips} and draws no land block for it; the game loop calls
 * {@link animateShips} every frame. Nothing here runs in a standard battle:
 * with no ship cells and no ships drawn, both calls return at once.
 *
 * Scene graph, per ship (a direct child of the board group so the board's
 * click raycast reaches it):
 *
 *   root      at the square's centre, y 0.  userData {type:'cell', ship:true,
 *             shipId, player, position:{x,z}} — clicks on the hull resolve to
 *             the square like any other cell.
 *     hitbox  invisible, the square's column from the sea up
 *     float   rides the sea: wave height + bob, heading, heel, pitch
 *       model a clone of the cached buildLongship() model, scaled
 *     foam    soft foam round the hull (on the water, not heeling)
 *     wake    a V of churned water behind it while it moves
 *
 * The passenger (a chess piece whose square holds the ship) is placed on
 * the deck every frame, riding the bob and any glide; `passengerPose` lets
 * the piece reconciler put it there too.
 */

import { buildLongship, longshipReady, preloadLongship } from './longship.js';
import {
	SHIP_SCALE, SHIP_STRETCH_Y, CENTRE_MODEL_Z, MODEL_LENGTH, PASSENGER_MODEL_Z, DECK_HEIGHT, PASSENGER_SCALE,
	collectShips, chooseHeading, headingAngle, chooseDetail, glideDuration,
	woolColours, diffFleet, isRowing, sailDirection, shipItemOf, layoutFleet, beamOf,
} from './shipLayout.js';
import { SEA_SURFACE_Y } from '../seaLevel.js';
import { translatePosition } from '../centreBoardMarker.js';
import { getPlayerColor } from '../boardFunctions/colours.js';
import { getChessPiecesGroup } from '../gameContext.js';
import { setToastAvoider, setToastAvoidExtra } from '../showToastMessage.js';

const SINK_MS = 2400;
const RISE_MS = 1800;
const RECOLOUR_MS = 1300;
const BUILT_GRACE_MS = 6000;   // ships seen this soon after a battle's first are not "new keels"
const MAX_BRACE = 0.66;        // the yard braced round at most ~38° off square
const SAIL_LEAN = 0.44;        // seen from straight above, the sail's foot swings out ~25°
const SAIL_YARD_Y = 3.8;       // the yard (the sail's head) in model units (longship.js YARD_Y)
const SAIL_YARD_Z = 0.13;      // …and YARD_Z

const SHADOW_OPACITY = 0.5;    // the hull's dark contact shadow on the water
const SPRAY_N = 40;            // bow-spray droplets per ship
const VWAKE_N = 44;            // samples of the bow's path kept for the V-wake
const VWAKE_MS = 2200;         // how long the V-wake takes to spread out and fade
const VWAKE_SPREAD = 0.75;     // board units a second each arm of the V moves out
const BURST_MS = 750;          // the burst of spray as a ship gets under way, and as it stops

/**
 * The owner's colour for the band on the water: a dark army's colour
 * would vanish on the dark sea, so it is lifted toward grey.
 */
export function haloColour(hex) {
	const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
	const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
	const k = lum < 0.4 ? Math.min(0.6, (0.4 - lum) * 1.6) : 0;
	const mix = (c) => Math.round(c + (255 - c) * k);
	return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

const state = {
	THREE: null,
	ships: new Map(),          // shipId -> entry
	fleet: new Map(),          // last collectShips() snapshot
	battleId: null,
	firstSeenAt: 0,
	boardGroup: null,
	listening: false,
	pendingSunk: new Map(),    // shipId -> time a 'sunk' arrived before the board caught up
	lastDir: new Map(),        // shipId -> {dx,dz}
	templates: new Map(),      // `${main}|${stripe}|${detail}` -> {group, meta}
	tex: null,
	water: null,
	stats: { builds: 0, buildMs: 0 },
};

/* ------------------------------------------------------------ helpers */

function now() { return Date.now(); }
function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
function easeInOut(t) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)); }
function easeOut(t) { t = clamp01(t); return 1 - (1 - t) * (1 - t); }

function hashPhase(id) {
	let h = 0;
	const s = String(id);
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return ((h >>> 0) % 1000) / 1000 * Math.PI * 2;
}

function localPlayerIds(gameState) {
	return [gameState?.localPlayerId, gameState?.myPlayerId].filter(Boolean).map(String);
}

function seatColour(gameState, item) {
	let c = null;
	try { c = getPlayerColor(item.player, gameState, 'chess'); } catch (_e) { c = null; }
	if (!Number.isFinite(c) && typeof item.color === 'string') c = parseInt(item.color.replace('#', ''), 16);
	return Number.isFinite(c) ? c : 0xb3261e;
}

/** Phones and tablets get the light model for every ship. */
function coarsePointer() {
	try {
		return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
			&& window.matchMedia('(pointer: coarse)').matches;
	} catch (_e) {
		return false;
	}
}

/* ------------------------------------------------------ shared assets */

function canvasTexture(THREE, size, draw) {
	const c = document.createElement('canvas');
	c.width = size; c.height = size;
	const g = c.getContext('2d');
	draw(g, size);
	const t = new THREE.CanvasTexture(c);
	t.needsUpdate = true;
	return t;
}

function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function ensureAssets(THREE) {
	if (state.tex) return state.tex;
	const rnd = seeded(7);
	// Foam where the hull meets the water: a thin broken ring of lace
	// right at the rim (no pale fill: from above that read as a spotlight).
	const foam = canvasTexture(THREE, 256, (g, S) => {
		g.clearRect(0, 0, S, S);
		const c = S / 2;
		for (let i = 0; i < 1100; i++) {
			const a = rnd() * Math.PI * 2;
			const rr = 0.8 + 0.17 * Math.pow(rnd(), 1.4) * (rnd() < 0.5 ? -1 : 1) * 0.6;
			const r = rr * c * 0.98;
			const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
			const sz = 0.8 + rnd() * 2.2;
			g.fillStyle = `rgba(255,255,255,${0.12 + 0.4 * rnd()})`;
			g.beginPath(); g.arc(x, y, sz, 0, Math.PI * 2); g.fill();
		}
	});
	// The hull's contact shadow on the water: dark, soft, tight.
	const shadow = canvasTexture(THREE, 128, (g, S) => {
		g.clearRect(0, 0, S, S);
		const c = S / 2;
		const grd = g.createRadialGradient(c, c, 0, c, c, c);
		grd.addColorStop(0, 'rgba(6,14,18,0.85)');
		grd.addColorStop(0.55, 'rgba(6,14,18,0.6)');
		grd.addColorStop(0.85, 'rgba(6,14,18,0.18)');
		grd.addColorStop(1, 'rgba(6,14,18,0)');
		g.fillStyle = grd; g.fillRect(0, 0, S, S);
	});
	// One stamp of wake: churn in the middle, a crest at either edge. A
	// row of stamps that widen as they age draws the V behind a hull.
	const trail = canvasTexture(THREE, 128, (g, S) => {
		g.clearRect(0, 0, S, S);
		const soft = (x, y, r, a) => {
			const grd = g.createRadialGradient(x, y, 0, x, y, r);
			grd.addColorStop(0, `rgba(255,255,255,${a})`);
			grd.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = grd;
			g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
		};
		for (let i = 0; i < 70; i++) {
			const side = rnd() < 0.5 ? -1 : 1;
			soft(S / 2 + side * S * (0.36 + 0.08 * rnd()), S * (0.25 + 0.5 * rnd()), 3 + 6 * rnd(), 0.35 + 0.3 * rnd());
		}
		for (let i = 0; i < 40; i++) soft(S / 2 + (rnd() - 0.5) * S * 0.3, S * (0.2 + 0.6 * rnd()), 4 + 8 * rnd(), 0.12 + 0.15 * rnd());
	});
	// Wake: churned water from the stern (top, v=0) spreading into a
	// widening V that dissolves with distance. Soft blobs, then a mask
	// that fades it to nothing across the width and along the length, so
	// no streak ever ends in a hard edge.
	const wake = canvasTexture(THREE, 256, (g, S) => {
		g.clearRect(0, 0, S, S);
		const soft = (x, y, r, a) => {
			const grd = g.createRadialGradient(x, y, 0, x, y, r);
			grd.addColorStop(0, `rgba(255,255,255,${a})`);
			grd.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = grd;
			g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
		};
		// the stern's churn: a broad soft patch at the top
		for (let i = 0; i < 90; i++) {
			const v = Math.pow(rnd(), 1.6) * 0.35;
			soft(S / 2 + (rnd() - 0.5) * S * (0.12 + 0.3 * v), v * S, 6 + 10 * rnd(), 0.10 * (1 - v));
		}
		// the two arms of the V, widening and breaking up behind
		for (let i = 0; i < 1100; i++) {
			const v = rnd();
			const side = rnd() < 0.5 ? -1 : 1;
			const spread = 0.05 + 0.3 * v;
			const x = S / 2 + side * spread * S + (rnd() - 0.5) * S * (0.03 + 0.08 * v);
			soft(x, v * S, 2 + 5 * rnd() * (0.6 + v), 0.22 * (1 - v) * (0.5 + 0.5 * rnd()));
		}
		// fade: along the length, and to zero at both side edges
		g.globalCompositeOperation = 'destination-in';
		const along = g.createLinearGradient(0, 0, 0, S);
		along.addColorStop(0, 'rgba(0,0,0,0.85)');
		along.addColorStop(0.08, 'rgba(0,0,0,1)');
		along.addColorStop(0.55, 'rgba(0,0,0,0.55)');
		along.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = along; g.fillRect(0, 0, S, S);
		const across = g.createLinearGradient(0, 0, S, 0);
		across.addColorStop(0, 'rgba(0,0,0,0)');
		across.addColorStop(0.14, 'rgba(0,0,0,1)');
		across.addColorStop(0.86, 'rgba(0,0,0,1)');
		across.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = across; g.fillRect(0, 0, S, S);
		g.globalCompositeOperation = 'source-over';
	});
	const bubble = canvasTexture(THREE, 64, (g, S) => {
		const c = S / 2;
		const grd = g.createRadialGradient(c - 6, c - 6, 1, c, c, c);
		grd.addColorStop(0, 'rgba(255,255,255,0.95)');
		grd.addColorStop(0.45, 'rgba(220,240,255,0.35)');
		grd.addColorStop(0.85, 'rgba(255,255,255,0.65)');
		grd.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = grd; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
	});
	// Spray: a soft filled droplet (the bubble's rim read as a string of beads).
	const droplet = canvasTexture(THREE, 32, (g, S) => {
		const c = S / 2;
		const grd = g.createRadialGradient(c, c, 0, c, c, c);
		grd.addColorStop(0, 'rgba(255,255,255,1)');
		grd.addColorStop(0.4, 'rgba(255,255,255,0.75)');
		grd.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = grd; g.fillRect(0, 0, S, S);
	});
	// A ribbon of foam (u along the wake, v across): broken lace, brightest
	// along the leading edge (v=0), so the V reads as two crisp lines.
	const streak = canvasTexture(THREE, 128, (g, S) => {
		g.clearRect(0, 0, S, S);
		// a solid crest along the leading edge, breaking up behind it
		const crest = g.createLinearGradient(0, 0, 0, S);
		crest.addColorStop(0, 'rgba(255,255,255,0.85)');
		crest.addColorStop(0.3, 'rgba(255,255,255,0.5)');
		crest.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = crest; g.fillRect(0, 0, S, S);
		for (let i = 0; i < 1500; i++) {
			const v = Math.pow(rnd(), 1.7);
			const x = rnd() * S, y = v * S;
			const r = 0.8 + 2.6 * rnd() * (0.4 + v);
			g.fillStyle = `rgba(255,255,255,${(0.25 + 0.6 * rnd()) * (1 - 0.6 * v)})`;
			g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
			// wrap the flecks across the u seam
			if (x < r) { g.beginPath(); g.arc(x + S, y, r, 0, Math.PI * 2); g.fill(); }
			if (x > S - r) { g.beginPath(); g.arc(x - S, y, r, 0, Math.PI * 2); g.fill(); }
		}
	});
	streak.wrapS = THREE.RepeatWrapping;
	const plane = new THREE.PlaneGeometry(1, 1);
	plane.rotateX(-Math.PI / 2);
	const hitGeo = new THREE.BoxGeometry(0.5, 1.6, SHIP_SCALE * 6.6);
	const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
	state.tex = { foam, wake, bubble, droplet, shadow, trail, streak, plane, hitGeo, hitMat };
	return state.tex;
}

/**
 * The cached longship for a colour and detail. Built once; ships clone it
 * (geometry and materials are shared, so four ships cost four sets of
 * draw calls but one set of buffers).
 */
/** Is the hull builder here yet (always, outside the production bundle)? */
function builderReady() {
	return typeof longshipReady !== 'function' || longshipReady();
}

/**
 * Fetch the hull builder now (a Viking battle is on), so the fleet is
 * drawn the moment the board brings it. No-op once loaded.
 */
export function prepareShips() {
	if (typeof preloadLongship === 'function' && !builderReady()) preloadLongship(resync);
}

/** Re-run the last sync (the builder has just arrived). */
function resync() {
	const args = state.lastSync;
	if (!args) return;
	try { syncShips(...args); } catch (err) { console.error('Ship sync failed:', err); }
}

function template(THREE, main, stripe, detail) {
	const key = `${main}|${stripe}|${detail}`;
	let t = state.templates.get(key);
	if (t) return t;
	const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const group = buildLongship(THREE, { sailColour: main, stripeColour: stripe, detail });
	if (!group) return null;
	state.stats.builds++;
	state.stats.buildMs += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
	const meta = {
		oarData: group.userData.oarData, main, stripe, detail,
		rigLines: group.userData.rigLines || null,
		aimRigLines: typeof group.userData.aimRigLines === 'function' ? group.userData.aimRigLines : null,
	};
	// Object3D.clone() JSON-copies userData; strip the mesh references first.
	group.userData = {};
	group.traverse((o) => {
		if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
	});
	t = { group, meta };
	state.templates.set(key, t);
	return t;
}

function lookFor(gameState, item, isLocal) {
	const { main, stripe } = woolColours(seatColour(gameState, item));
	const lowPower = !!(gameState && (gameState.lowQuality || gameState.renderProfile === 'cute'
		|| gameState.renderProfile === 'retro' || gameState.performanceMode === 'low'))
		|| coarsePointer();
	const detail = chooseDetail({ isLocal, lowPower });
	return { main, stripe, detail, key: `${main}|${stripe}|${detail}` };
}

function instantiate(THREE, gameState, item, isLocal) {
	const { main, stripe, detail } = lookFor(gameState, item, isLocal);
	const t = template(THREE, main, stripe, detail);
	const model = t.group.clone();
	model.name = 'longship-model';
	model.scale.set(SHIP_SCALE, SHIP_SCALE * SHIP_STRETCH_Y, SHIP_SCALE);
	model.position.set(0, 0, -CENTRE_MODEL_Z * SHIP_SCALE);
	const parts = {
		sail: model.getObjectByName('sail'),
		oars: model.getObjectByName('oars'),
		pennant: model.getObjectByName('pennant'),
		yard: model.getObjectByName('yard'),
		rigRopes: model.getObjectByName('rigRopes'),
		rigLines: t.meta.rigLines,
		aimRigLines: t.meta.aimRigLines,
		oarData: t.meta.oarData,
		main, stripe, detail,
	};
	return { model, parts };
}

/* ------------------------------------------------------- sea surface */

/**
 * Height of the rippling sea at a world point (scene.js addWaterPlane:
 * a 1200-unit, 64-segment plane rotated flat, following the camera).
 * Interpolated on the same triangles the GPU draws, so a hull sits on
 * the surface you see.
 */
export function seaHeightAt(scene, wx, wz) {
	let water = state.water;
	if (!water || water.parent !== scene) {
		water = scene ? scene.getObjectByName('tetches-water') : null;
		state.water = water;
	}
	if (!water || !water.geometry || !water.geometry.attributes.position) return SEA_SURFACE_Y;
	const pos = water.geometry.attributes.position;
	const SEG = 64, SIZE = 1200, step = SIZE / SEG, row = SEG + 1;
	const gx = (wx - water.position.x + SIZE / 2) / step;
	const gz = (wz - water.position.z + SIZE / 2) / step;
	if (!(gx >= 0 && gz >= 0 && gx < SEG && gz < SEG)) return water.position.y;
	const ix = Math.floor(gx), iz = Math.floor(gz);
	const fx = gx - ix, fz = gz - iz;
	const ha = pos.getY(ix + row * iz);
	const hb = pos.getY(ix + row * (iz + 1));
	const hc = pos.getY(ix + 1 + row * (iz + 1));
	const hd = pos.getY(ix + 1 + row * iz);
	const h = (fx + fz <= 1)
		? ha + (hd - ha) * fx + (hb - ha) * fz
		: hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
	return water.position.y + h;
}

/* ------------------------------------------------------------ entries */

function worldOf(gameState, x, z) {
	const p = translatePosition({ x, z }, gameState, true);
	return { x: p.x, z: p.z };
}

function isWaterFn(gameState) {
	const cells = gameState?.board?.cells || {};
	return (x, z) => {
		const c = cells[`${x},${z}`];
		if (c === undefined || c === null) return true;
		if (Array.isArray(c)) {
			if (c.length === 0) return true;
			return c.every(i => i && (i.type === 'specialMarker' || i.type === 'boardCentre'));
		}
		return false;
	};
}

function arenaCentre(gameState) {
	const b = gameState?.activeBattle;
	const a = b && (b.arena || b.bounds);
	if (a && Number.isFinite(a.minX) && Number.isFinite(a.maxX)) {
		return { x: (a.minX + a.maxX) / 2, z: (a.minZ + a.maxZ) / 2 };
	}
	if (a && a.centre && Number.isFinite(a.centre.x)) return a.centre;
	if (b && b.origin && Number.isFinite(b.origin.x)) return b.origin;
	return null;
}

/**
 * Which beam of a ship lying at (x, z) with its bow toward `dir` touches
 * land (or another hull) — along its whole length, the squares abeam and
 * diagonally fore and aft. `a` is the model's +X side, `b` its -X side.
 * A moored ship ships its oars on that side and lies a little off.
 */
export function shoreOf(gameState, x, z, dir) {
	if (!dir) return { a: false, b: false };
	const water = isWaterFn(gameState);
	const ax = dir.dz, az = -dir.dx;          // model +X in board terms
	const touches = (sx, sz) => [0, 1, -1].some(k => !water(x + sx + dir.dx * k, z + sz + dir.dz * k));
	return { a: touches(ax, az), b: touches(-ax, -az), ax, az };
}

/**
 * Land for the fleet layout: a square holding anything but a ship, a
 * marker or the board centre. (Other ships' squares are water here: the
 * layout keeps hulls apart itself.)
 */
function isLandFn(gameState) {
	const cells = gameState?.board?.cells || {};
	return (x, z) => {
		const c = cells[`${x},${z}`];
		if (c === undefined || c === null) return false;
		const items = Array.isArray(c) ? c : [c];
		let solid = false;
		for (const i of items) {
			if (!i) continue;
			if (i.type === 'ship') return false;
			if (i.type !== 'specialMarker' && i.type !== 'boardCentre') solid = true;
		}
		return solid;
	};
}

/**
 * Give every drawn ship a heading and an offset from its square (see
 * layoutFleet): no hull in land, none inside another. Only re-solved when
 * the ships or the land round them change.
 */
function layoutShips(gameState) {
	const isLand = isLandFn(gameState);
	const specs = [];
	let key = '';
	for (const e of state.ships.values()) {
		if (e.sink) continue;
		const moving = !!e.glide;
		const fixedDir = moving && e.glide.dir ? e.glide.dir : null;
		const prefer = fixedDir || headingFor(gameState, { shipId: e.shipId, x: e.x, z: e.z });
		let bits = '';
		for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) bits += isLand(e.x + dx, e.z + dz) ? '1' : '0';
		key += `${e.shipId}@${e.x},${e.z}:${prefer.dx},${prefer.dz}:${fixedDir ? 'f' : ''}:${bits}|`;
		specs.push({
			id: e.shipId, x: e.x, z: e.z, prefer, fixedDir, moving,
			prev: e.layout ? { d: e.layout.d, s: e.layout.s, c: e.layout.c } : null,
		});
	}
	if (key === state.layoutKey) return;
	state.layoutKey = key;
	const res = layoutFleet(specs, isLand);
	for (const e of state.ships.values()) {
		const lay = res.get(e.shipId);
		if (!lay) continue;
		const first = !e.layout;
		e.layout = lay;
		if (!e.glide) {
			e.targetHeading = headingAngle(lay.d);
			e.shore = berthShore(isLand, e.x, e.z, lay);
			if (first) {
				// a ship first seen is simply there, not swinging into place
				e.heading = e.targetHeading;
				e.nudge.x = lay.dx; e.nudge.z = lay.dz;
			}
		}
	}
}

/**
 * Which beam of a hull lying at its berth has land close alongside (an
 * oar's reach, ~1 square from the keel): that side's oars stay shipped.
 */
function berthShore(isLand, x, z, lay) {
	const d = lay.d;
	const b = beamOf(d);
	const touches = (side) => {
		for (let a = -1.3; a <= 1.61; a += 0.4) {
			const px = x + lay.dx + d.dx * a + b.dx * side * 0.95;
			const pz = z + lay.dz + d.dz * a + b.dz * side * 0.95;
			if (isLand(Math.round(px), Math.round(pz))) return true;
		}
		return false;
	};
	return { a: touches(1), b: touches(-1), ax: b.dx, az: b.dz };
}

function headingFor(gameState, ship, dirOverride) {
	const lastDir = dirOverride || state.lastDir.get(ship.shipId) || null;
	return chooseHeading({
		x: ship.x, z: ship.z,
		isWater: isWaterFn(gameState),
		lastDir,
		centre: arenaCentre(gameState) || { x: ship.x, z: ship.z },
	});
}

function makeEntry(THREE, gameState, ship, boardGroup) {
	const tex = ensureAssets(THREE);
	const locals = localPlayerIds(gameState);
	const isLocal = locals.includes(String(ship.item.player));
	const { model, parts } = instantiate(THREE, gameState, ship.item, isLocal);

	const root = new THREE.Group();
	root.name = 'longship';
	const w = worldOf(gameState, ship.x, ship.z);
	root.position.set(w.x, 0, w.z);
	root.userData = {
		type: 'cell', ship: true, shipId: ship.shipId, player: ship.item.player,
		position: { x: ship.x, z: ship.z },
	};

	const float = new THREE.Group();
	float.name = 'ship-float';
	float.add(model);
	root.add(float);

	// Clicks anywhere on the hull or sail resolve to the ship's square
	// (the root): a box round the hull, riding with it.
	const hitbox = new THREE.Mesh(tex.hitGeo, tex.hitMat);
	hitbox.name = 'ship-hitbox';
	hitbox.position.set(0, 0.75, -CENTRE_MODEL_Z * SHIP_SCALE);
	hitbox.userData = { type: 'shipHitbox', shipId: ship.shipId };
	// Never drawn; three.js raycasts ignore `visible`, so clicks still land.
	hitbox.visible = false;
	float.add(hitbox);

	const foamMat = new THREE.MeshBasicMaterial({
		map: tex.foam, transparent: true, depthWrite: false, opacity: 0.75, color: 0xffffff, fog: true,
	});
	const foam = new THREE.Mesh(tex.plane, foamMat);
	foam.name = 'ship-foam';
	foam.renderOrder = 2;
	root.add(foam);

	const wakeMat = new THREE.MeshBasicMaterial({
		map: tex.wake, transparent: true, depthWrite: false, opacity: 0, color: 0xffffff, fog: true,
	});
	const wake = new THREE.Mesh(tex.plane, wakeMat);
	wake.name = 'ship-wake';
	wake.renderOrder = 2;
	wake.visible = false;
	root.add(wake);

	// The hull's soft dark shadow on the water under it (whose ship it
	// is shows in the sail, not in a halo).
	const shadowMat = new THREE.MeshBasicMaterial({
		map: tex.shadow, transparent: true, depthWrite: false, opacity: SHADOW_OPACITY, color: 0xffffff, fog: true,
	});
	const shadow = new THREE.Mesh(tex.plane, shadowMat);
	shadow.name = 'ship-shadow';
	shadow.renderOrder = 1;
	root.add(shadow);

	// Bow spray: a few droplets thrown off the stem while under way.
	const sprayGeo = new THREE.BufferGeometry();
	sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPRAY_N * 3).fill(-999), 3));
	const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({
		map: tex.droplet, size: 0.13, transparent: true, depthWrite: false, opacity: 0, color: 0xf4f8fa, sizeAttenuation: true,
	}));
	spray.name = 'ship-spray';
	spray.frustumCulled = false;
	spray.visible = false;
	root.add(spray);

	boardGroup.add(root);

	const heading = headingFor(gameState, ship);
	const entry = {
		shipId: ship.shipId,
		x: ship.x, z: ship.z,
		item: ship.item,
		isLocal,
		root, float, model, parts, foam, wake, shadow, spray, hitbox,
		trail: [],         // wake stamps left on the water (boardGroup space)
		trailFrom: null,   // where the last stamp was dropped
		out: 0,            // oars run out (0 shipped inboard .. 1 rowing)
		heading: headingAngle(heading),
		shore: shoreOf(gameState, ship.x, ship.z, heading),
		stowA: 0, stowB: 0,          // shore-side oars shipped (+X side, -X side)
		nudge: { x: 0, z: 0 },       // moored: eased away from the shore
		hull: { x: w.x, z: w.z },    // hull centre (world), for the selection ring
		sea: SEA_SURFACE_Y,
		targetHeading: headingAngle(heading),
		phase: hashPhase(ship.shipId),
		glide: null,       // {fromW, toW, start, dur, dir}
		sink: null,        // {start, bubbles}
		rise: null,        // {start}
		recolour: null,    // {start, fromMain, fromStripe, toMain, toStripe, geo}
		rowing: false,
		oarsAtRest: true,
		deck: { x: w.x, y: SEA_SURFACE_Y + DECK_HEIGHT, z: w.z },
		sway: 0,
	};
	return entry;
}

function disposeEntry(entry) {
	if (!entry) return;
	const r = entry.root;
	if (r.parent) r.parent.remove(r);
	entry.foam.material.dispose();
	entry.wake.material.dispose();
	if (entry.shadow) entry.shadow.material.dispose();
	if (entry.spray) { entry.spray.geometry.dispose(); entry.spray.material.dispose(); }
	if (entry.vwake) {
		if (entry.vwake.mesh.parent) entry.vwake.mesh.parent.remove(entry.vwake.mesh);
		entry.vwake.mesh.geometry.dispose();
		entry.vwake.mesh.material.dispose();
	}
	for (const st of entry.trail || []) {
		if (st.mesh.parent) st.mesh.parent.remove(st.mesh);
		st.mesh.material.dispose();
	}
	if (entry.recolour && entry.recolour.geo) entry.recolour.geo.dispose();
	if (entry.sink && entry.sink.points) {
		entry.sink.points.geometry.dispose();
		entry.sink.points.material.dispose();
	}
	releaseMovedPassengers(entry);
}

function swapModel(THREE, gameState, entry) {
	const isLocal = localPlayerIds(gameState).includes(String(entry.item.player));
	const { model, parts } = instantiate(THREE, gameState, entry.item, isLocal);
	entry.float.remove(entry.model);
	entry.float.add(model);
	entry.model = model;
	entry.parts = parts;
	entry.isLocal = isLocal;
	entry.oarsAtRest = false;
}

/* ------------------------------------------------- sail colour fades */

function startRecolour(THREE, gameState, entry) {
	const { main, stripe } = woolColours(seatColour(gameState, entry.item));
	const current = entry.recolour ? entry.recolour.toHex : entry.parts.main;
	if (current === main) return;
	const sail = entry.parts.sail;
	if (!sail || !sail.geometry || !sail.geometry.attributes.color) { swapModel(THREE, gameState, entry); return; }
	if (entry.recolour && entry.recolour.geo) entry.recolour.geo.dispose();
	const geo = sail.geometry.clone();
	sail.geometry = geo;
	const col = geo.attributes.color;
	const fromMain = new THREE.Color(entry.parts.main);
	const fromStripe = new THREE.Color(entry.parts.stripe);
	const mask = new Uint8Array(col.count);
	for (let i = 0; i < col.count; i++) {
		const dm = Math.abs(col.getX(i) - fromMain.r) + Math.abs(col.getY(i) - fromMain.g) + Math.abs(col.getZ(i) - fromMain.b);
		const ds = Math.abs(col.getX(i) - fromStripe.r) + Math.abs(col.getY(i) - fromStripe.g) + Math.abs(col.getZ(i) - fromStripe.b);
		mask[i] = dm <= ds ? 1 : 0;
	}
	entry.recolour = {
		start: now(), geo, mask, fromMain, fromStripe, toHex: main,
		toMain: new THREE.Color(main), toStripe: new THREE.Color(stripe),
	};
}

function stepRecolour(THREE, gameState, entry, t) {
	const rc = entry.recolour;
	const k = easeInOut((t - rc.start) / RECOLOUR_MS);
	const col = rc.geo.attributes.color;
	const a = new THREE.Color(), b = new THREE.Color();
	a.copy(rc.fromMain).lerp(rc.toMain, k);
	b.copy(rc.fromStripe).lerp(rc.toStripe, k);
	for (let i = 0; i < col.count; i++) {
		const c = rc.mask[i] ? a : b;
		col.setXYZ(i, c.r, c.g, c.b);
	}
	col.needsUpdate = true;
	if (k >= 1) {
		// The hull's painted strake and shields follow in the swap.
		const geo = rc.geo;
		entry.recolour = null;
		swapModel(THREE, gameState, entry);
		geo.dispose();
	}
}

/* --------------------------------------------------------- the events */

function onShipEvent(ev) {
	const d = ev && ev.detail;
	if (!d || !d.kind) return;
	const id = d.shipId != null ? String(d.shipId) : null;
	if (d.kind === 'sailed' && id) {
		const dir = sailDirection(d.from, d.to);
		if (dir) state.lastDir.set(id, dir);
		const e = state.ships.get(id);
		// The board normally lands first (the glide is already running);
		// if not, the next sync starts it from the event's `from`.
		if (e && !e.glide && d.to && (e.x !== Number(d.to.x) || e.z !== Number(d.to.z))) e.pendingFrom = d.from;
	} else if (d.kind === 'seized' && id && d.to != null) {
		// Usually the board diff has already started the fade; this
		// covers a board that changed the item in place.
		const e = state.ships.get(id);
		const gs = state.gameState;
		if (e && gs && String(e.item.player) !== String(d.to)) {
			e.item = { ...e.item, player: d.to };
			e.root.userData.player = d.to;
			startRecolour(state.THREE, gs, e);
		}
	} else if (d.kind === 'sunk' && id) {
		const e = state.ships.get(id);
		if (e) startSink(e, { passengerId: d.passengerId });
		else state.pendingSunk.set(id, now());
	}
}

function ensureListening() {
	if (state.listening || typeof window === 'undefined') return;
	state.listening = true;
	window.addEventListener('tetches:ship', onShipEvent);
}

/* ---------------------------------------------------- sync (per board) */

/**
 * Reconcile the drawn ships with the board. Called by renderBoard with
 * the visible ship cells it skipped; cheap when nothing changed.
 *
 * @param {Object} gameState
 * @param {THREE.Group} boardGroup
 * @param {Object} THREE
 * @param {Object<string, any>} shipCells the visible cells holding a ship, by key
 */
export function syncShips(gameState, boardGroup, THREE, shipCells) {
	if (!THREE || !boardGroup) return;
	const fleet = collectShips(shipCells);
	if (fleet.size === 0 && state.ships.size === 0) {
		state.fleet = fleet; state.lastSync = null;
		if (state.avoiding) { setToastAvoider(null); setToastAvoidExtra(null); state.avoiding = false; }
		return;
	}
	if (!state.avoiding) { setToastAvoider(ownShipScreenRect); setToastAvoidExtra(fallingPieceScreenRects); state.avoiding = true; }
	state.lastSync = [gameState, boardGroup, THREE, shipCells];
	state.THREE = THREE;
	state.gameState = gameState;
	ensureListening();

	const battleId = gameState?.activeBattle?.id || null;
	const battleChanged = battleId !== state.battleId;
	if (battleChanged || state.boardGroup !== boardGroup) {
		// A new battle (or a fresh board): drop everything without ceremony.
		for (const e of state.ships.values()) disposeEntry(e);
		state.ships.clear();
		state.fleet = new Map();
		state.battleId = battleId;
		state.boardGroup = boardGroup;
		state.firstSeenAt = 0;
		state.lastDir.clear();
	}
	if (fleet.size > 0 && !state.firstSeenAt) state.firstSeenAt = now();

	const diff = diffFleet(state.fleet, fleet);
	const t = now();

	// Building a hull takes ~0.1-0.3 s; build at most one per board pass
	// so a battle's fleet arrives over a few frames instead of one hitch.
	let builds = 1;
	const locals = localPlayerIds(gameState);
	for (const id of diff.added) {
		const ship = fleet.get(id);
		const look = lookFor(gameState, ship.item, locals.includes(String(ship.item.player)));
		if (!state.templates.has(look.key)) {
			// The builder is still on its way: draw it when it lands.
			if (!builderReady()) { fleet.delete(id); prepareShips(); continue; }
			if (builds <= 0) { fleet.delete(id); continue; }   // next pass
			builds--;
		}
		const entry = makeEntry(THREE, gameState, ship, boardGroup);
		state.ships.set(id, entry);
		if (state.fleet.size > 0 && t - state.firstSeenAt > BUILT_GRACE_MS) entry.rise = { start: t };
		if (state.pendingSunk.has(id)) { startSink(entry); state.pendingSunk.delete(id); }
	}
	for (const m of diff.moved) {
		const e = state.ships.get(m.shipId);
		if (!e) continue;
		const dir = sailDirection(m.from, m.to);
		if (dir) state.lastDir.set(m.shipId, dir);
		const from = e.pendingFrom || m.from;
		e.pendingFrom = null;
		startGlide(gameState, e, from, m.to, dir);
	}
	for (const r of diff.recoloured) {
		const e = state.ships.get(r.shipId);
		if (!e) continue;
		e.item = fleet.get(r.shipId).item;
		e.root.userData.player = e.item.player;
		startRecolour(THREE, gameState, e);
	}
	// The whole fleet vanishing at once is the arena being cleared (battle
	// over), not a sea battle: take the ships away without ceremony.
	const wipe = diff.removed.length >= 2 && fleet.size === 0;
	for (const id of diff.removed) {
		const e = state.ships.get(id);
		if (!e) continue;
		if (wipe) { disposeEntry(e); state.ships.delete(id); continue; }
		if (!e.sink) startSink(e, { boardDropped: true });
		e.gone = true;
	}
	// Fresh item data (readyAt), and settle headings once neighbours change.
	for (const [id, s] of fleet) {
		const e = state.ships.get(id);
		if (!e) continue;
		e.item = s.item;
		if (!e.glide && !e.layout) {
			const hd = headingFor(gameState, s);
			e.targetHeading = headingAngle(hd);
			e.shore = shoreOf(gameState, s.x, s.z, hd);
		}
	}
	// Prune pending sinks that never matched a ship.
	for (const [id, at] of state.pendingSunk) if (t - at > 5000) state.pendingSunk.delete(id);
	state.fleet = fleet;
	// Headings and offsets that keep every hull clear of land and of the
	// other hulls (re-solved only when the ships or their land change).
	layoutShips(gameState);
}

function startGlide(gameState, e, from, to, dir) {
	const fromW = e.glide ? { x: e.root.position.x, z: e.root.position.z } : worldOf(gameState, from.x, from.z);
	const toW = worldOf(gameState, to.x, to.z);
	const cells = Math.abs(to.x - from.x) + Math.abs(to.z - from.z);
	e.x = to.x; e.z = to.z;
	e.root.userData.position = { x: to.x, z: to.z };
	// Swing the bow round first (a quarter turn takes ~0.3 s), then go.
	let turnMs = 0;
	if (dir) {
		e.targetHeading = headingAngle(dir);
		turnMs = Math.min(520, Math.abs(angleDelta(e.heading, e.targetHeading)) / (Math.PI / 2) * 300);
	}
	e.glide = { fromW, toW, start: now() + turnMs, dur: glideDuration(cells), dir };
}

function startSink(e, opts = {}) {
	if (e.sink) return;
	drownWithShip(e, opts);
	const THREE = state.THREE;
	const tex = ensureAssets(THREE);
	const N = 36;
	const geo = new THREE.BufferGeometry();
	const p = new Float32Array(N * 3);
	const seeds = new Float32Array(N * 3);
	const rnd = seeded(Math.floor(e.phase * 1000));
	for (let i = 0; i < N; i++) {
		seeds[i * 3] = (rnd() - 0.5) * 0.9;     // along the hull
		seeds[i * 3 + 1] = rnd();                // start delay
		seeds[i * 3 + 2] = (rnd() - 0.5) * 0.35; // across
	}
	geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
	const mat = new THREE.PointsMaterial({
		map: tex.bubble, size: 0.07, transparent: true, depthWrite: false, opacity: 0.9, sizeAttenuation: true,
	});
	const points = new THREE.Points(geo, mat);
	points.frustumCulled = false;
	points.name = 'ship-bubbles';
	e.root.add(points);
	e.sink = { start: now(), points, seeds, N };
	e.hitbox.visible = false;
	e.root.userData.type = 'sinkingShip';
}

/* --------------------------------------------------- passengers on deck */

/**
 * Which piece ids stand on which square, from the game state's own piece
 * list (the same ids the reconciler gives the meshes). The meshes' own
 * `userData.position` lags: the reconciler is rate-limited, so a bot's
 * passenger could be left standing on the water while its ship glided
 * off without it. Built once per frame.
 */
function pieceIdsBySquare(gameState) {
	const list = gameState && Array.isArray(gameState.chessPieces) ? gameState.chessPieces : null;
	if (!list) return null;
	const out = new Map();
	for (const p of list) {
		if (!p || !p.position) continue;
		const key = `${p.position.x},${p.position.z}`;
		const id = String(p.id || `${p.player}-${p.type}-${p.position.x}-${p.position.z}`);
		const at = out.get(key);
		if (at) at.push(id); else out.set(key, [id]);
	}
	return out;
}

function passengersAt(e, idsBySquare) {
	const g = getChessPiecesGroup()
		|| (typeof window !== 'undefined' && (window.chessPiecesGroup || window.gameState?.chessPiecesGroup)) || null;
	if (!g) return [];
	const out = [];
	const ids = idsBySquare ? (idsBySquare.get(`${e.x},${e.z}`) || []) : null;
	for (const m of g.children) {
		if (!m.userData || m.userData.type !== 'chessPiece') continue;
		if (ids) {
			if (ids.includes(String(m.userData.id))) out.push(m);
			continue;
		}
		const p = m.userData.position;
		if (p && Number(p.x) === e.x && Number(p.z) === e.z) out.push(m);
	}
	return out;
}

/*
 * A piece aboard wears a matte copy of its materials: the glossy board
 * finish turned a white piece into an overexposed blob against the sail.
 * The copies are shared per original material; the originals go back
 * the moment the piece is no longer aboard.
 */
const matteCache = new Map();
const SKIP_MATTE = /highlight|indicator|hitbox|vk-outline/i;
let outlineMat = null;

function matteOf(mat) {
	if (!mat || !mat.isMaterial) return mat;
	let m = matteCache.get(mat.uuid);
	if (!m) {
		m = mat.clone();
		if ('roughness' in m) m.roughness = Math.max(0.78, m.roughness || 0);
		if ('metalness' in m) m.metalness = 0;
		if ('shininess' in m) m.shininess = 6;
		if (m.specular && m.specular.setScalar) m.specular.setScalar(0.04);
		if ('envMapIntensity' in m) m.envMapIntensity = 0.25;
		if (m.color && m.color.multiplyScalar) {
			// a white piece is toned down most: it stood out as a glare
			const lum = 0.3 * m.color.r + 0.59 * m.color.g + 0.11 * m.color.b;
			m.color.multiplyScalar(lum > 0.7 ? 0.74 : 0.88);
		}
		m.userData = { ...(m.userData || {}), vikingMatte: true };
		matteCache.set(mat.uuid, m);
	}
	return m;
}

function matteRider(root) {
	const THREE = state.THREE;
	const parts = [];
	root.traverse((o) => {
		if (!o.isMesh || !o.material || o.visible === false || SKIP_MATTE.test(o.name || '') || (o.userData && o.userData.vkOrigMat)) return;
		parts.push(o);
	});
	for (const o of parts) {
		o.userData.vkOrigMat = o.material;
		o.material = Array.isArray(o.material) ? o.material.map(matteOf) : matteOf(o.material);
		// A dark rim (an inverted shell a touch larger) so the piece's
		// silhouette reads against the sail and the sea.
		if (THREE && o.geometry && !o.isInstancedMesh && !o.isSkinnedMesh) {
			if (!outlineMat) outlineMat = new THREE.MeshBasicMaterial({ color: 0x1c140c, side: THREE.BackSide });
			const shell = new THREE.Mesh(o.geometry, outlineMat);
			shell.name = 'vk-outline';
			shell.scale.setScalar(1.07);
			shell.raycast = () => {};
			shell.userData = { vkOutline: true };
			o.add(shell);
		}
	}
}

function unmatteRider(root) {
	if (!root || !root.traverse) return;
	if (root.userData) root.userData.deckSettled = null;
	const shells = [];
	root.traverse((o) => {
		if (o.userData && o.userData.vkOrigMat) {
			o.material = o.userData.vkOrigMat;
			delete o.userData.vkOrigMat;
		}
		if (o.userData && o.userData.vkOutline) shells.push(o);
	});
	for (const sh of shells) if (sh.parent) sh.parent.remove(sh);
}

function releaseMovedPassengers(e) {
	if (!e.riders) return;
	for (const m of e.riders) {
		if (!m.userData) continue;
		m.userData.onShip = null;
		unmatteRider(m);
	}
	// (scale is restored by the reconciler once the piece is ashore)
	e.riders = null;
}

/**
 * Where a piece standing on square (x, z) should be drawn, when that
 * square holds a ship: on the deck, a little smaller. Null for any other
 * square (the piece stands on land as usual).
 *
 * @returns {{x:number,y:number,z:number,scale:number}|null}
 */
export function passengerPose(gameState, x, z) {
	const cell = gameState?.board?.cells?.[`${x},${z}`];
	if (!shipItemOf(cell)) return null;
	for (const e of state.ships.values()) {
		if (e.x === x && e.z === z && !e.sink) {
			return { x: e.deck.x, y: e.deck.y, z: e.deck.z, scale: PASSENGER_SCALE, heading: e.heading };
		}
	}
	const w = worldOf(gameState, x, z);
	return { x: w.x, y: SEA_SURFACE_Y + DECK_HEIGHT, z: w.z, scale: PASSENGER_SCALE, heading: null };
}

/** Whether any ship is drawn (renderBoard keeps syncing until none are). */
export function hasShipsDrawn() {
	return state.ships.size > 0;
}

/** The ship roots currently drawn (for raycasts and tests). */
export function shipObjects() {
	return [...state.ships.values()].map(e => e.root);
}

/**
 * Where a drawn ship's hull is this frame: its centre on the water
 * (world x/z), heading (radians, bow = +Z at 0) and the sea's height
 * there. Null when the ship isn't drawn (or is going down).
 */
export function shipPose(shipId) {
	const e = state.ships.get(String(shipId));
	if (!e || e.sink) return null;
	return { x: e.hull.x, z: e.hull.z, heading: e.heading, sea: e.sea };
}

let _corner = null;
/**
 * The screen box (CSS px) of the local player's own longship, hull to
 * masthead, or null. Toasts keep clear of it (showToastMessage).
 */
export function ownShipScreenRect() {
	const gs = state.gameState;
	const THREE = state.THREE;
	const cam = gs && gs.camera;
	const canvas = gs && gs.renderer && gs.renderer.domElement;
	if (!THREE || !cam || !canvas || typeof canvas.getBoundingClientRect !== 'function') return null;
	const locals = localPlayerIds(gs);
	let e = null;
	for (const s of state.ships.values()) if (!s.sink && locals.includes(String(s.item.player))) { e = s; break; }
	if (!e) return null;
	const cr = canvas.getBoundingClientRect();
	if (!_corner) _corner = new THREE.Vector3();
	const half = SHIP_SCALE * MODEL_LENGTH * 0.5;
	const top = 4.2 * SHIP_SCALE * SHIP_STRETCH_Y;
	const dx = Math.sin(e.heading), dz = Math.cos(e.heading);
	let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
	for (const a of [-half, half]) for (const s of [-0.35, 0.35]) for (const h of [0, top]) {
		_corner.set(e.hull.x + dx * a + dz * s, e.sea + h, e.hull.z + dz * a - dx * s).project(cam);
		if (_corner.z > 1) return null;   // behind the eye
		const x = cr.left + (_corner.x + 1) / 2 * cr.width;
		const y = cr.top + (1 - _corner.y) / 2 * cr.height;
		l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
	}
	if (r < cr.left || l > cr.right || b < cr.top || t > cr.bottom) return null;
	return { left: l, top: t, right: r, bottom: b };
}

let _box = null;
/**
 * The screen box (CSS px) of the player's falling tetromino while it
 * waits or falls, as a list (empty when there is none). Toasts keep
 * clear of it too: on a phone the far side of the arena, where they
 * went to clear the ship, is where the piece hangs.
 */
export function fallingPieceScreenRects() {
	const gs = state.gameState;
	const THREE = state.THREE;
	const cam = gs && gs.camera;
	const canvas = gs && gs.renderer && gs.renderer.domElement;
	const g = gs && gs.currentTetrominoShapeGroup;
	if (!THREE || !cam || !canvas || !g || !g.visible || typeof canvas.getBoundingClientRect !== 'function') return [];
	if (!_box) _box = new THREE.Box3();
	_box.setFromObject(g);
	if (_box.isEmpty()) return [];
	if (!_corner) _corner = new THREE.Vector3();
	const cr = canvas.getBoundingClientRect();
	let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
	for (const x of [_box.min.x, _box.max.x]) for (const y of [_box.min.y, _box.max.y]) for (const z of [_box.min.z, _box.max.z]) {
		_corner.set(x, y, z).project(cam);
		if (_corner.z > 1) return [];
		const sx = cr.left + (_corner.x + 1) / 2 * cr.width;
		const sy = cr.top + (1 - _corner.y) / 2 * cr.height;
		l = Math.min(l, sx); r = Math.max(r, sx); t = Math.min(t, sy); b = Math.max(b, sy);
	}
	if (r < cr.left || l > cr.right || b < cr.top || t > cr.bottom) return [];
	return [{ left: l - 6, top: t - 6, right: r + 6, bottom: b + 6 }];
}

let frameHook = null;
/** One function called after the ships move each frame (the sail lanes). */
export function setShipFrameHook(fn) {
	frameHook = typeof fn === 'function' ? fn : null;
}

/* --------------------------------------------------- per-frame animation */

const _v = { x: 0, y: 0, z: 0 };

/**
 * The oars, as a crew handles them:
 *   shipped   (`out` 0) moored, under sail or drifting: drawn in and laid
 *             fore and aft on the thwarts, blades level — nothing hangs
 *             over the side;
 *   rowing    (`out` 1) during the rowing lock after a sail: run out
 *             nearly flat and swept aft, pulling a real stroke (catch,
 *             drive, release, recovery);
 *   alongside (stowA/stowB) the shore side's oars, if run out, are laid
 *             along the hull clear of the land.
 */
function stepOars(THREE, e, t, effort, out) {
	const oars = e.parts.oars;
	const data = e.parts.oarData;
	if (!oars || !data) return;
	const stowA = e.stowA || 0, stowB = e.stowB || 0;
	const stowKey = Math.round(stowA * 200) * 1000 + Math.round(stowB * 200) + Math.round(out * 200) * 1000000;
	if (effort <= 0.001) {
		if (e.oarsAtRest && e.oarsStowKey === stowKey) return;
		e.oarsAtRest = true;
	} else {
		e.oarsAtRest = false;
	}
	e.oarsStowKey = stowKey;
	const mT = stepOars.mT || (stepOars.mT = new THREE.Matrix4());
	const mY = stepOars.mY || (stepOars.mY = new THREE.Matrix4());
	const mZ = stepOars.mZ || (stepOars.mZ = new THREE.Matrix4());
	const mS = stepOars.mS || (stepOars.mS = new THREE.Matrix4());
	const STROKE_MS = 1000;
	const ph = (t / STROKE_MS) * Math.PI * 2 + e.phase;
	const inb = 1 - out;
	for (let k = 0; k < data.length; k++) {
		const o = data[k];
		// Catch at the bow end, drive aft through the water, release,
		// feather and recover forward in the air.
		const c = Math.cos(ph - k * 0.05);
		const s = Math.sin(ph - k * 0.05);
		const sweep = effort * 0.42 * c;                       // + = blade aft
		const lift = effort * (s > 0 ? -0.03 : 0.11 * -s);     // blade buried on the drive
		const yaw = o.yaw + 0.22 * effort + sweep;
		let angle = o.side > 0 ? yaw : Math.PI - yaw;
		let dip = o.dip * 0.55 + lift;                         // run out nearly flat
		const stow = Math.max(o.side > 0 ? stowA : stowB, inb);
		const along = o.pivot[2] < 0 ? Math.PI / 2 : -Math.PI / 2;   // after half aft, fore half forward
		if (stow > 0.001) {
			angle += angleDelta(angle, along) * stow;
			dip += (-0.02 - dip) * stow;
		}
		// shipped: drawn in through the port to lie on the thwarts
		const px = o.pivot[0] - o.side * 0.5 * inb;
		const py = o.pivot[1] + 0.06 * inb;
		mT.makeTranslation(px, py, o.pivot[2]);
		mY.makeRotationY(angle);
		mZ.makeRotationZ(-dip);
		mS.makeScale(1 - 0.12 * inb, 1, 1);
		oars.setMatrixAt(k, mT.multiply(mY).multiply(mZ).multiply(mS));
	}
	oars.instanceMatrix.needsUpdate = true;
}

/**
 * The V-wake: two ribbons of foam peeling off the bow, spreading out and
 * fading over VWAKE_MS, and a broad churn along the middle. Built from
 * the bow's path (samples dropped while under way), in boardGroup space.
 */
function stepVWake(THREE, scene, e, t, speed, bowX, bowZ, dirX, dirZ, sea) {
	const parent = e.root.parent;
	if (!parent) return;
	let vw = e.vwake;
	if (!vw && speed <= 0.05) return;
	if (!vw) {
		const n = VWAKE_N;
		const verts = 3 * n * 2;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
		geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 4), 4));
		geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
		const idx = [];
		for (let s = 0; s < 3; s++) {
			for (let i = 0; i < n - 1; i++) {
				const a = (s * n + i) * 2;
				idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
			}
		}
		geo.setIndex(idx);
		const mat = new THREE.MeshBasicMaterial({
			map: ensureAssets(THREE).streak, vertexColors: true, transparent: true, depthWrite: false, fog: true,
			side: THREE.DoubleSide,
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.name = 'ship-vwake';
		// (its vertices are in world space, the mesh at the origin: the
		// distance culler must not judge it by its position)
		mesh.userData = { boardWide: true, noRaycast: true };
		mesh.frustumCulled = false;
		mesh.renderOrder = 2;
		mesh.raycast = () => {};
		parent.add(mesh);
		vw = e.vwake = { mesh, samples: [], last: null };
	}
	if (vw.mesh.parent !== parent) parent.add(vw.mesh);
	// drop a sample of the bow's path while under way
	if (speed > 0.05) {
		const l = vw.last;
		if (!l || Math.hypot(bowX - l.x, bowZ - l.z) > 0.09 || t - l.t > 70) {
			const smp = { x: bowX, z: bowZ, dx: dirX, dz: dirZ, t, k: Math.min(1, 0.35 + speed), sea };
			vw.samples.unshift(smp);
			if (vw.samples.length > VWAKE_N) vw.samples.length = VWAKE_N;
			vw.last = smp;
		}
	}
	while (vw.samples.length && t - vw.samples[vw.samples.length - 1].t > VWAKE_MS) vw.samples.pop();
	const list = vw.samples;
	if (list.length < 2) { vw.mesh.visible = false; return; }
	vw.mesh.visible = true;
	const pos = vw.mesh.geometry.attributes.position.array;
	const col = vw.mesh.geometry.attributes.color.array;
	const uv = vw.mesh.geometry.attributes.uv.array;
	const n = VWAKE_N;
	const hullLen = SHIP_SCALE * 6.2;          // bow to stern
	let along = 0;
	for (let i = 0; i < n; i++) {
		const smp = list[Math.min(i, list.length - 1)];
		const live = i < list.length;
		const ageMs = t - smp.t;
		const age = clamp01(ageMs / VWAKE_MS);
		const fadeIn = clamp01(ageMs / 90);
		if (i > 0 && live) along += Math.hypot(smp.x - list[i - 1].x, smp.z - list[i - 1].z);
		const px = smp.dz, pz = -smp.dx;       // starboard of the heading then
		const y = smp.sea + 0.035;
		for (let s = 0; s < 3; s++) {
			let cx, cz, w, a;
			if (s < 2) {
				// an arm of the V: out from the stem, widening as it goes
				const side = s === 0 ? 1 : -1;
				const out = 0.09 + (ageMs / 1000) * VWAKE_SPREAD;
				cx = smp.x + px * side * out; cz = smp.z + pz * side * out;
				w = 0.1 + 0.36 * age;
				a = Math.min(1, smp.k * 1.15) * Math.pow(1 - age, 1.25) * fadeIn;
				const o = (s * n + i) * 2;
				const ix = cx - px * side * w * 0.5, iz = cz - pz * side * w * 0.5;
				const ox = cx + px * side * w * 0.5, oz = cz + pz * side * w * 0.5;
				pos.set([ix, y, iz, ox, y, oz], o * 3);
				uv.set([along / 1.6, 0, along / 1.6, 1], o * 2);
				const aa = live ? a : 0;
				col.set([0.96, 0.98, 1, aa, 0.96, 0.98, 1, aa * 0.55], o * 4);
			} else {
				// the churn down the middle, from the stern back
				const sx = smp.x - smp.dx * hullLen, sz = smp.z - smp.dz * hullLen;
				w = 0.26 + 0.7 * age;
				a = smp.k * Math.pow(1 - age, 2.2) * 0.5 * clamp01((ageMs - 120) / 200);
				const o = (s * n + i) * 2;
				pos.set([sx - px * w * 0.5, y, sz - pz * w * 0.5, sx + px * w * 0.5, y, sz + pz * w * 0.5], o * 3);
				uv.set([along / 1.6 + 0.37, 0, along / 1.6 + 0.37, 1], o * 2);
				const aa = live ? a : 0;
				col.set([0.92, 0.96, 0.98, aa, 0.92, 0.96, 0.98, aa], o * 4);
			}
		}
	}
	const g = vw.mesh.geometry;
	g.attributes.position.needsUpdate = true;
	g.attributes.color.needsUpdate = true;
	g.attributes.uv.needsUpdate = true;
}

/** Bow spray: droplets thrown up and out from the stem while under way. */
function stepSpray(e, t, speed, bowZ, sea, rootY) {
	const sp = e.spray;
	if (!sp) return;
	const burst = e.burstAt ? clamp01(1 - (t - e.burstAt) / BURST_MS) : 0;
	const drive = Math.max(speed, burst);
	const want = (speed > 0.15 || burst > 0.02) && !e.sink;
	if (!want && !sp.visible) return;
	const arr = sp.geometry.attributes.position.array;
	const secs = t / 1000;
	const dirX = Math.sin(e.heading), dirZ = Math.cos(e.heading);
	let alive = 0;
	for (let i = 0; i < SPRAY_N; i++) {
		// each droplet its own arc (one shared arc read as a string of beads)
		const s1 = (i * 0.618034) % 1, s2 = (i * 0.371 + 0.13) % 1, s3 = (i * 0.753 + 0.41) % 1;
		const life = 0.4 + 0.3 * s3;
		const tt = ((secs + s1 * life) % life) / life;          // 0..1 through this droplet's arc
		const side = i % 2 === 0 ? 1 : -1;
		const out = (0.05 + (0.22 + 0.5 * s2) * tt) * side;
		const up = (0.18 + 0.45 * s3) * 4 * tt * (1 - tt) * (0.5 + drive * 0.9);
		const back = -(0.08 + 0.4 * s1) * tt;
		const along = bowZ + back - 0.12 * s2;
		arr[i * 3] = dirX * along + dirZ * out + e.nudge.x;
		arr[i * 3 + 1] = want ? sea - rootY + 0.04 + up * 0.5 : -999;
		arr[i * 3 + 2] = dirZ * along - dirX * out + e.nudge.z;
		alive++;
	}
	sp.geometry.attributes.position.needsUpdate = true;
	const target = want ? Math.min(1, drive * 1.6) : 0;
	sp.material.size = 0.13 + 0.1 * burst;
	sp.material.opacity += (target - sp.material.opacity) * 0.2;
	sp.visible = alive > 0 && sp.material.opacity > 0.02;
}

function angleDelta(a, b) {
	let d = b - a;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return d;
}

function angleLerp(a, b, k) {
	return a + angleDelta(a, b) * k;
}

/**
 * Animate every ship: bob on the sea, glides, sinking, rising, sail
 * fades, oars, foam and wake, and carry passengers. Returns at once
 * when there are no ships.
 *
 * @param {THREE.Scene} scene
 * @param {Object} gameState
 * @param {number} [dtMs]
 */
export function animateShips(scene, gameState, dtMs = 16) {
	if (state.ships.size === 0) return;
	const THREE = state.THREE;
	if (!THREE) return;
	const t = now();
	const secs = t / 1000;
	const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
	const camPos = gameState?.camera?.position || null;
	const idsBySquare = pieceIdsBySquare(gameState);
	// A glide that has ended (or a board that changed under a ship) gets
	// its berth worked out again; cheap when nothing changed.
	if (gameState && t - (state.layoutAt || 0) > 250) {
		state.layoutAt = t;
		layoutShips(gameState);
	}

	for (const [id, e] of state.ships) {
		// Glide
		let speed = 0;
		if (e.glide) {
			const g = e.glide;
			const k = clamp01((t - g.start) / g.dur);
			const s = easeInOut(k);
			e.root.position.x = g.fromW.x + (g.toW.x - g.fromW.x) * s;
			e.root.position.z = g.fromW.z + (g.toW.z - g.fromW.z) * s;
			speed = Math.sin(Math.PI * k);
			// a burst of spray off the stem as she gets under way, and as she stops
			if (k > 0 && !g.burst) { g.burst = true; e.burstAt = t; }
			if (k >= 1) { e.glide = null; e.root.position.x = g.toW.x; e.root.position.z = g.toW.z; e.burstAt = t; }
		}
		// Heading eases round (fast when about to sail, gently when moored)
		e.heading = angleLerp(e.heading, e.targetHeading, 1 - Math.exp(-dt * (e.glide ? 11 : 2.2)));

		const wx = e.root.position.x, wz = e.root.position.z;
		const sea = seaHeightAt(scene, wx, wz);
		const bob = 0.022 * Math.sin(secs * 1.25 + e.phase) + 0.01 * Math.sin(secs * 2.1 + e.phase * 1.7);
		const roll = 0.032 * Math.sin(secs * 0.92 + e.phase) + speed * 0.11;
		const pitch = 0.018 * Math.sin(secs * 1.13 + e.phase * 0.6) - speed * 0.05 - 0.02 * speed * Math.sin(secs * 5.1);
		let y = sea + bob;
		let extraPitch = 0, extraRoll = 0;

		// Sinking: settle by the stern, bow lifting, then slip under.
		let sinkK = 0;
		if (e.sink) {
			sinkK = clamp01((t - e.sink.start) / SINK_MS);
			const settle = easeInOut(sinkK);
			y -= 1.7 * Math.pow(settle, 1.6);
			extraPitch = -0.5 * easeOut(sinkK * 1.4);
			extraRoll = 0.18 * settle;
			stepBubbles(e, t, sea);
		}
		// Rising: a new keel surfaces and settles.
		let riseK = 1;
		if (e.rise) {
			riseK = clamp01((t - e.rise.start) / RISE_MS);
			const r = easeOut(riseK);
			y -= 0.75 * (1 - r);
			extraRoll += 0.25 * (1 - r) * Math.sin(riseK * 7);
			if (riseK >= 1) e.rise = null;
		}

		// The rowing lock (after a sail, the ship lying still): oars out
		// and pulling. Moored, under sail or drifting: oars shipped.
		// Alongside, lie a little off the land, and keep the shore side's
		// oars clear of it while rowing.
		const rowLock = isRowing(e.item, t) && !e.glide && !e.sink;
		const sh = e.shore || {};
		const wantA = sh.a ? 1 : 0;
		const wantB = sh.b ? 1 : 0;
		const kS = Math.min(1, dt * 2.5);
		e.stowA += (wantA - e.stowA) * kS;
		e.stowB += (wantB - e.stowB) * kS;
		if (Math.abs(wantA - e.stowA) < 0.004) e.stowA = wantA;
		if (Math.abs(wantB - e.stowB) < 0.004) e.stowB = wantB;
		// Its berth from the fleet layout (clear of land and the other
		// hulls); under way it keeps to the middle of its lane.
		const lay = e.layout;
		const nx = lay && !e.glide && !e.sink ? lay.dx : 0;
		const nz = lay && !e.glide && !e.sink ? lay.dz : 0;
		const kN = Math.min(1, dt * 2);
		e.nudge.x += (nx - e.nudge.x) * kN;
		e.nudge.z += (nz - e.nudge.z) * kN;

		e.float.position.set(e.nudge.x, y, e.nudge.z);
		e.float.rotation.set(0, 0, 0);
		e.float.rotation.order = 'YXZ';
		e.float.rotation.y = e.heading;
		e.float.rotation.x = pitch + extraPitch;
		e.float.rotation.z = roll + extraRoll;

		// Seized: the sail's dye fades to the new owner's.
		if (e.recolour) stepRecolour(THREE, gameState, e, t);

		// Sail: a clean, shallow belly that always fills forward (the
		// yard is square to the keel, the wind from astern), breathing a
		// little, fuller while under way. A deep belly seen across the
		// camera read as a crumpled flap.
		const sail = e.parts.sail;
		if (sail) {
			// Seen from above (the play camera) a flat sail is a line: let
			// it belly out more, so its striped face still shows.
			let up = 0;
			let braceT = e.braceT || 0;
			let leanT = 0;
			if (camPos) {
				const cdx = camPos.x - wx, cdz = camPos.z - wz;
				const el = Math.atan2(camPos.y - y, Math.hypot(cdx, cdz));
				up = clamp01((el - 0.45) / 0.65);
				// Seen steeply from above (a phone's play camera) even a full
				// sail is a line: lean its foot out under the yard, away
				// from the eye, so its stripes face up toward it.
				const lzEye = Math.sin(e.heading) * cdx + Math.cos(e.heading) * cdz;
				leanT = SAIL_LEAN * clamp01((el - 0.96) / 0.35) * (lzEye < 0 ? -1 : 1);
				// The yard braced round toward the eye (as if trimmed to
				// the wind), so a ship crossing the screen never shows its
				// sail edge-on. Held near abeam so it does not flip about.
				const h = e.heading;
				const lx = Math.cos(h) * cdx - Math.sin(h) * cdz;
				const lz = Math.sin(h) * cdx + Math.cos(h) * cdz;
				let phi = Math.atan2(lx, lz);
				if (phi > Math.PI / 2) phi -= Math.PI;
				else if (phi < -Math.PI / 2) phi += Math.PI;
				const nearAbeam = Math.abs(phi) > Math.PI / 2 - 0.12;
				if (!nearAbeam || Math.sign(phi) === Math.sign(braceT) || braceT === 0) {
					braceT = Math.max(-MAX_BRACE, Math.min(MAX_BRACE, phi));
				}
			}
			e.braceT = braceT;
			e.brace = (e.brace || 0) + (braceT - (e.brace || 0)) * Math.min(1, dt * 1.6);
			const fill = 0.62 + 0.42 * up + 0.04 * Math.sin(secs * 0.8 + e.phase) + 0.22 * speed;
			sail.scale.set(1, 1, fill);
			e.lean = (e.lean || 0) + (leanT - (e.lean || 0)) * Math.min(1, dt * 2);
			if (Math.abs(e.lean) > 1e-3 || sail.userData.vkLean) {
				// swung about the yard (the sail hangs from it), then braced
				const a = e.lean, py = SAIL_YARD_Y, pz = SAIL_YARD_Z * fill;
				const ox = 0, oy = py - (py * Math.cos(a) - pz * Math.sin(a)), oz = pz - (py * Math.sin(a) + pz * Math.cos(a));
				const cb = Math.cos(e.brace), sb = Math.sin(e.brace);
				sail.position.set(ox * cb + oz * sb, oy, -ox * sb + oz * cb);
				sail.rotation.set(a, e.brace, 0, 'YXZ');
				sail.userData.vkLean = Math.abs(a) > 1e-3;
			}
			sail.rotation.y = e.brace;
			if (e.parts.yard) e.parts.yard.rotation.y = e.brace;
			if (e.parts.rigRopes && e.parts.aimRigLines && e.parts.rigLines) {
				const key = Math.round(e.brace * 200) * 1000 + Math.round(fill * 100);
				if (key !== e.rigKey) {
					e.rigKey = key;
					e.parts.aimRigLines(THREE, e.parts.rigRopes, e.parts.rigLines, e.brace, fill);
				}
			}
		}
		const pennant = e.parts.pennant;
		if (pennant && !pennant.userData.vkTrim) {
			// a shorter streamer: at full length it read as a loose flap
			pennant.userData.vkTrim = true;
			pennant.scale.set(1, 0.8, 0.55);
			pennant.position.z = 0;
		}

		// Oars: run out and pulling through the rowing lock, shipped
		// otherwise.
		const outTarget = rowLock ? 1 : 0;
		e.out += (outTarget - e.out) * Math.min(1, dt * 5);
		if (Math.abs(outTarget - e.out) < 0.003) e.out = outTarget;
		e.effort = (e.effort || 0) + ((rowLock ? 1 : 0) - (e.effort || 0)) * Math.min(1, dt * 6);
		const far = camPos ? ((camPos.x - wx) ** 2 + (camPos.z - wz) ** 2 > 50 * 50) : false;
		if (!far) stepOars(THREE, e, t, e.effort * e.out, e.out);

		// Foam ring on the water (does not heel), a wake while moving.
		const fm = e.foam;
		const dirX = Math.sin(e.heading), dirZ = Math.cos(e.heading);
		const off = -CENTRE_MODEL_Z * SHIP_SCALE;
		fm.position.set(dirX * off + e.nudge.x, sea + 0.015, dirZ * off + e.nudge.z);
		fm.rotation.set(0, e.heading, 0);
		const pulse = 1 + 0.04 * Math.sin(secs * 1.6 + e.phase);
		const sinkFoam = e.sink ? (1 + 1.4 * easeOut(sinkK)) : 1;
		const riseFoam = e.rise ? (1 + 1.2 * (1 - riseK)) : 1;
		fm.scale.set(SHIP_SCALE * 2.05 * pulse * sinkFoam * riseFoam, 1, SHIP_SCALE * 7.6 * pulse * (e.sink ? 1 + 0.3 * sinkK : 1));
		fm.material.opacity = e.sink ? 0.85 * (1 - sinkK) : (0.42 + 0.4 * speed + 0.15 * e.effort) * (e.rise ? 0.6 + 0.4 * riseK : 1);

		// The hull's dark shadow on the water under it.
		if (e.shadow) {
			const sw = e.shadow;
			// lifted clear of the swell's slope across its length (the sea's
			// triangles tilt up to ~0.02 per unit), or half of it is cut off
			sw.position.set(dirX * off + e.nudge.x, sea + 0.04, dirZ * off + e.nudge.z);
			sw.rotation.set(0, e.heading, 0);
			sw.scale.set(SHIP_SCALE * 2.3, 1, SHIP_SCALE * 7.4);
			sw.material.opacity = SHADOW_OPACITY * (e.sink ? 1 - sinkK : (e.rise ? riseK : 1));
		}
		e.hull.x = e.root.position.x + dirX * off + e.nudge.x;
		e.hull.z = e.root.position.z + dirZ * off + e.nudge.z;
		e.sea = sea;

		// The V-wake left on the water, and spray off the bow.
		const bowOff = off + SHIP_SCALE * 3.2;
		stepVWake(THREE, scene, e, t, speed, e.root.position.x + dirX * bowOff + e.nudge.x, e.root.position.z + dirZ * bowOff + e.nudge.z, dirX, dirZ, sea);
		stepSpray(e, t, speed, off + SHIP_SCALE * 3.2, sea, e.root.position.y);

		const wk = e.wake;
		// (the soft churn right under the stern; the V itself is stepVWake's)
		const wakeA = Math.min(1, speed * 1.35) * 0.55;
		wk.material.opacity = wk.material.opacity + (wakeA - wk.material.opacity) * Math.min(1, dt * 4);
		wk.visible = wk.material.opacity > 0.02;
		if (wk.visible) {
			const len = SHIP_SCALE * 13;
			// The texture's top edge is the stern: it starts under the
			// sternpost (overlapping the hull a touch) and trails behind.
			const stern = off - SHIP_SCALE * 3.0;
			wk.position.set(dirX * (stern - len / 2), sea + 0.02, dirZ * (stern - len / 2));
			wk.rotation.set(0, e.heading + Math.PI, 0);
			wk.scale.set(SHIP_SCALE * 7, 1, len);
		}

		// The deck point over the square's centre, in world space.
		// root moved this frame (glide): refresh it and its children now,
		// so the passenger is placed on this frame's deck, not last frame's
		e.root.updateMatrixWorld(true);
		_v.x = 0; _v.y = DECK_HEIGHT; _v.z = (PASSENGER_MODEL_Z - CENTRE_MODEL_Z) * SHIP_SCALE;
		const v = new THREE.Vector3(_v.x, _v.y, _v.z).applyMatrix4(e.float.matrixWorld);
		e.deck.x = v.x; e.deck.y = v.y; e.deck.z = v.z;
		carryPassengers(e, sinkK, dt, idsBySquare);

		if (e.sink && sinkK >= 1 && (e.gone || t - e.sink.start > SINK_MS + 4000)) {
			disposeEntry(e);
			state.ships.delete(id);
			// If the board still holds it (a 'sunk' the board never
			// confirmed), the next sync draws it afresh.
			state.fleet.delete(id);
		}
	}
	if (frameHook) {
		try { frameHook(scene); } catch (_e) { /* lanes are cosmetic */ }
	}
}

function carryPassengers(e, sinkK, dt, idsBySquare) {
	if (e.sink && e.gone && sinkK > 0) {
		// The board has already dropped the passenger; nothing to carry.
		releaseMovedPassengers(e);
		return;
	}
	const riders = passengersAt(e, idsBySquare);
	for (const m of riders) {
		if (m.userData.airborne || m.userData.inFlight) continue;
		// Mid-hop on or off the deck (chessInteraction animateChessPieceMove):
		// the hop owns the piece until it lands.
		if (m.userData.hopUntil && Date.now() < m.userData.hopUntil) continue;
		// Pieces are matrix-frozen when settled (pieceMatrixState.js);
		// a passenger rides the swell, so keep it live.
		m.matrixAutoUpdate = true;
		const dy = m.position.y - e.deck.y;
		const dxz = Math.abs(m.position.x - e.deck.x) + Math.abs(m.position.z - e.deck.z);
		// A piece already riding stays nailed to the deck (even when a slow
		// frame moved the hull a long way); only one just come aboard eases.
		const riding = m.userData.onShip === e.shipId && m.userData.deckSettled === e.shipId;
		if (!e.glide && !riding && (Math.abs(dy) > 0.25 || dxz > 0.4)) {
			// Just stepped aboard (the hop lands at land height): climb
			// down onto the deck rather than teleporting.
			const k = 1 - Math.exp(-dt * 9);
			m.position.x += (e.deck.x - m.position.x) * k;
			m.position.y += (e.deck.y - m.position.y) * k;
			m.position.z += (e.deck.z - m.position.z) * k;
		} else {
			m.position.set(e.deck.x, e.deck.y, e.deck.z);
			m.userData.deckSettled = e.shipId;
		}
		m.rotation.y = angleLerp(m.rotation.y, e.heading, Math.min(1, dt * 8));
		// The deck is narrow: the reconciler scales passengers down
		// (passengerPose); make sure a piece that just boarded is too.
		// The reconciler's renderScale then matches, and it restores the
		// full size when the piece steps ashore.
		if (!m.userData.aboard) {
			const s = (m.userData.renderScale || 1) * PASSENGER_SCALE;
			m.scale.setScalar(s);
			m.userData.renderScale = s;
			m.userData.aboard = true;
		}
		matteRider(m);
		m.userData.onShip = e.shipId;
	}
	// Anyone who has stepped ashore gets their own finish back.
	if (e.riders) for (const m of e.riders) if (!riders.includes(m)) unmatteRider(m);
	e.riders = riders;
	if (riders.length) { e.lastRiders = riders.slice(); e.lastRidersAt = now(); }
}

/**
 * Lost with all hands: the passenger goes down with the ship instead of
 * vanishing the moment the board drops it. A stand-in copy of its mesh
 * (shared geometry and materials, nothing to dispose) rides the sinking
 * hull; the real piece is hidden if the board has not removed it yet.
 *
 * @param {Object} e  ship entry
 * @param {{passengerId?: string|null, boardDropped?: boolean}} opts
 *   passengerId: from 'ship_sunk' (null means it sank empty);
 *   boardDropped: the ship left the board without a 'sunk' event — only
 *   a rider the board has already removed is taken down with it.
 */
function drownWithShip(e, { passengerId, boardDropped = false } = {}) {
	if (passengerId === null) return;
	const recent = e.lastRiders && (now() - (e.lastRidersAt || 0)) < 1500 ? e.lastRiders : null;
	if (!recent || !recent.length) return;
	const group = getChessPiecesGroup()
		|| (typeof window !== 'undefined' && (window.chessPiecesGroup || window.gameState?.chessPiecesGroup)) || null;
	const drowned = [];
	for (const m of recent) {
		const ud = m && m.userData;
		if (!ud) continue;
		const pos = ud.position;
		if (!pos || Number(pos.x) !== e.x || Number(pos.z) !== e.z) continue;     // stepped off first
		if (passengerId != null && ud.id != null && String(ud.id) !== String(passengerId)) continue;
		const stillOnBoard = !!(group && m.parent === group);
		if (boardDropped && stillOnBoard) continue;
		const copy = m.clone(true);
		for (const name of ['selected-highlight', 'hover-highlight', 'selected-indicator']) {
			const h = copy.getObjectByName(name);
			if (h && h.parent) h.parent.remove(h);
		}
		copy.traverse((o) => { o.userData = {}; });
		copy.userData = { type: 'drownedPassenger' };
		copy.matrixAutoUpdate = true;
		copy.visible = true;
		copy.position.set(0, DECK_HEIGHT, (PASSENGER_MODEL_Z - CENTRE_MODEL_Z) * SHIP_SCALE);
		copy.rotation.set(0, 0, 0);
		copy.scale.copy(m.scale);
		e.float.add(copy);
		drowned.push(copy);
		if (stillOnBoard) m.visible = false;
	}
	if (drowned.length) e.drowned = drowned;
}

function stepBubbles(e, t, sea) {
	const s = e.sink;
	const arr = s.points.geometry.attributes.position.array;
	const el = (t - s.start) / 1000;
	const dirX = Math.sin(e.heading), dirZ = Math.cos(e.heading);
	const off = -CENTRE_MODEL_Z * SHIP_SCALE;
	for (let i = 0; i < s.N; i++) {
		const along = s.seeds[i * 3] * 1.4 + off, delay = s.seeds[i * 3 + 1] * 1.6, across = s.seeds[i * 3 + 2];
		const life = ((el - delay) % 1.1 + 1.1) % 1.1;
		const active = el > delay && el < 3.2;
		const px = dirX * along + dirZ * across;
		const pz = dirZ * along - dirX * across;
		arr[i * 3] = px;
		arr[i * 3 + 1] = active ? sea - 0.12 + life * 0.22 : -999;
		arr[i * 3 + 2] = pz;
	}
	s.points.geometry.attributes.position.needsUpdate = true;
	s.points.material.opacity = 0.9 * (1 - clamp01((el - 2.2) / 1.0));
}

/** Test/diagnostic view of the renderer's state. */
export function _shipRendererState() {
	return state;
}
