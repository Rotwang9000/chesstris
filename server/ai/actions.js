/**
 * Strategic action selection for AI players.  Both
 * `performStrategicTetrominoPlacement` and `performStrategicChessMove`
 * mutate the world directly and broadcast the resulting state — they
 * are stateless from the AI's perspective other than reading the player's
 * `lastTetrominoPlacement` marker.
 */

const World = require('../world/World');
const { checkForDefender, checksByAttacker } = require('../king/pendingChecks');
const cells = require('../game/cells');
const pieces = require('../game/pieces');
const { GAME_RULES } = require('../game/Constants');
// Shared with the human chess handler so AI pawns freeze identically.
const { markPawnAwaitingPromotion } = require('../game/promotion');
const { activeBattleForSeat } = require('../battle/rules');
// Viking longships: the same classify-and-announce hook as the human
// chess handler, so bot embarks, raids and seizures look identical.
const ships = require('../battle/ships');
const shipRules = require('../battle/shipRules');
const shipPlanner = require('./shipPlanner');
const { SEA, hasSea, sinkAtMs } = require('../battle/sea');
const {
	nearestEnemyFocus,
	manhattan,
	piecePos,
	generateComputerStrategy,
	COMPUTER_DIFFICULTY,
} = require('./strategy');

const PROMOTABLE_CAPTURE_TYPES = Object.freeze(
	new Set(['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN'])
);

const TETROMINO_TYPES = Object.freeze(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);

/**
 * Longest slide the move enumerator considers for rooks/bishops/queens.
 * Board clusters (organic islands and battle arenas alike) are ~30
 * cells across, and path validation stops at the first gap anyway.
 */
const MAX_ENUMERATED_SLIDE = 14;

const KNIGHT_OFFSETS = Object.freeze([
	[1, 2], [2, 1], [-1, 2], [-2, 1],
	[1, -2], [2, -1], [-1, -2], [-2, -1],
]);
const ORTHOGONAL_DIRS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
/** What a bot most wants to save from the sea. */
const SEA_RESCUE_ORDER = Object.freeze({ KING: 100, QUEEN: 9, ROOK: 5, BISHOP: 3, KNIGHT: 3, PAWN: 1 });

/**
 * Quick battles: sort a bot's candidate moves against the rising sea.
 * A cell is "doomed" if it sinks before the bot is likely to move
 * again. Moves onto doomed cells are dropped (unless nothing else is
 * left), and moves that carry a piece off a doomed cell come back as
 * `escapes`, most valuable piece first — the king above all.
 *
 * Viking battles pass `isShipSquare` (and `lifeboatSinkAt`): a longship
 * can sail away on the bot's next tick, so it is safe until its OWN
 * square's time comes rather than the wider horizon. That keeps a
 * passenger aboard instead of scrambling ashore, and lets a piece on
 * doomed ground take to an empty ship as a lifeboat. For ranking
 * escapes a ship counts as lasting as long as the latest water it can
 * reach. Without these options the triage is exactly as before.
 */
function triageForSea(battle, captures, quiet, {
	now = Date.now(), moveIntervalMs = 10000, isShipSquare = null, lifeboatSinkAt = null,
} = {}) {
	if (!hasSea(battle)) return { captures, quiet, escapes: [] };
	const horizon = now + Math.max(SEA.WARNING_MS * 2, moveIntervalMs * 1.5);
	// Afloat until the bot's next tick is enough: it sails then.
	const shipHorizon = Math.min(horizon, now + moveIntervalMs * 1.25 + 1000);
	const onShip = (x, z) => !!isShipSquare && isShipSquare(x, z);
	const doomed = (x, z) => sinkAtMs(battle, x, z) <= (onShip(x, z) ? shipHorizon : horizon);
	const lastsUntil = (x, z) => (onShip(x, z) && lifeboatSinkAt
		? lifeboatSinkAt(x, z)
		: sinkAtMs(battle, x, z));
	const safeTarget = c => !doomed(c.target.x, c.target.z);
	// Most valuable piece first; for each piece, the ground the sea
	// reaches LAST (usually inward), or the next lap catches it again.
	const value = c => SEA_RESCUE_ORDER[String(c.piece.type).toUpperCase()] || 0;
	const escapes = captures.concat(quiet)
		.filter(c => safeTarget(c) && doomed(c.piece.position.x, c.piece.position.z))
		.sort((a, b) => (value(b) - value(a))
			|| (lastsUntil(b.target.x, b.target.z) - lastsUntil(a.target.x, a.target.z)));
	const safeCaptures = captures.filter(safeTarget);
	const safeQuiet = quiet.filter(safeTarget);
	if (safeCaptures.length + safeQuiet.length === 0) return { captures, quiet, escapes };
	return { captures: safeCaptures, quiet: safeQuiet, escapes };
}
const DIAGONAL_DIRS = Object.freeze([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
/**
 * Viking: what stepping onto an enemy's empty ship is worth, in squares
 * of progress toward the enemy. Enough to beat a few squares of detour:
 * the enemy loses its raider until the 45 s rebuild, and we gain one.
 */
const SEIZE_BONUS = 5;

function createAiActions({
	io, gameManager, broadcaster, integrityService, spectatorRegistry, lineClearService,
	powerUpManager = null,
}) {
	if (!io) throw new Error('createAiActions: io required');
	if (!gameManager) throw new Error('createAiActions: gameManager required');
	if (!broadcaster) throw new Error('createAiActions: broadcaster required');
	if (!integrityService) throw new Error('createAiActions: integrityService required');
	if (!lineClearService) throw new Error('createAiActions: lineClearService required');

	function performStrategicTetrominoPlacement(computerId) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer) return false;

		const board = world.board;
		const pieceType = TETROMINO_TYPES[Math.floor(Math.random() * TETROMINO_TYPES.length)];
		const rotation = Math.floor(Math.random() * 4);
		const shape = gameManager.tetrominoManager.getTetrisPieceShape(pieceType, rotation);
		if (!shape) return false;

		const anchors = collectPlacementAnchors(world, computerId);
		if (anchors.length === 0) return false;

		const strategy = computerPlayer.strategy
			|| generateComputerStrategy(computerPlayer.difficulty || COMPUTER_DIFFICULTY.MEDIUM);
		const enemyFocus = nearestEnemyFocus(world, computerId);
		const explore = Math.max(0, Math.min(1, Number(strategy.explorationRate) || 0.5));
		const orderedAnchors = orderAnchorsTowardEnemy(anchors, enemyFocus, explore);

		const maxAttempts = 60;
		const offsetRange = 4;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const window = Math.min(orderedAnchors.length, Math.max(3, Math.ceil(orderedAnchors.length * 0.35)));
			const anchor = orderedAnchors[Math.floor(Math.random() * window)];
			const { dx, dz } = placementOffsetTowardEnemy(anchor, enemyFocus, offsetRange, explore);
			const x = anchor.x + dx;
			const z = anchor.z + dz;

			const tetromino = {
				pieceType,
				type: pieceType,
				rotation,
				shape,
				position: { x, z },
			};

			const canPlace = gameManager.tetrominoManager.canPlaceTetromino(
				world, tetromino, x, z, 0, computerId
			);
			if (!canPlace) continue;

			const placedCells = gameManager.tetrominoManager.placeTetromino(world, tetromino, x, z, computerId);
			computerPlayer.lastTetrominoPlacement = { x, z };
			computerPlayer.lastTetrominoPlacementAt = Date.now();
			computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;

			if (powerUpManager && typeof powerUpManager.claimAcrossPlacement === 'function') {
				try {
					powerUpManager.claimAcrossPlacement(world, computerId, placedCells);
				} catch (claimErr) {
					console.warn('[AI] power-up claim failed:', claimErr.message);
				}
			}

			// IMPORTANT: do NOT run island integrity here. The human
			// placement path deliberately defers it to the tail of the
			// line-clear cascade (see server/sockets/tetromino.js and
			// LineClearService.runCascade) so gravity can reconnect
			// stranded cells before anything is decayed. Running it
			// pre-cascade here was stripping OTHER players' pieces/cells
			// when an AI cleared a row — the "AI Expert cleared my far
			// cells / my Queen's wings failed" report. The cascade's
			// final integrity pass handles orphans correctly.
			world.lastAction = {
				type: 'tetromino_placed',
				playerId: computerId,
				data: { pieceType, rotation, x, z },
			};
			World.markDirty();

			broadcaster.broadcastGameUpdate();

			// Animated cascade; players see the same pre-clear flash that
			// human placements produce. We don't await — the AI tick
			// continues on its own schedule.
			lineClearService.runCascade({ world, playerId: computerId }).catch((error) => {
				console.error(`[AI] line-clear cascade failed for ${computerId}:`, error);
			});

			if (spectatorRegistry) spectatorRegistry.broadcastUpdate(computerId, world);
			return true;
		}
		return false;
	}

	function collectPlacementAnchors(world, computerId) {
		const anchors = [];
		const boardCells = world.board?.cells;

		if (boardCells) {
			for (const [key, cellContents] of Object.entries(boardCells)) {
				if (!Array.isArray(cellContents) || cellContents.length === 0) continue;
				// A longship is never ground to build from (Viking rule 8).
				if (shipRules.cellHasShip(cellContents)) continue;
				const ownsNonHome = cellContents.some(
					item => item && item.player === computerId && item.type !== 'home'
				);
				if (!ownsNonHome) continue;
				const [x, z] = key.split(',').map(Number);
				if (Number.isFinite(x) && Number.isFinite(z)) anchors.push({ x, z });
			}
		}

		if (anchors.length === 0) {
			const king = (world.chessPieces || []).find(
				p => p && p.player === computerId && p.type === 'KING' && p.position
			);
			if (king) anchors.push({ x: king.position.x, z: king.position.z });
		}

		return anchors;
	}

	/**
	 * Sort anchors by distance to the nearest enemy; with high
	 * explorationRate the front of the list is used more often so
	 * Expert builds a bridge instead of farming its own backyard.
	 */
	function orderAnchorsTowardEnemy(anchors, enemyFocus, explore) {
		if (!enemyFocus?.position || explore < 0.15 || anchors.length < 2) {
			return anchors.slice();
		}
		const scored = anchors.map(a => ({
			a,
			d: manhattan(a, enemyFocus.position),
		}));
		scored.sort((l, r) => l.d - r.d);
		// Soft shuffle within the nearest third so bots don't stamp the
		// same bridge cell forever.
		const head = Math.max(2, Math.ceil(scored.length / 3));
		for (let i = head - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			const tmp = scored[i];
			scored[i] = scored[j];
			scored[j] = tmp;
		}
		return scored.map(s => s.a);
	}

	function placementOffsetTowardEnemy(anchor, enemyFocus, offsetRange, explore) {
		const isotropic = () => ({
			dx: Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange,
			dz: Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange,
		});
		if (!enemyFocus?.position || Math.random() > explore) return isotropic();

		const sx = Math.sign(enemyFocus.position.x - anchor.x);
		const sz = Math.sign(enemyFocus.position.z - anchor.z);
		// Bias one axis toward the enemy; keep some jitter so placement
		// still finds legal cells.
		const alongX = sx !== 0 && (sz === 0 || Math.random() < 0.5);
		if (alongX) {
			return {
				dx: sx * (1 + Math.floor(Math.random() * offsetRange)),
				dz: Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange,
			};
		}
		if (sz !== 0) {
			return {
				dx: Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange,
				dz: sz * (1 + Math.floor(Math.random() * offsetRange)),
			};
		}
		return isotropic();
	}

	/**
	 * AI escape under Check. Called from the runner when
	 * `world.pendingCheck.defenderId === computerId`. We walk the AI's
	 * pieces and every existing board cell looking for the first move
	 * that `checkService.validateEscape` accepts (king out of danger
	 * or attacker captured). If none exists, return false — the AI
	 * will eat the deadline.
	 *
	 * We prefer king-moves first (most likely to escape) and then
	 * captures-of-the-attacker, before falling back to the generic
	 * "any-legal-move-that-resolves-the-threat" search. The first
	 * accepted candidate is played; we don't pretend to evaluate
	 * positions beyond that — the AI just survives a single tick.
	 */
	function performCheckEscape(computerId, checkService, kingCaptureService) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer || !checkService) return false;
		const check = checkForDefender(world, computerId);
		if (!check) return false;

		const attackerPieceId = check.attackerPieceId;
		const ownedPieces = (world.chessPieces || []).filter(piece =>
			piece && piece.player === computerId && piece.position
			&& Number.isFinite(piece.position.x) && Number.isFinite(piece.position.z)
		);
		if (ownedPieces.length === 0) return false;

		const cellKeys = Object.keys(world.board?.cells || {});
		const existingCells = [];
		for (const key of cellKeys) {
			const [x, z] = key.split(',').map(Number);
			if (Number.isFinite(x) && Number.isFinite(z)) existingCells.push({ x, z });
		}
		if (existingCells.length === 0) return false;

		// Build a ranked list of move candidates: king-moves first,
		// then "capture-the-attacker" moves, then everything else.
		const kingPieces = ownedPieces.filter(p => String(p.type || '').toUpperCase() === 'KING');
		const attackerPiece = (world.chessPieces || []).find(p => p && String(p.id) === String(attackerPieceId));
		const captureMoves = [];
		const fallback = [];
		const kingMoves = [];

		for (const piece of ownedPieces) {
			for (const target of existingCells) {
				if (piece.position.x === target.x && piece.position.z === target.z) continue;
				if (!gameManager.chessManager.isValidChessMove(world, piece, target.x, target.z)) continue;
				const candidate = { piece, target };
				if (kingPieces.includes(piece)) kingMoves.push(candidate);
				else if (attackerPiece && target.x === attackerPiece.position.x && target.z === attackerPiece.position.z) {
					captureMoves.push(candidate);
				}
				else fallback.push(candidate);
			}
		}
		const ordered = kingMoves.concat(captureMoves, fallback);

		for (const { piece, target } of ordered) {
			const escape = checkService.validateEscape({
				world, piece, toX: target.x, toZ: target.z,
			});
			if (!escape.ok) continue;

			const moveResult = applyChessMove(world, piece, target.x, target.z, computerId);
			if (!moveResult.success) continue;

			computerPlayer.lastChessMoveAt = Date.now();
			computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;

			integrityService.runIslandIntegrityPass({ emitAnimation: true });

			world.lastAction = {
				type: 'chess_move',
				playerId: computerId,
				data: {
					pieceId: piece.id,
					targetPosition: { x: target.x, z: target.z },
					captured: moveResult.capturedPiece || null,
					checkEscape: true,
				},
			};
			World.markDirty();

			broadcaster.broadcastGameUpdate();
			io.to(world.id).emit('chess_move', {
				playerId: computerId,
				movedPiece: moveResult.movedPiece,
				movedFrom: moveResult.from,
				movedTo: moveResult.to,
				capturedPiece: moveResult.capturedPieceSnapshot,
				...(moveResult.ship ? { ship: moveResult.ship } : {}),
			});

			// Defender successfully escaped — clear the pending check.
			try { checkService.cancelCheck(world, 'ai_escaped', computerId); }
			catch (e) { console.warn('[AI] check cancel failed:', e.message); }

			if (moveResult.capturedPiece && moveResult.capturedPiece.type === 'KING' && kingCaptureService) {
				// Escape-by-king-capture (defender takes the attacker
				// king). Vanishingly rare but handle it cleanly — route
				// through the shared resolver so it's duel-eligible and
				// idempotent, exactly like the human path.
				kingCaptureService.resolveKingCapture({
					captorId: computerId, defeatedId: moveResult.capturedPiece.player,
				});
			}

			if (spectatorRegistry) spectatorRegistry.broadcastUpdate(computerId, world);
			console.log(
				`[AI] ${computerId} escaped check via ${piece.type} → (${target.x}, ${target.z}).`
			);
			return true;
		}

		console.log(`[AI] ${computerId} found no legal escape — will be captured on deadline.`);
		return false;
	}

	/**
	 * Enumerate every legal move for a piece by walking outward from
	 * its own position (knight offsets, pawn forwards/diagonals,
	 * bounded slides). This replaces the old "random board cell ×80
	 * attempts" sampler, which almost never found a legal move for
	 * battle-arena bots: their arena is a tiny island ~2,000 cells
	 * from the organic world, so nearly every sampled target was
	 * either water or a cell three continents away. World AIs get the
	 * same benefit — no more wasted ticks.
	 */
	function enumerateMovesForPiece(world, piece) {
		const moves = [];
		const type = String(piece.type || '').toUpperCase();
		const x0 = piece.position.x;
		const z0 = piece.position.z;
		const tryTarget = (x, z) => {
			if (gameManager.chessManager.isValidChessMove(world, piece, x, z)) {
				moves.push({ x, z });
			}
		};

		if (type === 'KING') {
			for (let dx = -1; dx <= 1; dx++) {
				for (let dz = -1; dz <= 1; dz++) {
					if (dx !== 0 || dz !== 0) tryTarget(x0 + dx, z0 + dz);
				}
			}
			return moves;
		}
		if (type === 'KNIGHT') {
			for (const [dx, dz] of KNIGHT_OFFSETS) tryTarget(x0 + dx, z0 + dz);
			return moves;
		}
		if (type === 'PAWN') {
			// All four compass forwards plus diagonals — orientation
			// filtering happens inside isValidChessMove, so just probe
			// the eight near cells and the two-step opener.
			for (let dx = -1; dx <= 1; dx++) {
				for (let dz = -1; dz <= 1; dz++) {
					if (dx !== 0 || dz !== 0) tryTarget(x0 + dx, z0 + dz);
				}
			}
			tryTarget(x0 + 2, z0);
			tryTarget(x0 - 2, z0);
			tryTarget(x0, z0 + 2);
			tryTarget(x0, z0 - 2);
			return moves;
		}

		const dirs = [];
		if (type === 'ROOK' || type === 'QUEEN') dirs.push(...ORTHOGONAL_DIRS);
		if (type === 'BISHOP' || type === 'QUEEN') dirs.push(...DIAGONAL_DIRS);
		for (const [dx, dz] of dirs) {
			for (let step = 1; step <= MAX_ENUMERATED_SLIDE; step++) {
				const x = x0 + dx * step;
				const z = z0 + dz * step;
				if (gameManager.chessManager.isValidChessMove(world, piece, x, z)) {
					moves.push({ x, z });
				}
				// Stop the ray at the first gap or chess piece — slides
				// can't pass either, so everything beyond is illegal too.
				const cell = gameManager.boardManager.getCell(world.board, x, z);
				const isBoard = Array.isArray(cell) && cell.length > 0;
				if (!isBoard) break;
				if (cell.some(item => item && item.type === 'chess')) break;
				// Nothing slides past a longship (it can be the end of a
				// slide — boarding — but never part of the path).
				if (shipRules.cellHasShip(cell)) break;
			}
		}
		return moves;
	}

	function performStrategicChessMove(computerId, kingCaptureService, checkService = null) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer) return false;

		const chessPieces = world.chessPieces || [];
		// Mirror the human chess handler: the ATTACKER PIECE in a
		// pending check is locked, but the attacker's OTHER pieces
		// can still move freely — drop it from the candidate set.
		// (An attacker can hold several checks at once — one per king.)
		const lockedPieceIds = new Set(checksByAttacker(world, computerId)
			.map(c => String(c.attackerPieceId)));
		const ownedPieces = chessPieces.filter(piece =>
			piece && piece.player === computerId && piece.position
			&& Number.isFinite(piece.position.x) && Number.isFinite(piece.position.z)
			&& !lockedPieceIds.has(String(piece.id))
			// Frozen pawns awaiting promotion can't move (mirrors the
			// human handler).
			&& !piece.awaitingPromotion
		);
		if (ownedPieces.length === 0) return false;

		// Full candidate list, tagged with whether the move captures.
		const pieceAt = (x, z) => (world.chessPieces || []).find(p =>
			p && p.position && p.position.x === x && p.position.z === z
		);
		let captures = [];
		let quiet = [];
		for (const piece of ownedPieces) {
			for (const target of enumerateMovesForPiece(world, piece)) {
				const victim = pieceAt(target.x, target.z);
				if (victim && String(victim.player) !== String(computerId)) {
					captures.push({ piece, target });
				} else {
					quiet.push({ piece, target });
				}
			}
		}
		if (captures.length === 0 && quiet.length === 0) return false;

		const now = Date.now();
		const moveIntervalMs = Number(computerPlayer.minMoveInterval) || 10000;
		// Viking battles only: everything ship-aware below keys on this.
		const viking = ships.vikingBattleOf(world, computerId);
		const seaOptions = { now, moveIntervalMs };
		if (viking) {
			const boardCells = world.board.cells || {};
			const lifeboats = new Map();
			seaOptions.isShipSquare = (x, z) => shipRules.cellHasShip(boardCells[`${x},${z}`]);
			// One water memo for every lifeboat this triage weighs.
			let grid = null;
			seaOptions.lifeboatSinkAt = (x, z) => {
				const key = `${x},${z}`;
				if (!lifeboats.has(key)) {
					grid = grid || shipPlanner.waterGrid(ships.boardEnv(world, viking, now), viking);
					lifeboats.set(key, shipPlanner.lifeboatSinkAt(world, viking, x, z, now, grid));
				}
				return lifeboats.get(key);
			};
		}
		const sea = triageForSea(activeBattleForSeat(world, computerId), captures, quiet, seaOptions);
		({ captures, quiet } = sea);
		if (viking) captures = orderShipCaptures(world, captures);

		// Prefer captures (proportional to aggressiveness). Quiet moves
		// that close distance to the nearest enemy are ranked ahead of
		// wandering — Expert used to shuffle quiet moves at random and
		// never leave its own footprint.
		const strategy = computerPlayer.strategy
			|| generateComputerStrategy(computerPlayer.difficulty || COMPUTER_DIFFICULTY.MEDIUM);
		const enemyFocus = nearestEnemyFocus(world, computerId);
		const rankedQuiet = rankQuietMovesTowardEnemy(
			quiet, enemyFocus, viking ? c => seizeBonus(world, c, computerId) : null,
		);
		const preferCaptures = captures.length > 0
			&& (rankedQuiet.length === 0 || Math.random() < Math.max(0.5, strategy.aggressiveness || 0.5));
		let pool = preferCaptures
			? captures.concat(rankedQuiet)
			: rankedQuiet.concat(captures);

		// Size of the pool's PRIORITY segment — the captures when we're in
		// capture-preferring mode, the distance-ranked quiet moves
		// otherwise. The pick jitter below must not reach past it.
		let priorityCount = preferCaptures ? captures.length : rankedQuiet.length;

		// Viking: an empty ship in harbour is wasted. After the opening
		// minute a knight or rook sometimes steps aboard (more often for
		// stronger bots) — unless there's a capture to make instead.
		// The raid legs in `maybeSail` take it from there.
		if (viking && !preferCaptures
			&& now - Number(viking.startedAt || now) >= shipPlanner.BOARDING_DELAY_MS
			&& Math.random() < shipPlanner.boardingChance(computerPlayer.difficulty)) {
			const boardings = rankedQuiet.filter(c => isHarbourBoarding(world, c, computerId));
			if (boardings.length > 0) {
				pool = boardings.concat(pool.filter(c => !boardings.includes(c)));
				priorityCount = boardings.length;
			}
		}

		// Fleeing the sea beats everything: the most valuable endangered
		// piece's escapes go first (a doomed king saves itself before
		// anything else moves).
		if (sea.escapes.length > 0) {
			const topValue = SEA_RESCUE_ORDER[String(sea.escapes[0].piece.type).toUpperCase()] || 0;
			const urgent = sea.escapes.filter(c =>
				(SEA_RESCUE_ORDER[String(c.piece.type).toUpperCase()] || 0) === topValue);
			pool = urgent.concat(pool.filter(c => !urgent.includes(c)));
			priorityCount = urgent.length;
		}

		const maxAttempts = Math.min(pool.length, 20);
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			// Take from the front of the ordered pool but with a little
			// jitter inside the first few entries so bots don't all play
			// identically. The jitter is CLAMPED to the priority segment:
			// a flat window of 4 across the whole pool meant a lone capture
			// competing with ranked quiet moves was played only one time in
			// four, so "aggressiveness 1.0" still walked past free material.
			const jitter = priorityCount > 0 ? Math.min(priorityCount, 4) : Math.min(pool.length, 4);
			const window = Math.max(1, jitter);
			const pick = Math.floor(Math.random() * window);
			const { piece, target } = pool.splice(pick, 1)[0];
			if (priorityCount > 0) priorityCount--;

			const moveResult = applyChessMove(world, piece, target.x, target.z, computerId, { checkService });
			// Deferred-check responses count as "acted" — the check
			// service has emitted the warning, and we don't want the
			// AI's stuck-counter ticking up for this case. Stamp the move
			// time too so starting a check consumes the AI's turn (H7
			// parity with the human handler) and the player reads as
			// active for island-decay purposes.
			if (moveResult.deferredCheck) {
				computerPlayer.lastChessMoveAt = Date.now();
				computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;
				World.markDirty();
				return true;
			}
			if (!moveResult.success) continue;

			computerPlayer.lastChessMoveAt = Date.now();
			computerPlayer.moveCount = (computerPlayer.moveCount || 0) + 1;

			// Run integrity so any defender pieces stranded by this AI's
			// ownership transfer get queued for decay with proper
			// grace-period tracking — exactly like the human chess move
			// flow does (see `server/sockets/chess.js`).
			integrityService.runIslandIntegrityPass({ emitAnimation: true });

			world.lastAction = {
				type: 'chess_move',
				playerId: computerId,
				data: {
					pieceId: piece.id,
					targetPosition: { x: target.x, z: target.z },
					captured: moveResult.capturedPiece || null,
				},
			};
			World.markDirty();

			broadcaster.broadcastGameUpdate();
			io.to(world.id).emit('chess_move', {
				playerId: computerId,
				movedPiece: moveResult.movedPiece,
				movedFrom: moveResult.from,
				movedTo: moveResult.to,
				capturedPiece: moveResult.capturedPieceSnapshot,
				...(moveResult.ship ? { ship: moveResult.ship } : {}),
			});

			if (moveResult.capturedPieceSnapshot) {
				io.to(world.id).emit('chess_capture', {
					at: { x: target.x, z: target.z },
					capturedPiece: moveResult.capturedPieceSnapshot,
					capturedBy: {
						playerId: computerId,
						pieceId: piece.id,
						pieceType: pieces.pieceLabel(piece),
					},
					t: Date.now(),
				});
			}

			if (moveResult.capturedPiece && moveResult.capturedPiece.type === 'KING' && kingCaptureService) {
				// Shared with the human path — records the capture in the
				// simultaneous-capture window and hands off to a King's
				// Duel if the defender had just taken this AI's king too.
				kingCaptureService.resolveKingCapture({
					captorId: computerId, defeatedId: moveResult.capturedPiece.player,
				});
			}

			if (spectatorRegistry) spectatorRegistry.broadcastUpdate(computerId, world);
			return true;
		}
		return false;
	}

	/**
	 * Prefer quiet moves that reduce Manhattan distance to the enemy
	 * focus (usually their king). Pieces already closer to the front
	 * also get a slight bump so rear pawns don't monopolise ticks.
	 */
	function rankQuietMovesTowardEnemy(quiet, enemyFocus, bonusFor = null) {
		if (!enemyFocus?.position || quiet.length < 2) return quiet.slice();

		const scored = quiet.map(candidate => {
			const from = piecePos(candidate.piece);
			const to = candidate.target;
			if (!from || !to) return { candidate, score: -Infinity };
			const before = manhattan(from, enemyFocus.position);
			const after = manhattan(to, enemyFocus.position);
			const closed = before - after;
			// Prefer front-line pieces when several moves close equally.
			const frontBias = -before * 0.01;
			const bonus = bonusFor ? bonusFor(candidate) : 0;
			return { candidate, score: closed + frontBias + bonus };
		});
		scored.sort((a, b) => b.score - a.score);
		return scored.map(s => s.candidate);
	}

	/** The ship in the cell at (x, z), or null. */
	function shipItemAt(world, x, z) {
		return shipRules.shipAt(world.board?.cells?.[`${x},${z}`]);
	}

	/**
	 * Viking: stepping onto an enemy's EMPTY ship takes it — worth
	 * `SEIZE_BONUS` squares of progress. (Every other quiet move gets 0.)
	 */
	function seizeBonus(world, candidate, computerId) {
		const ship = shipItemAt(world, candidate.target.x, candidate.target.z);
		return ship && String(ship.player) !== String(computerId) ? SEIZE_BONUS : 0;
	}

	/**
	 * Viking: captures that take a ship (boarding a passenger) or land a
	 * raid go first; otherwise the enumeration order is kept (stable).
	 */
	function orderShipCaptures(world, captures) {
		const bonus = c => (shipItemAt(world, c.target.x, c.target.z) ? 2 : 0)
			+ (shipItemAt(world, c.piece.position.x, c.piece.position.z) ? 1 : 0);
		return captures
			.map((c, i) => ({ c, i, b: bonus(c) }))
			.sort((a, b) => (b.b - a.b) || (a.i - b.i))
			.map(e => e.c);
	}

	/** A knight or rook stepping aboard its own empty ship. */
	function isHarbourBoarding(world, candidate, computerId) {
		const type = String(candidate.piece.type || '').toUpperCase();
		if (type !== 'KNIGHT' && type !== 'ROOK') return false;
		const ship = shipItemAt(world, candidate.target.x, candidate.target.z);
		return !!ship && String(ship.player) === String(computerId);
	}

	/**
	 * Viking: captain this bot's ships for one tick — flee the sea, sail
	 * a raid leg, or bring an empty ship home (see shipPlanner). Runs
	 * after the check escape and BEFORE the bot's chess or tetromino
	 * action, and doesn't use that action up: like a human's sail it is
	 * not a chess move. The 3 s rowing lock means the same tick can't
	 * also land from the ship that just sailed.
	 *
	 * @returns {number} How many ships sailed (0 outside Viking battles).
	 */
	function maybeSail(computerId, { now = Date.now() } = {}) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer || computerPlayer.eliminated || computerPlayer.paused) return 0;
		const battle = ships.vikingBattleOf(world, computerId);
		if (!battle || battle.status !== 'active') return 0;
		const moveIntervalMs = Number(computerPlayer.minMoveInterval) || 10000;
		const own = ships.shipsInBattle(world, battle)
			.filter(entry => String(entry.ship.player) === String(computerId)
				&& !shipRules.isRowing(entry.ship, now));
		if (own.length === 0) return 0;
		// Where each ship was heading, so a plan can stay the course
		// (persisted with the battle; reconcileShips prunes lost ships).
		const memory = ships.ensureFleet(battle).voyages;
		// One water memo for all this bot's ships — rebuilt after a sail,
		// which changes the board under it.
		let grid = null;
		let sailed = 0;
		for (const entry of own) {
			let plan = null;
			try {
				grid = grid || shipPlanner.waterGrid(ships.boardEnv(world, battle, now), battle);
				plan = shipPlanner.planVoyage(world, battle, entry, computerId, { now, moveIntervalMs, memory, grid });
			} catch (err) {
				console.warn(`[AI] ${computerId} voyage planning failed:`, err.message);
			}
			if (!plan) continue;
			const result = ships.sail(world, battle, computerId,
				{ shipId: entry.ship.shipId, to: plan.to }, { now });
			if (!result.success) {
				delete memory[String(entry.ship.shipId)];
				continue;
			}
			grid = null;
			sailed++;
			ships.emitToBattle(battle, 'ship_sailed', result.event);
		}
		if (sailed === 0) return 0;
		// Exactly the ship_sail handler's follow-up (sockets/boats.js).
		computerPlayer.lastActiveAt = now;
		integrityService.runIslandIntegrityPass({ emitAnimation: true });
		World.markDirty();
		broadcaster.broadcastGameUpdate();
		return sailed;
	}

	function pushCaptureToBasket(world, captorRecord, capturedPieceSnapshot) {
		if (!captorRecord || !capturedPieceSnapshot) return;
		const capturedType = String(capturedPieceSnapshot.type || '').toUpperCase();
		if (!PROMOTABLE_CAPTURE_TYPES.has(capturedType)) return;
		if (!Array.isArray(captorRecord.capturedBasket)) {
			captorRecord.capturedBasket = [];
		}
		const originalOwner = capturedPieceSnapshot.player;
		const ownerRecord = world?.players?.[originalOwner];
		captorRecord.capturedBasket.push({
			type: capturedType,
			originalOwner,
			originalOwnerName: ownerRecord?.name || originalOwner,
			originalColor: ownerRecord?.color,
			capturedAt: Date.now(),
		});
	}

	function applyChessMove(world, piece, targetX, targetZ, computerId, { checkService = null } = {}) {
		const computerPlayer = world.players?.[computerId];
		const sourceCell = gameManager.boardManager.getCell(world.board, piece.position.x, piece.position.z);
		if (!sourceCell) return { success: false };

		const chessPieceObj = sourceCell.find(
			item => item && item.type === 'chess' && item.pieceId === piece.id
		);
		if (!chessPieceObj) return { success: false };

		const targetCell = gameManager.boardManager.getCell(world.board, targetX, targetZ);
		// Classified against the pre-move board (the move flips the ship).
		const shipPlan = ships.planChessMove(world, piece, targetX, targetZ);
		let capturedPiece = null;

		let capturedPieceSnapshot = null;
		if (Array.isArray(targetCell) && targetCell.length > 0) {
			const capturedPieceObj = targetCell.find(
				item => item && item.type === 'chess' && item.player !== computerId
			);
			if (capturedPieceObj) {
				const target = world.chessPieces.find(
					p => p && String(p.id) === String(capturedPieceObj.pieceId)
				);
				// Deferred king-capture — same flow as the human chess
				// handler. The AI's move is held back, the king isn't
				// removed, the defender gets `CHECK_DEADLINE_MS` to
				// escape. Resolution is handled by `checkService.expireCheck`
				// (timeout) or `checkService.cancelCheck` (defender moved
				// out of danger).
				//
				// A check window is already open on this king — don't let
				// the AI skip the queue and instant-capture during the
				// defender's grace window (Chess-C2 parity with the human
				// handler). The AI will simply pick another move.
				if (target && String(target.type || '').toUpperCase() === 'KING'
					&& checkService && checkForDefender(world, target.player)) {
					return { success: false };
				}

				// Anti-spam: if this AI piece has used up its grace
				// deferrals on this king, `startCheck` returns null and
				// the AI's attack falls through to a normal capture.
				if (target && String(target.type || '').toUpperCase() === 'KING'
					&& checkService) {
					const started = checkService.startCheck({
						world,
						attackerPiece: piece,
						kingPiece: target,
						queuedMove: {
							captorId: computerId,
							defeatedId: target.player,
							toX: targetX,
							toZ: targetZ,
							attackerPieceId: piece.id,
						},
					});
					if (started) {
						return { success: false, deferredCheck: true };
					}
					// Else: defer denied — proceed with the normal
					// capture below.
				}
				if (target) {
					capturedPiece = target;
					capturedPieceSnapshot = {
						id: target.id,
						type: target.type,
						player: target.player,
						position: { x: targetX, z: targetZ },
					};
					// Mirror human chess_move: promotable captures go in
					// the basket so capturedCount / promotion choices work.
					pushCaptureToBasket(world, computerPlayer, capturedPieceSnapshot);
					// Route capture through the central helper. Emit a
					// per-piece `chess_piece_captured` activity event so
					// the user always sees *where* their piece was
					// captured — previously the AI flow only carried the
					// `captured` field on the move event, which left the
					// activity log silent and the user with no way to
					// reconcile a vanished piece with the world.
					pieces.removePiece(world, target, {
						reason: pieces.REMOVAL_REASONS.CAPTURED,
						activityLog: gameManager.activityLog || null,
						capturedBy: {
							playerId: computerId,
							playerName: computerPlayer?.name || computerPlayer?.username || computerId,
							pieceId: piece.id,
							pieceType: pieces.pieceLabel(piece),
						},
					});
					console.log(
						`[AI] ${computerId} (${piece.type} ${piece.id}) captured ` +
						`${capturedPiece.player}'s ${capturedPiece.type} ` +
						`(${capturedPiece.id}) at (${targetX}, ${targetZ})`
					);
				}
			}
		}

		const remainingAtSource = sourceCell.filter(
			item => !(item && item.type === 'chess' && String(item.pieceId) === String(piece.id))
		);
		if (remainingAtSource.length > 0) {
			gameManager.boardManager.setCell(world.board, piece.position.x, piece.position.z, remainingAtSource);
		} else {
			gameManager.boardManager.setCell(world.board, piece.position.x, piece.position.z, null);
		}

		// Strip enemy chess markers from the destination (capture handled
		// above), then transfer non-home content ownership to the mover —
		// same rule as the player chess_move handler. Without this the AI
		// can leave orphaned enemy terrain under itself, which then decays
		// the AI's own piece a few passes later via island integrity.
		const aiPlayer = world.players?.[computerId];
		const aiColor = aiPlayer?.color;
		const targetCellContents = Array.isArray(targetCell)
			? cells.stripAllChessMarkers(targetCell)
			: [];
		const aiPreviousOwners = new Set();
		for (const item of targetCellContents) {
			if (item && item.type !== 'home' && item.player != null
				&& String(item.player) !== String(computerId)
				&& !cells.isPausedOwner(world.players, item.player)) {
				aiPreviousOwners.add(String(item.player));
			}
		}
		cells.transferOwnership(targetCellContents, computerId, aiColor, world.players);
		targetCellContents.push({
			...chessPieceObj,
			position: { x: targetX, z: targetZ },
			player: computerId,
		});
		gameManager.boardManager.setCell(world.board, targetX, targetZ, targetCellContents);

		if (gameManager.activityLog && aiPreviousOwners.size > 0) {
			try {
				for (const prevOwnerId of aiPreviousOwners) {
					const prevOwner = world.players ? world.players[prevOwnerId] : null;
					gameManager.activityLog.recordTerritoryCaptured({
						fromPlayerId: prevOwnerId,
						fromPlayerName: prevOwner?.username || prevOwner?.name || prevOwnerId,
						toPlayerId: computerId,
						toPlayerName: aiPlayer?.username || aiPlayer?.name || computerId,
						cellCount: 1,
						sampleCells: [{ x: targetX, z: targetZ }],
						reason: 'ai_chess_move',
					});
				}
			} catch (err) {
				console.warn('[AI] activity log failed (territory):', err.message);
			}
		}

		const pieceIndex = world.chessPieces.findIndex(p => p && p.id === piece.id);
		const originalPosition = { x: piece.position.x, z: piece.position.z };
		let movedPiece = piece;
		if (pieceIndex !== -1) {
			movedPiece = world.chessPieces[pieceIndex];
			// Track net forward progress for the AI's pawns too —
			// otherwise AI pawns never trigger the promotion freeze.
			if (movedPiece.type === 'PAWN' && gameManager.chessManager) {
				gameManager.chessManager.updatePawnForwardDistance(
					movedPiece,
					originalPosition.x, originalPosition.z,
					targetX, targetZ,
				);
			}
			movedPiece.position = { x: targetX, z: targetZ };
			movedPiece.hasMoved = true;
			world.chessPieces[pieceIndex] = movedPiece;

			// Freeze at the promotion threshold exactly like a human pawn
			// (H5). Without this an AI pawn that completes the promotion
			// walk just keeps marching as an unkillable super-pawn that
			// never promotes. The marker is already stamped at the target
			// cell above, so the freeze flag mirrors onto it correctly.
			if (movedPiece.type === 'PAWN'
				&& !movedPiece.awaitingPromotion
				&& (movedPiece.forwardDistance || 0) >= GAME_RULES.PAWN_PROMOTION_DISTANCE) {
				markPawnAwaitingPromotion(world, computerId, movedPiece, {
					broadcaster,
					activityLog: gameManager.activityLog || null,
					io,
				});
			}
		}

		// AI moves were previously invisible in the activity log; only
		// human moves were recorded. Record this one with the same
		// shape (`chess_move`) so the replay panel is consistent.
		if (gameManager.activityLog) {
			try {
				gameManager.activityLog.recordChessMove({
					playerId: computerId,
					playerName: (world.players?.[computerId]?.username)
						|| (world.players?.[computerId]?.name)
						|| computerId,
					pieceType: pieces.pieceLabel(movedPiece),
					from: originalPosition,
					to: { x: targetX, z: targetZ },
					captured: capturedPiece ? {
						playerId: capturedPiece.player,
						pieceType: pieces.pieceLabel(capturedPiece),
					} : null,
				});
			} catch (err) {
				console.warn('[AI] activity log failed:', err.message);
			}
		}

		const shipMove = ships.afterPieceMoved(
			world, movedPiece, originalPosition, { x: targetX, z: targetZ },
			capturedPieceSnapshot, shipPlan,
		);

		return {
			success: true,
			movedPiece,
			capturedPiece,
			capturedPieceSnapshot,
			from: originalPosition,
			to: { x: targetX, z: targetZ },
			ship: shipMove,
		};
	}

	return {
		performStrategicTetrominoPlacement,
		performStrategicChessMove,
		performCheckEscape,
		maybeSail,
	};
}

module.exports = { createAiActions, triageForSea };
