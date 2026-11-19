/**
 * A phone held upright: the button strip (Reset Camera, Controls, Mode,
 * Battle, Paintings) folds into a ☰ round button, which opens it as a
 * menu. Five text buttons took two rows across the top of the screen.
 *
 * The round buttons (menu, sound, recent activity, view stick) sit in a
 * row under the title, and the Quick battle's sea banner goes under
 * them.
 *
 * They used to float mid-left over the sea (a third of the way down),
 * apart from everything else, where toasts and tips landed on them. The
 * title's height depends on the edition and the render profile's font,
 * so the place is measured, not guessed: this sets
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
	ensureMenuButton(doc);
	// (the strip is in the ☰ menu: the round buttons go under the title)
	const title = visibleRect(doc.querySelector('.game-title'));
	const top = Math.round((title ? title.bottom : 44) + GAP);
	const sea = top + ROUND + GAP;
	const key = `${top}|${sea}`;
	if (key === last) return;
	last = key;
	root.style.setProperty('--tx-phone-round-top', `${top}px`);
	root.style.setProperty('--tx-phone-sea-top', `${sea}px`);
}

const MENU_ID = 'hud-menu-toggle';

function setMenuOpen(doc, open) {
	const root = doc.documentElement;
	const btn = doc.getElementById(MENU_ID);
	if (open) root.dataset.hudMenu = 'open';
	else delete root.dataset.hudMenu;
	if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** Is the ☰ menu open (exported for tests). */
export function isMenuOpen(doc = document) {
	return doc.documentElement.dataset.hudMenu === 'open';
}

/**
 * The ☰ round button (made once). Only a phone held upright shows it
 * (the UI theme hides it elsewhere, and shows the strip as before).
 */
export function ensureMenuButton(doc = document) {
	if (!doc?.body || doc.getElementById(MENU_ID)) return;
	const strip = doc.querySelector('.debug-indicator');
	if (!strip) return;
	if (!strip.id) strip.id = 'hud-menu-panel';
	const btn = doc.createElement('button');
	btn.id = MENU_ID;
	btn.type = 'button';
	btn.className = 'tx-round-btn';
	btn.textContent = 'Menu';
	btn.title = 'Menu';
	btn.setAttribute('aria-label', 'Menu');
	btn.setAttribute('aria-expanded', 'false');
	btn.setAttribute('aria-controls', strip.id);
	btn.addEventListener('click', (event) => {
		event.stopPropagation();
		setMenuOpen(doc, !isMenuOpen(doc));
	});
	doc.body.appendChild(btn);
	// A choice made, a tap elsewhere or Escape: the menu closes.
	// (not one that opens a menu of its own: Paintings)
	strip.addEventListener('click', (event) => {
		const choice = event.target.closest?.('button, [role="button"]');
		if (choice && !choice.hasAttribute('aria-haspopup')) setTimeout(() => setMenuOpen(doc, false), 0);
	});
	doc.addEventListener('pointerdown', (event) => {
		if (!isMenuOpen(doc)) return;
		if (strip.contains(event.target) || btn.contains(event.target)) return;
		// (the Paintings choice opens its own little menu off the strip)
		if (event.target.closest?.('#paintings-setting-menu')) return;
		setMenuOpen(doc, false);
	}, true);
	doc.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && isMenuOpen(doc)) setMenuOpen(doc, false);
	});
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
