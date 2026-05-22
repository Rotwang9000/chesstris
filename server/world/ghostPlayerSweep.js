/**
 * Ghost-player sweep.
 *
 * Solves a long-standing complaint from the user: "There are still LOADS
 * of empty players that need to be cleared. I spawn into a new game and
 * was miles away from any other player."
 *
 * The existing `loneKingSweep` only catches players who still have
 * **exactly one** chess piece (a king). It doesn't help with the much
 * worse case: a player whose king was captured by another player. In
 * that case:
 *
 *   • The king-capture path marks them `eliminated = true` and gifts
 *     all their pieces to the captor — so the loser now has 0 pieces.
 *   • The AI runner notices it has no pieces and silently does nothing
 *     (no respawn for capture-victims, only for self-detonation).
 *   • The disconnect cleanup never fires (humans might still be
 *     connected; AIs never disconnect at all).
 *
 * Result: the player record lingers in `world.players` forever. The
 * sidebar shows them, the home-zone allocator anchors fresh joiners
 * around their corpse, and the spawn distance balloons. The sweep
 * here cleans them up:
 *
 *   1. Any non-eliminated player with 0 chess pieces for longer than
 *      `NO_PIECES_GRACE_MS` is force-flagged as eliminated.
 *   2. Any eliminated player who is offline (no live socket) and has
 *      0 chess pieces gets fully removed from the world (and AIs get
 *      a fresh respawn) after `REMOVAL_GRACE_MS`.
 *
 * Idempotent: re-running the sweep does nothing for players who've
 * recovered (e.g. a captured-and-promoted pawn brought their roster
 * back above zero).
 */

const World = require('../world/World');
const Sessions = require('../world/Sessions');

const NO_PIECES_GRACE_MS = 60 * 1000;
const REMOVAL_GRACE_MS = 90 * 1000;

function createGhostPlayerSweepService({
	broadcaster,
	persistence,
	lifecycleService,
	aiRunner = null,
	activityLog = null,
}) {
	if (!broadcaster) throw new Error('createGhostPlayerSweepService: broadcaster required');
	if (!persistence) throw new Error('createGhostPlayerSweepService: persistence required');
	if (!lifecycleService) throw new Error('createGhostPlayerSweepService: lifecycleService required');

	// playerId → timestamp first noticed with 0 pieces (alive cohort)
	const firstSeenEmpty = new Map();
	// playerId → timestamp marked eliminated by this sweep (recovery cohort)
	const eliminatedSince = new Map();

	function countPiecesByPlayer(world) {
		const counts = new Map();
		if (!Array.isArray(world.chessPieces)) return counts;
		for (const piece of world.chessPieces) {
			if (!piece || !piece.player) continue;
			const k = String(piece.player);
			counts.set(k, (counts.get(k) || 0) + 1);
		}
		return counts;
	}

	/**
	 * @returns {{ flagged: string[], removed: string[] }}
	 */
	function tick({ now = Date.now() } = {}) {
		const flagged = [];
		const removed = [];
		const world = World.getWorld();
		if (!world || !world.players) return { flagged, removed };

		const counts = countPiecesByPlayer(world);

		for (const [pid, player] of Object.entries(world.players)) {
			if (!player) continue;
			const pidStr = String(pid);
			const pieceCount = counts.get(pidStr) || 0;
			const hasPieces = pieceCount > 0;
			const isOnline = Sessions.isOnline(pidStr);
			const isAi = !!player.isComputer;

			if (player.eliminated) {
				if (hasPieces) {
					eliminatedSince.delete(pidStr);
					continue;
				}
				if (player.pendingRespawn && isAi) {
					// AI runner is mid-respawn — leave it alone.
					continue;
				}

				const stamped = eliminatedSince.get(pidStr)
					|| Number(player.eliminatedAt)
					|| now;
				eliminatedSince.set(pidStr, stamped);

				const offlineEnoughForHuman = !isOnline;
				const aiAlwaysEligible = isAi;
				if (!(offlineEnoughForHuman || aiAlwaysEligible)) continue;

				if (now - stamped < REMOVAL_GRACE_MS) continue;

				try {
					recordReap(player, pidStr, 'eliminated', hasPieces);
					if (isAi && aiRunner && typeof aiRunner.stopAiPlayer === 'function') {
						try { aiRunner.stopAiPlayer(pidStr); } catch (_e) { /* */ }
					}
					lifecycleService.removePlayerCompletely(pidStr);
					removed.push(pidStr);
				} catch (err) {
					console.warn(`[GhostSweep] Failed to remove ${pidStr}:`, err.message);
				}
				eliminatedSince.delete(pidStr);
				firstSeenEmpty.delete(pidStr);
				continue;
			}

			if (hasPieces) {
				firstSeenEmpty.delete(pidStr);
				continue;
			}

			const since = firstSeenEmpty.get(pidStr);
			if (!since) {
				firstSeenEmpty.set(pidStr, now);
				continue;
			}
			if (now - since < NO_PIECES_GRACE_MS) continue;

			player.eliminated = true;
			player.eliminatedAt = now;
			eliminatedSince.set(pidStr, now);
			firstSeenEmpty.delete(pidStr);
			flagged.push(pidStr);
			persistence.markDirty();
			console.log(`[GhostSweep] Flagged ${pidStr} as eliminated (no pieces for ${Math.round((now - since) / 1000)}s).`);
		}

		if (flagged.length > 0 || removed.length > 0) {
			try {
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
			} catch (err) {
				console.warn('[GhostSweep] broadcast failed:', err.message);
			}
		}

		return { flagged, removed };
	}

	function recordReap(player, playerId, reason, hadPieces) {
		if (!activityLog || typeof activityLog.recordPlayerReaped !== 'function') return;
		try {
			activityLog.recordPlayerReaped({
				playerId,
				playerName: player.username || player.name || playerId,
				reason,
				hadPieces: !!hadPieces,
			});
		} catch (err) {
			console.warn('[GhostSweep] activity log failed:', err.message);
		}
	}

	/**
	 * Boot-time sweep: assume any persisted "0-piece" player is
	 * already a ghost, no grace required. Used right after persistence
	 * restore so a freshly-rebooted server doesn't anchor new joiners
	 * around corpses left over from the previous session.
	 */
	function reapImmediately() {
		const flagged = [];
		const removed = [];
		const world = World.getWorld();
		if (!world || !world.players) return { flagged, removed };

		const counts = countPiecesByPlayer(world);
		const candidatePlayerIds = Object.keys(world.players);

		for (const pid of candidatePlayerIds) {
			const player = world.players[pid];
			if (!player) continue;
			const pieceCount = counts.get(String(pid)) || 0;
			if (pieceCount > 0) continue;
			if (player.pendingRespawn && player.isComputer) continue;

			if (!player.eliminated) {
				player.eliminated = true;
				player.eliminatedAt = Date.now();
				flagged.push(String(pid));
			}

			try {
				recordReap(player, String(pid), 'boot_sweep', false);
				if (player.isComputer && aiRunner && typeof aiRunner.stopAiPlayer === 'function') {
					try { aiRunner.stopAiPlayer(String(pid)); } catch (_e) { /* */ }
				}
				lifecycleService.removePlayerCompletely(String(pid));
				removed.push(String(pid));
			} catch (err) {
				console.warn(`[GhostSweep] boot reap failed for ${pid}:`, err.message);
			}
		}

		if (flagged.length > 0 || removed.length > 0) {
			persistence.markDirty();
			try {
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
			} catch (err) {
				console.warn('[GhostSweep] boot broadcast failed:', err.message);
			}
			console.log(`[GhostSweep] Boot sweep: ${flagged.length} flagged, ${removed.length} removed.`);
		}

		firstSeenEmpty.clear();
		eliminatedSince.clear();
		return { flagged, removed };
	}

	function reset() {
		firstSeenEmpty.clear();
		eliminatedSince.clear();
	}

	return {
		tick,
		reapImmediately,
		reset,
		NO_PIECES_GRACE_MS,
		REMOVAL_GRACE_MS,
	};
}

module.exports = {
	createGhostPlayerSweepService,
	NO_PIECES_GRACE_MS,
	REMOVAL_GRACE_MS,
};
