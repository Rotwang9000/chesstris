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
const BOAT_LOOP_RADIUS = 28;   // far enough out to clear the home zones
const BOAT_LOOP_JITTER = 6;    // wander in/out so they don't look like train carriages
const BOAT_LOOP_SECONDS = 60;  // one full lap takes this long
const AD_REFRESH_MS = 90 * 1000;
const TICK_MS = 200;
const BROADCAST_MS = 500;

function makeBoatId(idx) {
	return `boat-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Sample an (x, z) position for a boat at angle `theta` around the
 * orbit, with a per-boat radius modulation so all six aren't on
 * the same circle.
 */
function _boatPosition(boat, theta) {
	const radius = boat.baseRadius
		+ Math.sin(theta * 2 + boat.phase) * BOAT_LOOP_JITTER * 0.5;
	return {
		x: Math.cos(theta) * radius,
		// Boats sit on the sea surface (water plane lives at y=-2.2
		// in the client; -1.8 here so the hull bobs visibly above it).
		y: -1.8 + Math.sin(theta * 3 + boat.phase) * 0.12,
		z: Math.sin(theta) * radius,
	};
}

function createBoatManager({ io = null, pickAdvertiser = null, persistence = null } = {}) {
	const boats = [];
	let tickHandle = null;
	let broadcastHandle = null;
	let startedAt = 0;

	function _spawnBoat(idx) {
		const ad = (typeof pickAdvertiser === 'function')
			? safePickAd() : null;
		return {
			id: makeBoatId(idx),
			kind: 'longship',
			baseRadius: BOAT_LOOP_RADIUS + (Math.random() - 0.5) * 4,
			phase: Math.random() * Math.PI * 2,
			theta0: Math.random() * Math.PI * 2,
			// Direction: ±1 for clockwise / anticlockwise so the boats
			// pass each other rather than convoying in a line.
			direction: Math.random() < 0.5 ? -1 : 1,
			speed: 1 / BOAT_LOOP_SECONDS,
			advertiser: ad,
			adRefreshAt: Date.now() + AD_REFRESH_MS + Math.random() * AD_REFRESH_MS,
			passengers: [],
			position: { x: 0, y: -1.8, z: 0 },
			heading: 0,
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
		const elapsed = (Date.now() - startedAt) / 1000;
		for (const boat of boats) {
			const theta = boat.theta0 + boat.direction * elapsed * boat.speed * Math.PI * 2;
			const here = _boatPosition(boat, theta);
			const next = _boatPosition(boat, theta + 0.01 * boat.direction);
			boat.position = here;
			// Heading is the tangent to the orbit, used by the client
			// to point the prow forward.
			boat.heading = Math.atan2(next.x - here.x, next.z - here.z);
		}
		_refreshSails();
	}

	function start() {
		if (boats.length === 0) {
			for (let i = 0; i < BOAT_COUNT; i++) {
				boats.push(_spawnBoat(i));
			}
		}
		startedAt = Date.now();
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
	BOAT_LOOP_RADIUS,
	BOAT_LOOP_SECONDS,
};
