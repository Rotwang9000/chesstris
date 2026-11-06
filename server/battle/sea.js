/**
 * The rising sea — what makes a Quick battle end.
 *
 * After a short calm, the sea sweeps round the arena like a clock hand
 * at a constant angular speed, one lap every `LAP_MS`, spiralling
 * inward one band per lap. It starts on the outer edge of the ring
 * wall and finishes at the centre cell, so every cell has a fixed
 * moment it sinks — a pure function of the battle's start time and
 * the cell's position. Whatever stands on a cell when it sinks
 * (blocks, chess pieces, a king) is lost to the water. The last king
 * above water wins.
 *
 * Classic battles have no sea (`sinkAtMs` returns Infinity).
 *
 * The client mirrors these formulas (public/js/battle/battleRules.js)
 * to flash the cells about to go and to reject doomed placements.
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
	/** One full turn of the hand = one band lost. */
	LAP_MS: Math.round(22 * 1000 * TIME_SCALE),
	/** Cells due to sink within this window flash a warning. */
	WARNING_MS: 5 * 1000,
	/** How often the server sinks the cells that are due. */
	TICK_MS: 1000,
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

/** When the last cell (the centre) is gone. */
function seaEndMs(battle) {
	return seaStartMs(battle) + (outerBand(battle) + 1) * SEA.LAP_MS;
}

/**
 * Position of a cell round the hand's sweep, in [0, 1). The hand starts
 * pointing north (−z) and turns clockwise as seen from above.
 */
function sweepFraction(centre, x, z) {
	const dx = x - centre.x;
	const dz = z - centre.z;
	if (dx === 0 && dz === 0) return 0;
	const turn = Math.atan2(dx, -dz) / (2 * Math.PI);
	return turn < 0 ? turn + 1 : turn;
}

/**
 * The moment (epoch ms) the cell at (x, z) sinks, or Infinity if it
 * never will (Classic, or not yet started).
 */
function sinkAtMs(battle, x, z) {
	if (!hasSea(battle) || !battle.centre) return Infinity;
	const lap = (outerBand(battle) - radialBand(battle.centre, x, z))
		+ sweepFraction(battle.centre, x, z);
	return seaStartMs(battle) + lap * SEA.LAP_MS;
}

/** Has the cell at (x, z) already gone under? */
function isSunk(battle, x, z, now = Date.now()) {
	return sinkAtMs(battle, x, z) <= now;
}

/**
 * Every arena coordinate whose sink time is in (since, until]. Scans
 * the arena's bounding square — ~1,400 coordinates for the largest
 * arena, cheap at one pass a second.
 */
function cellsSinkingBetween(battle, since, until) {
	const out = [];
	if (!hasSea(battle) || !battle.centre) return out;
	const r = outerBand(battle);
	const { x: cx, z: cz } = battle.centre;
	for (let x = cx - r; x <= cx + r; x++) {
		for (let z = cz - r; z <= cz + r; z++) {
			if (radialBand(battle.centre, x, z) > r) continue;
			const t = sinkAtMs(battle, x, z);
			if (t > since && t <= until) out.push({ x, z, t });
		}
	}
	out.sort((a, b) => a.t - b.t);
	return out;
}

/** Sea timing for clients (they compute the rest themselves). */
function publicSea(battle, now = Date.now()) {
	if (!hasSea(battle)) return null;
	return {
		startsAt: seaStartMs(battle),
		endsAt: seaEndMs(battle),
		lapMs: SEA.LAP_MS,
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
