/**
 * Auto-pause-when-idle watcher.
 *
 * Optional convenience layer on top of the existing manual pause
 * feature (`pause_player` / `resume_player`). When enabled, it watches
 * for local user input and, after `IDLE_PAUSE_DELAY_MS` with no
 * activity, fires a normal pause request on the player's behalf. The
 * server enforces the same per-session pause budget, so an auto-pause
 * consumes one of the player's limited pauses exactly like a manual
 * one — which is why the feature is opt-in.
 *
 * When the player comes back (any input, or the tab regaining focus)
 * and the current pause was one WE started, we auto-resume so they
 * don't return to a frozen board they have to manually un-freeze.
 *
 * Design notes:
 *   • Dependencies (status accessor + pause/resume callbacks) are
 *     injected via `startAutoPauseWatcher` so this module owns no
 *     network or game state of its own and stays unit-testable.
 *   • Activity is stamped cheaply on every input event; a single
 *     low-frequency interval does the idle comparison, so we never
 *     churn timers on high-frequency events like `mousemove`.
 *   • The enabled flag is persisted client-side in `localStorage`.
 */

import { showToastMessage } from './showToastMessage.js';

const IDLE_PAUSE_DELAY_MS = 5 * 60 * 1000; // 5 minutes of no input
const IDLE_CHECK_INTERVAL_MS = 15 * 1000;  // how often we test for idle
const AUTO_PAUSE_PREF_KEY = 'tetches_auto_pause_enabled';

// Input events that count as "the player is here". Kept passive and
// attached at the window level so we don't interfere with gameplay
// handlers. `visibilitychange` is handled separately.
const ACTIVITY_EVENTS = Object.freeze([
	'pointerdown', 'pointermove', 'mousedown', 'mousemove',
	'keydown', 'touchstart', 'wheel',
]);

// Default ON: the whole point is to protect an AFK player's board.
// Players who'd rather conserve their pause budget can switch it off.
const AUTO_PAUSE_DEFAULT_ENABLED = true;

let started = false;
let lastActivityAt = Date.now();
let autoPausedByIdle = false;
let pauseInFlight = false;
let checkTimer = null;

/**
 * @returns {boolean} Whether auto-pause is currently enabled.
 */
export function isAutoPauseEnabled() {
	try {
		const raw = localStorage.getItem(AUTO_PAUSE_PREF_KEY);
		if (raw === null) return AUTO_PAUSE_DEFAULT_ENABLED;
		return raw === '1';
	} catch (_e) {
		return AUTO_PAUSE_DEFAULT_ENABLED;
	}
}

/**
 * Persist the enabled flag. Turning it off while we're mid-auto-pause
 * leaves the current pause in place (the player can resume manually);
 * we just stop initiating new ones.
 * @param {boolean} enabled
 */
export function setAutoPauseEnabled(enabled) {
	try {
		localStorage.setItem(AUTO_PAUSE_PREF_KEY, enabled ? '1' : '0');
	} catch (_e) { /* private browsing — fall back to in-memory default */ }
}

/** Expose the idle delay so the UI can describe it accurately. */
export function getIdlePauseDelayMs() {
	return IDLE_PAUSE_DELAY_MS;
}

function stampActivity(deps) {
	lastActivityAt = Date.now();
	if (!autoPausedByIdle) return;
	// We're returning from an auto-pause — resume immediately so the
	// board comes back to life without a manual click.
	autoPausedByIdle = false;
	const status = safeStatus(deps);
	if (!status || !status.active) return;
	deps.requestResume()
		.then(() => {
			showToastMessage('Welcome back — auto-pause lifted.', 2500);
		})
		.catch(() => { /* the manual button still works as a fallback */ });
}

function safeStatus(deps) {
	try {
		const status = deps.getPauseStatus();
		return status && typeof status === 'object' ? status : null;
	} catch (_e) {
		return null;
	}
}

function maybeAutoPause(deps) {
	if (!isAutoPauseEnabled()) return;
	if (pauseInFlight) return;
	if (Date.now() - lastActivityAt < IDLE_PAUSE_DELAY_MS) return;

	const status = safeStatus(deps);
	// No status yet means we're not a registered player in a game.
	if (!status) return;
	if (status.active) return;                 // already paused (manual or auto)
	if ((status.usesRemaining ?? 0) <= 0) return; // nothing left to spend

	pauseInFlight = true;
	deps.requestPause()
		.then((resp) => {
			if (resp && resp.success) {
				autoPausedByIdle = true;
				showToastMessage(
					'Auto-paused — you were idle. Move or press a key to resume.',
					4000,
				);
			}
		})
		.catch(() => { /* leave the player un-paused; nothing we can do */ })
		.finally(() => { pauseInFlight = false; });
}

/**
 * Begin watching for idle. Safe to call more than once — only the
 * first call wires listeners.
 *
 * @param {Object} deps
 * @param {() => (Object|null)} deps.getPauseStatus  Current cached pause status.
 * @param {() => Promise<Object>} deps.requestPause   Fire a pause request.
 * @param {() => Promise<Object>} deps.requestResume  Fire a resume request.
 * @returns {() => void} A stop function that removes listeners (for tests).
 */
export function startAutoPauseWatcher(deps) {
	if (!deps || typeof deps.getPauseStatus !== 'function'
		|| typeof deps.requestPause !== 'function'
		|| typeof deps.requestResume !== 'function') {
		throw new Error('startAutoPauseWatcher: getPauseStatus, requestPause and requestResume are required');
	}
	if (started) return stopAutoPauseWatcher;
	started = true;
	lastActivityAt = Date.now();

	const onActivity = () => stampActivity(deps);
	for (const evt of ACTIVITY_EVENTS) {
		window.addEventListener(evt, onActivity, { passive: true });
	}

	const onVisibility = () => {
		// A hidden tab counts as idle (we don't stamp), but regaining
		// focus is a strong "I'm back" signal.
		if (!document.hidden) stampActivity(deps);
	};
	document.addEventListener('visibilitychange', onVisibility);

	checkTimer = setInterval(() => {
		try { maybeAutoPause(deps); }
		catch (_e) { /* never let the idle check throw out of the interval */ }
	}, IDLE_CHECK_INTERVAL_MS);
	if (checkTimer && typeof checkTimer.unref === 'function') checkTimer.unref();

	// Store the teardown closure so the exported stop function can find it.
	stopAutoPauseWatcher._teardown = () => {
		for (const evt of ACTIVITY_EVENTS) {
			window.removeEventListener(evt, onActivity);
		}
		document.removeEventListener('visibilitychange', onVisibility);
		if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
		started = false;
	};

	return stopAutoPauseWatcher;
}

/** Tear down the watcher (primarily for tests). */
export function stopAutoPauseWatcher() {
	if (typeof stopAutoPauseWatcher._teardown === 'function') {
		stopAutoPauseWatcher._teardown();
		stopAutoPauseWatcher._teardown = null;
	}
}
