/**
 * @jest-environment jsdom
 *
 * A network blip longer than one reconnect round used to leave the page
 * offline for good: the round's three attempts failed, and with no
 * socket there was never another 'disconnect' to schedule the next one.
 * Mid-battle, a bot then took the seat and the battle ended without us
 * while the sea block kept gliding over a board that no longer changed.
 */

import NetworkManager from '../../public/js/utils/NetworkManagerClass.js';

function manager() {
	const nm = new NetworkManager();
	nm.state.hasAutoInitialized = true;
	nm.isConnected = jest.fn(() => nm.state.connectionStatus === 'connected');
	return nm;
}

describe('reconnecting after the network comes back', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	test('a failed round schedules the next one until a connection is made', async () => {
		const nm = manager();
		let calls = 0;
		nm.ensureConnected = jest.fn(async () => {
			calls++;
			if (calls < 4) return false;            // three rounds fail
			nm.state.connectionStatus = 'connected';
			return true;
		});
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		jest.spyOn(console, 'log').mockImplementation(() => {});
		nm.handleSocketDisconnect('transport close');
		for (let i = 0; i < 20; i++) {
			jest.advanceTimersByTime(30_000);
			await Promise.resolve();
			await Promise.resolve();
		}
		expect(nm.ensureConnected).toHaveBeenCalledTimes(4);
		expect(nm.state.connectionStatus).toBe('connected');
	});

	test('a failing attempt that throws keeps the rounds going too', async () => {
		const nm = manager();
		let calls = 0;
		nm.ensureConnected = jest.fn(async () => {
			calls++;
			if (calls < 3) throw new Error('xhr poll error');
			nm.state.connectionStatus = 'connected';
			return true;
		});
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		jest.spyOn(console, 'log').mockImplementation(() => {});
		nm.handleSocketDisconnect('transport close');
		for (let i = 0; i < 20; i++) {
			jest.advanceTimersByTime(30_000);
			await Promise.resolve();
			await Promise.resolve();
		}
		expect(nm.ensureConnected).toHaveBeenCalledTimes(3);
	});

	test('the browser coming back online tries straight away', async () => {
		const nm = manager();
		nm.ensureConnected = jest.fn(async () => false);
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		jest.spyOn(console, 'log').mockImplementation(() => {});
		nm.handleSocketDisconnect('transport close');
		expect(nm.ensureConnected).not.toHaveBeenCalled();
		window.dispatchEvent(new Event('online'));
		expect(nm.ensureConnected).toHaveBeenCalledTimes(1);
	});

	test('a deliberate disconnect does not reconnect', () => {
		const nm = manager();
		nm.ensureConnected = jest.fn(async () => true);
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		nm.handleSocketDisconnect('io client disconnect');
		jest.advanceTimersByTime(120_000);
		expect(nm.ensureConnected).not.toHaveBeenCalled();
	});
});
