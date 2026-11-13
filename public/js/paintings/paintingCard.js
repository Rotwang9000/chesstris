/**
 * The painting card: a framed picture of the moment, top-left on a desktop (top-centre on a phone), with
 * its title on a parchment band — like a history painting hung over
 * the board for a few seconds.
 *
 * It must never get in the way of play:
 *   • non-modal, and `pointer-events: none` on everything but the close
 *     button. inputManager.js treats any click inside the canvas as a
 *     board click unless the target is a button/link/input, so a card
 *     that caught taps would swallow chess moves under it; the real
 *     `<button>` is exempt there, so closing it never moves a piece;
 *   • z-index 11000: over the board HUD (≤ 10000), under the activity
 *     log (11500), the check banner (12000) and the battle results card
 *     (12500);
 *   • on phones (coarse pointer or narrow) it is smaller and is placed
 *     around the top HUD — the next-piece panel and the button strip —
 *     rather than over it (placeCompact), clear of the touch pad at the
 *     bottom and of the board centre.
 *
 * Screen readers hear the caption alone, through one visually hidden
 * `role="status"` region that is always in the page (a live region that
 * appears already filled is often not announced, and the alt text and
 * close button would be read out with it). The picture keeps the
 * manifest's alt text for anyone who goes looking.
 * Reduced motion: it fades, it doesn't slide.
 */

const CARD_ID = 'tetches-painting';
const LIVE_ID = 'tetches-painting-live';
const STYLE_ID = 'tetches-painting-style';
const FADE_MS = 320;
/** Longest wait for a picture to decode before the card shows anyway. */
export const ART_READY_TIMEOUT_MS = 1500;
/** Must match the compact @media rule below. */
const COMPACT_QUERY = '(pointer: coarse), (max-width: 700px)';
/** Room kept between the card and the HUD (the close button overhangs). */
const HUD_CLEARANCE = 14;
/**
 * HUD pieces along the top of a phone a painting must not hide: the
 * next-piece panel, and the Viking edition's longship button under it.
 */
const TOP_HUD_IDS = ['next-tetromino-display', 'longship-button', 'skip-chess-move-button'];
/** Narrowest card worth squeezing into a gap between HUD pieces. */
const MIN_GAP_WIDTH = { full: 170, small: 130 };
/**
 * Portrait phones: a full card first shows big — nearly the screen's
 * width, over the board — for this long, then shrinks to its corner
 * size. At corner size alone the art was a thumbnail.
 */
export const HERO_MS = 1900;
const HERO_QUERY = '(pointer: coarse) and (orientation: portrait), (max-width: 700px) and (orientation: portrait)';

function injectStyles() {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
#${CARD_ID} {
  /* Desktop: hung in the top-left sky, under the title and clear of the
     players tab — top-centre is where your own tetromino falls. */
  position: fixed; left: 46px; top: calc(62px + env(safe-area-inset-top, 0px));
  width: min(30vw, 400px, 44vh); z-index: 11000; pointer-events: none;
  opacity: 0; transform: translate(0, -10px);
  transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
}
#${CARD_ID}[hidden] { display: none; }
#${CARD_ID}.tp-visible { opacity: 1; transform: translate(0, 0); }
#${CARD_ID}[data-size="small"] { width: min(20vw, 230px); }
#${CARD_ID} figure, .tp-figure { margin: 0; }
.tp-frame {
  position: relative; padding: 9px; border-radius: 3px;
  background:
    linear-gradient(135deg, #5d3f17 0%, #d6ac55 14%, #8b6226 30%, #f0d488 46%, #9a6d2b 62%, #dcb15a 80%, #5d3f17 100%);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 0 1px #2e2008,
    inset 0 0 0 1px rgba(255, 236, 170, 0.7), inset 0 0 6px rgba(40, 25, 5, 0.8);
}
.tp-frame::before {
  /* Carved bead moulding inside the gilt. */
  content: ''; position: absolute; inset: 4px; border-radius: 2px; pointer-events: none;
  border: 2px dotted rgba(70, 45, 12, 0.55);
}
.tp-canvas {
  position: relative; aspect-ratio: 3 / 2; overflow: hidden; background: #2b394a;
  border: 2px solid #3a2a0e; box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.65);
}
.tp-canvas > img, .tp-canvas > canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
  transition: opacity 400ms ease;
}
.tp-caption {
  position: relative; width: 90%; box-sizing: border-box; margin: -7px auto 0;
  padding: 6px 22px 7px; text-align: center;
  font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 15px; line-height: 1.25;
  color: #2b1d0e; background: linear-gradient(#f1e6c8, #e0cd9f);
  clip-path: polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%);
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.4));
  text-wrap: balance;
}
#${CARD_ID}[data-size="small"] .tp-frame { padding: 6px; }
#${CARD_ID}[data-size="small"] .tp-caption { font-size: 12px; padding: 4px 16px 5px; }
.tp-close {
  position: absolute; top: -11px; right: -11px; width: 30px; height: 30px; padding: 0;
  border-radius: 50%; border: 2px solid #c99b45; background: #2b1d0e; color: #efe0b6;
  font: bold 17px/1 Georgia, serif; cursor: pointer; pointer-events: auto;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
.tp-close::after {
  /* A thumb-sized target (44px+) round the small visible disc. */
  content: ''; position: absolute; inset: -5px; border-radius: 50%;
}
.tp-close:hover, .tp-close:focus-visible { background: #9b2a2a; outline: none; }
@media (pointer: coarse), (max-width: 700px) {
  #${CARD_ID} { left: 50%; transform: translate(-50%, -10px);
    top: calc(10px + env(safe-area-inset-top, 0px)); width: min(56vw, 250px, 34vh); }
  #${CARD_ID}.tp-visible { transform: translate(-50%, 0); }
  #${CARD_ID}[data-size="small"] { width: min(40vw, 170px); }
  #${CARD_ID} .tp-caption { font-size: 12px; padding: 4px 16px 5px; }
  #${CARD_ID}[data-size="small"] .tp-caption { font-size: 10.5px; }
  .tp-close { width: 34px; height: 34px; top: -8px; right: -8px; }
}
@media (pointer: coarse) and (orientation: portrait), (max-width: 700px) and (orientation: portrait) {
  #${CARD_ID} { transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease, width 480ms ease, top 480ms ease; }
  /* Shrunk, it hangs below the HUD row (title, buttons, NEXT PIECE, the
     Longship and Skip stack), not over it. */
  #${CARD_ID}:not([data-hero="1"]) { top: calc(236px + env(safe-area-inset-top, 0px)); }
  #${CARD_ID}:not([data-hero="1"]):not([data-size="small"]) { width: min(52vw, 230px, 30vh); }
  #${CARD_ID}[data-hero="1"] { width: min(94vw, 480px, 52vh); top: calc(16vh + env(safe-area-inset-top, 0px)); }
  #${CARD_ID}[data-hero="1"] .tp-caption { font-size: 15px; padding: 6px 22px 7px; }
}
@media (pointer: coarse) and (orientation: landscape) {
  /* Height is what a landscape phone lacks: keep clear of the touch pad. */
  #${CARD_ID} { width: min(34vw, 260px, 50vh); }
  #${CARD_ID}[data-size="small"] { width: min(26vw, 190px, 38vh); }
}
.tp-results-painting { margin: -4px auto 14px; max-width: min(360px, 32vh); }
.tp-live {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  #${CARD_ID}, #${CARD_ID}.tp-visible { transform: translate(-50%, 0); transition: opacity ${FADE_MS}ms linear; }
  .tp-canvas > img, .tp-canvas > canvas { transition: none; }
}`;
	document.head.appendChild(style);
}

/**
 * A framed picture with its caption, for the card and for the battle
 * results card. `art` is an <img> or the woodcut <canvas>.
 */
export function buildFramedPainting(art, caption) {
	injectStyles();
	const figure = document.createElement('figure');
	figure.className = 'tp-figure';
	const frame = document.createElement('div');
	frame.className = 'tp-frame';
	const surface = document.createElement('div');
	surface.className = 'tp-canvas';
	if (art) surface.appendChild(art);
	frame.appendChild(surface);
	const band = document.createElement('figcaption');
	band.className = 'tp-caption';
	band.textContent = caption || '';
	figure.appendChild(frame);
	figure.appendChild(band);
	return figure;
}

/** Swap the picture in a framed painting (the real one arrived late). */
export function replaceArt(figure, art) {
	const surface = figure?.querySelector('.tp-canvas');
	if (!surface || !art) return;
	const old = Array.from(surface.children);
	art.style.opacity = '0';
	surface.appendChild(art);
	// Next frame, so the fade runs.
	requestAnimationFrame(() => { art.style.opacity = '1'; });
	setTimeout(() => old.forEach(n => n.remove()), 450);
}

function ensureCard() {
	injectStyles();
	ensureLiveRegion();
	let card = document.getElementById(CARD_ID);
	if (card) return card;
	card = document.createElement('div');
	card.id = CARD_ID;
	card.hidden = true;
	document.body.appendChild(card);
	return card;
}

function ensureLiveRegion() {
	let live = document.getElementById(LIVE_ID);
	if (live) return live;
	live = document.createElement('div');
	live.id = LIVE_ID;
	live.className = 'tp-live';
	live.setAttribute('role', 'status');
	live.setAttribute('aria-live', 'polite');
	live.setAttribute('aria-atomic', 'true');
	document.body.appendChild(live);
	return live;
}

let announceTimer = null;

/** Say the caption: emptied first, then filled, so a repeat is heard too. */
function announce(text) {
	const live = ensureLiveRegion();
	live.textContent = '';
	clearTimeout(announceTimer);
	announceTimer = setTimeout(() => { live.textContent = text || ''; }, 80);
}

/**
 * Styles, the card element and the live region, made ahead of the first
 * painting so the live region is already in the page when it speaks.
 */
export function preparePaintingCard() {
	ensureCard();
}

// ── Placement on phones ────────────────────────────────────────────────────

function isCompact() {
	try { return window.matchMedia(COMPACT_QUERY).matches; } catch (_e) { return false; }
}

/**
 * The HUD pieces along the top of a phone screen that a painting must
 * not hide: TOP_HUD_IDS, and each button of the strip (its own box is
 * wider than its buttons). Lower ones (the strip sits at the
 * bottom on a desktop) don't matter.
 */
function topHudRects() {
	const rects = [];
	const limit = window.innerHeight * 0.4;
	const add = (el) => {
		if (!el) return;
		const r = el.getBoundingClientRect();
		if (r.width > 0 && r.height > 0 && r.top < limit) rects.push(r);
	};
	for (const id of TOP_HUD_IDS) add(document.getElementById(id));
	const strip = document.querySelector('.debug-indicator');
	if (strip) Array.from(strip.children).forEach(add);
	return rects;
}

/** The widest stretch of [from, to] that no rect covers (± pad). */
function widestGap(rects, from, to, pad) {
	const spans = rects.map(r => [r.left - pad, r.right + pad]).sort((a, b) => a[0] - b[0]);
	let best = { left: from, right: from };
	let cursor = from;
	for (const [l, r] of spans) {
		if (l > cursor && Math.min(l, to) - cursor > best.right - best.left) {
			best = { left: cursor, right: Math.min(l, to) };
		}
		cursor = Math.max(cursor, r);
	}
	if (to - cursor > best.right - best.left) best = { left: cursor, right: to };
	return best;
}

/**
 * On a phone the CSS puts the card top-centre; if that would hide the
 * next-piece panel or the strip's buttons, it moves into the widest gap
 * between them along the top (landscape), or else just below them
 * (portrait). Desktop keeps the CSS placement. Uses offset* sizes, which
 * ignore the fade's translate.
 */
function placeCompact(card) {
	card.style.left = '';
	card.style.top = '';
	card.style.width = '';
	if (!isCompact()) return;
	const hud = topHudRects();
	if (hud.length === 0) return;
	if (card.dataset.hero === '1') {
		// The big first look sits over the board, but never over the
		// Longship or Skip buttons: it starts below the HUD on the right.
		const below = Math.max(...hud.map(r => r.bottom)) + HUD_CLEARANCE;
		if (below > card.offsetTop) card.style.top = `${Math.round(below)}px`;
		return;
	}
	const vw = window.innerWidth;
	const top = card.offsetTop;
	const clashes = (left, right, t, bottom) => hud.some(r => r.left < right + HUD_CLEARANCE
		&& left - HUD_CLEARANCE < r.right && r.top < bottom && t < r.bottom);
	const width = card.offsetWidth;
	const centreLeft = (vw - width) / 2;
	if (!clashes(centreLeft, centreLeft + width, top, top + card.offsetHeight)) return;

	const gap = widestGap(hud, 8, vw - 8, HUD_CLEARANCE);
	const room = gap.right - gap.left;
	if (room >= (MIN_GAP_WIDTH[card.dataset.size] || MIN_GAP_WIDTH.full)) {
		card.style.width = `${Math.min(width, room)}px`;
		card.style.left = `${(gap.left + gap.right) / 2}px`;
		return;
	}
	const below = Math.max(...hud.map(r => r.bottom));
	card.style.top = `${Math.round(below + HUD_CLEARANCE)}px`;
}

let active = null;

/** The big first look: portrait phones only. */
function heroWanted() {
	try {
		return typeof window.matchMedia === 'function' && window.matchMedia(HERO_QUERY).matches;
	} catch (_e) {
		return false;
	}
}

/**
 * Resolves once the art can be drawn: at once for the woodcut canvas,
 * when an <img> has loaded and decoded (or failed — the frame and
 * caption still show), or after ART_READY_TIMEOUT_MS at the latest.
 */
function whenArtReady(art) {
	if (!art || art.tagName !== 'IMG') return Promise.resolve();
	const decode = () => (typeof art.decode === 'function' ? art.decode().catch(() => {}) : undefined);
	const ready = art.complete
		? Promise.resolve(art.naturalWidth > 0 ? decode() : undefined)
		: new Promise((resolve) => {
			art.addEventListener('load', () => resolve(decode()), { once: true });
			art.addEventListener('error', () => resolve(), { once: true });
		});
	return Promise.race([ready, new Promise(resolve => setTimeout(resolve, ART_READY_TIMEOUT_MS))]);
}

/**
 * Show a painting. Replaces any card already up.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.art     <img> or <canvas>
 * @param {string} opts.caption
 * @param {'full'|'small'} [opts.size]
 * @param {Function} [opts.onClosing] called once, as soon as it starts to close
 * @param {Function} [opts.onClosed] called once, however it closes, after the fade
 * @param {Function} [opts.onVisible] called once, when the picture is ready
 *   and the fade-in begins — the moment its time on screen starts
 * @returns {{ close: Function, setCaption: Function, replaceArt: Function }}
 */
export function showPaintingCard({ art, caption, size = 'full', onClosing, onClosed, onVisible } = {}) {
	if (active) active.close({ immediate: true });
	const card = ensureCard();
	card.textContent = '';
	card.dataset.size = size === 'small' ? 'small' : 'full';
	let heroTimer = null;
	const endHero = () => {
		if (heroTimer) { clearTimeout(heroTimer); heroTimer = null; }
		if (card.dataset.hero !== '1') return;
		delete card.dataset.hero;
		try { delete document.documentElement.dataset.paintingHero; } catch (_e) { /* ignore */ }
		placeCompact(card);
	};
	if (card.dataset.size === 'full' && heroWanted()) {
		card.dataset.hero = '1';
		// Toasts wait while the big picture is up (showToastMessage).
		try { document.documentElement.dataset.paintingHero = String(Date.now()); } catch (_e) { /* ignore */ }
	} else {
		delete card.dataset.hero;
	}
	const figure = buildFramedPainting(art, caption);
	card.appendChild(figure);

	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'tp-close';
	closeBtn.setAttribute('aria-label', 'Close painting');
	closeBtn.title = 'Close';
	closeBtn.textContent = '×';
	card.appendChild(closeBtn);

	card.hidden = false;
	placeCompact(card);
	// Again if the screen turns or the HUD changes size under it (the
	// next-piece panel grows its hint line; the strip rewraps).
	const onResize = () => placeCompact(card);
	window.addEventListener('resize', onResize);
	let hudWatch = null;
	if (typeof ResizeObserver === 'function') {
		hudWatch = new ResizeObserver(onResize);
		for (const el of [...TOP_HUD_IDS.map(id => document.getElementById(id)), document.querySelector('.debug-indicator')]) {
			if (el) hudWatch.observe(el);
		}
	}
	announce(caption);
	// Fade in once the picture can be drawn (an <img> still decoding would
	// fade in as an empty frame), on a later frame so the transition runs
	// from opacity 0.
	whenArtReady(art).then(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => {
			if (handle !== active || closed) return;
			card.classList.add('tp-visible');
			// Toasts arriving with the picture wait their turn (showToastMessage).
			try { document.documentElement.dataset.paintingCardAt = String(Date.now()); } catch (_e) { /* ignore */ }
			if (card.dataset.hero === '1') heroTimer = setTimeout(endHero, HERO_MS);
			try { onVisible?.(); } catch (_e) { /* the card still shows */ }
		}));
	});

	let closed = false;
	const handle = {
		close({ immediate = false } = {}) {
			if (closed) return;
			closed = true;
			endHero();
			window.removeEventListener('resize', onResize);
			hudWatch?.disconnect();
			try { onClosing?.(); } catch (_e) { /* it still closes */ }
			if (active === handle) active = null;
			card.classList.remove('tp-visible');
			const finish = () => {
				// A newer card may own the element by now.
				if (!active) { card.hidden = true; card.textContent = ''; }
				try { onClosed?.(); } catch (_e) { /* the next card still comes */ }
			};
			if (immediate) finish();
			else setTimeout(finish, FADE_MS);
		},
		setCaption(text) {
			if (closed) return;
			const band = figure.querySelector('.tp-caption');
			if (band) band.textContent = text;
		},
		replaceArt(next) {
			if (!closed) replaceArt(figure, next);
		},
		get closed() { return closed; },
	};
	closeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		handle.close();
	});
	active = handle;
	return handle;
}

/** Take down whatever card is showing (setting turned off, check began). */
export function closePaintingCard() {
	if (active) active.close();
}
