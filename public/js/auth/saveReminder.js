/**
 * Leave-page save reminder for guests.
 *
 * Logging in is optional — guests play freely on the device cookie — but a
 * guest who quietly closes the tab may lose their kingdom (new device,
 * cleared cookies…). So: once the player has actually placed something
 * this session, leaving without an account triggers the browser's native
 * "leave site?" dialog. If they choose to stay, we take that as interest
 * and open the login dialog for them.
 *
 * Browsers don't tell us the dialog's outcome, so we infer "stayed" from
 * the page still being alive shortly after `beforeunload` fired (all
 * timers die with the page when they really leave). Custom text in the
 * native dialog is impossible — every browser shows its own generic
 * wording — hence this two-step approach.
 */

import { isLoggedIn } from './kingdomKey.js';
import { showLoginDialog } from './loginDialog.js';

// Give the browser time to actually unload before concluding "stayed".
const STAYED_ON_PAGE_DELAY_MS = 1500;
// Don't re-nag someone who dismissed the prompt and keeps playing.
const REMINDER_SNOOZE_MS = 15 * 60 * 1000;

let reminderArmed = false;
let hasSessionProgress = false;
let lastReminderAt = 0;

/**
 * Call when the player does something worth keeping (first successful
 * tetromino placement of the session is the trigger we use).
 */
export function markKingdomProgress() {
	hasSessionProgress = true;
}

/** Install the beforeunload listener (idempotent). */
export function initSaveReminder() {
	if (reminderArmed) return;
	reminderArmed = true;

	window.addEventListener('beforeunload', (event) => {
		if (!hasSessionProgress) return;
		try {
			if (isLoggedIn()) return;
		} catch (_e) {
			return; // cookie access failed — don't block the unload
		}
		if (Date.now() - lastReminderAt < REMINDER_SNOOZE_MS) return;
		lastReminderAt = Date.now();

		// Triggers the native "changes may not be saved" dialog.
		event.preventDefault();
		event.returnValue = '';

		// Still here in a moment = they cancelled the leave. Offer the
		// login that makes their kingdom permanent. (If the page unloads,
		// this timer dies with it — no stray dialogs.)
		setTimeout(() => {
			let prefill = '';
			try { prefill = localStorage.getItem('playerName') || ''; } catch (_e) { /* private mode */ }
			try { showLoginDialog({ prefillUsername: prefill }); } catch (_e) { /* dialog already open */ }
		}, STAYED_ON_PAGE_DELAY_MS);
	});
}
