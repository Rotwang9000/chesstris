/**
 * @jest-environment jsdom
 *
 * Back online mid-battle (battle/battleMode.js 'connect' handler): the
 * client asks the server what became of the battle it was playing
 * (`battle_resume`) and never sits on in a dead arena:
 *   • still its seat → plays on;
 *   • a bot held its army → takes the seat back;
 *   • the battle ended while it was away → results card, seat released;
 *   • nothing left of it → an "ended while you were offline" card.
 */

const mockListeners = {};
let mockSocket;
const mockPlayerId = 'real-player-1';

jest.mock('../../public/js/utils/networkManager.js', () => ({
	getSocket: jest.fn(() => mockSocket),
	getPlayerId: jest.fn(() => mockPlayerId),
	getGameId: jest.fn(() => 'global_game'),
	ensureConnected: jest.fn(() => Promise.resolve(true)),
	on: jest.fn((eventType, handler) => {
		mockListeners[eventType] = mockListeners[eventType] || [];
		mockListeners[eventType].push(handler);
	}),
}));
jest.mock('../../public/js/showToastMessage.js', () => ({ showToastMessage: jest.fn() }));
jest.mock('../../public/js/audio/soundManager.js', () => ({ playSound: jest.fn() }));
jest.mock('../../public/js/paintings/index.js', () => ({ paintingEvent: jest.fn(), startPaintings: jest.fn() }));

let socketResponses;
function emitServerEvent(eventType, payload) {
	for (const handler of mockListeners[eventType] || []) handler(payload);
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const SEAT = 'battle-b1-s0';
function battle(overrides = {}) {
	return {
		id: 'b1', code: 'ABC123', status: 'active', mode: 'quick', edition: 'standard',
		centre: { x: 2000, z: 2000 }, playRadius: 14, seatCount: 2, hostId: mockPlayerId,
		seats: [
			{ seatId: SEAT, index: 0, isAi: false, name: 'Me', controlledBy: mockPlayerId },
			{ seatId: 'battle-b1-s1', index: 1, isAi: true, name: 'Bot', controlledBy: null },
		],
		...overrides,
	};
}

describe('reconnecting during a battle', () => {
	let battleMode;
	let gameState;
	let showToastMessage;

	function boot() {
		jest.resetModules();
		for (const k of Object.keys(mockListeners)) delete mockListeners[k];
		document.body.innerHTML = '';
		socketResponses = { battle_state: { success: true, battles: [] } };
		mockSocket = {
			emit: jest.fn((event, data, cb) => {
				const r = socketResponses[event];
				if (typeof cb === 'function') cb(typeof r === 'function' ? r(data) : (r || { success: true }));
			}),
		};
		gameState = { localPlayerId: mockPlayerId, activeBattle: null };
		window.gameCore = {
			isWorldEntered: jest.fn(() => false),
			startBattleSession: jest.fn(),
			showWelcomeOverview: jest.fn(),
			flyToPlayerKing: jest.fn(() => true),
		};
		({ showToastMessage } = require('../../public/js/showToastMessage.js'));
		battleMode = require('../../public/js/battle/battleMode.js');
		battleMode.initBattleMode(gameState);
		emitServerEvent('battle_started', { battle: battle() });
		expect(gameState.localPlayerId).toBe(SEAT);
	}

	const sent = (event) => mockSocket.emit.mock.calls.filter(c => c[0] === event).map(c => c[1]);
	const resultsCard = () => document.getElementById('tetches-battle-results');

	afterEach(() => { delete window.gameCore; });

	test('the battle still runs: re-focus and play on', async () => {
		boot();
		socketResponses.battle_resume = { success: true, status: 'active', battle: battle(), seatId: SEAT };
		emitServerEvent('connect', {});
		await flush();
		expect(sent('battle_resume')).toEqual([{ battleId: 'b1' }]);
		expect(sent('battle_focus').pop()).toEqual({ battleId: 'b1' });
		expect(gameState.activeBattle?.id).toBe('b1');
		expect(gameState.localPlayerId).toBe(SEAT);
		expect(resultsCard()).toBeNull();
	});

	test('the battle ended while offline: the seat is released and the results shown', async () => {
		boot();
		const ended = battle({
			status: 'finished', winnerSeatId: 'battle-b1-s1',
			seats: [
				// A bot had taken the army over meanwhile.
				{ seatId: SEAT, index: 0, isAi: true, name: 'Me', controlledBy: null, leftBy: mockPlayerId },
				{ seatId: 'battle-b1-s1', index: 1, isAi: true, name: 'Bot', controlledBy: null },
			],
		});
		socketResponses.battle_resume = {
			success: true, status: 'finished', battle: ended,
			results: { reason: 'abandoned', durationMs: 90000, standings: [
				{ seatId: 'battle-b1-s1', name: 'Bot', place: 1, alive: true },
				{ seatId: SEAT, name: 'Me', place: 2, alive: false, knockedOutBy: 'the sea' },
			] },
		};
		emitServerEvent('connect', {});
		await flush();
		expect(gameState.activeBattle).toBeNull();
		expect(gameState.localPlayerId).toBe(mockPlayerId);
		expect(sent('battle_focus').pop()).toEqual({ battleId: null });
		expect(resultsCard()).not.toBeNull();
		expect(resultsCard().dataset.outcome).toBe('defeat');
		// "You" is still marked in the standings (the seat a bot held).
		expect(resultsCard().textContent).toMatch(/You placed 2nd/);
		expect(resultsCard().textContent).toMatch(/ended while you were offline/);
	});

	test('nothing left of the battle: an "ended while you were offline" card', async () => {
		boot();
		socketResponses.battle_resume = { success: true, status: 'gone' };
		emitServerEvent('connect', {});
		await flush();
		expect(gameState.activeBattle).toBeNull();
		expect(gameState.localPlayerId).toBe(mockPlayerId);
		expect(resultsCard().dataset.outcome).toBe('gone');
		expect(resultsCard().textContent).toMatch(/ended while you were offline/);
		// The card's button goes home.
		resultsCard().querySelector('button').click();
		await flush();
		expect(resultsCard()).toBeNull();
	});

	test('a bot held the army: the seat is taken back', async () => {
		boot();
		socketResponses.battle_resume = { success: true, status: 'reclaimed', battle: battle(), seatId: SEAT };
		emitServerEvent('connect', {});
		await flush();
		expect(gameState.activeBattle?.id).toBe('b1');
		expect(gameState.localPlayerId).toBe(SEAT);
		expect(resultsCard()).toBeNull();
		expect(showToastMessage.mock.calls.some(c => /army is yours again/.test(c[0]))).toBe(true);
	});

	test('the army fell meanwhile in a battle that goes on: the seat is released', async () => {
		boot();
		socketResponses.battle_resume = { success: true, status: 'lost', battle: battle() };
		emitServerEvent('connect', {});
		await flush();
		expect(gameState.activeBattle).toBeNull();
		expect(resultsCard().textContent).toMatch(/army fell while you were offline/);
	});

	test('no answer (old server or another drop): keep the seat and ask next time', async () => {
		boot();
		socketResponses.battle_resume = { success: false, error: 'Server timeout' };
		emitServerEvent('connect', {});
		await flush();
		expect(gameState.activeBattle?.id).toBe('b1');
		expect(resultsCard()).toBeNull();
	});

	test('the live end message for a bot-held seat still shows the result', () => {
		boot();
		emitServerEvent('battle_finished', {
			battle: battle({
				status: 'finished', winnerSeatId: SEAT,
				seats: [
					{ seatId: SEAT, index: 0, isAi: true, name: 'Me', controlledBy: null, leftBy: mockPlayerId },
					{ seatId: 'battle-b1-s1', index: 1, isAi: true, name: 'Bot', controlledBy: null },
				],
			}),
			results: { standings: [{ seatId: SEAT, name: 'Me', place: 1, alive: true }] },
		});
		expect(gameState.activeBattle).toBeNull();
		expect(resultsCard().dataset.outcome).toBe('victory');
	});
});
