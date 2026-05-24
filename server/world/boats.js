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
 * The manager keeps a small pool of boats (six by default). Each
 * boat travels in a slow loop around the edge of the world. On
 * every loop a fresh advertiser is pulled from `pickAdvertiserForBoat`
 * so the same boat doesn't carry the same banner forever.
 *
 * Knights are intended to be able to "board" a boat in a follow-up
 * change (the "viking" mode the user sketched out). To keep the door
 * open, every boat exposes a `passengers` array; the chess move
 * validator is the right place to mutate that, not this file.
 */

const BOAT_COUNT = 6;
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
const BOAT_SEPARATION_RADIUS = 12;
const BOAT_SEPARATION_PUSH = 2.6;
const BOAT_WAYPOINT_MIN_SPACING = 14;
// How far a boat will stay clear of any occupied chess cell. Cells
// are 0.94-unit cubes, so 1.9 leaves a comfortable hull-of-water
// gap around each island. We use the same value for steering and
// for the waypoint-rejection radius.
const BOAT_CELL_AVOID_RADIUS = 1.9;
const BOAT_TURN_RATE = 1.4;         // rad/s — how fast prow can swing
const BOAT_SEA_Y = -0.30;           // surface level for hulls (water
//                                     plane lives at y=-0.50 in
//                                     `scene.js`; keep these in step).
const AD_REFRESH_MS = 90 * 1000;
const TICK_MS = 200;
const BROADCAST_MS = 500;
const CENTRE_REFRESH_MS = 5 * 1000; // re-check world centre this often
const OCCUPIED_REFRESH_MS = 2 * 1000; // re-fetch the cell set this often

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

	function _pointInsideCell(x, z) {
		// Treat each occupied cell as a square of half-side
		// BOAT_CELL_AVOID_RADIUS. Cheaper than circle tests and lines
		// up with the cube geometry of the islands.
		for (const cell of occupiedCells) {
			if (Math.abs(cell.x - x) <= BOAT_CELL_AVOID_RADIUS &&
				Math.abs(cell.z - z) <= BOAT_CELL_AVOID_RADIUS) {
				return true;
			}
		}
		return false;
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
		// Try a handful of candidates so we usually pick a spot that
		// isn't already inside a cell or right next to another boat.
		// If every candidate is bad we still return SOMETHING so the
		// boat keeps moving (a degenerate world with cells everywhere
		// is unlikely but possible).
		let best = null;
		for (let attempt = 0; attempt < 16; attempt++) {
			const candidate = {
				x: wanderCentre.x + (Math.random() - 0.5) * 2 * wanderHalf,
				z: wanderCentre.z + (Math.random() - 0.5) * 2 * wanderHalf,
			};
			if (_pointInsideCell(candidate.x, candidate.z)) {
				best = best || candidate;
				continue;
			}
			if (forBoat && _pointTooCloseToOtherBoats(candidate.x, candidate.z, forBoat)) {
				best = best || candidate;
				continue;
			}
			return candidate;
		}
		return best || {
			x: wanderCentre.x + (Math.random() - 0.5) * 2 * wanderHalf,
			z: wanderCentre.z + (Math.random() - 0.5) * 2 * wanderHalf,
		};
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

			// Cell avoidance: nudge the hull away from any cell whose
			// centre is within the avoid radius. This is what stops
			// boats sailing visibly *through* islands.
			for (const cell of occupiedCells) {
				const cx = boat.position.x - cell.x;
				const cz = boat.position.z - cell.z;
				const cd = Math.hypot(cx, cz);
				if (cd > BOAT_CELL_AVOID_RADIUS || cd < 0.001) continue;
				const push = (1 - cd / BOAT_CELL_AVOID_RADIUS) * BOAT_CELL_AVOID_RADIUS * dt;
				stepX += (cx / cd) * push;
				stepZ += (cz / cd) * push;
			}

			// Apply the step, but if it would still leave us inside a
			// cell after the nudge above, abort the forward motion
			// and pick a new waypoint — we'd rather stop dead than
			// clip through an island.
			const nextX = boat.position.x + stepX;
			const nextZ = boat.position.z + stepZ;
			if (_pointInsideCell(nextX, nextZ)) {
				boat.waypoint = _randomWaypoint(boat);
			} else {
				boat.position.x = nextX;
				boat.position.z = nextZ;
			}
			// Bobbing on the swell (kept on the manager so the client
			// doesn't have to reinvent the phase).
			boat.position.y = BOAT_SEA_Y + Math.sin(now * 0.0011 + boat.phase) * 0.08;
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
	BOAT_CELL_AVOID_RADIUS,
};
