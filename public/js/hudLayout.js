/**
 * Right-hand HUD layout: how much the Next Piece panel shows, and an
 * optional feed of world announcements under it.
 *
 *   Panel size   full       as it always was (preview, turn hint, key legend)
 *                compact    small preview and turn hint, no key legend
 *                collapsed  a thumbnail only
 *   View stick   off | on   an on-screen joystick for the camera (viewStick.js)
 *   Feed         off | on   one line per notable thing OTHER players do
 *                           (king captures, piece captures, arrivals, …),
 *                           each fading after a few seconds
 *
 * Both are per-device preferences. The big announcements (overlay,
 * toasts, sounds) are only ever for the players an event involves; the
 * feed is where everyone else's news goes, if the player wants it.
 */

import { isTouchPrimary } from './utils/inputMode.js';
import { ensureActionStack, positionUnderNextPiece } from './skipChessButton.js';
import { showToastMessage } from './showToastMessage.js';
import { setViewStick } from './viewStick.js';
import { isSeaOn, setSeaOn } from './audio/soundManager.js';
import { isViking } from './edition.js';
import {
	describeEvent, flyTo, isLocalPlayerEvent, isEventInView, onLiveActivityEvent,
} from './activityLog.js';

const MODE_KEY = 'tetches.hud.rightPanel';
const FEED_KEY = 'tetches.hud.announceFeed';
const STICK_KEY = 'tetches.hud.viewStick';
const FEED_ID = 'announce-feed';
const FEED_MAX = 5;
const FEED_LINGER_MS = 12000;
const FEED_FADE_MS = 400;

export const PANEL_MODES = ['full', 'compact', 'collapsed'];
const MODE_LABEL = { full: 'Full', compact: 'Compact', collapsed: 'Collapsed' };

/** What the feed carries: the news, not every brick laid. */
export const FEED_TYPES = new Set([
	'king_captured', 'king_detonation', 'chess_piece_captured', 'territory_captured',
	'chess_piece_promoted', 'promotion_redeemed', 'powerup_claimed',
	'player_joined', 'player_left',
]);

function readPref(key) {
	try { return window.localStorage?.getItem(key) ?? null; } catch (_e) { return null; }
}
function writePref(key, value) {
	try { window.localStorage?.setItem(key, value); } catch (_e) { /* private mode */ }
}

/** The modes this device offers: a phone has no keyboard legend to show. */
export function availableModes(touch = isTouchPrimary()) {
	return touch ? ['compact', 'collapsed'] : PANEL_MODES;
}

export function normaliseMode(stored, touch = isTouchPrimary()) {
	const modes = availableModes(touch);
	return modes.includes(stored) ? stored : modes[0];
}

export function nextMode(mode, touch = isTouchPrimary()) {
	const modes = availableModes(touch);
	return modes[(modes.indexOf(mode) + 1) % modes.length];
}

/** Should this live event show in the feed? */
export function feedAccepts(ev) {
	if (!ev || !FEED_TYPES.has(ev.type)) return false;
	if (isLocalPlayerEvent(ev)) return false; // ours are announced properly
	return isEventInView(ev);
}

/** The log's wording, minus the board coordinates. */
export function feedText(text) {
	return String(text || '').replace(/\s*\(-?\d+,\s*-?\d+\)/g, '').trim();
}

let mode = 'full';
let feedOn = false;
let stickOn = false;
let stickBtn = null;
let widgetEl = null;
let modeBtn = null;
let feedBtn = null;
let unsubscribe = null;

function relayout() {
	positionUnderNextPiece();
	// The panel animates nothing, but fonts/canvas settle a frame later.
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => positionUnderNextPiece());
}

function applyMode() {
	if (!widgetEl) return;
	widgetEl.dataset.hud = mode;
	if (modeBtn) {
		const upcoming = MODE_LABEL[nextMode(mode)];
		modeBtn.title = `Panel: ${MODE_LABEL[mode]}. Click for ${upcoming}.`;
		modeBtn.setAttribute('aria-label', `Panel size: ${MODE_LABEL[mode]}. Switch to ${upcoming}.`);
		modeBtn.textContent = mode === 'collapsed' ? '\u25BE' : '\u25B4'; // open / shrink
	}
	relayout();
}

function feedContainer(create) {
	let feed = document.getElementById(FEED_ID);
	if (feed || !create) return feed;
	feed = document.createElement('div');
	feed.id = FEED_ID;
	feed.setAttribute('role', 'log');
	feed.setAttribute('aria-label', 'World announcements');
	ensureActionStack().appendChild(feed);
	return feed;
}

function removeItem(item) {
	if (!item || item.dataset.leaving) return;
	item.dataset.leaving = '1';
	item.style.opacity = '0';
	setTimeout(() => item.remove(), FEED_FADE_MS);
}

function pushFeedItem(ev) {
	if (!feedOn || !feedAccepts(ev)) return;
	const feed = feedContainer(true);
	const { icon, color, text, target } = describeEvent(ev);
	const item = document.createElement(target ? 'button' : 'div');
	item.className = 'tx-feed-item';
	if (target) {
		item.type = 'button';
		item.title = 'Fly there';
		item.addEventListener('click', () => { flyTo(target); item.blur(); });
	}
	item.style.borderLeftColor = color || '';
	const iconEl = document.createElement('span');
	iconEl.className = 'tx-feed-icon';
	iconEl.textContent = icon || '•';
	iconEl.style.color = color || '';
	const textEl = document.createElement('span');
	textEl.textContent = feedText(text);
	item.append(iconEl, textEl);
	feed.appendChild(item);
	const live = [...feed.children].filter(el => !el.dataset.leaving);
	for (const old of live.slice(0, Math.max(0, live.length - FEED_MAX))) removeItem(old);
	setTimeout(() => removeItem(item), FEED_LINGER_MS);
}

function applyFeed() {
	if (feedBtn) {
		feedBtn.setAttribute('aria-pressed', feedOn ? 'true' : 'false');
		feedBtn.title = feedOn
			? 'World announcements: on. Click to hide what other players do.'
			: 'World announcements: off. Click to see what other players do.';
	}
	if (feedOn && !unsubscribe) unsubscribe = onLiveActivityEvent(pushFeedItem);
	if (!feedOn) {
		if (unsubscribe) { unsubscribe(); unsubscribe = null; }
		const feed = feedContainer(false);
		if (feed) feed.remove();
	}
}

export function setPanelMode(next) {
	mode = normaliseMode(next);
	writePref(MODE_KEY, mode);
	applyMode();
}

export function setAnnounceFeed(on) {
	feedOn = !!on;
	writePref(FEED_KEY, feedOn ? '1' : '0');
	applyFeed();
}

const STICK_TOGGLE_ID = 'view-stick-toggle';

/**
 * The joystick's own round button, with mute and the activity log
 * (owner: the small panel tool was too easy to miss). Lit while on.
 */
function ensureStickToggle() {
	if (typeof document === 'undefined' || !document.body) return null;
	let btn = document.getElementById(STICK_TOGGLE_ID);
	if (btn) return btn;
	btn = document.createElement('button');
	btn.id = STICK_TOGGLE_ID;
	btn.type = 'button';
	btn.className = 'tx-round-btn';
	btn.setAttribute('aria-label', 'View joystick');
	btn.addEventListener('click', () => {
		setViewStickPref(!stickOn);
		btn.blur(); // Space must stay the game's drop key
		showToastMessage(stickOn
			? 'View joystick on: drag the stick to move the view, hold + or \u2212 to zoom. Its Move / Turn label switches what the stick does.'
			: 'View joystick off.', { duration: stickOn ? 4200 : 2200 });
	});
	document.body.appendChild(btn);
	return btn;
}

function applyStickPref() {
	const toggle = ensureStickToggle();
	if (toggle) {
		toggle.setAttribute('aria-pressed', stickOn ? 'true' : 'false');
		toggle.title = stickOn ? 'Hide the view joystick' : 'Show a view joystick: move, turn and zoom the camera';
	}
	if (stickBtn) {
		stickBtn.setAttribute('aria-pressed', stickOn ? 'true' : 'false');
		stickBtn.title = stickOn
			? 'View joystick: on. Click to hide it.'
			: 'View joystick: off. Click for an on-screen stick that moves the camera.';
	}
	setViewStick(stickOn);
}

export function setViewStickPref(on) {
	stickOn = !!on;
	writePref(STICK_KEY, stickOn ? '1' : '0');
	applyStickPref();
}

export function hudLayoutState() { return { mode, feedOn, stickOn }; }

function toolButton(label) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'tx-hud-tool';
	button.textContent = label;
	// The panel itself is one big "start the tetris turn" button.
	for (const type of ['click', 'keydown', 'pointerdown', 'mousedown', 'touchstart']) {
		button.addEventListener(type, event => event.stopPropagation());
	}
	return button;
}

/** Add the size and feed switches to the Next Piece panel (once). */
export function attachHudLayout(widget) {
	if (!widget || widget.querySelector('.tx-hud-tools')) return;
	widgetEl = widget;
	mode = normaliseMode(readPref(MODE_KEY));
	feedOn = readPref(FEED_KEY) === '1';
	stickOn = readPref(STICK_KEY) === '1';

	const tools = document.createElement('div');
	tools.className = 'tx-hud-tools';
	modeBtn = toolButton('▴');
	modeBtn.addEventListener('click', () => setPanelMode(nextMode(mode)));
	feedBtn = toolButton('📣');
	feedBtn.setAttribute('aria-label', 'World announcements');
	feedBtn.addEventListener('click', () => {
		setAnnounceFeed(!feedOn);
		showToastMessage(feedOn
			? 'World announcements on: news of other players shows here on the right.'
			: 'World announcements off.', { duration: 2600 });
	});
	stickBtn = toolButton('\uD83D\uDD79\uFE0F');
	stickBtn.setAttribute('aria-label', 'View joystick');
	stickBtn.addEventListener('click', () => {
		setViewStickPref(!stickOn);
		showToastMessage(stickOn
			? 'View joystick on: drag the stick (bottom right) to move the view, hold + or \u2212 to zoom. Its Move / Turn label switches what it does.'
			: 'View joystick off.', { duration: stickOn ? 4200 : 2200 });
	});
	tools.append(modeBtn, feedBtn, stickBtn);
	// Viking: the sound of the sea and the wind under the game.
	if (isViking()) {
		const seaBtn = toolButton('\uD83C\uDF0A');
		seaBtn.setAttribute('aria-label', 'Sea sounds');
		const paintSea = () => seaBtn.setAttribute('aria-pressed', isSeaOn() ? 'true' : 'false');
		seaBtn.addEventListener('click', () => {
			setSeaOn(!isSeaOn());
			paintSea();
			showToastMessage(isSeaOn() ? 'Sea and wind on (quietly, under the game).' : 'Sea and wind off.', { duration: 2200 });
		});
		paintSea();
		tools.append(seaBtn);
	}
	widget.appendChild(tools);

	applyMode();
	applyFeed();
	applyStickPref();
}
