/**
 * @jest-environment jsdom
 *
 * Tests for `public/js/auth/saveReminder.js` — the guest "save your
 * kingdom before you leave" nudge.
 *
 * Expected behaviour:
 *   • no progress this session → leave silently
 *   • progress + logged out    → block the unload (native dialog)
 *   • progress + logged in     → leave silently
 *   • repeat within the snooze window → leave silently
 */

jest.mock('../../public/js/auth/loginDialog.js', () => ({
	showLoginDialog: jest.fn(),
}));

function clearAuthCookie() {
	document.cookie = 'tetches_auth_key=;path=/;max-age=0';
}

function setAuthCookie() {
	document.cookie = 'tetches_auth_key=player_abcdef0123456789;path=/';
}

function fireBeforeUnload() {
	const event = new Event('beforeunload', { cancelable: true });
	window.dispatchEvent(event);
	return event;
}

describe('saveReminder', () => {
	let saveReminder;
	let showLoginDialog;

	beforeEach(() => {
		jest.resetModules();
		jest.useFakeTimers();
		clearAuthCookie();
		localStorage.clear();
		// Re-require AFTER resetModules so the module under test and the
		// assertion both see the same fresh mock instance.
		({ showLoginDialog } = require('../../public/js/auth/loginDialog.js'));
		showLoginDialog.mockClear();
		saveReminder = require('../../public/js/auth/saveReminder.js');
		saveReminder.initSaveReminder();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('does nothing when the player has no progress', () => {
		const event = fireBeforeUnload();
		expect(event.defaultPrevented).toBe(false);
	});

	test('blocks the unload for a guest with progress, then offers login on stay', () => {
		saveReminder.markKingdomProgress();
		const event = fireBeforeUnload();
		expect(event.defaultPrevented).toBe(true);

		// Page still alive after the delay = they stayed → login offer.
		jest.advanceTimersByTime(2000);
		expect(showLoginDialog).toHaveBeenCalledTimes(1);
	});

	test('lets logged-in players leave without fuss', () => {
		setAuthCookie();
		saveReminder.markKingdomProgress();
		const event = fireBeforeUnload();
		expect(event.defaultPrevented).toBe(false);
		jest.advanceTimersByTime(3000);
		expect(showLoginDialog).not.toHaveBeenCalled();
	});

	test('snoozes after one reminder instead of nagging on every attempt', () => {
		saveReminder.markKingdomProgress();
		expect(fireBeforeUnload().defaultPrevented).toBe(true);
		// Immediately trying to leave again — let them go this time.
		expect(fireBeforeUnload().defaultPrevented).toBe(false);
	});

	test('prefills the login dialog with the stored player name', () => {
		localStorage.setItem('playerName', 'Boudicca');
		saveReminder.markKingdomProgress();
		fireBeforeUnload();
		jest.advanceTimersByTime(2000);
		expect(showLoginDialog).toHaveBeenCalledWith({ prefillUsername: 'Boudicca' });
	});
});
