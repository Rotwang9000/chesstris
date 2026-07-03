/**
 * Battle bots must actually PLAY — regression tests for the "computer
 * player never moves its pieces in battle mode" report.
 *
 * Root cause: the old strategic chess mover sampled random cells from
 * the WHOLE board as move targets. A battle arena is a small island
 * ~2,000 cells from the organic world, so over 80 samples virtually
 * none landed anywhere near the bot's pieces — chess ticks were pure
 * no-ops. The mover now enumerates moves outward from each piece, so
 * an arena bot finds its legal moves on the first tick.
 */

const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');
const TetrominoManager = require('../../server/game/TetrominoManager');
const { createBattleManager } = require('../../server/battle/BattleManager');
const { createAiActions } = require('../../server/ai/actions');

describe('battle bot gameplay', () => {
	let manager;
	let aiActions;
	let boardManager;
	let botSeatId;
	let battle;

	beforeEach(() => {
		World.resetWorld();
		Sessions.clearAll();
		const world = World.getWorld();
		world.players.host1 = { id: 'host1', name: 'Hosty' };

		boardManager = new BoardManager();
		const islandManager = new IslandManager();
		const chessManager = new ChessManager(boardManager, islandManager);
		const tetrominoManager = new TetrominoManager(boardManager, islandManager);
		const gameManager = { boardManager, chessManager, tetrominoManager, activityLog: null };

		manager = createBattleManager({
			gameManager,
			aiRunner: { startAiPlayer: () => {}, stopAiPlayer: () => {} },
			broadcaster: { broadcastGameUpdate: () => {} },
			persistence: { markDirty: () => {} },
			lifecycleService: { removePlayerCompletely: id => World.removePlayer(id) },
			io: { to: () => ({ emit: () => {} }) },
		});

		aiActions = createAiActions({
			io: { to: () => ({ emit: () => {} }) },
			gameManager,
			broadcaster: { broadcastGameUpdate: () => {} },
			integrityService: { runIslandIntegrityPass: () => {} },
			spectatorRegistry: null,
			lineClearService: { runCascade: () => Promise.resolve() },
		});

		const created = manager.createBattle({ hostId: 'host1', hostName: 'Hosty', seatCount: 2 });
		const started = manager.startBattle({ battleId: created.battle.id, playerId: 'host1' });
		battle = started.battle;
		botSeatId = battle.seats.find(s => s.isAi).seatId;
	});

	test('fresh arena: no chess move exists yet, but a tetromino placement succeeds', () => {
		// Every home-zone cell is occupied by a piece and the gap between
		// the seats is open water — chess is genuinely impossible.
		const moved = aiActions.performStrategicChessMove(botSeatId, null, null);
		expect(moved).toBe(false);

		// The bot's real first action is building terrain.
		const placed = aiActions.performStrategicTetrominoPlacement(botSeatId);
		expect(placed).toBe(true);

		const world = World.getWorld();
		const botCells = Object.entries(world.board.cells).filter(([, contents]) =>
			Array.isArray(contents) && contents.some(
				item => item && item.player === botSeatId && item.type === 'tetromino'
			)
		);
		expect(botCells.length).toBeGreaterThanOrEqual(4);
	});

	test('with terrain in front of the pawns, the bot finds a chess move on the first try', () => {
		const world = World.getWorld();
		const zone = world.homeZones[botSeatId];
		expect(zone).toBeTruthy();

		// Lay a bot-owned strip directly in front of the pawn row so
		// pawn-forward becomes legal (mirrors what its tetrominoes do).
		// Orientation 0 ⇒ pawns advance +z (bot is the north seat).
		const pawnRow = zone.orientation === 0 ? zone.z + 1 : zone.z;
		const stripZ = zone.orientation === 0 ? pawnRow + 1 : pawnRow - 1;
		for (let dx = 0; dx < zone.width; dx++) {
			world.board.cells[`${zone.x + dx},${stripZ}`] = [{
				type: 'tetromino', player: botSeatId, color: '#123456',
			}];
		}

		const before = world.chessPieces
			.filter(p => String(p.player) === botSeatId)
			.map(p => `${p.id}@${p.position.x},${p.position.z}`)
			.join('|');

		const moved = aiActions.performStrategicChessMove(botSeatId, null, null);
		expect(moved).toBe(true);

		const after = world.chessPieces
			.filter(p => String(p.player) === botSeatId)
			.map(p => `${p.id}@${p.position.x},${p.position.z}`)
			.join('|');
		expect(after).not.toBe(before);
	});

	test('the bot prefers capturing an adjacent enemy piece', () => {
		const world = World.getWorld();
		const zone = world.homeZones[botSeatId];
		const pawnRow = zone.orientation === 0 ? zone.z + 1 : zone.z;
		const stepZ = zone.orientation === 0 ? 1 : -1;

		// Enemy piece diagonally in front of a bot pawn (a legal pawn
		// capture) on a real board cell.
		const humanSeatId = battle.seats.find(s => !s.isAi).seatId;
		const targetX = zone.x + 3;
		const targetZ = pawnRow + stepZ;
		world.board.cells[`${targetX + 1},${targetZ}`] = [
			{ type: 'tetromino', player: humanSeatId, color: '#abcdef' },
			{ type: 'chess', player: humanSeatId, pieceId: 'victim-1', pieceType: 'ROOK' },
		];
		world.chessPieces.push({
			id: 'victim-1', type: 'ROOK', player: humanSeatId,
			position: { x: targetX + 1, z: targetZ },
		});

		// Aggressive strategy ⇒ captures always preferred.
		World.getPlayer(botSeatId).strategy = {
			aggressiveness: 1, defensiveness: 0.5, buildSpeed: 0.5, kingProtection: 0.5,
		};

		const moved = aiActions.performStrategicChessMove(botSeatId, null, null);
		expect(moved).toBe(true);
		expect(world.chessPieces.some(p => p && p.id === 'victim-1')).toBe(false);
	});
});
