/**
 * Home-zone degradation.
 *
 * If a player goes idle (no tetromino placements, chess moves, or AI ticks)
 * for longer than `BOARD_SETTINGS.HOME_ZONE_DEGRADATION_INTERVAL`, their
 * home zone "degrades": the home-marker cells are converted to normal
 * terrain (still owned, so their king stays supported) and a flag is
 * raised so it doesn't degrade twice.
 */

const World = require('../world/World');
const Sessions = require('../world/Sessions');
const { BOARD_SETTINGS } = require('../game/Constants');
const { getLatestPlayerActionAt } = require('../utils/cooldowns');

const DEFAULT_DEGRADATION_MS = 150000;
// Multiplier applied to the degradation interval when the player is
// still connected.  The bible's 5-minute degradation rule was intended
// to clean up *absent* players; players who are still sat in front of
// the screen shouldn't have their footing pulled out from under them
// because they're thinking about their next move.
const ONLINE_DEGRADATION_MULTIPLIER = 12;

function createHomeZoneDegradationService({ gameManager, broadcaster, persistence }) {
	if (!gameManager) throw new Error('createHomeZoneDegradationService: gameManager required');
	if (!broadcaster) throw new Error('createHomeZoneDegradationService: broadcaster required');
	if (!persistence) throw new Error('createHomeZoneDegradationService: persistence required');

	// playerId -> epoch ms at which they were last seen active.  Ephemeral.
	const idleSince = new Map();

	function convertHomeZoneToNormalCells(playerId, homeZone) {
		const world = World.getWorld();
		if (!world || !world.board || !world.board.cells || !homeZone) return 0;

		const width = homeZone.width || 8;
		const height = homeZone.height || 2;
		let convertedCount = 0;

		for (let z = homeZone.z; z < homeZone.z + height; z++) {
			for (let x = homeZone.x; x < homeZone.x + width; x++) {
				const key = `${x},${z}`;
				const cellContents = world.board.cells[key];
				if (!Array.isArray(cellContents) || cellContents.length === 0) continue;

				const hasPlayerHomeMarker = cellContents.some(
					item => item && item.type === 'home' && String(item.player) === String(playerId)
				);
				if (!hasPlayerHomeMarker) continue;

				const remaining = cellContents.filter(
					item => !(item && item.type === 'home' && String(item.player) === String(playerId))
				);

				const hasOwnedTerrain = remaining.some(item =>
					item
					&& String(item.player) === String(playerId)
					&& item.type !== 'home'
					&& item.type !== 'chess'
				);

				if (!hasOwnedTerrain) {
					remaining.push({
						type: 'tetromino',
						pieceType: 'home_converted',
						player: playerId,
						placedAt: Date.now(),
						fromHomeZone: true,
					});
				}

				world.board.cells[key] = remaining;
				convertedCount++;
			}
		}

		if (convertedCount > 0) {
			gameManager.boardManager.recalculateBoardBoundaries(world.board);
		}

		return convertedCount;
	}

	function tick() {
		try {
			const world = World.getWorld();
			if (!world || !world.homeZones) return;

			const now = Date.now();
			const degradationInterval = Number(BOARD_SETTINGS.HOME_ZONE_DEGRADATION_INTERVAL) > 0
				? Number(BOARD_SETTINGS.HOME_ZONE_DEGRADATION_INTERVAL)
				: DEFAULT_DEGRADATION_MS;

			let changed = false;

			for (const [playerId, homeZone] of Object.entries(world.homeZones)) {
				if (!homeZone || homeZone.isDegraded) continue;

				const playerData = World.getPlayer(playerId);

				// Manual pause is honoured here too — it freezes
				// degradation entirely. See `pauseService` in
				// `server/world/pause.js`.
				if (playerData && playerData.paused === true) continue;

				const latestActionAt = getLatestPlayerActionAt(playerData);

				if (latestActionAt > 0) {
					idleSince.set(playerId, latestActionAt);
				} else if (!idleSince.has(playerId)) {
					idleSince.set(playerId, now);
				}

				const sinceMs = idleSince.get(playerId) || now;
				const isOnline = Sessions.isOnline(playerId);
				const effectiveInterval = isOnline
					? degradationInterval * ONLINE_DEGRADATION_MULTIPLIER
					: degradationInterval;
				if (now - sinceMs < effectiveInterval) continue;

				const convertedCount = convertHomeZoneToNormalCells(playerId, homeZone);
				homeZone.isDegraded = true;
				homeZone.degradedAt = now;
				idleSince.delete(playerId);
				changed = true;

				console.log(
					`[HomeZone] Degraded ${playerId} (${isOnline ? 'online idle' : 'offline'}); converted ${convertedCount} cells to normal terrain.`
				);
			}

			if (changed) {
				persistence.markDirty();
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
			}
		} catch (error) {
			console.error('[HomeZone] Error during degradation tick:', error);
		}
	}

	function forgetPlayer(playerId) {
		idleSince.delete(playerId);
	}

	function reset() {
		idleSince.clear();
	}

	return { tick, forgetPlayer, reset };
}

module.exports = { createHomeZoneDegradationService };
