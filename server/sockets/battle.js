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
				botDifficulty: data?.botDifficulty,
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
			// With multi-battle membership the client says WHICH lobby to
			// start; legacy clients (no id) start their first hosted lobby.
			const requested = data?.battleId || data?.code || null;
			const battle = requested
				? (battleManager.getBattle(requested) || battleManager.battleByCode(requested))
				: battleManager.battlesForPlayer(playerId)
					.find(b => b.status === 'lobby' && String(b.hostId) === String(playerId))
					|| battleManager.battleForPlayer(playerId);
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
			const result = battleManager.leaveBattle({
				playerId,
				battleId: data?.battleId || data?.code || null,
			});
			if (typeof callback === 'function') callback(result);
		} catch (err) {
			console.error('[Battle] battle_leave failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});

	socket.on('battle_state', (data, callback) => {
		try {
			const all = battleManager.battlesForPlayer(playerId);
			const focusId = socket.data?.focusedBattleId;
			const focused = (focusId && all.find(b => String(b.id) === String(focusId))) || all[0] || null;
			const result = {
				success: true,
				battle: focused ? battleManager.publicState(focused) : null,
				battles: all.map(b => battleManager.publicState(b)),
			};
			if (typeof callback === 'function') callback(result);
		} catch (err) {
			console.error('[Battle] battle_state failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});

	// The client's current VIEW: a battle id (act as that battle's seat),
	// or null for the world (act as the real player). Focus is per
	// SOCKET, so two tabs can watch two different battles.
	socket.on('battle_focus', (data, callback) => {
		try {
			const battleId = data?.battleId ?? null;
			if (battleId === null) {
				socket.data.focusedBattleId = null;
			} else {
				const battle = battleManager.getBattle(battleId) || battleManager.battleByCode(battleId);
				if (!battle) {
					if (typeof callback === 'function') callback({ success: false, error: 'Battle not found' });
					return;
				}
				socket.data.focusedBattleId = String(battle.id);
			}
			if (typeof callback === 'function') callback({ success: true, focusedBattleId: socket.data.focusedBattleId });
		} catch (err) {
			console.error('[Battle] battle_focus failed:', err);
			if (typeof callback === 'function') callback({ success: false, error: 'Server error' });
		}
	});
}

module.exports = { registerBattleHandlers };
