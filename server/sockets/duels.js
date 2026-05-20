/**
 * King's Duel response socket handler.  Each player submits their
 * placement / guess pair; the duel service resolves the round when both
 * are in.
 */

function registerDuelHandlers(socket, ctx) {
	const { playerId, kingDuelService } = ctx;

	socket.on('king_duel_response', (data, callback) => {
		try {
			const { duelId, placement, guess } = data || {};
			const result = kingDuelService.recordResponse(duelId, playerId, placement, guess);
			if (callback) callback(result);
		} catch (error) {
			console.error('Error handling king_duel_response:', error);
			if (callback) callback({ success: false, error: error.message });
		}
	});
}

module.exports = { registerDuelHandlers };
