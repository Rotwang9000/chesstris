/**
 * @jest-environment jsdom
 *
 * The sea block and the cells it sinks must stay together (owner, after a
 * Viking Quick battle: "after a while the thing knocking in the ring to
 * make it smaller seemed to be out of sync and the ring cells stopped
 * regenerating").
 *
 * Two causes, both on the client:
 *  • the server's clock was learnt from ONE sample, the battle object at
 *    adoption, which arrives late when the page is busy building the
 *    arena (measured 0.5-1.9 s on one machine), so the block ran behind
 *    the cells the server was sinking for the whole battle;
 *  • the cells only went when the server's update was drawn, so on a
 *    busy device (updates queuing behind slow frames) the block glided on
 *    while the ground it had passed stayed up, then vanished in bursts.
 * Now every server-stamped update tunes the clock (the largest sample
 * wins: no message arrives early) and the client sinks the cells the
 * block reaches itself (sink times are a pure function of the battle).
 */

import {
	noteServerClock, clockOffsetEstimate, resetServerClock, serverNow, withClockOffset,
	seaSpiral, CLOCK_JUMP_MS, CLOCK_CONFIRM_MS,
} from '../../public/js/battle/battleRules.js';
import {
	sinkReachedCells, onServerUpdate, startSeaOverlay, stopSeaOverlay,
} from '../../public/js/battle/seaOverlay.js';
import gameState from '../../public/js/utils/gameState.js';

const serverSea = require('../../server/battle/sea');

const START = 1_800_000_000_000;

function serverBattle() {
	return { id: 'bS', mode: 'quick', status: 'active', centre: { x: 2000, z: 2000 }, playRadius: 14, seatCount: 2, startedAt: START };
}

function clientBattle(battle = serverBattle(), id = battle.id) {
	return { id, centre: battle.centre, playRadius: battle.playRadius, sea: serverSea.publicSea(battle, START) };
}

/** Board cells on the first `n` squares of the sea's path (+ extras). */
function boardAlongPath(battle, n, extra = {}) {
	const path = seaSpiral(battle.sea.outerBand).cells;
	const cells = {};
	for (let i = 0; i < n; i++) {
		cells[`${battle.centre.x + path[i].dx},${battle.centre.z + path[i].dz}`] = [{ type: 'tetromino', battleRing: battle.id }];
	}
	return { cells: { ...cells, ...extra } };
}

function keyAt(battle, i) {
	const p = seaSpiral(battle.sea.outerBand).cells[i];
	return `${battle.centre.x + p.dx},${battle.centre.z + p.dz}`;
}

beforeEach(() => {
	resetServerClock();
	stopSeaOverlay();
});

describe('the server clock, learnt from every stamped message', () => {
	test('a late message never drags the estimate back; an earlier-arriving one lifts it', () => {
		// True offset: the server runs 300 ms ahead of us.
		expect(noteServerClock(1_000_300 - 1900, 1_000_000)).toBe(-1600);   // arrived 1.9 s late
		expect(noteServerClock(1_005_300 - 40, 1_005_000)).toBeCloseTo(260, 0); // 40 ms late
		// A backlog: every update arrives seconds late — the estimate holds.
		for (let t = 1_006_000; t < 1_060_000; t += 400) noteServerClock(t + 300 - 6000, t);
		expect(clockOffsetEstimate(1_060_000)).toBeGreaterThan(240);
		expect(clockOffsetEstimate(1_060_000)).toBeLessThanOrEqual(260);
	});

	test('the battle object is one more sample, and serverNow uses the best', () => {
		noteServerClock(5_000_000 + 250, 5_000_000);          // a prompt update: +250
		const sea = withClockOffset({ startsAt: 0, serverNow: 5_001_000 - 1200 }, 5_001_000); // a late battle object
		expect(sea.clockOffset).toBeCloseTo(250, 0);
		expect(serverNow({ sea }, 5_002_000)).toBeCloseTo(5_002_250, -1);
	});

	test('without any sample the battle\'s own offset is used', () => {
		expect(serverNow({ sea: { clockOffset: 700 } }, 1000)).toBe(1700);
	});

	test('a wall clock set back is followed at once', () => {
		noteServerClock(10_000 + 100, 10_000, 500);
		expect(clockOffsetEstimate(11_000 - 60_000, 1_500)).toBeCloseTo(100 + 60_000, 0);
	});

	test('a wall clock set forward is followed once the server confirms it', () => {
		// mono: the monotonic clock; wall jumps 60 s ahead between samples.
		noteServerClock(10_000 + 100, 10_000, 500);
		expect(clockOffsetEstimate(11_000, 1_500)).toBeCloseTo(100, -2);
		// Until a sample says so, a forward jump may be a suspend: hold.
		expect(clockOffsetEstimate(71_000, 1_500)).toBeCloseTo(100, -2);
		// Samples ~60 s lower, spread over more than CLOCK_CONFIRM_MS.
		noteServerClock(71_200 - 59_950, 71_200, 1_700);
		expect(clockOffsetEstimate(71_300, 1_800)).toBeCloseTo(100, -2);
		noteServerClock(72_900 - 59_940, 72_900, 3_400);
		expect(clockOffsetEstimate(72_900, 3_400)).toBeCloseTo(100 - 60_000, -2);
		expect(CLOCK_JUMP_MS).toBeLessThan(60_000);
		expect(CLOCK_CONFIRM_MS).toBeLessThan(3_400 - 1_700);
	});

	test('a suspended device (monotonic clock stalled) keeps the offset', () => {
		// True offset 0, 50 ms transit (the estimate also gives way by
		// CLOCK_DRIFT_PER_MS: a few ms here, hence the ±50 ms checks).
		noteServerClock(1_000_000 - 50, 1_000_000, 10_000);
		expect(clockOffsetEstimate(1_000_000, 10_000)).toBeCloseTo(-50, -2);
		// 30 s asleep: the wall clock ran on, the monotonic one moved 5 ms.
		expect(clockOffsetEstimate(1_030_005, 10_005)).toBeCloseTo(-50, -2);
		expect(serverNow({}, 1_030_005)).toBeGreaterThan(1_030_005 - 100);
		// Still reconnecting 3 s later: unchanged.
		expect(clockOffsetEstimate(1_033_005, 13_005)).toBeCloseTo(-50, -2);
		// A burst of messages queued before the sleep (stale, ~30 s low)
		// handled on waking doesn't drag it back…
		noteServerClock(1_000_100, 1_033_010, 13_010);
		noteServerClock(1_000_200, 1_033_020, 13_020);
		expect(clockOffsetEstimate(1_033_020, 13_020)).toBeCloseTo(-50, -2);
		// …and the first fresh update re-bases on the new clocks.
		noteServerClock(1_034_000 - 60, 1_034_000, 14_000);
		expect(clockOffsetEstimate(1_034_000, 14_000)).toBeCloseTo(-50, -2);
		expect(clockOffsetEstimate(1_040_000, 20_000)).toBeCloseTo(-50, -2);
	});
});

describe('the cells the block reaches sink on the client at once', () => {
	test('up to the block, once, never ahead, never a longship', () => {
		const battle = clientBattle();
		const shipKey = keyAt(battle, 3);
		const board = boardAlongPath(battle, 10, { [shipKey]: [{ type: 'ship', shipId: 's1', battleId: 'bS' }] });
		const t5 = battle.sea.startsAt + 5 * battle.sea.cellMs;
		const gone = sinkReachedCells(board, battle, t5);
		expect(gone).toEqual([0, 1, 2, 4, 5].map(i => keyAt(battle, i)));
		expect(board.cells[shipKey]).toBeDefined();           // the server sinks ships
		expect(board.cells[keyAt(battle, 6)]).toBeDefined();  // not reached yet
		expect(sinkReachedCells(board, battle, t5)).toEqual([]);
		// Before the calm ends nothing goes.
		const fresh = clientBattle(serverBattle(), 'other');
		const board2 = boardAlongPath(fresh, 5);
		expect(sinkReachedCells(board2, fresh, fresh.sea.startsAt - 1)).toEqual([]);
		expect(Object.keys(board2.cells)).toHaveLength(5);
	});

	test('pieces on the ground it reaches go under with it (not a ship\'s crew)', () => {
		const battle = clientBattle(serverBattle(), 'pieces');
		const shipKey = keyAt(battle, 2);
		const board = boardAlongPath(battle, 8, { [shipKey]: [{ type: 'ship', shipId: 's1', battleId: 'pieces' }] });
		// Square 1's cell was already taken by an earlier update.
		delete board.cells[keyAt(battle, 1)];
		const at = (i) => { const [x, z] = keyAt(battle, i).split(',').map(Number); return { x, z }; };
		const pieces = [
			{ id: 'a', type: 'ROOK', position: at(0) },
			{ id: 'b', type: 'PAWN', position: at(1) },
			{ id: 'crew', type: 'KNIGHT', position: at(2) },
			{ id: 'safe', type: 'KING', position: at(6) },
		];
		const piecesGone = [];
		sinkReachedCells(board, battle, battle.sea.startsAt + 3.5 * battle.sea.cellMs, { pieces, piecesGone });
		expect(piecesGone.map(p => p.id).sort()).toEqual(['a', 'b']);
		expect(pieces.map(p => p.id)).toEqual(['crew', 'safe']);
	});

	test('agrees with the server about which cells have gone', () => {
		const sb = serverBattle();
		const battle = clientBattle(sb, 'agree');
		const t = battle.sea.startsAt + 123.5 * battle.sea.cellMs;
		const board = boardAlongPath(battle, 200);
		sinkReachedCells(board, battle, t);
		for (const key of Object.keys(boardAlongPath(battle, 200).cells)) {
			const [x, z] = key.split(',').map(Number);
			expect(key in board.cells).toBe(!serverSea.isSunk(sb, x, z, t));
		}
	});

	test('a late server update that puts a sunk cell back is corrected before it is drawn', () => {
		const battle = clientBattle(serverBattle(), 'late');
		gameState.activeBattle = battle;
		try {
			const now = battle.sea.startsAt + 20 * battle.sea.cellMs;
			const board = boardAlongPath(battle, 30);
			sinkReachedCells(board, battle, now);
			// A full update stamped before the sink, with cell 12 still up.
			const stale = boardAlongPath(battle, 30);
			const realNow = Date.now;
			Date.now = () => now;
			try {
				onServerUpdate({ detail: { timestamp: now - 3000, board: stale, fullUpdate: true } });
			} finally {
				Date.now = realNow;
			}
			expect(stale.cells[keyAt(battle, 12)]).toBeUndefined();
			expect(stale.cells[keyAt(battle, 25)]).toBeDefined();
			// …and the update's stamp tuned the battle's clock.
			expect(battle.sea.clockOffset).toBeCloseTo(-3000, 0);
		} finally {
			gameState.activeBattle = null;
		}
	});
});

describe('the frame loop', () => {
	let realRaf;
	beforeEach(() => {
		jest.useFakeTimers();
		realRaf = window.requestAnimationFrame;
		window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
		window.cancelAnimationFrame = (id) => clearTimeout(id);
		window.updateBoardVisuals = jest.fn();
	});
	afterEach(() => {
		stopSeaOverlay();
		gameState.activeBattle = null;
		gameState.board = null;
		window.requestAnimationFrame = realRaf;
		delete window.updateBoardVisuals;
		jest.useRealTimers();
	});

	function seat(id) {
		const sb = { ...serverBattle(), startedAt: Date.now() - serverSea.SEA.CALM_MS };
		const battle = { id, centre: sb.centre, playRadius: 14, sea: withClockOffset(serverSea.publicSea(sb)) };
		gameState.activeBattle = battle;
		gameState.board = boardAlongPath(battle, 40);
		return battle;
	}

	test('sinks the ground the block reaches and redraws the board', () => {
		const battle = seat('loop1');
		startSeaOverlay();
		jest.advanceTimersByTime(3 * battle.sea.cellMs + 20);
		expect(gameState.board.cells[keyAt(battle, 0)]).toBeUndefined();
		expect(gameState.board.cells[keyAt(battle, 2)]).toBeUndefined();
		expect(gameState.board.cells[keyAt(battle, 10)]).toBeDefined();
		jest.advanceTimersByTime(300);
		expect(window.updateBoardVisuals).toHaveBeenCalled();
	});

	test('leaves the redraw to a server update that arrives in time', () => {
		const battle = seat('loop2');
		startSeaOverlay();
		jest.advanceTimersByTime(20);
		expect(gameState.board.cells[keyAt(battle, 0)]).toBeUndefined();
		window.dispatchEvent(new CustomEvent('gameupdate', { detail: { timestamp: Date.now(), board: gameState.board } }));
		jest.advanceTimersByTime(100);
		expect(window.updateBoardVisuals).not.toHaveBeenCalled();
	});
});
