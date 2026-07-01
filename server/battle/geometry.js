/**
 * Battle-arena geometry — pure functions, no world state.
 *
 * A battle arena is a circular region of the ordinary world board, placed
 * far from the organic play cluster. It consists of:
 *
 *   • A neutral **ring** — a 2-cell-thick rasterised annulus of ownerless
 *     terrain (`battleRing` items). The ring is shared ground: any seated
 *     player may traverse it or anchor tetrominoes against it, but ring
 *     cells never clear, never move, and never change owner. Because the
 *     ring is a closed circle it also acts as the arena wall.
 *
 *   • 2–4 **seats** — ordinary home zones placed at fixed positions facing
 *     the arena centre. Two-seat battles face each other with pawn rows
 *     exactly `BATTLE.FRONT_ROW_GAP` (8) cells apart; three/four-seat
 *     battles sit at 90° with pawn rows pushed 1 cell further out so the
 *     zones cannot collide at the corners.
 *
 * Arenas are allocated on a fixed grid starting at `BATTLE.ARENA_BASE`,
 * far enough from the organic world that they can never interact, but
 * close enough to the origin that client float precision is unaffected.
 */

'use strict';

const BATTLE = Object.freeze({
	/** Outer ring radius in cells (diameter 32 as designed). */
	RING_OUTER_RADIUS: 16,
	/** Inner ring radius — the annulus spans [inner, outer]. */
	RING_INNER_RADIUS: 15,
	/** Furthest cell distance from centre a seated player may build on. */
	PLAY_RADIUS: 14,
	/** Non-battle players must keep this far from an arena centre. */
	KEEP_OUT_RADIUS: 18,
	/** Distance between opposing pawn rows for a 2-seat battle. */
	FRONT_ROW_GAP: 8,
	/** Arena grid anchor — far beyond the organic cluster (~±200 cells). */
	ARENA_BASE: Object.freeze({ x: 2000, z: 2000 }),
	/** Centre-to-centre spacing of arena slots on the grid. */
	ARENA_PITCH: 64,
	/** Arena slots per grid row. */
	ARENA_GRID_COLUMNS: 8,
	/** Highest number of concurrent arenas we allocate slots for. */
	MAX_ARENAS: 64,
	MIN_SEATS: 2,
	MAX_SEATS: 4,
});

/** Home zone footprint (mirrors HOME_ZONE_WIDTH/HEIGHT in Constants.js). */
const ZONE_LONG_SIDE = 8;
const ZONE_SHORT_SIDE = 2;

/**
 * Centre of the arena occupying grid `slot` (0-based).
 * @param {number} slot
 * @returns {{x: number, z: number}}
 */
function arenaCentreForSlot(slot) {
	if (!Number.isInteger(slot) || slot < 0 || slot >= BATTLE.MAX_ARENAS) {
		throw new Error(`arenaCentreForSlot: slot out of range: ${slot}`);
	}
	return {
		x: BATTLE.ARENA_BASE.x + (slot % BATTLE.ARENA_GRID_COLUMNS) * BATTLE.ARENA_PITCH,
		z: BATTLE.ARENA_BASE.z + Math.floor(slot / BATTLE.ARENA_GRID_COLUMNS) * BATTLE.ARENA_PITCH,
	};
}

function cellDistance(centre, x, z) {
	const dx = x - centre.x;
	const dz = z - centre.z;
	return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Rounded radial band of a cell. All arena classification uses the same
 * rounding so play area (≤14), ring (15–16), and outside (≥17) tile the
 * plane with no dead cells between the bands.
 */
function radialBand(centre, x, z) {
	return Math.round(cellDistance(centre, x, z));
}

/**
 * Is (x, z) inside the buildable play area of an arena (strictly inside
 * the ring)?
 */
function isInsidePlayArea(centre, x, z) {
	return radialBand(centre, x, z) <= BATTLE.PLAY_RADIUS;
}

/**
 * Is (x, z) inside the keep-out zone that non-battle players must not
 * build in (ring + a safety margin)?
 */
function isInsideKeepOut(centre, x, z) {
	return radialBand(centre, x, z) <= BATTLE.KEEP_OUT_RADIUS;
}

/**
 * All cells of the 2-thick ring annulus around `centre`.
 * The 2-cell thickness guarantees the ring is **orthogonally** connected
 * (a 1-thick midpoint circle steps diagonally, which would break the
 * BFS path rules that only walk N/S/E/W).
 *
 * @param {{x:number, z:number}} centre
 * @returns {Array<{x:number, z:number}>}
 */
function ringCells(centre) {
	const out = [];
	const rOuter = BATTLE.RING_OUTER_RADIUS;
	const rInner = BATTLE.RING_INNER_RADIUS;
	for (let dz = -rOuter; dz <= rOuter; dz++) {
		for (let dx = -rOuter; dx <= rOuter; dx++) {
			const band = radialBand({ x: 0, z: 0 }, dx, dz);
			if (band >= rInner && band <= rOuter) {
				out.push({ x: centre.x + dx, z: centre.z + dz });
			}
		}
	}
	return out;
}

/**
 * Home zones for `seatCount` seats around `centre`, in seat order.
 * Returned zones are ready for `game.homeZones[seatId]` and
 * `ChessManager.initializeChessPieces`.
 *
 * Orientation reminder (authoritative — see moveValidation.js):
 *   0: pawns advance +z (horizontal zone, pieces at z, pawns at z+1)
 *   1: pawns advance +x (vertical zone, pieces at x, pawns at x+1)
 *   2: pawns advance −z (horizontal zone, pieces at z+1, pawns at z)
 *   3: pawns advance −x (vertical zone, pieces at x+1, pawns at x)
 *
 * @param {{x:number, z:number}} centre
 * @param {number} seatCount 2–4
 * @returns {Array<{x:number, z:number, width:number, height:number, orientation:number}>}
 */
function seatHomeZones(centre, seatCount) {
	if (!Number.isInteger(seatCount) || seatCount < BATTLE.MIN_SEATS || seatCount > BATTLE.MAX_SEATS) {
		throw new Error(`seatHomeZones: seatCount must be ${BATTLE.MIN_SEATS}-${BATTLE.MAX_SEATS}, got ${seatCount}`);
	}

	// Pawn-row distance from centre. 2 seats: exactly FRONT_ROW_GAP apart
	// (±4). 3–4 seats: one cell further out (±5) so adjacent zones at 90°
	// can't both claim the corner cells.
	const frontOffset = seatCount === 2
		? BATTLE.FRONT_ROW_GAP / 2
		: BATTLE.FRONT_ROW_GAP / 2 + 1;
	const half = ZONE_LONG_SIDE / 2;

	// Seat order: north, south, west, east. North/south first so a
	// 2-seat battle is a pure face-off.
	const zones = [
		{ // North seat (−z side), advancing +z towards centre.
			x: centre.x - half,
			z: centre.z - frontOffset - 1,
			width: ZONE_LONG_SIDE,
			height: ZONE_SHORT_SIDE,
			orientation: 0,
		},
		{ // South seat (+z side), advancing −z towards centre.
			x: centre.x - half,
			z: centre.z + frontOffset,
			width: ZONE_LONG_SIDE,
			height: ZONE_SHORT_SIDE,
			orientation: 2,
		},
		{ // West seat (−x side), advancing +x towards centre.
			x: centre.x - frontOffset - 1,
			z: centre.z - half,
			width: ZONE_SHORT_SIDE,
			height: ZONE_LONG_SIDE,
			orientation: 1,
		},
		{ // East seat (+x side), advancing −x towards centre.
			x: centre.x + frontOffset,
			z: centre.z - half,
			width: ZONE_SHORT_SIDE,
			height: ZONE_LONG_SIDE,
			orientation: 3,
		},
	];

	return zones.slice(0, seatCount);
}

/**
 * Every cell covered by a zone returned from `seatHomeZones` (used by
 * tests and cleanup sweeps).
 */
function zoneCells(zone) {
	const out = [];
	for (let dz = 0; dz < zone.height; dz++) {
		for (let dx = 0; dx < zone.width; dx++) {
			out.push({ x: zone.x + dx, z: zone.z + dz });
		}
	}
	return out;
}

module.exports = {
	BATTLE,
	arenaCentreForSlot,
	cellDistance,
	radialBand,
	isInsidePlayArea,
	isInsideKeepOut,
	ringCells,
	seatHomeZones,
	zoneCells,
};
