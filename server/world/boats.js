/**
 * Viking longship fleet that drifts around the board outside the
 * playable area. The boats serve two purposes:
 *
 *   1. They give the scene a "ships passing between islands" feel
 *      that reinforces the floating-in-the-sea aesthetic.
 *   2. They carry adverts on their sails — replacing the heavier
 *      sponsored-cell mechanic for a simpler, less intrusive
 *      advertising surface.
 *
 * The manager keeps a small pool of boats (two by default). Each
 * boat travels in a slow loop around the edge of the world. On
 * every loop a fresh advertiser is pulled from `pickAdvertiserForBoat`
 * so the same boat doesn't carry the same banner forever.
 *
 * Knights are intended to be able to "board" a boat in a follow-up
 * change (the "viking" mode the user sketched out). To keep the door
 * open, every boat exposes a `passengers` array; the chess move
 * validator is the right place to mutate that, not this file.
 */

// Rare fleet — two longships at most so they feel like occasional
// visitors rather than a harbour full of traffic.
const BOAT_COUNT = 2;
// Boats no longer travel a fixed orbit. Each picks a random target
// inside the wander box and sails toward it; once it gets close it
// picks another. This makes the fleet wander among the islands
// instead of forming a halo at the play-area perimeter, which is
// what the user kept seeing.
//
// The wander box is RELATIVE to a centre point that defaults to the
// origin but is overridden each time we refresh from the live World
// — boats actually wander around the chess islands instead of around
// (0, 0, 0). See `getWorldCentre` in the manager constructor.
const BOAT_WANDER_HALF_DEFAULT = 24;
const BOAT_WANDER_HALF_MIN = 12;   // tiny worlds still need room
const BOAT_WANDER_HALF_MAX = 60;   // sanity ceiling
const BOAT_WAYPOINT_REACH = 2.4;   // close enough to "arrive"
const BOAT_SPEED_UPS = 1.2;        // units per second (slow drift)
// Boats actively repel each other inside SEPARATION_RADIUS so the
// fleet ends up spread across the wander box rather than bunched.
// Combined with a "minimum waypoint distance from siblings" check
// (see `_randomWaypoint`) this gives the fleet enough spacing that
// usually only one boat is close to the viewer at a time — which
// is what the user asked for.
// Scaled longships on the client are ~1.7× a ~7-unit hull, so the
// centre must stay well clear of cell centres or the mesh clips
// straight through islands.
// Match the scaled client hull (~1.7× the ~4.4-unit mesh).
const BOAT_HULL_RADIUS = 8;
const CELL_HALF = 0.5;
const BOAT_CELL_CLEARANCE = BOAT_HULL_RADIUS + CELL_HALF + 1;
const BOAT_SEPARATION_RADIUS = 40;
const BOAT_SEPARATION_PUSH = 4.5;
const BOAT_WAYPOINT_MIN_SPACING = 38;
const BOAT_TURN_RATE = 1.4;         // rad/s — how fast prow can swing
const BOAT_SEA_Y = -0.30;           // surface level for hulls (water
//                                     plane lives at y=-0.50 in
//                                     `scene.js`; keep these in step).
const AD_REFRESH_MS = 90 * 1000;
const TICK_MS = 200;
const BROADCAST_MS = 500;
const CENTRE_REFRESH_MS = 5 * 1000; // re-check world centre this often
const OCCUPIED_REFRESH_MS = 800; // re-fetch the cell set this often

function makeBoatId(idx) {
	return `boat-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`;
}

function _clamp(value, lo, hi) {
	return Math.max(lo, Math.min(hi, value));
}

function createBoatManager({
	io = null,
	pickAdvertiser = null,
	persistence = null,
	getWorldCentre = null,
	getOccupiedCells = null,
} = {}) {
	const boats = [];
	let tickHandle = null;
	let broadcastHandle = null;
	let lastStepAt = 0;
	// Cached "wander around here, this big" derived from the world.
	// Recomputed every CENTRE_REFRESH_MS so the boats trail the play
	// area as cells are added / cleared rather than staying parked
	// around the spot the world happened to be when the manager started.
	let wanderCentre = { x: 0, z: 0 };
	let wanderHalf = BOAT_WANDER_HALF_DEFAULT;
	let lastCentreRefreshAt = -Infinity;
	// Cached set of (x, z) cell positions. Refreshed every couple of
	// seconds so the boats avoid newly-spawned islands without us
	// having to call into the world on every 200 ms tick.
	/** @type {Array<{x:number,z:number}>} */
	let occupiedCells = [];
	let lastOccupiedRefreshAt = -Infinity;

	function _refreshWanderCentre(now) {
		if (typeof getWorldCentre !== 'function') return;
		if (now - lastCentreRefreshAt < CENTRE_REFRESH_MS) return;
		lastCentreRefreshAt = now;
		try {
			const info = getWorldCentre();
			if (info && Number.isFinite(info.centreX) && Number.isFinite(info.centreZ)) {
				wanderCentre = { x: info.centreX, z: info.centreZ };
			}
			if (info && Number.isFinite(info.extent)) {
				wanderHalf = _clamp(info.extent * 0.7, BOAT_WANDER_HALF_MIN, BOAT_WANDER_HALF_MAX);
			}
		} catch (_err) {
			/* leave previous values in place */
		}
	}

	function _refreshOccupiedCells(now) {
		if (typeof getOccupiedCells !== 'function') return;
		if (now - lastOccupiedRefreshAt < OCCUPIED_REFRESH_MS) return;
		lastOccupiedRefreshAt = now;
		try {
			const cells = getOccupiedCells();
			if (Array.isArray(cells)) {
				// Defensive copy — we don't trust the caller not to
				// mutate the array between ticks.
				occupiedCells = cells.filter(c =>
					c && Number.isFinite(c.x) && Number.isFinite(c.z)
				);
			}
		} catch (_err) {
			/* leave previous list in place */
		}
	}

	function _distToCellFootprint(bx, bz, cx, cz) {
		const nearestX = Math.max(cx - CELL_HALF, Math.min(bx, cx + CELL_HALF));
		const nearestZ = Math.max(cz - CELL_HALF, Math.min(bz, cz + CELL_HALF));
		return Math.hypot(bx - nearestX, bz - nearestZ);
	}

	function _minDistanceToCells(x, z) {
		if (occupiedCells.length === 0) return Infinity;
		let best = Infinity;
		for (const cell of occupiedCells) {
			const gap = _distToCellFootprint(x, z, cell.x, cell.z) - BOAT_HULL_RADIUS;
			if (gap < best) best = gap;
		}
		return best;
	}

	function _pointInsideCell(x, z) {
		return _minDistanceToCells(x, z) < 0.05;
	}

	function _resolveCellPenetration(x, z) {
		let px = x;
		let pz = z;
		for (let pass = 0; pass < 12; pass++) {
			let moved = false;
			for (const cell of occupiedCells) {
				const nearestX = Math.max(cell.x - CELL_HALF, Math.min(px, cell.x + CELL_HALF));
				const nearestZ = Math.max(cell.z - CELL_HALF, Math.min(pz, cell.z + CELL_HALF));
				const dx = px - nearestX;
				const dz = pz - nearestZ;
				const dist = Math.hypot(dx, dz);
				if (dist >= BOAT_HULL_RADIUS) continue;
				moved = true;
				if (dist < 0.001) {
					const ox = px - cell.x;
					const oz = pz - cell.z;
					const od = Math.hypot(ox, oz) || 1;
					const push = BOAT_HULL_RADIUS + CELL_HALF + 0.15;
					px = cell.x + (ox / od) * push;
					pz = cell.z + (oz / od) * push;
				} else {
					const overlap = BOAT_HULL_RADIUS - dist + 0.05;
					px += (dx / dist) * overlap;
					pz += (dz / dist) * overlap;
				}
			}
			if (!moved) break;
		}
		return { x: px, z: pz };
	}

	function _waypointOutsidePlayArea() {
		// Pick a point on a ring just outside the occupied-cell bbox
		// when random sampling keeps failing (dense worlds).
		if (occupiedCells.length === 0) {
			const angle = Math.random() * Math.PI * 2;
			const r = wanderHalf * 0.85;
			return {
				x: wanderCentre.x + Math.cos(angle) * r,
				z: wanderCentre.z + Math.sin(angle) * r,
			};
		}
		let minX = Infinity; let maxX = -Infinity;
		let minZ = Infinity; let maxZ = -Infinity;
		for (const c of occupiedCells) {
			if (c.x < minX) minX = c.x;
			if (c.x > maxX) maxX = c.x;
			if (c.z < minZ) minZ = c.z;
			if (c.z > maxZ) maxZ = c.z;
		}
		const midX = (minX + maxX) / 2;
		const midZ = (minZ + maxZ) / 2;
		const span = Math.max(maxX - minX, maxZ - minZ, 4);
		const ring = span / 2 + BOAT_CELL_CLEARANCE + 4;
		const angle = Math.random() * Math.PI * 2;
		return {
			x: midX + Math.cos(angle) * ring,
			z: midZ + Math.sin(angle) * ring,
		};
	}

	function _pointTooCloseToOtherBoats(x, z, ignoreBoat) {
		for (const other of boats) {
			if (other === ignoreBoat) continue;
			const dx = other.position.x - x;
			const dz = other.position.z - z;
			if (Math.hypot(dx, dz) < BOAT_WAYPOINT_MIN_SPACING) return true;
		}
		return false;
	}

	function _randomWaypoint(forBoat = null) {
		// Prefer open water: among valid candidates pick the one
		// farthest from any cell centre. Never fall back to a point
		// inside an island — that was causing hulls to clip through
		// cells when every random draw failed.
		let best = null;
		let bestClearance = -1;
		for (let attempt = 0; attempt < 48; attempt++) {
			const candidate = {
				x: wanderCentre.x + (Math.random() - 0.5) * 2 * wanderHalf,
				z: wanderCentre.z + (Math.random() - 0.5) * 2 * wanderHalf,
			};
			if (_pointInsideCell(candidate.x, candidate.z)) continue;
			if (forBoat && _pointTooCloseToOtherBoats(candidate.x, candidate.z, forBoat)) continue;
			const clearance = _minDistanceToCells(candidate.x, candidate.z);
			if (clearance > bestClearance) {
				bestClearance = clearance;
				best = candidate;
			}
		}
		if (best) return best;
		return _waypointOutsidePlayArea();
	}

	function _spawnBoat(idx) {
		const ad = (typeof pickAdvertiser === 'function')
			? safePickAd() : null;
		// Use the boat-aware picker so spawn positions/waypoints
		// don't pile up in the same patch of sea.
		const stub = { position: { x: NaN, y: BOAT_SEA_Y, z: NaN } };
		const start = _randomWaypoint(stub);
		stub.position.x = start.x;
		stub.position.z = start.z;
		const waypoint = _randomWaypoint(stub);
		const initialHeading = Math.atan2(waypoint.x - start.x, waypoint.z - start.z);
		return {
			id: makeBoatId(idx),
			kind: 'longship',
			waypoint,
			phase: Math.random() * Math.PI * 2,
			speed: BOAT_SPEED_UPS * (0.85 + Math.random() * 0.4),
			advertiser: ad,
			adRefreshAt: Date.now() + AD_REFRESH_MS + Math.random() * AD_REFRESH_MS,
			passengers: [],
			position: { x: start.x, y: BOAT_SEA_Y, z: start.z },
			heading: initialHeading,
		};
	}

	function safePickAd() {
		try { return pickAdvertiser(); }
		catch (_err) { return null; }
	}

	function _refreshSails() {
		if (typeof pickAdvertiser !== 'function') return;
		const now = Date.now();
		for (const boat of boats) {
			if (boat.adRefreshAt > now) continue;
			boat.advertiser = safePickAd();
			boat.adRefreshAt = now + AD_REFRESH_MS + Math.random() * AD_REFRESH_MS;
		}
	}

	function _stepBoats() {
		const now = Date.now();
		const dt = lastStepAt === 0 ? TICK_MS / 1000 : Math.min(0.5, (now - lastStepAt) / 1000);
		lastStepAt = now;
		_refreshWanderCentre(now);
		_refreshOccupiedCells(now);

		for (const boat of boats) {
			// If the waypoint has been gobbled up by a freshly-spawned
			// cell, ditch it now so we don't try to sail into a rock.
			if (_pointInsideCell(boat.waypoint.x, boat.waypoint.z)) {
				boat.waypoint = _randomWaypoint(boat);
			}

			const dx = boat.waypoint.x - boat.position.x;
			const dz = boat.waypoint.z - boat.position.z;
			const dist = Math.hypot(dx, dz);
			if (dist < BOAT_WAYPOINT_REACH) {
				// Arrived: pick a fresh waypoint somewhere else in
				// the wander box so the fleet keeps drifting around
				// rather than parking. We pass `boat` so the picker
				// avoids spots close to other boats.
				boat.waypoint = _randomWaypoint(boat);
				continue;
			}

			// Desired heading toward the waypoint (z is the "forward"
			// axis for the longship mesh on the client).
			const desiredHeading = Math.atan2(dx, dz);
			let delta = desiredHeading - boat.heading;
			while (delta > Math.PI) delta -= 2 * Math.PI;
			while (delta < -Math.PI) delta += 2 * Math.PI;
			const maxTurn = BOAT_TURN_RATE * dt;
			boat.heading += Math.max(-maxTurn, Math.min(maxTurn, delta));

			let stepX = Math.sin(boat.heading) * boat.speed * dt;
			let stepZ = Math.cos(boat.heading) * boat.speed * dt;

			// Stronger separation so the fleet spreads across the
			// wander box rather than clumping.
			for (const other of boats) {
				if (other === boat) continue;
				const ox = boat.position.x - other.position.x;
				const oz = boat.position.z - other.position.z;
				const od = Math.hypot(ox, oz);
				if (od > BOAT_SEPARATION_RADIUS || od < 0.001) continue;
				const push = (1 - od / BOAT_SEPARATION_RADIUS) * BOAT_SEPARATION_PUSH * dt;
				stepX += (ox / od) * push;
				stepZ += (oz / od) * push;
			}

			// Cell avoidance: push away from the cell footprint (not
			// just its centre) so corners can't be clipped diagonally.
			for (const cell of occupiedCells) {
				const nearestX = Math.max(cell.x - CELL_HALF, Math.min(boat.position.x, cell.x + CELL_HALF));
				const nearestZ = Math.max(cell.z - CELL_HALF, Math.min(boat.position.z, cell.z + CELL_HALF));
				const cx = boat.position.x - nearestX;
				const cz = boat.position.z - nearestZ;
				const cd = Math.hypot(cx, cz);
				const gap = cd - BOAT_HULL_RADIUS;
				if (gap > 1.2 || cd < 0.001) continue;
				const strength = gap <= 0
					? 3.5
					: (1 - gap / 1.2);
				const push = strength * BOAT_SEPARATION_PUSH * dt;
				stepX += (cx / cd) * push;
				stepZ += (cz / cd) * push;
			}

			// Sub-step long moves so we don't tunnel through islands
			// between 200 ms ticks.
			let px = boat.position.x;
			let pz = boat.position.z;
			const stepLen = Math.hypot(stepX, stepZ);
			const subSteps = Math.max(1, Math.ceil(stepLen / 0.35));
			const fracX = stepX / subSteps;
			const fracZ = stepZ / subSteps;
			let blocked = false;
			for (let s = 0; s < subSteps; s++) {
				const tryX = px + fracX;
				const tryZ = pz + fracZ;
				if (_pointInsideCell(tryX, tryZ)) {
					blocked = true;
					break;
				}
				const resolved = _resolveCellPenetration(tryX, tryZ);
				px = resolved.x;
				pz = resolved.z;
			}
			if (blocked) {
				boat.waypoint = _randomWaypoint(boat);
			} else {
				boat.position.x = px;
				boat.position.z = pz;
			}
			boat.position.y = BOAT_SEA_Y;
		}
		_refreshSails();
	}

	function start() {
		// Pull a fresh centre + occupied-cell set BEFORE we spawn so
		// the very first waypoints land near the live play area and
		// avoid the islands. (The previous version spawned around
		// the origin which was ~50 units off the actual board centre
		// — the whole fleet would end up off-screen the moment the
		// camera framed the islands.)
		_refreshWanderCentre(0);
		_refreshOccupiedCells(0);
		if (boats.length === 0) {
			for (let i = 0; i < BOAT_COUNT; i++) {
				boats.push(_spawnBoat(i));
			}
		}
		lastStepAt = 0;
		_stepBoats();
		if (!tickHandle) tickHandle = setInterval(_stepBoats, TICK_MS);
		if (!broadcastHandle && io) {
			broadcastHandle = setInterval(_broadcast, BROADCAST_MS);
		}
	}

	function _broadcast() {
		if (!io || boats.length === 0) return;
		try {
			io.emit('boats_update', {
				ts: Date.now(),
				boats: getSnapshot(),
			});
		} catch (err) {
			console.warn('[boats] broadcast failed:', err && err.message);
		}
	}

	function stop() {
		if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
		if (broadcastHandle) { clearInterval(broadcastHandle); broadcastHandle = null; }
	}

	function getSnapshot() {
		return boats.map(b => ({
			id: b.id,
			kind: b.kind,
			position: { x: b.position.x, y: b.position.y, z: b.position.z },
			heading: b.heading,
			passengers: Array.isArray(b.passengers) ? b.passengers.slice() : [],
			advertiser: b.advertiser
				? {
					id: b.advertiser.id,
					name: b.advertiser.name,
					adImage: b.advertiser.adImage,
					adLink: b.advertiser.adLink,
					adText: b.advertiser.adText,
					placeholder: b.advertiser.placeholder === true,
				  }
				: null,
		}));
	}

	function getBoat(id) {
		return boats.find(b => b.id === id) || null;
	}

	function addPassenger(boatId, payload) {
		const boat = getBoat(boatId);
		if (!boat) return false;
		if (!Array.isArray(boat.passengers)) boat.passengers = [];
		// Keep passenger payloads opaque to this manager — the chess
		// layer is the source of truth for what a boarding knight
		// looks like. We just stash it and broadcast it.
		boat.passengers.push(payload);
		return true;
	}

	function removePassenger(boatId, predicate) {
		const boat = getBoat(boatId);
		if (!boat || !Array.isArray(boat.passengers)) return false;
		const before = boat.passengers.length;
		boat.passengers = boat.passengers.filter(p => !predicate(p));
		return boat.passengers.length !== before;
	}

	void persistence; // boats are intentionally ephemeral for now

	return {
		start,
		stop,
		tick: _stepBoats,
		broadcast: _broadcast,
		getSnapshot,
		getBoat,
		addPassenger,
		removePassenger,
		get boats() { return boats; },
	};
}

module.exports = {
	createBoatManager,
	BOAT_COUNT,
	BOAT_WANDER_HALF_DEFAULT,
	// Legacy alias — existing tests/imports refer to the previous
	// single-value constant. Pointing at the default keeps them
	// passing without revising every call-site at once.
	BOAT_WANDER_HALF: BOAT_WANDER_HALF_DEFAULT,
	BOAT_SEA_Y,
	BOAT_CELL_CLEARANCE,
	BOAT_HULL_RADIUS,
};
