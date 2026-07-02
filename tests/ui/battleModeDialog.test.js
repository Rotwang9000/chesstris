/**
 * @jest-environment jsdom
 *
 * Battle-mode client tests (public/js/battle/battleMode.js).
 *
 * Pins the two bugs the user hit:
 *   1. "Start battle does nothing" — battle events arrive as plain
 *      forwarded socket events; subscribing via onMessage() left them
 *      unheard. The module must subscribe with `on(...)`.
 *   2. Battle-only entry — adopting a seat must start the battle
 *      session via gameCore WITHOUT any world join, and finishing a
 *      battle as a homeless player must return to the welcome screen.
 */

const mockListeners = {};
let mockSocket;
const mockPlayerId = 'real-player-1';

jest.mock('../../public/js/utils/networkManager.js', () => ({
	getSocket: jest.fn(() => mockSocket),
	getPlayerId: jest.fn(() => mockPlayerId),
	ensureConnected: jest.fn(() => Promise.resolve(true)),
	on: jest.fn((eventType, handler) => {
		mockListeners[eventType] = mockListeners[eventType] || [];
		mockListeners[eventType].push(handler);
	}),
}));

jest.mock('../../public/js/showToastMessage.js', () => ({
	showToastMessage: jest.fn(),
}));

function emitServerEvent(eventType, payload) {
	for (const handler of mockListeners[eventType] || []) handler(payload);
}

/** Battle fixtures the fake socket serves for battle_* commands. */
let socketResponses;

function makeFakeSocket() {
	return {
		emit: jest.fn((event, data, cb) => {
			const responder = socketResponses[event];
			if (typeof cb === 'function') {
				cb(typeof responder === 'function' ? responder(data) : (responder || { success: true }));
			}
		}),
	};
}

function lobbyBattle(overrides = {}) {
	return {
		id: 'CODE99',
		code: 'CODE99',
		status: 'lobby',
		centre: null,
		seatCount: 2,
		hostId: mockPlayerId,
		seats: [
			{ seatId: 'battle-code99-s0', index: 0, isAi: false, name: 'Hosty', controlledBy: mockPlayerId },
		],
		...overrides,
	};
}

function activeBattle(overrides = {}) {
	return lobbyBattle({
		status: 'active',
		centre: { x: 2000, z: 2000 },
		seats: [
			{ seatId: 'battle-code99-s0', index: 0, isAi: false, name: 'Hosty', controlledBy: mockPlayerId },
			{ seatId: 'battle-code99-s1', index: 1, isAi: true, name: 'Bot 2', controlledBy: null },
		],
		...overrides,
	});
}

describe('battleMode client', () => {
	let battleMode;
	let gameState;
	let showToastMessage;

	beforeEach(() => {
		jest.resetModules();
		for (const key of Object.keys(mockListeners)) delete mockListeners[key];
		document.body.innerHTML = '';
		socketResponses = { battle_state: { success: true, battle: null } };
		mockSocket = makeFakeSocket();
		gameState = { localPlayerId: mockPlayerId, activeBattle: null };
		window.gameCore = {
			isWorldEntered: jest.fn(() => false),
			startBattleSession: jest.fn(() => true),
			showWelcomeOverview: jest.fn(),
			flyToPlayerKing: jest.fn(() => true),
		};
		// Re-require AFTER resetModules so the module under test and the
		// assertions see the same fresh mock instances.
		({ showToastMessage } = require('../../public/js/showToastMessage.js'));
		showToastMessage.mockClear();
		battleMode = require('../../public/js/battle/battleMode.js');
		battleMode.initBattleMode(gameState);
	});

	afterEach(() => {
		jest.useRealTimers();
		delete window.gameCore;
	});

	test('subscribes to battle events on the PLAIN event bus (not onMessage)', () => {
		// The regression: events forwarded by the socket bridge fire as
		// `on('battle_started')`. If nothing registered for them, the
		// "Start battle" click looks like it does nothing.
		for (const eventType of [
			'battle_lobby_update', 'battle_started', 'battle_finished', 'battle_cancelled',
		]) {
			expect(mockListeners[eventType]?.length || 0).toBeGreaterThan(0);
		}
	});

	test('create/join dialog shows both sections and a Back button pre-entry', async () => {
		await battleMode.showBattleDialog();
		const dialog = document.getElementById('tetches-battle-dialog');
		expect(dialog).toBeTruthy();
		expect(dialog.textContent).toContain('START A NEW BATTLE');
		expect(dialog.textContent).toContain('JOIN A FRIEND');
		// Not entered the world → dismissing goes back to the welcome
		// screen, and the button says so.
		expect(dialog.textContent).toContain('← Back');
	});

	test('lobby renders the code, live seats, and a bot-count start hint', async () => {
		socketResponses.battle_state = { success: true, battle: lobbyBattle() };
		await battleMode.showBattleDialog();
		const dialog = document.getElementById('tetches-battle-dialog');
		expect(dialog.textContent).toContain('CODE99');
		expect(dialog.textContent).toContain('Hosty');
		expect(dialog.textContent).toContain('Open seat');
		// Host with one empty seat → start button spells out the bot fill.
		const startBtn = [...dialog.querySelectorAll('button')]
			.find(btn => btn.textContent.includes('Start'));
		expect(startBtn).toBeTruthy();
		expect(startBtn.textContent).toContain('1 bot');

		// A live lobby update re-renders the seat list in place.
		emitServerEvent('battle_lobby_update', {
			battle: lobbyBattle({
				seats: [
					...lobbyBattle().seats,
					{ seatId: 'battle-code99-s1', index: 1, isAi: false, name: 'Guesty', controlledBy: 'real-player-2' },
				],
			}),
		});
		expect(document.getElementById('tetches-battle-dialog').textContent).toContain('Guesty');
	});

	test('battle_started adopts the seat and starts the battle session (no world join)', () => {
		emitServerEvent('battle_started', { battle: activeBattle() });

		expect(gameState.localPlayerId).toBe('battle-code99-s0');
		expect(gameState.myPlayerId).toBe('battle-code99-s0');
		expect(gameState.activeBattle).toEqual(
			expect.objectContaining({ id: 'CODE99', centre: { x: 2000, z: 2000 } })
		);
		expect(gameState.turnPhase).toBe('tetris');
		expect(window.gameCore.startBattleSession).toHaveBeenCalledTimes(1);
	});

	test('battle_finished returns a battle-only player to the welcome overview', () => {
		jest.useFakeTimers();
		emitServerEvent('battle_started', { battle: activeBattle() });
		emitServerEvent('battle_finished', {
			battle: activeBattle({ status: 'finished', winnerSeatId: 'battle-code99-s0' }),
		});

		// Identity restored to the real player…
		expect(gameState.activeBattle).toBeNull();
		expect(gameState.localPlayerId).toBe(mockPlayerId);
		expect(showToastMessage).toHaveBeenCalledWith(
			expect.stringContaining('Victory'), expect.anything()
		);
		// …and (not having entered the world) the welcome screen returns.
		jest.advanceTimersByTime(3000);
		expect(window.gameCore.showWelcomeOverview).toHaveBeenCalled();
		// No flight to a kingdom that does not exist.
		expect(window.gameCore.flyToPlayerKing).not.toHaveBeenCalledWith(mockPlayerId);
	});

	test('battle_finished flies a world player home instead of showing the modal', () => {
		jest.useFakeTimers();
		window.gameCore.isWorldEntered.mockReturnValue(true);
		emitServerEvent('battle_started', { battle: activeBattle() });
		emitServerEvent('battle_finished', {
			battle: activeBattle({ status: 'finished', winnerSeatId: 'battle-code99-s1' }),
		});

		expect(gameState.localPlayerId).toBe(mockPlayerId);
		jest.advanceTimersByTime(5000);
		expect(window.gameCore.showWelcomeOverview).not.toHaveBeenCalled();
	});

	test('battle_cancelled while homeless returns to the welcome overview', () => {
		emitServerEvent('battle_cancelled', { battleId: 'CODE99', reason: 'timeout' });
		expect(window.gameCore.showWelcomeOverview).toHaveBeenCalled();
	});

	test('enterBattleFlow with an invite code claims the seat then opens the lobby', async () => {
		socketResponses.battle_join = (data) => ({
			success: true,
			battle: lobbyBattle({ hostId: 'someone-else', code: String(data.code).toUpperCase() }),
			seatId: 'battle-code99-s1',
		});
		socketResponses.battle_state = () => ({
			success: true,
			battle: lobbyBattle({ hostId: 'someone-else' }),
		});

		const ok = await battleMode.enterBattleFlow('code99');
		expect(ok).toBe(true);
		expect(mockSocket.emit).toHaveBeenCalledWith(
			'battle_join', expect.objectContaining({ code: 'code99' }), expect.any(Function)
		);
		const dialog = document.getElementById('tetches-battle-dialog');
		expect(dialog).toBeTruthy();
		expect(dialog.textContent).toContain('Waiting for the host');
	});
});
