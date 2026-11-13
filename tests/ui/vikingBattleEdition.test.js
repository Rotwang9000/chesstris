/**
 * @jest-environment jsdom
 *
 * Viking battle plumbing in the battle client (battle/battleMode.js):
 *   • battle_create / battle_quickmatch carry the client's edition;
 *   • the seat adopts battle.edition from the server's record (never the
 *     URL) on start, on a repeat adoption and on reconnect;
 *   • lite (2D) mode refuses to create, match or join Viking battles;
 *   • the lobby shows a longship badge with the rules.
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

function battle(overrides = {}) {
	return {
		id: 'VK1', code: 'VK1', status: 'active', mode: 'classic', edition: 'viking',
		centre: { x: 2000, z: 2000 }, playRadius: 14, seatCount: 2, hostId: mockPlayerId,
		seats: [
			{ seatId: 'battle-vk1-s0', index: 0, isAi: false, name: 'Me', controlledBy: mockPlayerId },
			{ seatId: 'battle-vk1-s1', index: 1, isAi: true, name: 'Bot', controlledBy: null },
		],
		...overrides,
	};
}

describe('Viking battles in the battle client', () => {
	let battleMode;
	let gameState;
	let showToastMessage;

	function boot({ viking = false, lite = false } = {}) {
		jest.resetModules();
		for (const k of Object.keys(mockListeners)) delete mockListeners[k];
		document.body.innerHTML = '';
		if (viking) document.documentElement.dataset.edition = 'viking';
		else delete document.documentElement.dataset.edition;
		socketResponses = { battle_state: { success: true, battles: [] } };
		mockSocket = {
			emit: jest.fn((event, data, cb) => {
				const r = socketResponses[event];
				if (typeof cb === 'function') cb(typeof r === 'function' ? r(data) : (r || { success: true }));
			}),
		};
		gameState = { localPlayerId: mockPlayerId, activeBattle: null, ...(lite ? { liteMode: true } : {}) };
		window.gameCore = {
			isWorldEntered: jest.fn(() => false),
			startBattleSession: jest.fn(),
			showWelcomeOverview: jest.fn(),
			flyToPlayerKing: jest.fn(() => true),
		};
		({ showToastMessage } = require('../../public/js/showToastMessage.js'));
		battleMode = require('../../public/js/battle/battleMode.js');
		battleMode.initBattleMode(gameState);
	}

	const sent = (event) => mockSocket.emit.mock.calls.filter(c => c[0] === event).map(c => c[1]);

	afterEach(() => {
		delete window.gameCore;
		delete document.documentElement.dataset.edition;
	});

	test('a standard client creates and matches standard battles', async () => {
		boot();
		await battleMode.createBattle(2, 'auto', 'quick');
		await battleMode.quickMatch();
		expect(sent('battle_create')[0]).toEqual({ seatCount: 2, botDifficulty: 'auto', mode: 'quick', edition: 'standard' });
		expect(sent('battle_quickmatch')[0]).toEqual({ edition: 'standard' });
	});

	test('a Viking client asks for Viking battles', async () => {
		boot({ viking: true });
		await battleMode.createBattle(3, 'hard', 'classic');
		await battleMode.quickMatch();
		expect(sent('battle_create')[0].edition).toBe('viking');
		expect(sent('battle_quickmatch')[0]).toEqual({ edition: 'viking' });
	});

	test('the seat adopts the battle’s edition, not the page’s', () => {
		jest.useFakeTimers();
		try {
			boot(); // standard page
			emitServerEvent('battle_started', { battle: battle() });
			expect(gameState.activeBattle).toMatchObject({ id: 'VK1', edition: 'viking' });
			// (after the opening toasts: one message at a time)
			expect(showToastMessage.mock.calls.some(c => /Longships in play/.test(c[0]))).toBe(false);
			jest.advanceTimersByTime(12000);
			expect(showToastMessage.mock.calls.some(c => /Longships in play/.test(c[0]))).toBe(true);
		} finally {
			jest.useRealTimers();
		}
	});

	test('a Viking page in a standard battle plays standard', () => {
		boot({ viking: true });
		emitServerEvent('battle_started', { battle: battle({ edition: 'standard' }) });
		expect(gameState.activeBattle.edition).toBe('standard');
	});

	test('a repeat adoption (reconnect / poll) refreshes the edition', () => {
		boot();
		emitServerEvent('battle_started', { battle: battle({ edition: 'standard' }) });
		gameState.activeBattle.edition = 'standard';
		emitServerEvent('battle_started', { battle: battle({ edition: 'viking' }) });
		expect(gameState.activeBattle.edition).toBe('viking');
		// A payload without the field keeps what we knew.
		emitServerEvent('battle_started', { battle: battle({ edition: undefined }) });
		expect(gameState.activeBattle.edition).toBe('viking');
	});

	test('lite mode refuses to create or match a Viking battle', async () => {
		boot({ viking: true, lite: true });
		const created = await battleMode.createBattle(2);
		const matched = await battleMode.quickMatch();
		expect(created.success).toBe(false);
		expect(created.error).toMatch(/3D/);
		expect(matched.success).toBe(false);
		expect(sent('battle_create')).toEqual([]);
		expect(sent('battle_quickmatch')).toEqual([]);
	});

	test('lite mode hands a joined Viking seat straight back, and never adopts one', async () => {
		boot({ lite: true });
		socketResponses.battle_join = { success: true, battle: battle({ status: 'lobby' }) };
		const joined = await battleMode.joinBattle('VK1');
		expect(joined.success).toBe(false);
		expect(sent('battle_leave')).toEqual([{ battleId: 'VK1' }]);
		emitServerEvent('battle_started', { battle: battle() });
		expect(gameState.activeBattle).toBeNull();
		expect(showToastMessage.mock.calls.some(c => /3D/.test(c[0]))).toBe(true);
	});

	test('lite mode still plays standard battles', async () => {
		boot({ lite: true });
		socketResponses.battle_join = { success: true, battle: battle({ status: 'lobby', edition: 'standard' }) };
		expect((await battleMode.joinBattle('VK1')).success).toBe(true);
		emitServerEvent('battle_started', { battle: battle({ edition: 'standard' }) });
		expect(gameState.activeBattle.edition).toBe('standard');
	});

	test('the lobby of a Viking battle wears a longship badge with the rules', async () => {
		boot();
		socketResponses.battle_state = { success: true, battle: battle({ status: 'lobby', seats: battle().seats.slice(0, 1) }) };
		await battleMode.showBattleDialog();
		const dialog = document.getElementById('tetches-battle-dialog');
		const badge = dialog.querySelector('.viking-battle-badge');
		expect(badge).toBeTruthy();
		expect(badge.textContent).toMatch(/Viking battle: longships in play/);
		const rules = dialog.querySelector('.viking-battle-rules');
		expect(rules.style.display).toBe('none');
		badge.querySelector('button').click();
		expect(rules.style.display).toBe('block');
		expect(rules.textContent).toMatch(/While YOUR ship rows/);
	});

	test('no badge anywhere in the standard game', async () => {
		boot();
		socketResponses.battle_state = { success: true, battle: battle({ status: 'lobby', edition: 'standard', seats: battle().seats.slice(0, 1) }) };
		await battleMode.showBattleDialog();
		expect(document.querySelector('.viking-battle-badge')).toBeNull();
	});

	test.each(['standard', 'viking'])('a reconnect mid %s battle keeps the seat as the identity', (edition) => {
		boot();
		emitServerEvent('battle_started', { battle: battle({ edition }) });
		const seatId = gameState.localPlayerId;
		expect(seatId).toBe('battle-vk1-s0');
		const { keepSeatOnRejoin } = require('../../public/js/battle/seatHold.js');
		// The server re-announces the real id on reconnect: the seat stays.
		expect(keepSeatOnRejoin(mockPlayerId)).toBe(true);
		expect(gameState.localPlayerId).toBe(seatId);
	});
});
