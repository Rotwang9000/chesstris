/**
 * Expert used to farm locally (buildSpeed 0.8, Chebyshev≤1 "attack"
 * detection) and never close on humans — capturedCount stayed 0 for
 * weeks. These cover the hunt heuristics and strategy retune.
 */

const {
	COMPUTER_DIFFICULTY,
	generateComputerStrategy,
	hasAttackOpportunity,
	hasEnemyInTheatre,
	nearestEnemyFocus,
	manhattan,
} = require('../../server/ai/strategy');
const World = require('../../server/world/World');
const Sessions = require('../../server/world/Sessions');
const BoardManager = require('../../server/game/BoardManager');
const IslandManager = require('../../server/game/IslandManager');
const ChessManager = require('../../server/game/ChessManager');
const TetrominoManager = require('../../server/game/TetrominoManager');
const { createAiActions } = require('../../server/ai/actions');

describe('AI hunt strategy', () => {
	test('Expert profile hunts instead of farming', () => {
		const easy = generateComputerStrategy(COMPUTER_DIFFICULTY.EASY);
		const hard = generateComputerStrategy(COMPUTER_DIFFICULTY.HARD);
		expect(hard.aggressiveness).toBeGreaterThan(easy.aggressiveness);
		expect(hard.explorationRate).toBeGreaterThan(easy.explorationRate);
		expect(hard.huntRadius).toBeGreaterThan(easy.huntRadius);
		expect(hard.buildSpeed).toBeLessThanOrEqual(0.45);
		expect(hard.huntRadius).toBeGreaterThanOrEqual(8);
	});

	test('hasAttackOpportunity uses huntRadius, not only adjacency', () => {
		World.resetWorld();
		Sessions.clearAll();
		const world = World.getWorld();
		world.players.ai = {
			id: 'ai',
			isComputer: true,
			strategy: generateComputerStrategy(COMPUTER_DIFFICULTY.HARD),
		};
		world.players.human = { id: 'human', name: 'Human' };
		world.chessPieces = [
			{ id: 'ak', type: 'KING', player: 'ai', position: { x: 0, z: 0 } },
			{ id: 'hk', type: 'KING', player: 'human', position: { x: 8, z: 0 } },
		];
		expect(hasAttackOpportunity(world, 'ai')).toBe(true);
		expect(hasEnemyInTheatre(world, 'ai')).toBe(true);

		world.players.ai.strategy = generateComputerStrategy(COMPUTER_DIFFICULTY.EASY);
		// Easy huntRadius is 3 — 8 cells away is outside attack range
		// but still in theatre for bridging.
		expect(hasAttackOpportunity(world, 'ai')).toBe(false);
		expect(hasEnemyInTheatre(world, 'ai')).toBe(true);
	});

	test('nearestEnemyFocus prefers opposing kings', () => {
		World.resetWorld();
		Sessions.clearAll();
		const world = World.getWorld();
		world.chessPieces = [
			{ id: 'ak', type: 'KING', player: 'ai', position: { x: 0, z: 0 } },
			{ id: 'hp', type: 'PAWN', player: 'human', position: { x: 2, z: 0 } },
			{ id: 'hk', type: 'KING', player: 'human', position: { x: 10, z: 0 } },
		];
		const focus = nearestEnemyFocus(world, 'ai');
		expect(focus.piece.id).toBe('hk');
		expect(focus.distance).toBe(manhattan({ x: 0, z: 0 }, { x: 10, z: 0 }));
	});

	test('AI capture of a rook lands in the basket', () => {
		World.resetWorld();
		Sessions.clearAll();
		const world = World.getWorld();
		const boardManager = new BoardManager();
		const islandManager = new IslandManager();
		const chessManager = new ChessManager(boardManager, islandManager);
		const tetrominoManager = new TetrominoManager(boardManager, islandManager);
		const gameManager = { boardManager, chessManager, tetrominoManager, activityLog: null };

		world.players.ai = {
			id: 'ai', name: 'Expert', isComputer: true,
			strategy: { aggressiveness: 1, explorationRate: 0.9, huntRadius: 10 },
			capturedBasket: [],
		};
		world.players.human = { id: 'human', name: 'Human', color: '#ff0000' };

		// Contiguous strip so the AI rook can slide onto the victim.
		for (let x = 0; x <= 3; x++) {
			world.board.cells[`${x},0`] = [{ type: 'tetromino', player: 'ai', color: '#0f0' }];
		}
		world.board.cells['0,0'].push({
			type: 'chess', player: 'ai', pieceId: 'ar', pieceType: 'ROOK',
		});
		world.board.cells['3,0'] = [
			{ type: 'tetromino', player: 'human', color: '#f00' },
			{ type: 'chess', player: 'human', pieceId: 'hr', pieceType: 'ROOK' },
		];
		world.chessPieces = [
			{ id: 'ar', type: 'ROOK', player: 'ai', position: { x: 0, z: 0 } },
			{ id: 'hr', type: 'ROOK', player: 'human', position: { x: 3, z: 0 } },
		];

		const aiActions = createAiActions({
			io: { to: () => ({ emit: () => {} }) },
			gameManager,
			broadcaster: { broadcastGameUpdate: () => {} },
			integrityService: { runIslandIntegrityPass: () => {} },
			spectatorRegistry: null,
			lineClearService: { runCascade: () => Promise.resolve() },
		});

		const moved = aiActions.performStrategicChessMove('ai', null, null);
		expect(moved).toBe(true);
		expect(world.chessPieces.some(p => p && p.id === 'hr')).toBe(false);
		expect(world.players.ai.capturedBasket).toEqual([
			expect.objectContaining({
				type: 'ROOK',
				originalOwner: 'human',
				originalOwnerName: 'Human',
			}),
		]);
	});
});
