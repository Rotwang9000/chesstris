const DEDUP_WINDOW_MS = 2000;
const MAX_VISIBLE_TOASTS = 2;
let _recentMessages = [];
let _avoider = null;

/**
 * Something on screen toasts must not cover (Viking edition: the
 * player's own longship, moored just below the home row where the
 * toasts land). `fn` returns its screen box `{left, top, right, bottom}`
 * in CSS px, or null; pass null to stop. Never set in the standard game.
 */
export function setToastAvoider(fn) {
	_avoider = typeof fn === 'function' ? fn : null;
}

/** The box toasts and tips keep clear of right now, or null. */
export function avoidRect() {
	try { return _avoider ? _avoider() : null; } catch (_e) { return null; }
}

let _avoidExtra = null;

/**
 * More screen boxes toasts keep clear of (Viking edition: the falling
 * tetromino). `fn` returns an array of `{left, top, right, bottom}`; pass
 * null to stop. Never set in the standard game.
 */
export function setToastAvoidExtra(fn) {
	_avoidExtra = typeof fn === 'function' ? fn : null;
}

// The top HUD (title, strip, Next piece and the stack under it, the
// round buttons on a phone, the sea banner).
const TOP_HUD = ['.game-title', '.debug-indicator', '#next-tetromino-display', '#turn-action-stack', '#longship-button',
	'#audio-mute-toggle', '#activity-log-toggle', '#tetches-sea-hud'];

/**
 * "Up in the far side of the arena": just under the top HUD (on a phone
 * a fixed 24% of the screen landed on the round buttons and the sea
 * banner), never above 24% down.
 */
function highTop(vh) {
	let bottom = topHudBottom();
	// (and the CHECK! banner docked under it)
	const banner = document.getElementById('check-alert-banner');
	if (banner && !banner.classList.contains('attacker')) {
		const q = banner.getBoundingClientRect();
		if (q.height > 0) bottom = Math.max(bottom, q.bottom);
	}
	return Math.max(vh * 0.24, bottom + 8);
}

/**
 * Where the top HUD ends on screen (CSS px from the top; 0 when none
 * shows): the CHECK! alert docks just under it.
 */
export function topHudBottom(span = null) {
	if (typeof document === 'undefined' || typeof window === 'undefined') return 0;
	const vh = window.innerHeight;
	let bottom = 0;
	for (const sel of TOP_HUD) {
		const el = document.querySelector(sel);
		if (!el) continue;
		const q = el.getBoundingClientRect();
		if (!(q.height > 0 && q.width > 0) || q.top >= vh * 0.4) continue;
		// (only what lies above `span` {left, right}, when given: on a
		// desktop the tall Next piece column is off to the side)
		if (span && (q.right <= span.left || q.left >= span.right)) continue;
		bottom = Math.max(bottom, q.bottom);
	}
	return bottom;
}

function keepClearOf(container) {
	let r = null;
	try { r = _avoider ? _avoider() : null; } catch (_e) { r = null; }
	let extra = [];
	try { extra = _avoidExtra ? (_avoidExtra() || []) : []; } catch (_e) { extra = []; }
	if (r && !(r.bottom > r.top)) r = null;
	extra = extra.filter(q => q && q.bottom > q.top);
	const rects = (r ? [r] : []).concat(extra);
	if (!rects.length) return;
	const t = container.getBoundingClientRect();
	if (!(t.height > 0)) return;
	const hits = (top) => rects.some(q => t.left < q.right && t.right > q.left && top < q.bottom && top + t.height > q.top);
	if (!hits(t.top)) return;
	const vh = window.innerHeight;
	const current = parseFloat(container.style.bottom) || 0;
	// Where it may go, best first: just below the ship (above whatever the
	// toasts already clear, the touch pad), just below the falling piece,
	// up in the far side of the arena under the top HUD, or just above the
	// ship (last: there it covers the player's own pieces).
	const tops = [];
	if (r) tops.push(r.bottom + 8);
	for (const q of extra) tops.push(q.bottom + 8);
	const high = highTop(vh);
	tops.push(high);
	if (r) tops.push(r.top - 8 - t.height);
	for (const top of tops) {
		const bottom = vh - top - t.height;
		if (bottom < current || top < 8) continue;
		if (!hits(top)) { container.style.bottom = `${Math.round(bottom)}px`; return; }
	}
	if (!r) return;
	const belowBottom = vh - (r.bottom + 8 + t.height);
	let next;
	if (belowBottom >= current) next = belowBottom;
	else {
		next = (high + t.height + 8 < r.top) ? vh - high - t.height : vh - r.top + 8;
	}
	container.style.bottom = `${Math.round(Math.max(current, Math.min(next, vh - t.height - 8)))}px`;
}

// The variants a toast can take (their look: `.toast-*` in index.html).
const TOAST_VARIANTS = { info: true, alert: true, success: true };
const TOAST_ICONS = { longship: true };

/**
 * Show a toast message with deduplication.
 *
 * @param {string} message - Message to display
 * @param {number|Object} [optionsOrDuration] - either a duration in ms (legacy
 *   signature) or an options object: `{ duration?, variant? }`.
 *   `variant` defaults to `'info'` ('alert' is louder/red for things like
 *   "Your knight was captured" so the player can't miss them).
 */
export function showToastMessage(message, optionsOrDuration, _since = Date.now()) {
	// Viking edition, portrait phone: while a painting is up at full size
	// (paintingCard sets the flag for its first ~2 s) toasts wait their
	// turn instead of landing on top of it. Never set in the standard game.
	const heroAt = typeof document !== 'undefined' ? Number(document.documentElement?.dataset?.paintingHero) : NaN;
	// Any painting card, any screen: a toast arriving with it (often the
	// same news in words) waits a moment, so the picture lands alone.
	const cardAt = typeof document !== 'undefined' ? Number(document.documentElement?.dataset?.paintingCardAt) : NaN;
	// Viking edition (the avoider is set only while longships are drawn):
	// one thing at a time — a toast waits while a tip is on screen.
	// (never longer than WAIT_MAX_MS: then it shows regardless)
	const waited = Date.now() - _since;
	// (an alert — check, a capture — never waits behind a tip)
	const urgent = !!optionsOrDuration && typeof optionsOrDuration === 'object' && optionsOrDuration.variant === 'alert';
	const tipUp = !urgent && !!_avoider && waited < WAIT_MAX_MS && typeof document !== 'undefined'
		&& !!document.querySelector?.('.one-time-tip');
	// …and one toast at a time (two stacked mid-screen hid the arena): the
	// one up gives way once it has been read for a moment.
	const holdFor = !!_avoider && waited < WAIT_MAX_MS ? makeWayForNext() : 0;
	if (tipUp || holdFor > 0 || (heroAt > 0 && Date.now() - heroAt < 4000) || (cardAt > 0 && Date.now() - cardAt < 2400)) {
		setTimeout(() => showToastMessage(message, optionsOrDuration, _since), Math.max(400, holdFor));
		return;
	}
	const { duration, variant, aboveInfoCard, icon } = normaliseOptions(optionsOrDuration);
	// A toast that waited its turn may have gone stale meanwhile (a hint
	// about the ship just tapped, shown after it had already sailed):
	// `stillTrue` is asked when it finally shows.
	const stillTrue = optionsOrDuration && typeof optionsOrDuration === 'object' ? optionsOrDuration.stillTrue : null;
	if (typeof stillTrue === 'function') {
		let ok = true;
		try { ok = !!stillTrue(); } catch (_e) { ok = true; }
		if (!ok) return;
	}

	const now = Date.now();
	_recentMessages = _recentMessages.filter(r => now - r.ts < DEDUP_WINDOW_MS);
	if (_recentMessages.some(r => r.msg === message)) return;
	_recentMessages.push({ msg: message, ts: now });

	let toastContainer = document.getElementById('toast-container');
	// Docked in a dialog that has closed since: back to the screen.
	if (toastContainer && toastContainer.classList.contains('toast-docked')) {
		const host = toastContainer.parentElement;
		const hr = host && host.isConnected ? host.getBoundingClientRect() : null;
		if (!hr || !(hr.height > 0)) undock(toastContainer);
	}
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.id = 'toast-container';

		Object.assign(toastContainer.style, {
			position: 'fixed',
			bottom: '20px',
			left: '50%',
			transform: 'translateX(-50%)',
			// Above the dialogs (12000-12500) and their blurred scrim: a
			// toast raised while one is open ("Server timeout") was drawn
			// under the blur, unreadable. clearOfDialog keeps it off the card.
			zIndex: '12600',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			width: 'auto',
			maxWidth: '80%',
			pointerEvents: 'none'
		});

		document.body.appendChild(toastContainer);
	}

	// If the touch control pad is currently on screen, push toasts
	// above it. The pad owns the bottom-centre during the tetris
	// phase on mobile; without this, every "Line cleared!" toast
	// lands directly behind the move buttons.
	const pad = document.getElementById('touch-control-pad');
	if (pad && pad.style.visibility === 'visible') {
		const padHeight = pad.offsetHeight || 130;
		toastContainer.style.bottom = `${padHeight + 30}px`;
	} else {
		toastContainer.style.bottom = '20px';
	}

	while (toastContainer.children.length >= MAX_VISIBLE_TOASTS) {
		toastContainer.removeChild(toastContainer.firstChild);
	}

	const toast = document.createElement('div');
	toast.classList.add('toast-message');
	if (variant) toast.classList.add(`toast-${variant}`);
	if (variant === 'alert') toast.setAttribute('role', 'alert');
	// A drawn icon before the words (`.toast-icon-*` in the UI theme): the
	// Viking longship, in place of the modern sailboat emoji.
	if (icon && TOAST_ICONS[icon]) toast.classList.add(`toast-icon-${icon}`);

	// Colours, border and type per variant: `.toast-*` in the UI theme
	// (index.html). Inline: only layout and the slide in / out.
	Object.assign(toast.style, {
		marginBottom: '10px',
		opacity: '0',
		transition: 'opacity 0.3s, transform 0.3s',
		transform: 'translateY(20px)',
		textAlign: 'center',
		maxWidth: '100%',
		boxSizing: 'border-box',
	});

	toast.textContent = message;
	toast.dataset.shownAt = String(Date.now());
	// (asked again while it shows: a hint about the ship just chosen
	// went on saying "tap a glowing tile to sail" after it had sailed)
	if (typeof stillTrue === 'function') toast._stillTrue = stillTrue;
	toastContainer.appendChild(toast);
	if (!toastContainer.classList.contains('toast-docked')) {
		clearOfHud(toastContainer);
		if (aboveInfoCard) liftAboveInfoCard(toastContainer);
		if (_avoider) keepClearOf(toastContainer);
		clearOfTip(toastContainer);
	}
	clearOfDialog(toastContainer);
	watchDialogs(toastContainer);

	setTimeout(() => {
		toast.style.opacity = '1';
		toast.style.transform = 'translateY(0)';
	}, 10);

	setTimeout(() => {
		toast.style.opacity = '0';
		toast.style.transform = 'translateY(-20px)';

		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		}, 300);
	}, duration);
}

// The HUD along the bottom of the screen: the button strip and the
// links over it (bottom left), the round buttons (bottom right).
// (and the Recent activity panel: a bottom sheet on a phone, where an
// alert landed butting against its top edge)
const BOTTOM_HUD = ['.debug-indicator', '.advertise-link', '#session-warning', '#audio-mute-toggle', '#activity-log-toggle',
	'#activity-log-panel[data-open]'];

/**
 * Toasts sit bottom-centre; a long one reached across the button strip
 * and hid its buttons. When the toasts would overlap any of the bottom
 * HUD, they rise to just above it.
 */
function clearOfHud(container) {
	if (typeof document === 'undefined' || typeof window === 'undefined') return;
	const t = container.getBoundingClientRect();
	if (!(t.height > 0)) return;
	let top = Infinity;
	for (const sel of BOTTOM_HUD) {
		for (const el of document.querySelectorAll(sel)) {
			const r = el.getBoundingClientRect();
			if (!(r.height > 0) || r.top < window.innerHeight * 0.5) continue;
			if (t.left < r.right + 8 && t.right > r.left - 8 && t.bottom > r.top - 8) top = Math.min(top, r.top);
		}
	}
	if (top === Infinity) return;
	const lifted = window.innerHeight - top + 10;
	const current = parseFloat(container.style.bottom) || 0;
	if (lifted > current) container.style.bottom = `${Math.round(lifted)}px`;
}

/**
 * A dialog is open: the toast (drawn above it) must not cover the card's
 * text or buttons. It goes just above the card, or to the top of the
 * screen when there is no room above.
 */
function clearOfDialog(container) {
	if (typeof document === 'undefined' || typeof window === 'undefined') return;
	// Docked in a dialog that has since closed (hidden, or gone): back to
	// the screen.
	if (container.classList.contains('toast-docked')) {
		const host = container.parentElement;
		const r = host ? host.getBoundingClientRect() : null;
		if (host && host.isConnected && r && r.height > 0 && r.width > 0) return;
		undock(container);
	}
	const t = container.getBoundingClientRect();
	if (!(t.height > 0)) return;
	const vh = window.innerHeight;
	for (const d of document.querySelectorAll('.tx-dialog')) {
		const r = d.getBoundingClientRect();
		if (!(r.height > 0) || !(r.width > 0)) continue;
		if (!(t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top)) continue;
		// Just above the card, else just below it; when the card fills the
		// screen (a phone) there is no gap anywhere, and a toast laid over
		// it hid its title or its Close button: it docks inside the card,
		// on top of its content, until it fades.
		if (r.top - 10 - t.height >= 8) {
			container.style.bottom = `${Math.round(vh - r.top + 10)}px`;
		} else if (r.bottom + 10 + t.height <= vh - 8) {
			container.style.bottom = `${Math.round(vh - r.bottom - 10 - t.height)}px`;
		} else {
			dock(container, d);
		}
		return;
	}
}

/**
 * A tip card is up mid-screen (nextPiece.js): a toast that would land on
 * it goes just below it, or just above when there is no room below.
 */
function clearOfTip(container) {
	const tip = document.querySelector('.one-time-tip');
	if (!tip) return;
	const r = tip.getBoundingClientRect();
	const t = container.getBoundingClientRect();
	if (!(r.height > 0) || !(t.height > 0)) return;
	if (!(t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top)) return;
	const vh = window.innerHeight;
	if (r.bottom + 10 + t.height <= vh - 8) container.style.bottom = `${Math.round(vh - r.bottom - 10 - t.height)}px`;
	else if (r.top - 10 - t.height >= 8) container.style.bottom = `${Math.round(vh - r.top + 10)}px`;
}

/** Toasts docked in a dialog: first thing in the card, pinned to its top as it scrolls. */
function dock(container, dialog) {
	container.classList.add('toast-docked');
	dialog.insertBefore(container, dialog.firstChild);
}

function undock(container) {
	container.classList.remove('toast-docked');
	document.body.appendChild(container);
}

/** Fade out the toasts whose `stillTrue` no longer holds. */
function dropStale(container) {
	for (const t of Array.from(container.children)) {
		if (typeof t._stillTrue !== 'function' || t.dataset.leaving) continue;
		let ok = true;
		try { ok = !!t._stillTrue(); } catch (_e) { ok = true; }
		if (ok) continue;
		t.dataset.leaving = '1';
		t.style.opacity = '0';
		t.style.transform = 'translateY(-20px)';
		setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
	}
}

let _dialogWatch = null;
let _watched = null;
/**
 * A toast already up when a dialog opens over it (the Controls card,
 * the battle hub) ended up on the card's buttons; one up when a card
 * grows past it was cut off at the top. While toasts are on screen
 * they are re-placed against the dialogs a few times a second.
 */
function watchDialogs(container) {
	if (typeof window === 'undefined' || (_dialogWatch && _watched === container)) return;
	if (_dialogWatch) clearInterval(_dialogWatch);
	_watched = container;
	_dialogWatch = setInterval(() => {
		if (!container.isConnected || container.childElementCount === 0) {
			clearInterval(_dialogWatch);
			_dialogWatch = null;
			_watched = null;
			if (container.isConnected && container.classList.contains('toast-docked')) undock(container);
			return;
		}
		dropStale(container);
		clearOfDialog(container);
	}, 250);
}

/**
 * `aboveInfoCard` (the longship hints, Viking edition only): a hint
 * about the piece just tapped must not sit under that piece's info card
 * (#selected-piece-card, bottom-right). On a phone the two share the
 * bottom of the screen, so when they would overlap the toasts move up
 * to clear the card.
 */
function liftAboveInfoCard(container) {
	const card = typeof document !== 'undefined' ? document.getElementById('selected-piece-card') : null;
	// (its opacity fades in a frame after it is shown: go by display)
	if (!card || card.style.display === 'none') return;
	const c = card.getBoundingClientRect();
	const t = container.getBoundingClientRect();
	if (!(c.height > 0) || !(t.height > 0)) return;
	const overlaps = t.left < c.right && t.right > c.left && t.top < c.bottom && t.bottom > c.top;
	if (!overlaps) return;
	const bottomGap = Math.max(0, window.innerHeight - c.bottom);
	const lifted = bottomGap + c.height + 12;
	const current = parseFloat(container.style.bottom) || 0;
	if (lifted > current) container.style.bottom = `${Math.round(lifted)}px`;
}

const WAIT_MAX_MS = 6000;
const READ_MS = 1600;

/**
 * Viking edition: before the next toast shows, the one on screen fades
 * (once it has been up READ_MS). Returns how long the next must wait, 0
 * when the way is clear.
 */
function makeWayForNext() {
	const box = typeof document !== 'undefined' ? document.getElementById('toast-container') : null;
	if (!box || box.childElementCount === 0) return 0;
	let wait = 0;
	for (const t of Array.from(box.children)) {
		if (t.dataset.leaving) { wait = Math.max(wait, 350); continue; }
		const up = Date.now() - (Number(t.dataset.shownAt) || 0);
		if (up < READ_MS) { wait = Math.max(wait, READ_MS - up + 350); continue; }
		t.dataset.leaving = '1';
		t.style.opacity = '0';
		t.style.transform = 'translateY(-20px)';
		setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
		wait = Math.max(wait, 350);
	}
	return wait;
}

function normaliseOptions(input) {
	if (input == null) return { duration: 3000, variant: 'info' };
	if (typeof input === 'number') return { duration: input, variant: 'info' };
	if (typeof input === 'object') {
		const duration = Number.isFinite(input.duration) ? input.duration : 3000;
		const variant = TOAST_VARIANTS[input.variant] ? input.variant : 'info';
		return { duration, variant, aboveInfoCard: input.aboveInfoCard === true, icon: typeof input.icon === 'string' ? input.icon : null };
	}
	return { duration: 3000, variant: 'info' };
}
