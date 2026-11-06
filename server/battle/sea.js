/**
 * The rising sea — what makes a Quick battle end.
 *
 * After a short calm, ONE sea block sets off from the outer edge of the
 * ring wall and glides cell by cell along a spiral — round each band
 * clockwise from north, then the next band in — at a steady pace
 * (`CELL_MS` per cell) until it reaches the centre. Every cell it
 * reaches dissolves into the sea, with whatever stands on it (blocks,
 * chess pieces, a king). The last king above water wins.
 *
 * Each cell's sink time is a pure function of the battle's start time
 * and the cell's place on the spiral, so the server, the client's
 * warnings and the bots all agree.
 *
 * Classic battles have no sea (`sinkAtMs` returns Infinity).
 *
 * The client mirrors these formulas (public/js/battle/battleRules.js)
 * to draw the sea block, flash the cells about to go and refuse doomed
 * placements.
 */

'use strict';

const { BATTLE, radialBand, ringOuterRadius, playRadiusForSeats } = require('./geometry');

const BATTLE_MODES = Object.freeze({ QUICK: 'quick', CLASSIC: 'classic' });

// Local playtests only: BATTLE_SEA_TIME_SCALE=0.2 runs the sea 5× faster.
const TIME_SCALE = (() => {
	const v = Number(process.env.BATTLE_SEA_TIME_SCALE);
	return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
})();

const SEA = Object.freeze({
	/** Calm before the sea starts moving. */
	CALM_MS: Math.round(40 * 1000 * TIME_SCALE),
	/** The sea block's pace: one cell every CELL_MS. */
	CELL_MS: Math.round(400 * TIME_SCALE),
	/** Cells due to sink within this window flash a warning. */
	WARNING_MS: 5 * 1000,
	/** How often the server sinks the cells that are due (under CELL_MS,
	 * so cells go one at a time). */
	TICK_MS: 200,
});

/** Coerce an untrusted client value to a battle mode (default quick). */
function normaliseBattleMode(value) {
	const v = String(value || '').trim().toLowerCase();
	return v === BATTLE_MODES.CLASSIC ? BATTLE_MODES.CLASSIC : BATTLE_MODES.QUICK;
}

/** Does this battle have a sea? Battles from before modes existed don't. */
function hasSea(battle) {
	return !!battle && battle.mode === BATTLE_MODES.QUICK && Number.isFinite(battle.startedAt);
}

/** The arena's full (unshrunk) play radius. */
function fullRadius(battle) {
	return Number(battle?.playRadius) || playRadiusForSeats(battle?.seatCount || BATTLE.MIN_SEATS);
}

/** The outermost band the sea starts on (the ring wall's outer edge). */
function outerBand(battle) {
	return ringOuterRadius(fullRadius(battle));
}

function seaStartMs(battle) {
	return battle.startedAt + SEA.CALM_MS;
}

/**
 * Position of a cell round its band, in [0, 1): north (−z) first, then
 * clockwise as seen from above.
 */
function sweepFraction(centre, x, z) {
	const dx = x - centre.x;
	const dz = z - centre.z;
	if (dx === 0 && dz === 0) return 0;
	const turn = Math.atan2(dx, -dz) / (2 * Math.PI);
	return turn < 0 ? turn + 1 : turn;
}

/**
 * The sea block's path for an arena reaching out to `outerBand`: every
 * offset from the centre, outermost band first, each band clockwise
 * from north. Same for every arena of that size, so it's cached.
 */
const spirals = new Map();
function spiralFor(outer) {
	if (spirals.has(outer)) return spirals.get(outer);
	const origin = { x: 0, z: 0 };
	const cells = [];
	for (let dx = -outer; dx <= outer; dx++) {
		for (let dz = -outer; dz <= outer; dz++) {
			const band = radialBand(origin, dx, dz);
			if (band > outer) continue;
			cells.push({ dx, dz, band, turn: sweepFraction(origin, dx, dz), dist: Math.hypot(dx, dz) });
		}
	}
	cells.sort((a, b) => (b.band - a.band) || (a.turn - b.turn) || (b.dist - a.dist) || (a.dx - b.dx) || (a.dz - b.dz));
	const index = new Map(cells.map((c, i) => [`${c.dx},${c.dz}`, i]));
	const spiral = { cells, index };
	spirals.set(outer, spiral);
	return spiral;
}

/** When the sea block has eaten the last cell (the centre). */
function seaEndMs(battle) {
	return seaStartMs(battle) + spiralFor(outerBand(battle)).cells.length * SEA.CELL_MS;
}

/**
 * The moment (epoch ms) the cell at (x, z) sinks, or Infinity if it
 * never will (Classic, or not yet started). Cells beyond the ring wall
 * count as sea from the start.
 */
function sinkAtMs(battle, x, z) {
	if (!hasSea(battle) || !battle.centre) return Infinity;
	const i = spiralFor(outerBand(battle)).index.get(`${x - battle.centre.x},${z - battle.centre.z}`);
	return seaStartMs(battle) + (i === undefined ? 0 : i * SEA.CELL_MS);
}

/** Has the cell at (x, z) already gone under? */
function isSunk(battle, x, z, now = Date.now()) {
	return sinkAtMs(battle, x, z) <= now;
}

/** Every arena coordinate whose sink time is in (since, until], in order. */
function cellsSinkingBetween(battle, since, until) {
	const out = [];
	if (!hasSea(battle) || !battle.centre || !(until > since)) return out;
	const { cells } = spiralFor(outerBand(battle));
	const start = seaStartMs(battle);
	const first = Math.max(0, Math.floor((since - start) / SEA.CELL_MS) + 1);
	const last = Math.min(cells.length - 1, Math.floor((until - start) / SEA.CELL_MS));
	for (let i = first; i <= last; i++) {
		const t = start + i * SEA.CELL_MS;
		if (t <= since || t > until) continue;
		out.push({ x: battle.centre.x + cells[i].dx, z: battle.centre.z + cells[i].dz, t });
	}
	return out;
}

/** Sea timing for clients (they compute the rest themselves). */
function publicSea(battle, now = Date.now()) {
	if (!hasSea(battle)) return null;
	return {
		startsAt: seaStartMs(battle),
		endsAt: seaEndMs(battle),
		cellMs: SEA.CELL_MS,
		warningMs: SEA.WARNING_MS,
		outerBand: outerBand(battle),
		serverNow: now,
	};
}

module.exports = {
	BATTLE_MODES,
	SEA,
	normaliseBattleMode,
	hasSea,
	outerBand,
	seaStartMs,
	seaEndMs,
	sweepFraction,
	sinkAtMs,
	isSunk,
	cellsSinkingBetween,
	publicSea,
};
