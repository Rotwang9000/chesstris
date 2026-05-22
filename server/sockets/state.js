/**
 * `get_game_state` and `request_game_state` socket handlers.  These let
 * clients sync up to the authoritative world without waiting for the
 * next broadcast — used at boot, after reconnect and by spectators.
 *
 * `get_game_state` also supports an optional area-of-interest (AOI)
 * window so large global worlds can stream only the visible portion
 * of the board to a particular client.
 */

const World = require('../world/World');

function clipBoardToAoi(board, aoi) {
	if (!board || !aoi) return board;

	let minX;
	let maxX;
	let minZ;
	let maxZ;

	if (Number.isFinite(aoi.centerX) && Number.isFinite(aoi.centerZ) && Number.isFinite(aoi.radius)) {
		minX = aoi.centerX - aoi.radius;
		maxX = aoi.centerX + aoi.radius;
		minZ = aoi.centerZ - aoi.radius;
		maxZ = aoi.centerZ + aoi.radius;
	} else if (
		Number.isFinite(aoi.minX) && Number.isFinite(aoi.maxX)
		&& Number.isFinite(aoi.minZ) && Number.isFinite(aoi.maxZ)
	) {
		({ minX, maxX, minZ, maxZ } = aoi);
	} else {
		return board;
	}

	const view = { ...board, cells: {}, minX, maxX, minZ, maxZ };
	for (const [key, value] of Object.entries(board.cells || {})) {
		const [xStr, zStr] = String(key).split(',');
		const x = Number(xStr);
		const z = Number(zStr);
		if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
			view.cells[key] = value;
		}
	}
	return view;
}

function registerStateHandlers(socket, ctx) {
	const { playerId, broadcaster, activityLog } = ctx;

	if (activityLog) {
		socket.on('get_activity_log', (data, callback) => {
			try {
				const events = activityLog.snapshot();
				const response = { success: true, events };
				socket.emit('activity_log_snapshot', response);
				if (callback) callback(response);
			} catch (error) {
				console.error('Error sending activity log snapshot:', error);
				if (callback) callback({ success: false, error: 'Error fetching activity log' });
			}
		});
	}

	socket.on('get_game_state', (data, callback) => {
		try {
			const world = World.getWorld();
			if (!world) {
				const errorResponse = { success: false, error: 'World not initialised' };
				socket.emit('error', { message: errorResponse.error });
				if (callback) callback(errorResponse);
				return;
			}

			const player = World.getPlayer(playerId);
			if (!player) {
				socket.emit('error', { message: 'Player not registered' });
				return;
			}

			socket.join(world.id);

			const payload = broadcaster.buildGameStatePayload(world);
			const options = (data && typeof data === 'object') ? data.options : null;
			const aoi = options && typeof options === 'object' ? options.aoi : null;

			let board = world.board;
			if (aoi) board = clipBoardToAoi(world.board, aoi);

			const response = {
				success: true,
				gameId: world.id,
				state: { ...payload, board },
				players: broadcaster.buildPlayersList(world),
				timestamp: Date.now(),
			};

			socket.emit('game_state', response);
			if (callback) callback(response);
		} catch (error) {
			console.error('Error handling get_game_state request:', error);
			socket.emit('error', { message: 'Error getting game state' });
			if (callback) callback({ success: false, error: 'Error getting game state' });
		}
	});

	socket.on('request_game_state', (data) => {
		if (!data || !data.playerId) return;

		const world = World.getWorld();
		if (!world) return;

		broadcaster.emitFullStateTo(socket);
	});
}

module.exports = { registerStateHandlers };
