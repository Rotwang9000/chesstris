/**
 * Home squares don't count toward a line (tetromino/lineHint.js,
 * boardFunctions/homeMarks.js), the Viking sound set's routing
 * (audio/*), sailing over orbs (shipControls sailOrbText) and C to
 * skip the drop (skipTetris.js).
 */

jest.mock('../../public/js/tetromino/rendering.js', () => ({ cleanupCurrentTetromino: jest.fn(), cleanupGhostPiece: jest.fn() }));
jest.mock('../../public/js/skipChessButton.js', () => ({ armSkipChessTimer: jest.fn(), cancelSkipDropTimer: jest.fn() }));
jest.mock('../../public/js/createLoadingIndicator.js', () => ({ updateGameStatusDisplay: jest.fn() }));
jest.mock('../../public/js/tetromino/nextPiece.js', () => ({ updateNextPieceHint: jest.fn() }));
jest.mock('../../public/js/showToastMessage.js', () => ({ showToastMessage: jest.fn() }));

const { lineRole, findHomeBlockedLines, placedSquares, tipDue, homeLineTip, noteOwnPlacement, LINE_LENGTH } = require('../../public/js/tetromino/lineHint.js');
const { markStyleFor, MARK_STYLE } = require('../../public/js/boardFunctions/homeMarks.js');
const { VIKING_CUES, SHIP_KIND_CUES } = require('../../public/js/audio/vikingCues.js');
const { SHIP_SOCKET_EVENTS } = require('../../public/js/longships/shipEvents.js');
const { shipCueFor, shipEventPlayers } = require('../../public/js/audio/shipSounds.js');
const { cueDue } = require('../../public/js/audio/soundManager.js');
const { skipTetrisMove, canSkipTetris } = require('../../public/js/skipTetris.js');

const T = (player = 'a') => ({ type: 'tetromino', player });
const H = (player = 'a') => ({ type: 'home', player });

function boardFrom(row, z = 0) {
	// row: string of '#' (tetromino), 'h' (home), 'x' (ex-home), '.' (water)
	const cells = {};
	[...row].forEach((ch, x) => {
		if (ch === '#') cells[`${x},${z}`] = [T()];
		if (ch === 'h') cells[`${x},${z}`] = [H()];
		if (ch === 'x') cells[`${x},${z}`] = [{ type: 'tetromino', player: 'a', fromHomeZone: true }];
	});
	return cells;
}

describe('which squares count toward a line', () => {
	test('tetromino land counts; home, ex-home and degraded home break the run', () => {
		expect(lineRole([T()])).toBe('count');
		expect(lineRole([H()])).toBe('home');
		expect(lineRole([H(), T()])).toBe('home');
		expect(lineRole([{ type: 'tetromino', fromHomeZone: true }])).toBe('home');
		expect(lineRole([{ type: 'tetromino', battleRing: true }])).toBe('wall');
		expect(lineRole(null)).toBe('wall');
	});
});

describe('a line kept from clearing only by home squares', () => {
	test('nine land squares with a home square among them is reported, with the home square', () => {
		const cells = boardFrom('####h####');
		const got = findHomeBlockedLines((x, z) => cells[`${x},${z}`], [{ x: 8, z: 0 }]);
		const row = got.find(l => l.axis === 'row');
		expect(row).toBeTruthy();
		expect(row.home).toEqual([{ x: 4, z: 0 }]);
		expect(row.land).toBe(9);
	});

	test('a run of 8 real squares clears anyway: no report', () => {
		const cells = boardFrom('h########');
		expect(findHomeBlockedLines((x, z) => cells[`${x},${z}`], [{ x: 8, z: 0 }])
			.filter(l => l.axis === 'row')).toEqual([]);
	});

	test('a short row, or one broken by water, is not a near miss', () => {
		const cells = boardFrom('###h###');
		expect(findHomeBlockedLines((x, z) => cells[`${x},${z}`], [{ x: 0, z: 0 }])).toEqual([]);
		const gap = boardFrom('####.h####');
		expect(findHomeBlockedLines((x, z) => cells[`${x},${z}`], [{ x: 9, z: 0 }])).toEqual([]);
	});

	test('a square just placed counts even before the board shows it', () => {
		const cells = boardFrom('####h###.');
		const got = findHomeBlockedLines((x, z) => cells[`${x},${z}`], [{ x: 8, z: 0 }]);
		expect(got.some(l => l.axis === 'row')).toBe(true);
		expect(LINE_LENGTH).toBe(8);
	});

	test('placedSquares reads the shape at its position', () => {
		expect(placedSquares({ shape: [[1, 1], [0, 1]], position: { x: 3, z: 7 } }))
			.toEqual([{ x: 3, z: 7 }, { x: 4, z: 7 }, { x: 4, z: 8 }]);
	});

	test('pulses the home squares, and the tip shows a few times, spaced out', () => {
		const store = {};
		global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, clear() {} };
		const gameState = { board: { cells: boardFrom('####h####') } };
		const pulse = jest.fn();
		const toast = jest.fn();
		const piece = { shape: [[1]], position: { x: 8, z: 0 } };
		noteOwnPlacement(gameState, piece, { pulse, toast, viking: true });
		expect(pulse).toHaveBeenCalledWith([{ x: 4, z: 0 }], gameState);
		expect(toast).toHaveBeenCalledTimes(1);
		expect(toast.mock.calls[0][0]).toMatch(/flagstones/);
		noteOwnPlacement(gameState, piece, { pulse, toast });
		expect(pulse).toHaveBeenCalledTimes(2);
		expect(toast).toHaveBeenCalledTimes(1);   // too soon for another tip
		expect(tipDue({ count: 3, at: 0 }, 1e12)).toBe(false);
		expect(tipDue({ count: 1, at: 0 }, 1e12)).toBe(true);
		expect(homeLineTip(false)).toMatch(/striped/);
	});
});

describe('home marks', () => {
	test('every look has its stripes', () => {
		expect(markStyleFor('retro')).toBe(MARK_STYLE.retro);
		expect(markStyleFor('cute')).toBe(MARK_STYLE.cute);
		expect(markStyleFor('anything')).toBe(MARK_STYLE.normal);
	});
});

describe('the Viking sound set', () => {
	test('covers every standard cue and every longship event', () => {
		for (const name of ['tick', 'drop', 'hardDrop', 'lineClear', 'capture', 'error', 'orbClaim', 'promotion', 'kingFall', 'alert', 'explosion', 'move']) {
			expect(typeof VIKING_CUES[name]).toBe('function');
		}
		for (const kind of Object.values(SHIP_SOCKET_EVENTS)) {
			expect(VIKING_CUES[SHIP_KIND_CUES[kind]]).toBeDefined();
		}
		for (const kind of ['embark', 'land', 'raid', 'boarded', 'seize']) {
			expect(VIKING_CUES[SHIP_KIND_CUES[kind]]).toBeDefined();
		}
	});

	test('every cue schedules on a stub synth without throwing', () => {
		const calls = [];
		const voice = (name) => (t, o) => { calls.push(name); return t + 0.1; };
		const s = { noise: voice('noise'), tone: voice('tone'), bell: voice('bell'), drum: voice('drum'), pluck: voice('pluck'), horn: voice('horn') };
		for (const [name, cue] of Object.entries(VIKING_CUES)) {
			expect(() => cue(s, 0)).not.toThrow();
			expect(calls.length).toBeGreaterThan(0);
			calls.length = 0;
			void name;
		}
	});

	test('a cue twice in a moment plays once; ship cues are spaced wider', () => {
		const last = new Map();
		expect(cueDue('drop', 1000, last)).toBe(true);
		expect(cueDue('drop', 1050, last)).toBe(false);
		expect(cueDue('drop', 1200, last)).toBe(true);
		expect(cueDue('shipSeized', 0, last)).toBe(true);
		expect(cueDue('shipSeized', 300, last)).toBe(false);
	});

	test('ship sounds: ours in the world, everyone\'s in a battle', () => {
		const sail = { kind: 'sailed', playerId: 'me' };
		expect(shipCueFor(sail, { localId: 'me' })).toBe('shipSail');
		expect(shipCueFor({ kind: 'sailed', playerId: 'them' }, { localId: 'me' })).toBeNull();
		expect(shipCueFor({ kind: 'sailed', playerId: 'them' }, { localId: 'me', inBattle: true })).toBe('shipSail');
		expect(shipCueFor({ kind: 'seized', from: 'me', to: 'them' }, { localId: 'me' })).toBe('shipSeized');
		expect(shipCueFor({ kind: 'embark', move: { playerId: 'me' } }, { localId: 'me' })).toBe('shipEmbark');
		expect(shipCueFor({ kind: 'nonsense', playerId: 'me' }, { localId: 'me' })).toBeNull();
		expect(shipEventPlayers({ from: { x: 1, z: 2 }, playerId: 7 })).toEqual(['7']);
	});
});

describe('C skips the drop', () => {
	test('only in the tetris phase; goes to the chess move', () => {
		const gs = { turnPhase: 'tetris', currentTetromino: { type: 'T' } };
		expect(canSkipTetris(gs)).toBe(true);
		expect(skipTetrisMove(gs)).toBe(true);
		expect(gs.turnPhase).toBe('chess');
		expect(gs.currentTetromino).toBeNull();
		expect(skipTetrisMove(gs)).toBe(false);
		expect(canSkipTetris({ turnPhase: 'tetris', processingMove: true })).toBe(false);
	});
});
