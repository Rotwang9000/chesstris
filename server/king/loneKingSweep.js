/**
 * Lone-king auto-detonation sweep.
 *
 * The AI runner already handles its own bots — if an AI player ends up with
 * just a king left, the next AI tick fires `kingDetonationService.detonateKing`
 * straight away. But human players (including guests that never made it past
 * "Player_abc123") have no such safety net: they sit on the board indefinitely
 * with their lone king blocking real estate, confusing the camera, and
 * inflating the player list.
 *
 * This periodic sweep picks them up:
 *   1. Find every non-eliminated player with exactly one chess piece (a king).
 *   2. The first time we see them in this state, stamp the timestamp.
 *   3. Once they've been in that state for `LONE_KING_GRACE_MS` and haven't
 *      taken any action since the stamp, detonate. Active players who have
 *      moved their king since stamping get a fresh grace window — they're
 *      clearly still engaged.
 *
 * The sweep is intentionally idempotent: re-running it does nothing if the
 * player has already been detonated, eliminated, or recovered (e.g. via a
 * pawn promotion).
 */

const World = require('../world/World');

// How long a player can sit with only a king before the sweep cleans them
// up. Long enough that an actively-deciding human can either move their
// king to a meaningful position, accept their fate, or hit "detonate" —
// short enough that abandoned guests don't clog the board for hours.
const LONE_KING_GRACE_MS = 60 * 1000;

function createLoneKingSweepService({ kingDetonationService, broadcaster, persistence, activityLog = null }) {
	if (!kingDetonationService) throw new Error('createLoneKingSweepService: kingDetonationService required');
	if (!broadcaster) throw new Error('createLoneKingSweepService: broadcaster required');
	if (!persistence) throw new Error('createLoneKingSweepService: persistence required');

	// playerId → { since, kingPieceId, lastActionAt }
	const loneSince = new Map();

	function getKingsOnlyPlayers(world) {
		const byPlayer = new Map();
		for (const piece of world.chessPieces || []) {
			if (!piece || !piece.player) continue;
			const list = byPlayer.get(String(piece.player)) || [];
			list.push(piece);
			byPlayer.set(String(piece.player), list);
		}
		const result = [];
		for (const [playerId, pieces] of byPlayer) {
			if (pieces.length !== 1) continue;
			if (String(pieces[0].type || '').toUpperCase() !== 'KING') continue;
			result.push({ playerId, kingPiece: pieces[0] });
		}
		return result;
	}

	function lastActionAt(player) {
		if (!player) return 0;
		return Math.max(
			Number(player.lastTetrominoPlacementAt) || 0,
			Number(player.lastChessMoveAt) || 0,
			Number(player.lastActiveAt) || 0,
			Number(player.lastMoveTime) || 0,
		);
	}

	function tick() {
		try {
			const world = World.getWorld();
			if (!world || !Array.isArray(world.chessPieces)) return;

			const candidates = getKingsOnlyPlayers(world);
			const liveIds = new Set(candidates.map(c => c.playerId));

			// Forget bookkeeping for players who recovered or left.
			for (const playerId of [...loneSince.keys()]) {
				if (!liveIds.has(playerId)) loneSince.delete(playerId);
			}

			const now = Date.now();
			let anyTriggered = false;

			for (const { playerId, kingPiece } of candidates) {
				const player = World.getPlayer(playerId);
				if (!player || player.eliminated || player.pendingRespawn) continue;

				const currentAction = lastActionAt(player);
				const existing = loneSince.get(playerId);
				if (!existing) {
					loneSince.set(playerId, {
						since: now,
						kingPieceId: kingPiece.id,
						lastActionAt: currentAction,
					});
					continue;
				}

				// If the player did something since we stamped them, reset
				// the timer — they're clearly still engaged.
				if (currentAction > existing.lastActionAt) {
					existing.since = now;
					existing.kingPieceId = kingPiece.id;
					existing.lastActionAt = currentAction;
					continue;
				}

				if (now - existing.since < LONE_KING_GRACE_MS) continue;

				const reason = player.isComputer ? 'ai_lone_king' : 'lone_king_sweep';
				console.log(
					`[LoneKingSweep] ${playerId} has been lone-king for ` +
					`${Math.round((now - existing.since) / 1000)}s — detonating (${reason}).`
				);
				player.pendingRespawn = true;
				player.eliminated = true;

				// `kingDetonationService.detonateKing` now emits the
				// `king_detonation` activity-log event itself (and the
				// per-piece collateral) so we don't duplicate it here —
				// the sweep just provides the `reason` field.

				const result = kingDetonationService.detonateKing({
					playerId,
					kingPieceId: kingPiece.id,
					reason,
					onComplete: () => {
						loneSince.delete(playerId);
					},
				});

				if (!result.success) {
					console.warn(
						`[LoneKingSweep] Failed to detonate ${playerId}: ${result.error || 'unknown'}`
					);
					player.pendingRespawn = false;
					player.eliminated = false;
					continue;
				}
				anyTriggered = true;
			}

			if (anyTriggered) {
				persistence.markDirty();
				broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
			}
		} catch (error) {
			console.error('[LoneKingSweep] Error during sweep tick:', error);
		}
	}

	function reset() {
		loneSince.clear();
	}

	return { tick, reset, LONE_KING_GRACE_MS };
}

module.exports = {
	createLoneKingSweepService,
	LONE_KING_GRACE_MS,
};
