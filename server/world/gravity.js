/**
 * World gravity — a very slow drift that pulls scattered players back
 * towards each other when they have drifted "massively far apart".
 *
 * Why this exists:
 *   The home-zone allocator places new players near the centroid of
 *   existing zones, but worlds restored from older saves (with a
 *   different allocator) can leave humans on opposite sides of the map.
 *   Without intervention the game feels lonely and matches are hard to
 *   reach. Gravity shifts a player's entire territory (cells, chess
 *   pieces, home zone) one square towards the centroid of all players
 *   whenever they sit beyond `GRAVITY_TRIGGER_DISTANCE`.
 *
 *   The pull only happens occasionally (every `GRAVITY_TICK_MS`) and
 *   only moves the player by a single cell at a time. The shift is
 *   skipped if it would collide with another player's content.
 */

const World = require('./World');

const GRAVITY_TICK_MS = 60_000;        // Apply gravity once a minute.
const GRAVITY_TRIGGER_DISTANCE = 60;   // Only pull players further than this.
const GRAVITY_STEP = 1;                // Cells per tick.

function homeZoneCentre(zone) {
	if (!zone) return null;
	const w = zone.width || 8;
	const h = zone.height || 2;
	return { x: zone.x + w / 2, z: zone.z + h / 2 };
}

function buildWorldCentroid(world) {
	const zones = world?.homeZones || {};
	const players = world?.players || {};
	let totalX = 0;
	let totalZ = 0;
	let count = 0;
	for (const playerId of Object.keys(zones)) {
		const player = players[playerId];
		if (!player || player.eliminated) continue;
		const centre = homeZoneCentre(zones[playerId]);
		if (!centre) continue;
		totalX += centre.x;
		totalZ += centre.z;
		count++;
	}
	if (count === 0) return null;
	return { x: totalX / count, z: totalZ / count, count };
}

/**
 * Collect every cell, chess piece and the home zone owned by `playerId`.
 *
 * @param {Object} world
 * @param {string} playerId
 */
function collectPlayerFootprint(world, playerId) {
	const pid = String(playerId);
	const cells = [];
	if (world.board && world.board.cells) {
		for (const [key, contents] of Object.entries(world.board.cells)) {
			if (!Array.isArray(contents) || contents.length === 0) continue;
			const owners = new Set(contents.map(item => item && item.player != null ? String(item.player) : null));
			if (!owners.has(pid)) continue;
			cells.push({ key, x: Number(key.split(',')[0]), z: Number(key.split(',')[1]), contents });
		}
	}

	const pieces = Array.isArray(world.chessPieces)
		? world.chessPieces.filter(piece => piece && String(piece.player) === pid)
		: [];

	const zone = world.homeZones?.[playerId] || null;

	return { cells, pieces, zone };
}

/**
 * Test whether shifting these cells by (dx, dz) would land on top of
 * another player's content (or off the sparse-board limits).
 *
 * @returns {boolean} True if the shift is safe.
 */
function isShiftSafe(world, footprint, dx, dz) {
	const sourceKeys = new Set(footprint.cells.map(c => c.key));
	const cells = world.board?.cells || {};
	for (const { x, z } of footprint.cells) {
		const newKey = `${x + dx},${z + dz}`;
		if (sourceKeys.has(newKey)) continue;
		const dest = cells[newKey];
		if (Array.isArray(dest) && dest.length > 0) return false;
	}
	return true;
}

function applyShift(world, playerId, footprint, dx, dz) {
	const cells = world.board?.cells;
	if (!cells) return false;

	const sourceKeys = new Set(footprint.cells.map(c => c.key));
	for (const c of footprint.cells) {
		delete cells[c.key];
	}
	for (const c of footprint.cells) {
		const newKey = `${c.x + dx},${c.z + dz}`;
		cells[newKey] = c.contents;
		for (const item of c.contents) {
			if (item && item.position) {
				if (Number.isFinite(item.position.x)) item.position.x += dx;
				if (Number.isFinite(item.position.z)) item.position.z += dz;
			}
		}
	}

	for (const piece of footprint.pieces) {
		const pos = piece.position || piece;
		if (pos && Number.isFinite(pos.x)) pos.x += dx;
		if (pos && Number.isFinite(pos.z)) pos.z += dz;
	}

	if (footprint.zone) {
		footprint.zone.x += dx;
		footprint.zone.z += dz;
	}

	if (world.disconnectedSince) {
		const newMap = {};
		const pid = String(playerId);
		for (const [key, ts] of Object.entries(world.disconnectedSince)) {
			const [keyPid, coords] = key.split(':');
			if (keyPid !== pid || !coords) {
				newMap[key] = ts;
				continue;
			}
			const [xStr, zStr] = coords.split(',');
			const x = Number(xStr) + dx;
			const z = Number(zStr) + dz;
			if (Number.isFinite(x) && Number.isFinite(z)) {
				newMap[`${pid}:${x},${z}`] = ts;
			}
		}
		world.disconnectedSince = newMap;
	}

	return sourceKeys.size > 0;
}

function createWorldGravityService({ boardManager, broadcaster, persistence } = {}) {
	if (!boardManager) throw new Error('createWorldGravityService: boardManager required');
	if (!broadcaster) throw new Error('createWorldGravityService: broadcaster required');
	if (!persistence) throw new Error('createWorldGravityService: persistence required');

	function tick() {
		const world = World.getWorld();
		if (!world || !world.homeZones) return;
		const centroid = buildWorldCentroid(world);
		if (!centroid || centroid.count < 2) return;

		let shifted = false;
		const zoneEntries = Object.entries(world.homeZones);
		for (const [playerId, zone] of zoneEntries) {
			const player = world.players?.[playerId];
			if (!player || player.eliminated) continue;
			const centre = homeZoneCentre(zone);
			if (!centre) continue;
			const dx = centroid.x - centre.x;
			const dz = centroid.z - centre.z;
			const distance = Math.hypot(dx, dz);
			if (distance < GRAVITY_TRIGGER_DISTANCE) continue;

			// Step one cell along whichever axis is the larger distance,
			// so the player drifts diagonally over many ticks rather than
			// jumping in a straight line.
			let stepX = 0;
			let stepZ = 0;
			if (Math.abs(dx) >= Math.abs(dz)) stepX = Math.sign(dx) * GRAVITY_STEP;
			else stepZ = Math.sign(dz) * GRAVITY_STEP;
			if (stepX === 0 && stepZ === 0) continue;

			const footprint = collectPlayerFootprint(world, playerId);
			if (footprint.cells.length === 0) continue;
			if (!isShiftSafe(world, footprint, stepX, stepZ)) continue;

			const moved = applyShift(world, playerId, footprint, stepX, stepZ);
			if (moved) {
				shifted = true;
				console.log(
					`[Gravity] Drifted player ${playerId} by (${stepX}, ${stepZ}); distance to centroid was ${distance.toFixed(1)}`
				);
			}
		}

		if (!shifted) return;

		boardManager.recalculateBoardBoundaries(world.board);
		World.markDirty();
		persistence.markDirty();
		broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
	}

	return { tick, GRAVITY_TICK_MS, GRAVITY_TRIGGER_DISTANCE };
}

module.exports = {
	createWorldGravityService,
	GRAVITY_TICK_MS,
	GRAVITY_TRIGGER_DISTANCE,
	homeZoneCentre,
	buildWorldCentroid,
	collectPlayerFootprint,
	isShiftSafe,
	applyShift,
};
