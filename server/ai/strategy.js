/**
 * AI difficulty profiles and a couple of cheap heuristics shared by
 * the strategic-action helpers.
 */

const COMPUTER_DIFFICULTY = Object.freeze({
	EASY: 'easy',
	MEDIUM: 'medium',
	HARD: 'hard',
});

const MIN_COMPUTER_MOVE_INTERVAL_MS = Object.freeze({
	[COMPUTER_DIFFICULTY.EASY]: 15000,
	[COMPUTER_DIFFICULTY.MEDIUM]: 10000,
	[COMPUTER_DIFFICULTY.HARD]: 5000,
});

const AI_ROSTER_TEMPLATE = Object.freeze([
	{ label: 'Novice',   difficulty: COMPUTER_DIFFICULTY.EASY,   interval: MIN_COMPUTER_MOVE_INTERVAL_MS[COMPUTER_DIFFICULTY.EASY] },
	{ label: 'Standard', difficulty: COMPUTER_DIFFICULTY.MEDIUM, interval: MIN_COMPUTER_MOVE_INTERVAL_MS[COMPUTER_DIFFICULTY.MEDIUM] },
	{ label: 'Expert',   difficulty: COMPUTER_DIFFICULTY.HARD,   interval: MIN_COMPUTER_MOVE_INTERVAL_MS[COMPUTER_DIFFICULTY.HARD] },
]);

function generateComputerStrategy(difficulty) {
	switch (difficulty) {
		case COMPUTER_DIFFICULTY.EASY:
			return {
				aggressiveness: 0.2,
				defensiveness: 0.7,
				buildSpeed: 0.3,
				kingProtection: 0.8,
				explorationRate: 0.4,
			};
		case COMPUTER_DIFFICULTY.HARD:
			return {
				aggressiveness: 0.8,
				defensiveness: 0.4,
				buildSpeed: 0.8,
				kingProtection: 0.6,
				explorationRate: 0.7,
			};
		case COMPUTER_DIFFICULTY.MEDIUM:
		default:
			return {
				aggressiveness: 0.5,
				defensiveness: 0.5,
				buildSpeed: 0.5,
				kingProtection: 0.7,
				explorationRate: 0.5,
			};
	}
}

function labelForDifficulty(difficulty) {
	const entry = AI_ROSTER_TEMPLATE.find(t => t.difficulty === difficulty);
	return entry ? entry.label : 'Standard';
}

// ── Cheap board heuristics ─────────────────────────────────────────────────

function checkForThreatenedPieces(world, computerId) {
	const myPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) === String(computerId)
	);
	if (myPieces.length === 0) return false;

	const opponentPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) !== String(computerId)
	);
	for (const op of opponentPieces) {
		const opPos = op.position || op;
		for (const myP of myPieces) {
			const myPos = myP.position || myP;
			const dx = Math.abs(opPos.x - myPos.x);
			const dz = Math.abs(opPos.z - myPos.z);
			if (dx <= 2 && dz <= 2) return true;
		}
	}
	return false;
}

function isKingExposed(world, computerId) {
	const king = (world.chessPieces || []).find(
		p => p && String(p.player) === String(computerId)
			&& String(p.type).toUpperCase() === 'KING'
	);
	if (!king) return false;

	const kp = king.position || king;
	const cells = world.board?.cells || {};
	let neighbours = 0;
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			if (dx === 0 && dz === 0) continue;
			const key = `${kp.x + dx},${kp.z + dz}`;
			if (Array.isArray(cells[key]) && cells[key].length > 0) neighbours++;
		}
	}
	return neighbours < 3;
}

function hasAttackOpportunity(world, computerId) {
	const myPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) === String(computerId)
	);
	const opponentPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) !== String(computerId)
	);
	if (myPieces.length === 0 || opponentPieces.length === 0) return false;

	for (const mine of myPieces) {
		const mp = mine.position || mine;
		for (const opp of opponentPieces) {
			const op = opp.position || opp;
			if (Math.abs(mp.x - op.x) <= 1 && Math.abs(mp.z - op.z) <= 1) return true;
		}
	}
	return false;
}

module.exports = {
	COMPUTER_DIFFICULTY,
	MIN_COMPUTER_MOVE_INTERVAL_MS,
	AI_ROSTER_TEMPLATE,
	generateComputerStrategy,
	labelForDifficulty,
	checkForThreatenedPieces,
	isKingExposed,
	hasAttackOpportunity,
};
