/**
 * A phone held upright: the round buttons (sound, recent activity) join
 * the top HUD as a pair just under the button strip, and the Quick
 * battle's sea banner goes under them.
 *
 * They used to float mid-left over the sea (a third of the way down),
 * apart from everything else, where toasts and tips landed on them. The
 * strip's height depends on the edition, the render profile's font and
 * the network pill, so the place is measured, not guessed: this sets
 * two CSS variables the UI theme (index.html) reads,
 * `--tx-phone-round-top` and `--tx-phone-sea-top`. Everywhere else the
 * variables are unset and the theme's own placement stands.
 *
 * Cost: one cheap layout read twice a second, and on resize.
 */

const PHONE_UPRIGHT = '(pointer: coarse) and (orientation: portrait) and (max-width: 600px)';
const ROUND = 44;     // .tx-round-btn on a phone
const GAP = 8;

let timer = null;
let last = '';

function visibleRect(el) {
	if (!el) return null;
	const r = el.getBoundingClientRect();
	return r.height > 0 && r.width > 0 ? r : null;
}

/** Measure and place (exported for tests). */
export function layoutPhoneHud(doc = typeof document !== 'undefined' ? document : null) {
	if (!doc || typeof window === 'undefined') return;
	const root = doc.documentElement;
	let phone = false;
	try { phone = !!window.matchMedia?.(PHONE_UPRIGHT)?.matches; } catch (_e) { phone = false; }
	if (!phone) {
		if (last) {
			root.style.removeProperty('--tx-phone-round-top');
			root.style.removeProperty('--tx-phone-sea-top');
			last = '';
		}
		return;
	}
	const strip = visibleRect(doc.querySelector('.debug-indicator'));
	const title = visibleRect(doc.querySelector('.game-title'));
	const above = strip || title;
	const top = Math.round((above ? above.bottom : 52) + GAP);
	const sea = top + ROUND + GAP;
	const key = `${top}|${sea}`;
	if (key === last) return;
	last = key;
	root.style.setProperty('--tx-phone-round-top', `${top}px`);
	root.style.setProperty('--tx-phone-sea-top', `${sea}px`);
}

/** Start keeping the layout (idempotent). */
export function startPhoneHudLayout() {
	if (timer || typeof window === 'undefined') return;
	const run = () => { try { layoutPhoneHud(); } catch (_e) { /* best-effort */ } };
	run();
	timer = setInterval(run, 500);
	window.addEventListener('resize', run);
	window.addEventListener('orientationchange', run);
}
