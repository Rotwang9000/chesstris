/**
 * Viking longship socket handlers:
 *   • ship_sail {shipId, to:{x,z}} → ack {success, error?, reason?, readyAt?}
 *
 * A sail IS the turn's chess move (owner, 2026-11-15): it honours and
 * stamps the chess cooldown like chess_move, and the client moves on to
 * the tetris phase on success. The guard list mirrors chess_move's, in
 * order:
 *
 *   1. the acting seat exists, isn't eliminated and isn't paused;
 *   2. it sits in an ACTIVE battle that plays the Viking edition, or
 *      is a main-world kingdom with world longships on (worldShips.js);
 *   3. the ship exists and this seat controls it;
 *   4. the ship has finished rowing;
 *   5. the leg is integer, orthogonal, within range (battle 5, world 8),
 *      all open water.
 *
 * (3–5 live in ships.sail so the bots and tests share them.)
 */

'use strict';

const World = require('../world/World');
const { PLAYER_SETTINGS } = require('../game/Constants');
const { getCooldownRemainingMs } = require('../utils/cooldowns');
const ships = require('../battle/ships');
const worldShips = require('../world/worldShips');
const { afterSail } = require('../world/sailEffects');

function registerBoatHandlers(socket, ctx) {
	const { playerId: boundPlayerId, broadcaster, integrityService, persistence } = ctx;
	// While in an active battle the socket acts as its SEAT id.
	const actingPlayerId = typeof ctx.resolveActingPlayerId === 'function'
		? ctx.resolveActingPlayerId
		: () => boundPlayerId;

	socket.on('ship_sail', (data, callback) => {
		const ack = typeof callback === 'function' ? callback : () => {};
		const refuse = (reason, error) => ack({ success: false, reason, error });
		try {
			const playerId = actingPlayerId();
			const player = World.getPlayer(playerId);
			if (!player) return refuse('not_registered', 'Not registered');

			// 1. Eliminated players are out; paused players are protected,
			// so letting them sail would make pause a free shield.
			if (player.eliminated) return refuse('eliminated', 'You have been eliminated — your king is gone.');
			if (player.paused) return refuse('paused', 'You are paused — press Resume to play.');

			const cooldown = getCooldownRemainingMs(player, 'lastChessMoveAt', PLAYER_SETTINGS.CHESS_MOVE_COOLDOWN_MS);
			if (cooldown > 0) return ack({ success: false, reason: 'rate_limited', error: 'rate_limited', retryAfterMs: cooldown });

			// 2. Seats of an active Viking battle, or main-world kingdoms
			// once world longships are on, have ships to sail.
			const world = World.getWorld();
			const battle = ships.vikingBattleOf(world, playerId);
			const inWorld = !battle && worldShips.appliesTo(world, playerId);
			if (!inWorld && (!battle || battle.status !== 'active')) {
				return refuse('not_viking', 'There are no longships in this game.');
			}

			const shipId = data && typeof data === 'object' ? data.shipId : null;
			const to = data && typeof data === 'object' ? data.to : null;
			const now = Date.now();
			const result = inWorld
				? worldShips.sail(world, playerId, { shipId, to }, { now })
				: ships.sail(world, battle, playerId, { shipId, to }, { now });
			if (!result.success) return refuse(result.reason, result.error);

			// Exactly what follows every sail, bot or human (sailEffects).
			const orbClaims = afterSail({
				world, playerId, player, result, battle: inWorld ? null : battle, now,
				powerUpManager: ctx.powerUpManager, integrityService, persistence, broadcaster, io: ctx.io,
			});

			return ack({
				success: true,
				...result.event,
				orbs: orbClaims.filter(c => c && !c.skipped).map(c => ({
					pieceType: c.piece ? c.piece.type : (c.ship ? 'SHIP' : c.orb?.pieceType),
				})),
			});
		} catch (err) {
			console.error('[Ships] ship_sail failed:', err);
			return refuse('server_error', 'Server error');
		}
	});
}

module.exports = { registerBoatHandlers };
