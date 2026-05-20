/**
 * King's Duel mini-game.
 *
 * When two players capture each other's kings within
 * `SIMULTANEOUS_CAPTURE_WINDOW_MS`, neither capture is processed
 * immediately.  Instead they enter a hidden-information mini-game: both
 * players secretly place a token on a 4×2 grid and guess where the
 * opponent placed theirs.  Whoever guesses correctly (and is the only one
 * to do so) wins the duel; ties trigger a new round, and after
 * `KING_DUEL_MAX_ROUNDS` of draws we fall back to a coin flip.
 */

const Sessions = require('../world/Sessions');
const World = require('../world/World');
const { GAME_RULES } = require('../game/Constants');

function createKingDuelService({ io, kingCaptureService }) {
	if (!io) throw new Error('createKingDuelService: io required');
	if (!kingCaptureService) throw new Error('createKingDuelService: kingCaptureService required');

	const pendingDuels = new Map();

	function startDuel(playerAId, playerBId) {
		const world = World.getWorld();
		if (!world) return null;

		const duelId = `duel_${playerAId}_${playerBId}_${Date.now()}`;
		const cols = GAME_RULES.KING_DUEL_GRID_COLS || 4;
		const rows = GAME_RULES.KING_DUEL_GRID_ROWS || 2;
		const totalCells = cols * rows;

		const duel = {
			player1: { id: playerAId },
			player2: { id: playerBId },
			gameId: world.id,
			gridCols: cols,
			gridRows: rows,
			round: 1,
			responses: {},
			resolved: false,
			timeout: setTimeout(() => autoCompleteAndResolve(duelId, totalCells),
				GAME_RULES.KING_DUEL_TIMEOUT_MS || 10000),
		};

		pendingDuels.set(duelId, duel);

		const duelPayload = { duelId, gridCols: cols, gridRows: rows };
		const playerA = World.getPlayer(playerAId);
		const playerB = World.getPlayer(playerBId);

		const sockA = Sessions.socketForPlayer(playerAId);
		const sockB = Sessions.socketForPlayer(playerBId);
		if (sockA) sockA.emit('king_duel_start', { ...duelPayload, opponentName: playerB?.name || playerBId });
		if (sockB) sockB.emit('king_duel_start', { ...duelPayload, opponentName: playerA?.name || playerAId });

		io.to(world.id).emit('king_duel_announced', {
			player1: playerAId,
			player2: playerBId,
			player1Name: playerA?.name || playerAId,
			player2Name: playerB?.name || playerBId,
		});

		console.log(`King's Duel initiated: ${playerAId} vs ${playerBId} (duel ${duelId})`);
		return duelId;
	}

	function recordResponse(duelId, playerId, placement, guess) {
		const duel = pendingDuels.get(duelId);
		if (!duel || duel.resolved) return { success: false, error: 'No active duel' };

		if (duel.responses[playerId]) {
			return { success: false, error: 'Already responded' };
		}

		const totalCells = duel.gridCols * duel.gridRows;
		const clamp = (value) => Math.max(0, Math.min(totalCells - 1, Math.floor(Number(value) || 0)));

		duel.responses[playerId] = {
			placement: clamp(placement),
			guess: clamp(guess),
		};

		console.log(`King's Duel response from ${playerId}: place=${clamp(placement)}, guess=${clamp(guess)}`);

		if (duel.responses[duel.player1.id] && duel.responses[duel.player2.id]) {
			resolveDuel(duelId);
		}

		return { success: true };
	}

	function autoCompleteAndResolve(duelId, totalCells) {
		const duel = pendingDuels.get(duelId);
		if (!duel || duel.resolved) return;
		const randomCell = () => Math.floor(Math.random() * totalCells);
		if (!duel.responses[duel.player1.id]) {
			duel.responses[duel.player1.id] = { placement: randomCell(), guess: randomCell() };
		}
		if (!duel.responses[duel.player2.id]) {
			duel.responses[duel.player2.id] = { placement: randomCell(), guess: randomCell() };
		}
		resolveDuel(duelId);
	}

	function resolveDuel(duelId) {
		const duel = pendingDuels.get(duelId);
		if (!duel || duel.resolved) return;
		clearTimeout(duel.timeout);

		const { player1, player2, gameId } = duel;
		const r1 = duel.responses[player1.id];
		const r2 = duel.responses[player2.id];

		const p1Guessed = !!(r1 && r2 && r1.guess === r2.placement);
		const p2Guessed = !!(r2 && r1 && r2.guess === r1.placement);

		const roundPayload = {
			duelId,
			round: duel.round,
			player1Placement: r1?.placement ?? -1,
			player1Guess: r1?.guess ?? -1,
			player2Placement: r2?.placement ?? -1,
			player2Guess: r2?.guess ?? -1,
			player1Guessed: p1Guessed,
			player2Guessed: p2Guessed,
			player1Id: player1.id,
			player2Id: player2.id,
		};

		if (p1Guessed && !p2Guessed) {
			finaliseDuel(duel, duelId, player1.id, player2.id, roundPayload);
			return;
		}
		if (p2Guessed && !p1Guessed) {
			finaliseDuel(duel, duelId, player2.id, player1.id, roundPayload);
			return;
		}

		const maxRounds = GAME_RULES.KING_DUEL_MAX_ROUNDS || 5;
		if (duel.round >= maxRounds) {
			const victorId = Math.random() < 0.5 ? player1.id : player2.id;
			const loserId = victorId === player1.id ? player2.id : player1.id;
			console.log(`King's Duel max rounds reached, random winner: ${victorId}`);
			finaliseDuel(duel, duelId, victorId, loserId, { ...roundPayload, maxRoundsReached: true });
			return;
		}

		console.log(
			`King's Duel round ${duel.round} draw (both=${p1Guessed && p2Guessed}, neither=${!p1Guessed && !p2Guessed})`
		);
		io.to(gameId).emit('king_duel_round_result', roundPayload);
		setTimeout(() => startNewRound(duel, duelId), 2500);
	}

	function startNewRound(duel, duelId) {
		duel.round++;
		duel.responses = {};

		const totalCells = duel.gridCols * duel.gridRows;
		duel.timeout = setTimeout(() => autoCompleteAndResolve(duelId, totalCells),
			GAME_RULES.KING_DUEL_TIMEOUT_MS || 10000);

		const newRoundPayload = {
			duelId,
			round: duel.round,
			gridCols: duel.gridCols,
			gridRows: duel.gridRows,
		};

		const sockA = Sessions.socketForPlayer(duel.player1.id);
		const sockB = Sessions.socketForPlayer(duel.player2.id);
		if (sockA) sockA.emit('king_duel_new_round', newRoundPayload);
		if (sockB) sockB.emit('king_duel_new_round', newRoundPayload);
	}

	function finaliseDuel(duel, duelId, victorId, loserId, roundPayload) {
		duel.resolved = true;
		pendingDuels.delete(duelId);
		console.log(`King's Duel resolved: ${victorId} wins on round ${duel.round}`);

		io.to(duel.gameId).emit('king_duel_result', {
			...roundPayload,
			victorId,
			loserId,
		});

		kingCaptureService.executeKingCapture(victorId, loserId);
	}

	function reset() {
		for (const duel of pendingDuels.values()) {
			clearTimeout(duel.timeout);
		}
		pendingDuels.clear();
	}

	return {
		startDuel,
		recordResponse,
		reset,
	};
}

module.exports = { createKingDuelService };
