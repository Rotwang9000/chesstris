/**
 * Pure layout rules for longships on the battle board (no THREE, no DOM),
 * so the decisions the renderer makes can be unit-tested:
 *
 *   - which cells hold a ship, and that a ship cell draws no land block;
 *   - which way a ship points (its prow) on its one-cell square;
 *   - how big it is and where it sits in the square;
 *   - which level of detail it gets;
 *   - the dyed-wool colours of its sail;
 *   - how the fleet changed between two board snapshots.
 *
 * A ship is one board cell (see server/battle/shipRules.js): an item
 * `{type:'ship', shipId, player, readyAt, ...}` in `board.cells[key]`,
 * with no land under it. The model is longer than a cell, so it overhangs
 * into the squares fore and aft — the layout keeps the overhang over water.
 */

/** Length of the model built by buildLongship, in its own units. */
export const MODEL_LENGTH = 7.8;
/** Length of a ship on the board, in cells. */
export const SHIP_LENGTH_CELLS = 3.4;
/** Model units → board units. */
export const SHIP_SCALE = SHIP_LENGTH_CELLS / MODEL_LENGTH;
/**
 * The model is drawn this much taller than it is long-scaled: the ships
 * sit on the sea, a long way below the pieces on land, and a true-scale
 * mast barely reached a king's knee. A high prow and a tall sail are
 * what make a longship read at the play camera.
 */
export const SHIP_STRETCH_Y = 1.3;
/**
 * Which point of the keel (model units, + = forward) sits over the
 * square's centre: a little aft of the mast, so the ship sits a touch
 * forward of its square and the prow reaches out over open water.
 */
export const CENTRE_MODEL_Z = -0.35;
/**
 * Where the passenger stands (model units along the keel): on the after
 * deck by the steering oar — the skipper's place, clear of the sail.
 */
export const PASSENGER_MODEL_Z = -1.75;
/** Deck height above the waterline, in model units (longship.js DECK_Y). */
export const DECK_MODEL_Y = 0.14;
/**
 * A chess piece aboard is scaled down to a crewman's size on the after
 * deck: at full size it stood as tall as the gunwale and its base poked
 * out through the strakes.
 */
export const PASSENGER_SCALE = 0.56;
/** Deck height above the waterline, in board units (stretch included). */
export const DECK_HEIGHT = DECK_MODEL_Y * SHIP_SCALE * SHIP_STRETCH_Y;

export const DIRS = Object.freeze([
	Object.freeze({ dx: 0, dz: 1 }),
	Object.freeze({ dx: 1, dz: 0 }),
	Object.freeze({ dx: 0, dz: -1 }),
	Object.freeze({ dx: -1, dz: 0 }),
]);

export function isShipItem(item) {
	return !!item && typeof item === 'object' && item.type === 'ship';
}

/** The ship item in a cell (array or legacy object), or null. */
export function shipItemOf(cell) {
	if (Array.isArray(cell)) {
		for (let i = 0; i < cell.length; i++) if (isShipItem(cell[i])) return cell[i];
		return null;
	}
	return isShipItem(cell) ? cell : null;
}

/** A ship cell is water with a hull on it: it gets no land block or cloud. */
export function cellHasShip(cell) {
	return shipItemOf(cell) !== null;
}

/**
 * Every ship on a board, keyed by shipId.
 * @param {Object<string, any>} cells board.cells
 * @param {(x:number,z:number)=>boolean} [visible] filter (view isolation)
 * @returns {Map<string, {shipId, x, z, key, item}>}
 */
export function collectShips(cells, visible) {
	const out = new Map();
	if (!cells || typeof cells !== 'object') return out;
	for (const key of Object.keys(cells)) {
		const item = shipItemOf(cells[key]);
		if (!item) continue;
		const comma = key.indexOf(',');
		const x = Number(key.slice(0, comma));
		const z = Number(key.slice(comma + 1));
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		if (visible && !visible(x, z)) continue;
		const shipId = String(item.shipId != null ? item.shipId : key);
		// `player` is copied: a board delta may edit the item in place.
		out.set(shipId, { shipId, x, z, key, item, player: String(item.player) });
	}
	return out;
}

/**
 * Pick the prow direction for a ship at (x, z).
 *
 * 1. The prow must point at a water square when any side has one, so the
 *    overhanging bow never pokes into land.
 * 2. A ship that last sailed keeps pointing the way it went.
 * 3. A moored ship lies alongside the shore (its keel parallel to the
 *    land it touches), like a ship tied up at a quay.
 * 4. Then the way with the most open water ahead (up to `lookahead`).
 * 5. Then away from the arena's centre, then a fixed order.
 *
 * @param {Object} o
 * @param {number} o.x
 * @param {number} o.z
 * @param {(x:number,z:number)=>boolean} o.isWater
 * @param {{dx:number,dz:number}|null} [o.lastDir] last sail direction
 * @param {{x:number,z:number}|null} [o.centre] arena centre
 * @param {number} [o.lookahead]
 * @returns {{dx:number,dz:number}}
 */
export function chooseHeading({ x, z, isWater, lastDir = null, centre = null, lookahead = 4 }) {
	const water = (dx, dz) => !!isWater(x + dx, z + dz);
	const open = (d) => {
		let n = 0;
		for (let k = 1; k <= lookahead; k++) {
			if (!isWater(x + d.dx * k, z + d.dz * k)) break;
			n++;
		}
		return n;
	};
	const ahead = DIRS.filter(d => water(d.dx, d.dz));
	if (ahead.length === 0) return lastDir ? unit(lastDir) : DIRS[0];

	if (lastDir) {
		const ld = unit(lastDir);
		if (water(ld.dx, ld.dz)) return ld;
	}

	const landSide = (d) => !water(d.dx, d.dz);
	const score = (d) => {
		// alongside: the land the ship touches lies to its beam, not ahead/astern
		const beamA = { dx: d.dz, dz: -d.dx };
		const beamB = { dx: -d.dz, dz: d.dx };
		const astern = { dx: -d.dx, dz: -d.dz };
		let s = 0;
		if (landSide(beamA) || landSide(beamB)) s += 100;
		if (!landSide(astern)) s += 10; // a free stern means no overhang into land
		s += open(d);
		return s;
	};
	let best = null;
	let bestScore = -Infinity;
	let bestAway = -Infinity;
	for (const d of ahead) {
		const s = score(d);
		const away = centre ? (d.dx * (x - centre.x) + d.dz * (z - centre.z)) : 0;
		if (s > bestScore || (s === bestScore && away > bestAway)) {
			best = d; bestScore = s; bestAway = away;
		}
	}
	return best;
}

function unit(d) {
	const dx = Math.sign(Number(d.dx) || 0);
	const dz = Math.sign(Number(d.dz) || 0);
	if (dx !== 0 && dz !== 0) return Math.abs(d.dx) >= Math.abs(d.dz) ? { dx, dz: 0 } : { dx: 0, dz };
	if (dx === 0 && dz === 0) return DIRS[0];
	return { dx, dz };
}

/** Unit direction of a sail from→to (orthogonal), or null. */
export function sailDirection(from, to) {
	if (!from || !to) return null;
	const dx = Number(to.x) - Number(from.x);
	const dz = Number(to.z) - Number(from.z);
	if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx === 0 && dz === 0)) return null;
	return unit({ dx, dz });
}

/** Y rotation that turns the model's +Z bow toward (dx, dz). */
export function headingAngle(d) {
	return Math.atan2(d.dx, d.dz);
}

/**
 * Level of detail: the local player's own ships are built in full; the
 * rest use the light model, and everything goes light on a low-power
 * profile or when far from the camera.
 */
export function chooseDetail({ isLocal = false, lowPower = false, distance = 0 } = {}) {
	if (lowPower) return 'low';
	if (distance > 26) return 'low';
	return isLocal ? 'high' : 'low';
}

/** How long a glide of `cells` squares takes (ms). */
export function glideDuration(cells) {
	const n = Math.max(1, Math.min(8, Math.abs(Number(cells) || 1)));
	return Math.round(Math.min(1600, 750 + 170 * n));
}

/* ----------------------------------------------------------- dyed wool */

function hexToRgb(hex) {
	return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
function rgbToHex(r, g, b) {
	const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
	return (c(r) << 16) | (c(g) << 8) | c(b);
}
function rgbToHsl(r, g, b) {
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
	if (s === 0) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const f = (t) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Undyed wool: the cream stripe on a coloured sail. */
export const WOOL_CREAM = 0xe2d6b8;
/** Madder red: the stripe on a white army's linen sail. */
export const WOOL_MADDER = 0xa82a24;

/**
 * Seat colour → the two stripe colours of a sail woven from dyed wool.
 * Plant dyes are never neon: saturation comes down a little and the
 * lightness is kept off the extremes, but the two tones stay bold so a
 * sail says whose it is from the play camera. A white army sails
 * bleached linen with madder-red stripes (as in the paintings);
 * everyone else alternates their dye with cream.
 *
 * @param {number|string} seat 0xRRGGBB or '#rrggbb'
 * @returns {{main:number, stripe:number}}
 */
export function woolColours(seat) {
	let hex = typeof seat === 'string' ? parseInt(seat.replace('#', ''), 16) : Number(seat);
	if (!Number.isFinite(hex)) hex = 0xb3261e;
	const [r, g, b] = hexToRgb(hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	if (s < 0.12 && l > 0.7) {
		// white army: bleached linen, madder-red stripes
		return { main: 0xf0eadb, stripe: WOOL_MADDER };
	}
	if (s < 0.12) {
		// black/grey army: walnut-dyed wool with cream stripes
		const lw = Math.max(0.17, Math.min(0.32, l * 0.7));
		return { main: rgbToHex(...hslToRgb(0.07, 0.16, lw)), stripe: WOOL_CREAM };
	}
	const s2 = Math.min(0.72, s * 0.85);
	const l2 = Math.max(0.3, Math.min(0.5, l * 0.86));
	return { main: rgbToHex(...hslToRgb(h, s2, l2)), stripe: WOOL_CREAM };
}

/* --------------------------------------------------------- fleet diff */

/**
 * What changed between two fleets (Maps from collectShips).
 * @returns {{added:string[], removed:string[], moved:Array<{shipId,from,to}>, recoloured:Array<{shipId,from,to}>}}
 */
export function diffFleet(prev, next) {
	const added = [];
	const removed = [];
	const moved = [];
	const recoloured = [];
	for (const [id, s] of next) {
		const p = prev.get(id);
		if (!p) { added.push(id); continue; }
		if (p.x !== s.x || p.z !== s.z) moved.push({ shipId: id, from: { x: p.x, z: p.z }, to: { x: s.x, z: s.z } });
		const pp = p.player !== undefined ? p.player : String(p.item.player);
		const sp = s.player !== undefined ? s.player : String(s.item.player);
		if (pp !== sp) recoloured.push({ shipId: id, from: pp, to: sp });
	}
	for (const id of prev.keys()) if (!next.has(id)) removed.push(id);
	return { added, removed, moved, recoloured };
}

/* --------------------------------------------------- fleet layout */

/**
 * The hull's footprint on the board, relative to the float's origin (the
 * square's centre plus the layout's offset), along the keel: from the
 * sternpost to the stem, and half its beam. (Model: ±3.9 units long,
 * shifted forward by -CENTRE_MODEL_Z; beam 1.5 units.)
 */
export const HULL_AFT = (MODEL_LENGTH / 2 + CENTRE_MODEL_Z) * SHIP_SCALE;   // ~1.55
export const HULL_FORE = (MODEL_LENGTH / 2 - CENTRE_MODEL_Z) * SHIP_SCALE;  // ~1.85
export const HULL_HALF_BEAM = 0.75 * SHIP_SCALE;                              // ~0.33
/** How far the layout may slide a hull along its keel / across its beam. */
export const LAYOUT_SLIDE = Object.freeze({ min: -0.7, max: 1.3 });
export const LAYOUT_ACROSS = 0.75;
/** A moored hull lies this far off the land along its beam. */
export const LAYOUT_MOOR = 0.45;

const LAND_MARGIN = 0.07;        // kept between a hull and a land block
const SHIP_HALF_GAP = 0.08;      // each hull keeps this much water round it from another

/** The model's +X (starboard) in board terms, for a bow toward d. */
export function beamOf(d) {
	return { dx: d.dz, dz: -d.dx };
}

/**
 * A hull's box on the board (axis-aligned, as every heading is one of
 * the four DIRS) for a ship on square (x, z) with its bow toward `d`,
 * slid `s` along the keel and `c` across the beam.
 */
export function hullBox(x, z, d, s, c, padLen = 0, padBeam = 0) {
	const b = beamOf(d);
	const cx = x + d.dx * s + b.dx * c;
	const cz = z + d.dz * s + b.dz * c;
	const mid = (HULL_FORE - HULL_AFT) / 2;          // the box's centre ahead of the float origin
	const half = (HULL_FORE + HULL_AFT) / 2 + padLen;
	const hb = HULL_HALF_BEAM + padBeam;
	const mx = cx + d.dx * mid, mz = cz + d.dz * mid;
	const hx = d.dx !== 0 ? half : hb;
	const hz = d.dz !== 0 ? half : hb;
	return { x0: mx - hx, x1: mx + hx, z0: mz - hz, z1: mz + hz };
}

function overlap1(a0, a1, b0, b1) {
	return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Area of a box that lies over land squares (each square spans ±0.5). */
export function landOverlap(box, isLand) {
	let area = 0;
	const x0 = Math.round(box.x0), x1 = Math.round(box.x1);
	const z0 = Math.round(box.z0), z1 = Math.round(box.z1);
	for (let cx = x0; cx <= x1; cx++) {
		for (let cz = z0; cz <= z1; cz++) {
			if (!isLand(cx, cz)) continue;
			area += overlap1(box.x0, box.x1, cx - 0.5, cx + 0.5) * overlap1(box.z0, box.z1, cz - 0.5, cz + 0.5);
		}
	}
	return area;
}

/** How deep two boxes overlap (0 when apart). */
export function boxOverlap(a, b) {
	const ox = overlap1(a.x0, a.x1, b.x0, b.x1);
	const oz = overlap1(a.z0, a.z1, b.z0, b.z1);
	return Math.min(ox, oz);
}

/**
 * Lay the fleet out so no hull lies in land or inside another hull.
 *
 * A ship holds one square but its hull is ~3.4 squares long, so it
 * overhangs into the squares fore and aft. Each ship gets a heading (one
 * of the four DIRS) and an offset from its square's centre — slid along
 * its keel out of a slip, or across its beam off a quay or alongside a
 * neighbour (two ships on adjoining squares lie rafted side by side) —
 * chosen to keep the hull over open water, as close as it can to the
 * heading it prefers (the way it sailed, or alongside the shore) and
 * to where it lay before (no jumping about as the board changes).
 *
 * Pure: the caller passes the land test and the preferences.
 *
 * @param {Array<{id:string, x:number, z:number, prefer:{dx,dz}, fixedDir?:{dx,dz}|null,
 *   moving?:boolean, prev?:{d:{dx,dz}, s:number, c:number}|null}>} ships
 * @param {(x:number,z:number)=>boolean} isLand a square holding land (not a ship, not water)
 * @returns {Map<string, {d:{dx,dz}, s:number, c:number, dx:number, dz:number, land:number}>}
 *   d heading, s/c the slide and the shift, dx/dz the offset on the board
 */
export function layoutFleet(ships, isLand) {
	const out = new Map();
	if (!Array.isArray(ships) || ships.length === 0) return out;
	// the ships that have not moved keep their place; a newcomer fits in
	const order = ships.slice().sort((a, b) => (a.moving ? 1 : 0) - (b.moving ? 1 : 0)
		|| String(a.id).localeCompare(String(b.id)));
	const placed = [];   // {id, box}
	const STEP = 0.15;
	const candidatesFor = (sh) => {
		const dirs = sh.fixedDir ? [unit(sh.fixedDir)] : DIRS;
		const list = [];
		for (const d of dirs) {
			const b = beamOf(d);
			// a moored hull lies a little off the land along one beam
			const landA = isLand(sh.x + b.dx, sh.z + b.dz);
			const landB = isLand(sh.x - b.dx, sh.z - b.dz);
			const c0 = landA === landB ? 0 : (landA ? -LAYOUT_MOOR : LAYOUT_MOOR);
			const headCost = (d.dx === sh.prefer.dx && d.dz === sh.prefer.dz) ? 0 : 2.4;
			const prev = sh.prev && sh.prev.d && sh.prev.d.dx === d.dx && sh.prev.d.dz === d.dz ? sh.prev : null;
			// across the beam: a grid, plus the plain mooring offset itself
			const cs = [];
			for (let c = -LAYOUT_ACROSS; c <= LAYOUT_ACROSS + 1e-9; c += STEP) cs.push(Math.round(c * 100) / 100);
			if (!cs.includes(c0)) cs.push(c0);
			for (let s0 = LAYOUT_SLIDE.min; s0 <= LAYOUT_SLIDE.max + 1e-9; s0 += STEP) {
				const s = Math.round(s0 * 100) / 100;
				for (const c of cs) {
					const box = hullBox(sh.x, sh.z, d, s, c, LAND_MARGIN, LAND_MARGIN);
					const land = landOverlap(box, isLand);
					let cost = land * 60 + headCost + 2.2 * Math.abs(s) + 2.6 * Math.abs(c - c0);
					if (sh.prev) cost += prev ? 0.8 * (Math.abs(s - prev.s) + Math.abs(c - prev.c)) : 1.2;
					list.push({ d, s, c, cost, land });
				}
			}
		}
		list.sort((p, q) => p.cost - q.cost);
		return list;
	};
	const shipCost = (sh, cand, others) => {
		const box = hullBox(sh.x, sh.z, cand.d, cand.s, cand.c, SHIP_HALF_GAP, SHIP_HALF_GAP);
		let pen = 0;
		for (const o of others) {
			if (o.id === sh.id) continue;
			const ov = boxOverlap(box, o.box);
			if (ov > 0) pen += 40 + 300 * ov;
		}
		return { box, pen };
	};
	// (built only for a ship that needs a search: see `simple` below)
	const cands = new Map();
	const candsOf = (sh) => {
		let c = cands.get(sh.id);
		if (!c) { c = candidatesFor(sh); cands.set(sh.id, c); }
		return c;
	};
	// A ship with no other within reach whose plain berth (its heading,
	// moored off the land, not slid) is clear of land needs no search —
	// most of them, most of the time.
	const simple = new Set();
	const plainBerth = (sh) => {
		if (ships.some(o => o !== sh && Math.max(Math.abs(o.x - sh.x), Math.abs(o.z - sh.z)) <= 4)) return null;
		const d = unit(sh.fixedDir || sh.prefer);
		const b = beamOf(d);
		const landA = isLand(sh.x + b.dx, sh.z + b.dz);
		const landB = isLand(sh.x - b.dx, sh.z - b.dz);
		const c = landA === landB ? 0 : (landA ? -LAYOUT_MOOR : LAYOUT_MOOR);
		const land = landOverlap(hullBox(sh.x, sh.z, d, 0, c, LAND_MARGIN, LAND_MARGIN), isLand);
		if (land > 0) return null;
		return { d, s: 0, c, cost: 0, land: 0, total: 0, box: hullBox(sh.x, sh.z, d, 0, c, SHIP_HALF_GAP, SHIP_HALF_GAP) };
	};
	const choose = (sh, others) => {
		let best = null;
		for (const cand of candsOf(sh)) {
			if (best && cand.cost >= best.total) break;      // sorted: nothing cheaper follows
			const { box, pen } = shipCost(sh, cand, others);
			const total = cand.cost + pen;
			if (!best || total < best.total) best = { ...cand, box, total };
		}
		return best;
	};
	for (const sh of order) {
		const plain = plainBerth(sh);
		if (plain) simple.add(sh.id);
		const best = plain || choose(sh, placed);
		placed.push({ id: sh.id, box: best.box, best });
	}
	// a second pass: each ship looks again with all the others placed
	for (let pass = 0; pass < 2; pass++) {
		for (const sh of order) {
			if (simple.has(sh.id)) continue;
			const i = placed.findIndex(p => p.id === sh.id);
			const cur = placed[i].best;
			const now = cur.cost + shipCost(sh, cur, placed).pen;
			const best = choose(sh, placed);
			if (best.total < now - 1e-6) placed[i] = { id: sh.id, box: best.box, best };
		}
	}
	// Two ships crowding one corner: one moving alone cannot make room
	// (the first to settle took the best berth), so search their berths
	// together — each among its own cheapest few — for the cheapest pair.
	const K = 140;
	const pairPen = (a, b) => { const ov = boxOverlap(a, b); return ov > 0 ? 40 + 300 * ov : 0; };
	const topOf = new Map();
	const top = (sh) => {
		let t = topOf.get(sh.id);
		if (!t) {
			t = candsOf(sh).slice(0, K).map(c => ({
				...c, box: hullBox(sh.x, sh.z, c.d, c.s, c.c, SHIP_HALF_GAP, SHIP_HALF_GAP),
			}));
			topOf.set(sh.id, t);
		}
		return t;
	};
	const byId = new Map(order.map(sh => [sh.id, sh]));
	for (let pass = 0; pass < 2; pass++) {
		for (let i = 0; i < placed.length; i++) {
			for (let j = i + 1; j < placed.length; j++) {
				const A = byId.get(placed[i].id), B = byId.get(placed[j].id);
				if (simple.has(A.id) || simple.has(B.id)) continue;
				if (Math.max(Math.abs(A.x - B.x), Math.abs(A.z - B.z)) > 6) continue;
				const others = placed.filter((_p, k) => k !== i && k !== j);
				const penOthers = (box) => { let p = 0; for (const o of others) p += pairPen(box, o.box); return p; };
				const curA = placed[i].best, curB = placed[j].best;
				const pens = penOthers(placed[i].box) + penOthers(placed[j].box) + pairPen(placed[i].box, placed[j].box);
				// (both clear of land and of every hull: nothing to mend)
				if (pens === 0 && curA.land < 1e-6 && curB.land < 1e-6) continue;
				const now = curA.cost + curB.cost + pens;
				const ta = top(A).map(c => ({ c, p: c.cost + penOthers(c.box) }));
				const tb = top(B).map(c => ({ c, p: c.cost + penOthers(c.box) }));
				let best = null;
				for (const a of ta) {
					if (best && a.p >= best.total) continue;
					for (const b of tb) {
						const total = a.p + b.p + pairPen(a.c.box, b.c.box);
						if (!best || total < best.total) best = { a: a.c, b: b.c, total };
					}
				}
				if (best && best.total < now - 1e-6) {
					placed[i] = { id: A.id, box: best.a.box, best: { ...best.a, total: best.a.cost } };
					placed[j] = { id: B.id, box: best.b.box, best: { ...best.b, total: best.b.cost } };
				}
			}
		}
	}
	for (const sh of order) {
		const p = placed.find(q => q.id === sh.id).best;
		const b = beamOf(p.d);
		out.set(sh.id, {
			d: p.d, s: p.s, c: p.c,
			dx: p.d.dx * p.s + b.dx * p.c,
			dz: p.d.dz * p.s + b.dz * p.c,
			land: p.land,
		});
	}
	return out;
}

/** A ship rows (oars working, nobody steps on/off) until its readyAt. */
export function isRowing(item, now = Date.now()) {
	const at = Number(item && item.readyAt);
	return Number.isFinite(at) && now < at;
}
