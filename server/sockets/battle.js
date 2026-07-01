/**
 * Battle-arena socket handlers: create / join / start / leave / state.
 *
 * All events act on the REAL player id bound to the socket — the
 * BattleManager maps it to a seat. Gameplay events (tetromino / chess)
 * resolve their acting id separately via `ctx.resolveActingPlayerId`.
 */

const World = require('../world/World');

function registerBattleHandlers(socket, ctx) {
	const { playerId, battleManager } = ctx;
	if (!battleManager) return;

	socket.on('battle_create', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (typeof callback === 'function') callback({ success: false, error: 'Not registered' });
				return;
			}
			const result = battleManager.createBattle({
				hostId: playerId,
				hostName: player.name || 'Player 1',
				seatCount: Number(data?.seatCount) || 2,
			});
			if (typeof callback === 'function') callback(result);
		} catch (err) {
			console.error('[Battle] battle_create failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});

	socket.on('battle_join', (data, callback) => {
		try {
			const player = World.getPlayer(playerId);
			if (!player) {
				if (typeof callback === 'function') callback({ success: false, error: 'Not registered' });
				return;
			}
			const result = battleManager.joinBattle({
				code: data?.code,
				playerId,
				playerName: player.name || 'Player',
			});
			if (typeof callback === 'function') callback(result);
		} catch (err) {
			console.error('[Battle] battle_join failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});

	socket.on('battle_start', (data, callback) => {
		try {
			const battle = battleManager.battleForPlayer(playerId);
			const result = battle
				? battleManager.startBattle({ battleId: battle.id, playerId })
				: { success: false, error: 'You are not in a battle' };
			if (typeof callback === 'function') callback(result);
		} catch (err) {
			console.error('[Battle] battle_start failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});

	socket.on('battle_leave', (data, callback) => {
		try {
			const result = battleManager.leaveBattle({ playerId });
			if (typeof callback === 'function') callback(result);
		} catch (err) {
			console.error('[Battle] battle_leave failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});

	socket.on('battle_state', (data, callback) => {
		try {
			const battle = battleManager.battleForPlayer(playerId);
			const result = battle
				? { success: true, battle: battleManager.publicState(battle) }
				: { success: true, battle: null };
			if (typeof callback === 'function') callback(result);
		} catch (err) {
			console.error('[Battle] battle_state failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});
}

module.exports = { registerBattleHandlers };
