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
	tops.push(vh * 0.24);
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
		const highTop = vh * 0.24;
		next = (highTop + t.height + 8 < r.top) ? vh - highTop - t.height : vh - r.top + 8;
	}
	container.style.bottom = `${Math.round(Math.max(current, Math.min(next, vh - t.height - 8)))}px`;
}

const TOAST_VARIANTS = {
	info: { color: '#ffcc00', border: '#ffcc00', shadow: 'rgba(255, 204, 0, 0.3)' },
	alert: { color: '#ff5252', border: '#ff5252', shadow: 'rgba(255, 82, 82, 0.45)' },
	success: { color: '#7CFC8A', border: '#7CFC8A', shadow: 'rgba(124, 252, 138, 0.35)' },
};

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
	const tipUp = !!_avoider && waited < WAIT_MAX_MS && typeof document !== 'undefined'
		&& !!document.querySelector?.('.one-time-tip');
	// …and one toast at a time (two stacked mid-screen hid the arena): the
	// one up gives way once it has been read for a moment.
	const holdFor = !!_avoider && waited < WAIT_MAX_MS ? makeWayForNext() : 0;
	if (tipUp || holdFor > 0 || (heroAt > 0 && Date.now() - heroAt < 4000) || (cardAt > 0 && Date.now() - cardAt < 2400)) {
		setTimeout(() => showToastMessage(message, optionsOrDuration, _since), Math.max(400, holdFor));
		return;
	}
	const { duration, variant, aboveInfoCard } = normaliseOptions(optionsOrDuration);

	const now = Date.now();
	_recentMessages = _recentMessages.filter(r => now - r.ts < DEDUP_WINDOW_MS);
	if (_recentMessages.some(r => r.msg === message)) return;
	_recentMessages.push({ msg: message, ts: now });

	let toastContainer = document.getElementById('toast-container');
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.id = 'toast-container';

		Object.assign(toastContainer.style, {
			position: 'fixed',
			bottom: '20px',
			left: '50%',
			transform: 'translateX(-50%)',
			zIndex: '1000',
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

	const palette = TOAST_VARIANTS[variant] || TOAST_VARIANTS.info;
	const isLoud = variant === 'alert';

	const toast = document.createElement('div');
	toast.classList.add('toast-message');
	if (variant) toast.classList.add(`toast-${variant}`);

	Object.assign(toast.style, {
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		color: palette.color,
		padding: isLoud ? '14px 28px' : '10px 20px',
		borderRadius: '5px',
		marginBottom: '10px',
		fontSize: isLoud ? '20px' : '16px',
		fontWeight: isLoud ? '700' : '400',
		letterSpacing: isLoud ? '0.5px' : 'normal',
		fontFamily: 'Times New Roman, serif',
		boxShadow: `0 2px ${isLoud ? '18px' : '10px'} ${palette.shadow}`,
		opacity: '0',
		transition: 'opacity 0.3s, transform 0.3s',
		transform: 'translateY(20px)',
		textAlign: 'center',
		maxWidth: '100%',
		border: `${isLoud ? 2 : 1}px solid ${palette.border}`
	});

	toast.textContent = message;
	toast.dataset.shownAt = String(Date.now());
	toastContainer.appendChild(toast);
	if (aboveInfoCard) liftAboveInfoCard(toastContainer);
	if (_avoider) keepClearOf(toastContainer);

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
		return { duration, variant, aboveInfoCard: input.aboveInfoCard === true };
	}
	return { duration: 3000, variant: 'info' };
}
