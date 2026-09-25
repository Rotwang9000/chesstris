/**
 * AI difficulty profiles and board heuristics shared by the strategic
 * action helpers and the runner's action picker.
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

/**
 * Expert used to farm (buildSpeed 0.8) and never hunt — aggressiveness
 * only mattered once an enemy was already adjacent (Chebyshev ≤1), so
 * a "hard" bot could vacuum power-ups for weeks with capturedCount 0.
 * explorationRate now actually drives placement/chess bias in actions.js.
 */
function generateComputerStrategy(difficulty) {
	switch (difficulty) {
		case COMPUTER_DIFFICULTY.EASY:
			return {
				aggressiveness: 0.25,
				defensiveness: 0.7,
				buildSpeed: 0.45,
				kingProtection: 0.8,
				explorationRate: 0.35,
				huntRadius: 3,
			};
		case COMPUTER_DIFFICULTY.HARD:
			return {
				aggressiveness: 0.9,
				defensiveness: 0.35,
				buildSpeed: 0.4,
				kingProtection: 0.55,
				explorationRate: 0.85,
				huntRadius: 10,
			};
		case COMPUTER_DIFFICULTY.MEDIUM:
		default:
			return {
				aggressiveness: 0.55,
				defensiveness: 0.5,
				buildSpeed: 0.5,
				kingProtection: 0.7,
				explorationRate: 0.55,
				huntRadius: 6,
			};
	}
}

function labelForDifficulty(difficulty) {
	const entry = AI_ROSTER_TEMPLATE.find(t => t.difficulty === difficulty);
	return entry ? entry.label : 'Standard';
}

function chebyshev(a, b) {
	if (!a || !b) return Infinity;
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

function manhattan(a, b) {
	if (!a || !b) return Infinity;
	return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

function piecePos(piece) {
	if (!piece) return null;
	const p = piece.position || piece;
	if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
	return { x: p.x, z: p.z };
}

/** Nearest opposing king (or any opposing piece if no king). */
function nearestEnemyFocus(world, computerId) {
	const opponents = (world.chessPieces || []).filter(
		p => p && String(p.player) !== String(computerId)
	);
	if (opponents.length === 0) return null;

	const myPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) === String(computerId)
	);
	const myOrigin = piecePos(myPieces.find(p => String(p.type || '').toUpperCase() === 'KING'))
		|| piecePos(myPieces[0]);
	if (!myOrigin) return null;

	const kings = opponents.filter(p => String(p.type || '').toUpperCase() === 'KING');
	const pool = kings.length > 0 ? kings : opponents;
	let best = null;
	let bestDist = Infinity;
	for (const opp of pool) {
		const pos = piecePos(opp);
		if (!pos) continue;
		const d = manhattan(myOrigin, pos);
		if (d < bestDist) {
			bestDist = d;
			best = { piece: opp, position: pos, distance: d };
		}
	}
	return best;
}

function strategyFor(world, computerId) {
	const player = world?.players?.[computerId];
	return player?.strategy || generateComputerStrategy(COMPUTER_DIFFICULTY.MEDIUM);
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
	const radius = Math.max(2, Math.round((strategyFor(world, computerId).huntRadius || 4) / 3));
	for (const op of opponentPieces) {
		const opPos = piecePos(op);
		if (!opPos) continue;
		for (const myP of myPieces) {
			const myPos = piecePos(myP);
			if (!myPos) continue;
			if (chebyshev(opPos, myPos) <= radius) return true;
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

	const kp = piecePos(king);
	if (!kp) return false;
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

/**
 * True when any of our pieces can currently capture, OR an enemy sits
 * inside the difficulty's hunt radius (so Expert starts chess-marching
 * long before contact).
 */
function hasAttackOpportunity(world, computerId) {
	const myPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) === String(computerId)
	);
	const opponentPieces = (world.chessPieces || []).filter(
		p => p && String(p.player) !== String(computerId)
	);
	if (myPieces.length === 0 || opponentPieces.length === 0) return false;

	const radius = Number(strategyFor(world, computerId).huntRadius) || 4;
	for (const mine of myPieces) {
		const mp = piecePos(mine);
		if (!mp) continue;
		for (const opp of opponentPieces) {
			const op = piecePos(opp);
			if (!op) continue;
			if (chebyshev(mp, op) <= radius) return true;
		}
	}
	return false;
}

/** True when any enemy kingdom is close enough that bridging is worthwhile. */
function hasEnemyInTheatre(world, computerId) {
	const focus = nearestEnemyFocus(world, computerId);
	if (!focus) return false;
	const radius = (Number(strategyFor(world, computerId).huntRadius) || 4) * 4;
	return focus.distance <= Math.max(24, radius);
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
	hasEnemyInTheatre,
	nearestEnemyFocus,
	chebyshev,
	manhattan,
	piecePos,
};
