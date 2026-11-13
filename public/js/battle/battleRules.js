/**
 * Client mirror of the server's battle-arena rules (server/battle/*).
 * Used by local placement validation and the camera so predictions
 * match what the server will decide.
 */

/** Play radius of a 2-seat arena (3-4 seat arenas are larger; the
 * server sends the actual radius on the battle object). */
export const BATTLE_PLAY_RADIUS = 14;

/** Effective play radius of the local player's battle. */
export function battlePlayRadius(battle) {
	const r = Number(battle?.playRadius);
	return Number.isFinite(r) && r > 0 ? r : BATTLE_PLAY_RADIUS;
}

/**
 * Battle-arena grid — keep in lockstep with `server/battle/geometry.js`
 * (`BATTLE.ARENA_BASE` / pitch / columns / max arenas).
 *
 * The region is an AABB around that grid, NOT "anything far from the
 * origin". The live world has drifted thousands of cells from (0,0);
 * treating distance-from-origin ≥ 1500 as "arena" hid the entire
 * global board.
 */
export const BATTLE_ARENA_BASE = Object.freeze({ x: 2000, z: 2000 });
export const BATTLE_ARENA_PITCH = 64;
export const BATTLE_ARENA_GRID_COLUMNS = 8;
export const BATTLE_MAX_ARENAS = 64;
/** PLAY_RADIUS_LARGE + RING_THICKNESS + KEEP_OUT_MARGIN */
export const BATTLE_REGION_MARGIN = 20;

function battleRegionBounds() {
	const lastCol = BATTLE_ARENA_GRID_COLUMNS - 1;
	const lastRow = Math.ceil(BATTLE_MAX_ARENAS / BATTLE_ARENA_GRID_COLUMNS) - 1;
	return Object.freeze({
		minX: BATTLE_ARENA_BASE.x - BATTLE_REGION_MARGIN,
		maxX: BATTLE_ARENA_BASE.x + lastCol * BATTLE_ARENA_PITCH + BATTLE_REGION_MARGIN,
		minZ: BATTLE_ARENA_BASE.z - BATTLE_REGION_MARGIN,
		maxZ: BATTLE_ARENA_BASE.z + lastRow * BATTLE_ARENA_PITCH + BATTLE_REGION_MARGIN,
	});
}

export const BATTLE_REGION_BOUNDS = battleRegionBounds();

/** The battle the local player is currently seated in, or null. */
export function getActiveBattle(gameState) {
	return gameState?.activeBattle || null;
}

/** Is this cell item a battle-ring wall segment? */
export function isBattleRingItem(item) {
	return !!(item && item.battleRing);
}

/**
 * May the local player treat this ring item as their own ground
 * (adjacency / path-to-king)? Only while seated in that battle.
 */
export function isRingItemUsable(gameState, item) {
	if (!isBattleRingItem(item)) return false;
	const battle = getActiveBattle(gameState);
	return !!battle && String(item.battleRing) === String(battle.id);
}

/**
 * Arena-bounds prediction for a placement cell. True when the local
 * player is not in a battle, or the cell is inside their arena's play
 * area and the sea hasn't taken it.
 */
export function isCellInsideOwnArena(gameState, x, z) {
	const battle = getActiveBattle(gameState);
	if (!battle || !battle.centre) return true;
	if (radialBand(battle.centre, x, z) > battlePlayRadius(battle)) return false;
	return seaSinkAt(battle, x, z) > serverNow(battle);
}

// ── The rising sea (Quick battles) — mirrors server/battle/sea.js ──────────

function radialBand(centre, x, z) {
	const dx = x - centre.x;
	const dz = z - centre.z;
	return Math.round(Math.sqrt(dx * dx + dz * dz));
}

// ── The server's clock ──────────────────────────────────────────────────────
// Sink times are server epoch ms. Every message the server stamps (the
// battle's `sea.serverNow`, each game update's `timestamp`) is one
// sample of (server clock − ours), too low by however long it took to
// arrive AND to wait for our main thread: a battle starting while the
// arena, the fjord and the Viking chunk are being built, a backlog of
// updates on a slow device, a background tab. One sample taken at
// adoption left the sea block up to seconds behind the cells the server
// was sinking, for the whole battle. So keep learning, and keep the
// LARGEST sample (no message arrives early): a late one never drags the
// estimate back. Two things can make the best sample wrong, and both are
// handled: our wall clock jumping (set by hand, an NTP step: spotted
// against the monotonic clock), and the two clocks drifting apart (the
// estimate gives way by CLOCK_DRIFT_PER_MS, far more than any real drift
// and far less than a late message).
//
// A jump BACK is followed at once. A jump FORWARD is not: a suspended
// device (screen locked) looks exactly the same — the monotonic clock
// stops while the wall clock runs on — and there the offset has not
// changed at all. Following it put the sea block a whole suspend behind
// until the next update (seconds, when the socket had to reconnect). So
// the estimate stays put and the server's samples decide: one in line
// with the old offset means it was a suspend; samples lower by about
// the jump, spread over CLOCK_CONFIRM_MS (not one burst of messages that
// queued up before the device slept), mean the clock really moved.

/** How fast the estimate gives way to later, lower samples (ms per ms). */
export const CLOCK_DRIFT_PER_MS = 0.00025;
/** A change in (wall − monotonic) clock above this is a wall clock jump. */
export const CLOCK_JUMP_MS = 1500;
/** A forward jump is believed once samples back it for this long. */
export const CLOCK_CONFIRM_MS = 1000;
// confirm: { firstMono, best } — samples so far that back a forward jump.
const serverClock = { offset: null, at: 0, wallMinusMono: null, confirm: null };

function monotonicNow() {
	return typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: null;
}

/**
 * The clocks to read: ours now (and the monotonic one, to spot wall
 * clock jumps), or the caller's `now` (tests, replays) and its `mono`
 * if given — a caller's `now` alone is taken as plain time passing.
 */
function clocksFor(now, mono) {
	if (now === undefined) return { now: Date.now(), mono: mono === undefined ? monotonicNow() : mono };
	return { now, mono: mono === undefined ? null : mono };
}

/** How far (wall − monotonic) has moved since the offset was learnt. */
function wallJump(now, mono) {
	if (!Number.isFinite(mono) || serverClock.wallMinusMono === null) return 0;
	return (now - mono) - serverClock.wallMinusMono;
}

function adoptSample(sample, now, mono) {
	serverClock.offset = sample;
	serverClock.at = now;
	serverClock.wallMinusMono = Number.isFinite(mono) ? now - mono : null;
	serverClock.confirm = null;
}

/**
 * Note a server timestamp received at (our) `now`.
 * @returns {number|null} The current best (server − ours) offset.
 */
export function noteServerClock(serverMs, nowArg, monoArg) {
	const { now, mono } = clocksFor(nowArg, monoArg);
	const s = Number(serverMs);
	const current = clockOffsetEstimate(now, mono);
	if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(now)) return current;
	const sample = s - now;
	const jump = current === null ? 0 : wallJump(now, mono);
	if (jump > CLOCK_JUMP_MS) {
		if (sample > current - CLOCK_JUMP_MS) {
			// The server says nothing moved: we were asleep. Re-base.
			serverClock.wallMinusMono = now - mono;
			serverClock.confirm = null;
		} else if (Math.abs(sample - (current - jump)) <= CLOCK_JUMP_MS) {
			// Backs a real forward jump: believe it once samples keep
			// saying so (a burst queued before a sleep says it too).
			const c = serverClock.confirm || (serverClock.confirm = { firstMono: mono, best: sample });
			c.best = Math.max(c.best, sample);
			if (mono - c.firstMono < CLOCK_CONFIRM_MS) return current;
			adoptSample(c.best, now, mono);
			return clockOffsetEstimate(now, mono);
		} else {
			return current; // neither: a stray late message
		}
	}
	if (current === null || sample > current) adoptSample(sample, now, mono);
	return clockOffsetEstimate(now, mono);
}

/** Best guess at (server clock − ours), or null before any sample. */
export function clockOffsetEstimate(nowArg, monoArg) {
	const { now, mono } = clocksFor(nowArg, monoArg);
	if (serverClock.offset === null || !Number.isFinite(now)) return serverClock.offset;
	const jump = wallJump(now, mono);
	if (jump < -CLOCK_JUMP_MS) {
		// Our wall clock was set back (a suspend never does that): the
		// offset grew by as much.
		serverClock.offset -= jump;
		serverClock.at += jump;
		serverClock.wallMinusMono += jump;
		serverClock.confirm = null;
	}
	// A forward jump is left to the server's samples (noteServerClock).
	return serverClock.offset - Math.max(0, now - serverClock.at) * CLOCK_DRIFT_PER_MS;
}

/** Forget what we learnt about the server's clock (tests). */
export function resetServerClock() {
	serverClock.offset = null;
	serverClock.at = 0;
	serverClock.wallMinusMono = null;
	serverClock.confirm = null;
}

/**
 * A battle object's sea, with how far the server clock is from ours
 * (its `serverNow` is one more clock sample), so sink times (server
 * epoch ms) line up locally.
 */
export function withClockOffset(sea, nowArg) {
	if (!sea) return null;
	const now = nowArg === undefined ? Date.now() : nowArg;
	const offset = Number.isFinite(sea.serverNow) ? sea.serverNow - now : 0;
	const best = Number.isFinite(sea.serverNow) ? noteServerClock(sea.serverNow, nowArg) : null;
	return { ...sea, clockOffset: best !== null && best > offset ? best : offset };
}

/** The server's clock, as best we know it. */
export function serverNow(battle, nowArg) {
	const now = nowArg === undefined ? Date.now() : nowArg;
	const learnt = clockOffsetEstimate(nowArg);
	if (learnt !== null) return now + learnt;
	return now + (Number(battle?.sea?.clockOffset) || 0);
}

/** Position round a band in [0, 1): north, then clockwise. */
export function sweepFraction(centre, x, z) {
	const dx = x - centre.x;
	const dz = z - centre.z;
	if (dx === 0 && dz === 0) return 0;
	const turn = Math.atan2(dx, -dz) / (2 * Math.PI);
	return turn < 0 ? turn + 1 : turn;
}

/**
 * The sea block's path: every offset from the centre, outermost band
 * first, each band clockwise from north (same order as the server).
 */
const spirals = new Map();
export function seaSpiral(outer) {
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

/** When (server epoch ms) the cell at (x, z) sinks; Infinity without a sea. */
export function seaSinkAt(battle, x, z) {
	const sea = battle?.sea;
	if (!sea || !battle.centre || !sea.cellMs) return Infinity;
	const i = seaSpiral(sea.outerBand).index.get(`${x - battle.centre.x},${z - battle.centre.z}`);
	return sea.startsAt + (i === undefined ? 0 : i * sea.cellMs);
}

/**
 * Where the sea block is at server time `now`: the spiral cell it's on
 * (`index`, `x`, `z`), the next one, and how far it has glided between
 * them (0..1). Null before it sets off or after it has finished.
 */
export function seaBlockAt(battle, now) {
	const sea = battle?.sea;
	if (!sea || !battle.centre || !sea.cellMs) return null;
	const { cells } = seaSpiral(sea.outerBand);
	const progress = (now - sea.startsAt) / sea.cellMs;
	if (progress < 0 || progress >= cells.length) return null;
	const index = Math.floor(progress);
	const here = cells[index];
	const next = cells[Math.min(index + 1, cells.length - 1)];
	return {
		index,
		glide: progress - index,
		band: here.band,
		turn: here.turn,
		x: battle.centre.x + here.dx,
		z: battle.centre.z + here.dz,
		nextX: battle.centre.x + next.dx,
		nextZ: battle.centre.z + next.dz,
	};
}

/**
 * Cells due to sink in (from, until] (server ms), soonest first — the
 * ones to flash a warning on.
 */
export function cellsSinkingBetween(battle, from, until) {
	const sea = battle?.sea;
	const out = [];
	if (!sea || !battle.centre || !sea.cellMs || !(until > from)) return out;
	const { cells } = seaSpiral(sea.outerBand);
	const first = Math.max(0, Math.floor((from - sea.startsAt) / sea.cellMs) + 1);
	const last = Math.min(cells.length - 1, Math.floor((until - sea.startsAt) / sea.cellMs));
	for (let i = first; i <= last; i++) {
		const t = sea.startsAt + i * sea.cellMs;
		if (t <= from || t > until) continue;
		out.push({ x: battle.centre.x + cells[i].dx, z: battle.centre.z + cells[i].dz, t });
	}
	return out;
}

/** Does this coordinate belong to the remote battle-arena grid? */
export function isBattleRegionCell(x, z) {
	return x >= BATTLE_REGION_BOUNDS.minX
		&& x <= BATTLE_REGION_BOUNDS.maxX
		&& z >= BATTLE_REGION_BOUNDS.minZ
		&& z <= BATTLE_REGION_BOUNDS.maxZ;
}

/**
 * Cells of breathing room past the ring wall a seated player may see.
 * The ring spans [playRadius+1, playRadius+2] (see
 * `server/battle/geometry.js`), so the view reaches playRadius + 6.
 */
export const BATTLE_VIEW_MARGIN = 6;

/** Everything a seated player may see for their battle. */
export function battleViewRadius(battle) {
	return battlePlayRadius(battle) + BATTLE_VIEW_MARGIN;
}

/**
 * View isolation — "the edge of the game is the edge of the world".
 *
 * While seated in a battle, ONLY the own arena exists visually: the
 * global world (and other arenas) must not render. Outside a battle
 * the reverse holds: the organic world renders, battle arenas do not.
 *
 * @returns {boolean} True when the cell belongs in the current view.
 */
export function isCellVisibleInCurrentView(gameState, x, z) {
	const battle = getActiveBattle(gameState);
	if (battle && battle.centre) {
		const dx = x - battle.centre.x;
		const dz = z - battle.centre.z;
		return Math.sqrt(dx * dx + dz * dz) <= battleViewRadius(battle);
	}
	return !isBattleRegionCell(x, z);
}

/**
 * Battle-seat player ids follow `battle-<battle id>-s<n>` (server
 * seatIdFor). Older battles used the invite code as their id, so keying
 * on `battle.id` covers both.
 */
const SEAT_ID_PREFIX = 'battle-';

/**
 * Does an event involving this player belong in the local player's
 * current view? Seated in a battle: only that battle's seats (and the
 * local identity) are news. In the world view: battle seats belong to
 * remote arenas and their events are noise.
 */
export function isPlayerInCurrentView(gameState, playerId) {
	if (playerId == null) return true;
	const id = String(playerId);
	const battle = getActiveBattle(gameState);
	if (battle) {
		if (id === String(gameState?.localPlayerId || '')) return true;
		const myBattlePrefix = `${SEAT_ID_PREFIX}${String(battle.id || battle.code || '').toLowerCase()}-`;
		return id.startsWith(myBattlePrefix);
	}
	return !id.startsWith(SEAT_ID_PREFIX);
}

/**
 * View filter for multi-participant events (duels, captures, activity
 * log entries). Events with no participant info always pass; otherwise
 * at least one participant must belong to the current view.
 */
export function isEventInCurrentView(gameState, participantIds) {
	const ids = (Array.isArray(participantIds) ? participantIds : [participantIds])
		.filter(v => v != null);
	if (ids.length === 0) return true;
	return ids.some(id => isPlayerInCurrentView(gameState, id));
}

// ── Viking battles (longships) ──────────────────────────────────────────────
// The player-facing longship rules and controls live in vikingRules.js
// (next to the generated rules mirror in js/viking/shipRulesClient.js);
// re-exported here so every battle rule is reachable from one module.
export { VIKING_RULES, VIKING_CONTROLS, vikingControls, vikingRulesText } from './vikingRules.js';
