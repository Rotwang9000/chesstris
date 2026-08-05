/**
 * @jest-environment jsdom
 *
 * (The `default` Jest project runs in node; the check banner is DOM UI,
 * so this suite opts itself into jsdom.)
 *
 * Tests for the defender's escape window in `checkAlert.js`.
 *
 * A check almost always lands while the defender is mid-drop in the
 * tetris phase, where `selectChessPiece` / `performRaycast` refuse to
 * do anything — so the defender could watch the countdown expire
 * without being able to touch their king. The client now opens the
 * chess phase for the duration of the check and restores the previous
 * phase when it resolves; these tests pin that behaviour (including
 * the two ways it must NOT fire: for the attacker, and for anyone who
 * was already in the chess phase).
 */

const mockFlyToPosition = jest.fn();
const mockClearChessSelection = jest.fn();
const mockClearStaleChessSelection = jest.fn();
const mockShowToast = jest.fn();
const mockUpdateStatus = jest.fn();

let mockGameState;

jest.mock('../../public/js/setupCamera.js', () => ({
	flyToPosition: (...args) => mockFlyToPosition(...args),
}));
jest.mock('../../public/js/centreBoardMarker.js', () => ({
	translatePosition: (pos) => ({ x: pos.x, z: pos.z }),
}));
jest.mock('../../public/js/chessInteraction.js', () => ({
	clearChessSelection: (...args) => mockClearChessSelection(...args),
	clearStaleChessSelection: (...args) => mockClearStaleChessSelection(...args),
}));
jest.mock('../../public/js/showToastMessage.js', () => ({
	showToastMessage: (...args) => mockShowToast(...args),
}));
jest.mock('../../public/js/createLoadingIndicator.js', () => ({
	updateGameStatusDisplay: (...args) => mockUpdateStatus(...args),
}));
jest.mock('../../public/js/gameContext.js', () => ({
	getGameState: () => mockGameState,
	getCamera: () => null,
	getControls: () => null,
	getRenderer: () => null,
	getScene: () => null,
	getTHREE: () => null,
}));

function makeCheck(overrides = {}) {
	return {
		defenderId: 'p1',
		attackerId: 'p2',
		attackerPieceType: 'ROOK',
		startedAt: 1000,
		deadlineAt: Date.now() + 20000,
		kingPos: { x: 4, z: 4 },
		attackerFrom: { x: 4, z: 8 },
		...overrides,
	};
}

describe('checkAlert — defender escape window', () => {
	let checkAlert;

	beforeEach(() => {
		jest.resetModules();
		mockFlyToPosition.mockClear();
		mockClearChessSelection.mockClear();
		mockClearStaleChessSelection.mockClear();
		mockShowToast.mockClear();
		mockUpdateStatus.mockClear();
		document.body.innerHTML = '';
		mockGameState = {
			localPlayerId: 'p1',
			turnPhase: 'tetris',
			currentTetromino: { type: 'T' },
			processingMove: false,
		};
		checkAlert = require('../../public/js/checkAlert.js');
	});

	it('opens the chess phase for the defender so the king can be moved', () => {
		checkAlert.onCheckStart(makeCheck());

		expect(mockGameState.turnPhase).toBe('chess');
		expect(mockClearChessSelection).toHaveBeenCalled();
		expect(mockShowToast).toHaveBeenCalled();
	});

	it('clears a stuck processingMove flag that would swallow the escape click', () => {
		mockGameState.processingMove = true;

		checkAlert.onCheckStart(makeCheck());

		expect(mockGameState.processingMove).toBe(false);
	});

	it('restores the tetris phase once the check resolves', () => {
		checkAlert.onCheckStart(makeCheck());
		expect(mockGameState.turnPhase).toBe('chess');

		checkAlert.onCheckClear();

		expect(mockGameState.turnPhase).toBe('tetris');
	});

	it('leaves the phase alone when the escape move already advanced it', () => {
		checkAlert.onCheckStart(makeCheck());
		// A successful escape move runs `advanceToTetrisPhase`, which
		// moves the player on itself before the clear arrives.
		mockGameState.turnPhase = 'tetris';
		mockGameState.currentTetromino = { type: 'L' };

		checkAlert.onCheckClear();

		expect(mockGameState.turnPhase).toBe('tetris');
	});

	it('does not force a phase for the attacker', () => {
		mockGameState.localPlayerId = 'p2';

		checkAlert.onCheckStart(makeCheck());

		expect(mockGameState.turnPhase).toBe('tetris');
		expect(mockClearChessSelection).not.toHaveBeenCalled();
	});

	it('sweeps a stale selection instead of re-forcing an already-chess phase', () => {
		mockGameState.turnPhase = 'chess';

		checkAlert.onCheckStart(makeCheck());

		expect(mockGameState.turnPhase).toBe('chess');
		expect(mockClearStaleChessSelection).toHaveBeenCalled();
		// Nothing was forced, so nothing may be restored on resolution.
		checkAlert.onCheckClear();
		expect(mockGameState.turnPhase).toBe('chess');
	});
});
