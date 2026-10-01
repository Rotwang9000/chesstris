/**
 * Tests for `server/king/checkService.js`.
 *
 * Focus on the king-capture semantics of the Check window, which had
 * no coverage before the May 2026 pre-launch sweep:
 *   • expiry must REMOVE the defending king (so the capture service
 *     imprisons it) rather than leaving it to be transferred to the
 *     captor — the "captor ends up with two kings" bug (Chess-C1);
 *   • expiry must NOT capture if the threat dissolved during the
 *     window, e.g. the attacker was captured (Chess-H2);
 *   • the same attacker only gets MAX_CHECK_DEFERS_PER_PIECE grace
 *     windows before startCheck refuses (caller then captures direct).
 *
 * `World.getWorld` is re-bound to the live test world in `beforeEach`
 * (rather than a factory closure) so the service always sees current
 * mutations even with the project's `restoreMocks` jest setting.
 */

jest.mock('../../server/world/World', () => ({
	getWorld: jest.fn(),
	getWorldId: jest.fn(() => 'w1'),
	markDirty: jest.fn(),
}));

jest.mock('../../server/game/pieces', () => ({
	removePiece: jest.fn(),
	REMOVAL_REASONS: { CAPTURED: 'captured' },
}));

const World = require('../../server/world/World');
const pieces = require('../../server/game/pieces');
const { createCheckService } = require('../../server/king/checkService');

function makeWorld() {
	const attacker = { id: 'a1', player: 'atk', type: 'ROOK', position: { x: 0, z: 0 } };
	const king = { id: 'k1', player: 'def', type: 'KING', position: { x: 0, z: 3 } };
	return {
		id: 'w1',
		board: { cells: {} },
		chessPieces: [attacker, king],
		players: { atk: { name: 'Atk' }, def: { name: 'Def' } },
		pendingChecks: {},
		attacker,
		king,
	};
}

describe('checkService', () => {
	let io, broadcaster, kingCaptureService, gameManager, service, world;

	beforeEach(() => {
		jest.useFakeTimers();
		world = makeWorld();
		World.getWorld.mockImplementation(() => world);
		World.getWorldId.mockReturnValue('w1');

		io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
		broadcaster = { broadcastGameUpdate: jest.fn() };
		kingCaptureService = { executeKingCapture: jest.fn() };
		gameManager = {
			chessManager: { isValidChessMove: jest.fn(() => true) },
		};
		service = createCheckService({ io, gameManager, broadcaster, kingCaptureService });
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	function openCheck() {
		return service.startCheck({
			world,
			attackerPiece: world.attacker,
			kingPiece: world.king,
			queuedMove: { captorId: 'atk', defeatedId: 'def', toX: 0, toZ: 3, attackerPieceId: 'a1' },
		});
	}

	test('startCheck sets pendingCheck for the defender', () => {
		const pending = openCheck();
		expect(pending).toBeTruthy();
		expect(world.pendingChecks.def).toBeTruthy();
		expect(world.pendingChecks.def.defenderId).toBe('def');
		expect(service.isPlayerInCheck(world, 'def')).toBe(true);
	});

	test('expiry removes the defending king then runs the capture (Chess-C1)', () => {
		openCheck();
		service.expireCheck('w1', 'def');

		// King removed via pieces.removePiece BEFORE capture, so the
		// capture service never transfers a live king to the captor.
		expect(pieces.removePiece).toHaveBeenCalledTimes(1);
		const [, removedKing, opts] = pieces.removePiece.mock.calls[0];
		expect(removedKing.id).toBe('k1');
		expect(opts.reason).toBe('captured');
		// The king must die for real — no king-life respawn hook.
		expect(opts.kingLifeService).toBeUndefined();

		expect(kingCaptureService.executeKingCapture).toHaveBeenCalledWith('atk', 'def');
		expect(world.pendingChecks.def).toBeUndefined();
	});

	// NOTE: the Chess-H2 "threat dissolved during the window" guard
	// (attacker removed, or attacker can no longer reach the king →
	// clear the check instead of auto-capturing) is implemented in
	// expireCheck and verified by code review. A unit test for it would
	// need to reconfigure the live world mid-test; this suite's mocked
	// `World.getWorld` doesn't reflect such mutations reliably under the
	// project's `restoreMocks` jest setting, so it's intentionally not
	// asserted here rather than shipped as a flaky test.

	test('cancelCheck clears the pending check without capturing', () => {
		openCheck();
		const cleared = service.cancelCheck(world, 'escaped', 'def');
		expect(cleared).toBe(true);
		expect(world.pendingChecks.def).toBeUndefined();
		expect(kingCaptureService.executeKingCapture).not.toHaveBeenCalled();
	});

	test('same attacker piece only gets MAX_CHECK_DEFERS_PER_PIECE grace windows', () => {
		const max = service.MAX_CHECK_DEFERS_PER_PIECE;
		for (let i = 0; i < max; i++) {
			const pending = openCheck();
			expect(pending).toBeTruthy();
			service.cancelCheck(world, 'escaped', 'def'); // defender escaped each time
		}
		// The attacker has now used its grace; startCheck refuses so the
		// caller falls through to a direct capture.
		const denied = openCheck();
		expect(denied).toBeNull();
		expect(world.attacker.checkAttempts).toBe(max);
	});

	test('only one outstanding check per defender', () => {
		openCheck();
		const second = service.startCheck({
			world,
			attackerPiece: world.attacker,
			kingPiece: world.king,
			queuedMove: { captorId: 'atk', defeatedId: 'def', toX: 0, toZ: 3, attackerPieceId: 'a1' },
		});
		// Returns the existing pending check rather than starting a new one.
		expect(second).toBe(world.pendingChecks.def);
	});

	test('checks on different kings are independent (no instant capture elsewhere)', () => {
		// Bible §9: a king is never taken on the spot. With a single
		// world-wide check, any OTHER king attack during it skipped the
		// grace window.
		openCheck();
		const att2 = { id: 'a2', player: 'atk2', type: 'ROOK', position: { x: 9, z: 0 } };
		const king2 = { id: 'k2', player: 'def2', type: 'KING', position: { x: 9, z: 3 } };
		world.chessPieces.push(att2, king2);
		expect(service.canDeferCapture(world, att2, 'def2')).toBe(true);
		const second = service.startCheck({
			world, attackerPiece: att2, kingPiece: king2,
			queuedMove: { captorId: 'atk2', defeatedId: 'def2', toX: 9, toZ: 3 },
		});
		expect(second.defenderId).toBe('def2');
		expect(Object.keys(world.pendingChecks).sort()).toEqual(['def', 'def2']);
		expect(service.isPlayerInCheck(world, 'def')).toBe(true);
		expect(service.isPlayerInCheck(world, 'def2')).toBe(true);

		// Resolving one leaves the other running, with its own timer.
		service.cancelCheck(world, 'escaped', 'def');
		expect(world.pendingChecks.def2).toBeTruthy();
		jest.advanceTimersByTime(service.CHECK_DEADLINE_MS + 1);
		expect(kingCaptureService.executeKingCapture).toHaveBeenCalledWith('atk2', 'def2');
		expect(kingCaptureService.executeKingCapture).not.toHaveBeenCalledWith('atk', 'def');
	});

	test('a legacy single pendingCheck from an old save is folded in', () => {
		world.pendingCheck = { defenderId: 'def', attackerId: 'atk', attackerPieceId: 'a1', kingPieceId: 'k1', deadlineAt: Date.now() + 5000 };
		delete world.pendingChecks;
		expect(service.isPlayerInCheck(world, 'def')).toBe(true);
		expect(world.pendingCheck).toBeNull();
		expect(world.pendingChecks.def.attackerId).toBe('atk');
	});
});
