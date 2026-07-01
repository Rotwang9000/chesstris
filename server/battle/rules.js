/**
 * Battle-arena rule hooks — pure functions over the `game` (world) object.
 *
 * The battles registry lives at `game.battles`:
 *   {
 *     [battleId]: {
 *       id, code, status: 'lobby'|'active'|'finished',
 *       centre: {x, z}, slot, seats: [{ playerId, controlledBy, isAi }], …
 *     }
 *   }
 *
 * Seat player records carry `battleId` so per-cell checks stay O(1); the
 * registry itself is only scanned for the (rare) "does this placement
 * trespass on someone's arena" keep-out test, and there are at most a
 * handful of live battles at a time.
 */

'use strict';

const cells = require('../game/cells');
const { isInsidePlayArea, isInsideKeepOut } = require('./geometry');

/** The battle this player is seated in (via their player record), or null. */
function seatBattleId(game, playerId) {
	const record = game?.players?.[playerId];
	return record && record.battleId ? String(record.battleId) : null;
}

/** The active battle object this player is seated in, or null. */
function activeBattleForSeat(game, playerId) {
	const battleId = seatBattleId(game, playerId);
	if (!battleId) return null;
	const battle = game?.battles?.[battleId];
	return battle && battle.status !== 'finished' ? battle : null;
}

/**
 * May this player treat the given battle-ring item as their own ground
 * (for adjacency and path-to-king)? Only seats of the same battle may.
 */
function ringItemUsableBy(game, item, playerId) {
	if (!cells.isBattleRingItem(item)) return false;
	const battleId = seatBattleId(game, playerId);
	return !!battleId && String(item.battleRing) === battleId;
}

/**
 * Arena-bounds check for a tetromino placement.
 *
 *  • A seated player must keep every cell of the shape inside their
 *    arena's play area (the ring is the wall — you cannot build on or
 *    beyond it).
 *  • Everyone else must stay out of every live arena's keep-out circle.
 *
 * @param {Object} game
 * @param {string} playerId
 * @param {Array<{x:number, z:number}>} shapeCells Absolute cell coords.
 * @returns {{valid: boolean, reason?: string, message?: string}}
 */
function validateArenaBounds(game, playerId, shapeCells) {
	const battle = activeBattleForSeat(game, playerId);

	if (battle && battle.centre) {
		for (const cell of shapeCells) {
			if (!isInsidePlayArea(battle.centre, cell.x, cell.z)) {
				return {
					valid: false,
					reason: 'outside_arena',
					message: 'You cannot build outside the battle arena',
				};
			}
		}
		return { valid: true };
	}

	const battles = game?.battles;
	if (battles) {
		for (const other of Object.values(battles)) {
			if (!other || other.status === 'finished' || !other.centre) continue;
			for (const cell of shapeCells) {
				if (isInsideKeepOut(other.centre, cell.x, cell.z)) {
					return {
						valid: false,
						reason: 'arena_reserved',
						message: 'That area is reserved for a battle arena',
					};
				}
			}
		}
	}

	return { valid: true };
}

module.exports = {
	seatBattleId,
	activeBattleForSeat,
	ringItemUsableBy,
	validateArenaBounds,
};
