/**
 * @jest-environment jsdom
 *
 * Tests for `public/js/autoPause.js`.
 *
 * The watcher pauses the player after a fixed idle window and resumes
 * when they come back — but only for pauses IT started, and only while
 * the feature is enabled and pause budget remains. We drive it with
 * jsdom + Jest fake timers (which also fake `Date.now`).
 */

jest.mock('../../public/js/showToastMessage.js', () => ({
	showToastMessage: jest.fn(),
}));

// Flush a handful of microtask turns so a `.then().catch().finally()`
// chain settles. Promises resolve on the microtask queue, which Jest's
// fake timers do not touch, so this works with fake timers active.
const flushPromises = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('autoPause watcher', () => {
	let autoPause;
	let deps;
	let status;

	beforeEach(() => {
		jest.resetModules();
		jest.useFakeTimers();
		jest.setSystemTime(0);
		try { localStorage.clear(); } catch (_e) { /* jsdom */ }

		autoPause = require('../../public/js/autoPause.js');

		status = { active: false, usesRemaining: 4 };
		deps = {
			getPauseStatus: jest.fn(() => status),
			requestPause: jest.fn(() => Promise.resolve({ success: true })),
			requestResume: jest.fn(() => Promise.resolve({ success: true })),
		};
	});

	afterEach(() => {
		autoPause.stopAutoPauseWatcher();
		jest.useRealTimers();
	});

	test('defaults to enabled, and the flag round-trips through storage', () => {
		expect(autoPause.isAutoPauseEnabled()).toBe(true);
		autoPause.setAutoPauseEnabled(false);
		expect(autoPause.isAutoPauseEnabled()).toBe(false);
		autoPause.setAutoPauseEnabled(true);
		expect(autoPause.isAutoPauseEnabled()).toBe(true);
	});

	test('pauses after the idle window elapses', () => {
		autoPause.startAutoPauseWatcher(deps);
		jest.advanceTimersByTime(autoPause.getIdlePauseDelayMs() + 16 * 1000);
		expect(deps.requestPause).toHaveBeenCalledTimes(1);
	});

	test('does not pause while activity keeps arriving', () => {
		autoPause.startAutoPauseWatcher(deps);
		// Halfway to the threshold, then poke an input event.
		jest.advanceTimersByTime(autoPause.getIdlePauseDelayMs() / 2);
		window.dispatchEvent(new Event('mousemove'));
		jest.advanceTimersByTime(autoPause.getIdlePauseDelayMs() / 2);
		expect(deps.requestPause).not.toHaveBeenCalled();
	});

	test('does not pause when disabled', () => {
		autoPause.setAutoPauseEnabled(false);
		autoPause.startAutoPauseWatcher(deps);
		jest.advanceTimersByTime(autoPause.getIdlePauseDelayMs() + 16 * 1000);
		expect(deps.requestPause).not.toHaveBeenCalled();
	});

	test('does not pause when no pause uses remain', () => {
		status.usesRemaining = 0;
		autoPause.startAutoPauseWatcher(deps);
		jest.advanceTimersByTime(autoPause.getIdlePauseDelayMs() + 16 * 1000);
		expect(deps.requestPause).not.toHaveBeenCalled();
	});

	test('does not pause again when already paused', () => {
		status.active = true; // someone (or we) already paused
		autoPause.startAutoPauseWatcher(deps);
		jest.advanceTimersByTime(autoPause.getIdlePauseDelayMs() + 16 * 1000);
		expect(deps.requestPause).not.toHaveBeenCalled();
	});

	test('auto-resumes on activity after an auto-pause', async () => {
		autoPause.startAutoPauseWatcher(deps);
		jest.advanceTimersByTime(autoPause.getIdlePauseDelayMs() + 16 * 1000);
		expect(deps.requestPause).toHaveBeenCalledTimes(1);

		// Mimic the server confirming the pause.
		await flushPromises();
		status.active = true;

		window.dispatchEvent(new Event('keydown'));
		expect(deps.requestResume).toHaveBeenCalledTimes(1);
	});

	test('does NOT auto-resume a manual pause it did not start', () => {
		// Never idle long enough to auto-pause; player paused manually.
		autoPause.startAutoPauseWatcher(deps);
		status.active = true;
		window.dispatchEvent(new Event('keydown'));
		expect(deps.requestResume).not.toHaveBeenCalled();
	});
});
