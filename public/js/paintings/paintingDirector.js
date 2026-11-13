/**
 * The painting director (Viking edition): decides what is painted, and
 * when, from the game's events.
 *
 * "When things happen there is a proper image of what is happening" —
 * a knight slaying a bishop, a king fallen, a queen come ashore, the
 * victory. The network handlers call `handlePaintingEvent` (through
 * paintings/index.js, only when the edition is on); this module turns
 * the payload into a moment (paintingEvents.js), queues it
 * (paintingQueue.js), picks the picture (paintingCatalogue.js, or the
 * woodcut from fallbackArt.js) and hangs it (paintingCard.js).
 *
 * Holding back:
 *   • while the viewer is defending a check, the check banner and the
 *     camera fly-in own the screen — paintings wait (a card already up
 *     is taken down);
 *   • while the battle results card is open, the battle's own painting
 *     is shown inside it and nothing floats over it;
 *   • moments that waited too long (the queue's STALE_MS; 3 s for the
 *     longship scenes) are let go rather than shown out of time, and a
 *     battle's end lets go of everything still waiting, so nothing from
 *     it turns up in the next battle;
 *   • each longship scene is painted once per battle (paintingShips.js
 *     turns the ship events into moments; the queue's throttleKey).
 *
 * "Viking" is `vikingActive(gameState)`: the edition switched on, or a
 * seat in a Viking battle — joining one by its code from the standard
 * game starts the paintings too (battleMode.js calls startPaintings).
 */

import gameState from '../utils/gameState.js';
import { isViking, vikingActive, returnToStandardEdition } from '../edition.js';
import { isDefenderInCheck } from '../checkAlert.js';
import { seaSinkAt, serverNow } from '../battle/battleRules.js';
import {
	slotCandidates, resolvePainting, loadManifest, loadImage, preloadPaintings,
} from './paintingCatalogue.js';
import { captionFor, displayNameOf, isPlaceholderName, cleanName } from './paintingCaptions.js';
import {
	fromChessCapture, fromChessMove, fromKingCaptured, fromPromotion, fromBattleEnd,
} from './paintingEvents.js';
import { PaintingQueue, durationFor, priorityOf } from './paintingQueue.js';
import { ShipMoments } from './paintingShips.js';
import { drawWoodcut } from './fallbackArt.js';
import {
	showPaintingCard, closePaintingCard, buildFramedPainting, replaceArt, preparePaintingCard,
} from './paintingCard.js';
import {
	getPaintingSetting, setPaintingSetting, paintingSettingLabel, PAINTING_SETTINGS,
} from './paintingSettings.js';

/** How long the real painting gets to load before the woodcut stands in. */
export const ART_RACE_MS = 250;
/**
 * A card on screen at least this long makes way for a waiting ship
 * scene of equal or higher rank, which would otherwise expire (3 s)
 * behind it — embark then set sail is the usual rhythm.
 */
const MAKE_WAY_MS = 2000;
/** …and a lesser card (a capture) makes way for a ship scene sooner. */
const MAKE_WAY_LESSER_MS = 900;
/**
 * Capture cards in a battle: each attacker/victim pairing once, and at
 * least this long apart. Between them the capture toasts tell the tale.
 */
const CAPTURE_CARD_GAP_MS = 20000;
/** A card not visible this long after mounting is given up. */
const NEVER_SHOWN_MS = 4000;
const GAP_MS = 350;
const RETRY_MS = 400;
const RESULTS_ID = 'tetches-battle-results';
const SETTING_BUTTON_ID = 'paintings-setting-btn';
const SETTING_MENU_ID = 'paintings-setting-menu';
const MENU_STYLE_ID = 'paintings-setting-menu-style';
const SETTING_NAMES = { full: 'Full size', small: 'Small', off: 'Off' };

let started = false;
let queue = null;
let showing = null;      // { moment, handle }
let presenting = false;  // a card is being prepared (art race)
let retryTimer = null;
let watchTimer = null;
let ships = null;        // ShipMoments, reset when the battle changes
let shipsBattleId = null;
let manifestNow = null;  // the manifest once loaded (which moments have real paintings)
let lastCaptureCardAt = -Infinity;
let lastCaptureBattle = null;

/**
 * Painted when nothing more specific is: a defeat with no painting of
 * its own is the fallen king.
 */
function fallbackSlots(moment) {
	if (moment?.kind === 'battle' && moment.outcome !== 'victory') return ['kingfall.blade'];
	return [];
}

function artSlots(moment) {
	return slotCandidates(moment).concat(fallbackSlots(moment));
}

/**
 * Is this moment worth a card? The great moments (a king's fall, a
 * queen's arrival, the longship scenes, the battle's end) always are.
 * A capture or other arrival only with a real oil painting of its own —
 * a woodcut of every skirmish between the paintings cheapens them, and
 * the capture toast already says what happened — and captures are
 * rationed: each pairing once a battle, CAPTURE_CARD_GAP_MS apart.
 */
function deservesCard(moment, now) {
	const great = moment.kind === 'ship' || moment.kind === 'kingfall' || moment.kind === 'battle'
		|| (moment.kind === 'arrival' && moment.pieceType === 'queen');
	if (great) return true;
	const painted = manifestNow ? resolvePainting(manifestNow, slotCandidates(moment)) : null;
	if (!painted) return false;
	if (moment.kind !== 'capture') return true;
	const battleId = gameState.activeBattle?.id || 'world';
	if (battleId !== lastCaptureBattle) { lastCaptureBattle = battleId; lastCaptureCardAt = -Infinity; }
	if (now - lastCaptureCardAt < CAPTURE_CARD_GAP_MS) return false;
	moment.throttleKey = `${battleId}:capture:${painted.slot}`;
	return true;
}

function localName() {
	try { return localStorage.getItem('playerName') || null; } catch (_e) { return null; }
}

function nameOf(id) {
	return displayNameOf(gameState.players, id, { localId: gameState.localPlayerId, localName: localName() });
}

function sameId(a, b) {
	return a != null && b != null && String(a) === String(b);
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/** Start once, in the Viking edition or a Viking battle only. */
export function initPaintings() {
	if (!vikingActive(gameState)) return;
	syncSettingButton();
	if (started) return;
	started = true;
	queue = new PaintingQueue();
	ships = new ShipMoments();
	preparePaintingCard();
	loadManifest().then((manifest) => {
		if (!manifest) return;
		manifestNow = manifest;
		preloadPaintings(manifest);
	});
	syncSettingButton();
	// Joined a Viking battle from the standard game: the setting goes
	// when the battle does (the director is loaded by then anyway).
	window.addEventListener('gameupdate', syncSettingButton);
	// Playtest handle, like window.gameState: paint a moment by hand,
	// or read which events reached the director.
	window.tetchesPaintings = { paint: handlePaintingEvent, queue, received, counts: receivedCounts };
}

/** The last few events in, and running totals, for playtests. */
const received = [];
const receivedCounts = {};
function noteReceived(type, moment) {
	const key = `${type}:${moment?.kind || '-'}`;
	receivedCounts[key] = (receivedCounts[key] || 0) + 1;
	received.push({ type, kind: moment?.kind || null, at: Date.now() });
	if (received.length > 40) received.shift();
}

// ── The setting: Full / Small / Off, and the way home ──────────────────────

/**
 * A button in the utility strip opening a small menu: the painting size
 * (Full / Small / Off) and "Return to the standard game". The edition
 * is remembered, and an installed app has no address bar to type
 * `?edition=standard` into, so the way back has to be in the game.
 */
function mountSettingButton() {
	if (document.getElementById(SETTING_BUTTON_ID)) return;
	const strip = document.querySelector('.debug-indicator');
	if (!strip) return;
	const btn = document.createElement('button');
	btn.id = SETTING_BUTTON_ID;
	btn.type = 'button';
	btn.title = 'Paintings of great moments: full size, small, or off — and the way back to the standard game';
	btn.setAttribute('aria-haspopup', 'menu');
	btn.setAttribute('aria-expanded', 'false');
	btn.textContent = paintingSettingLabel(getPaintingSetting());
	btn.addEventListener('click', () => {
		if (document.getElementById(SETTING_MENU_ID)) closeSettingMenu();
		else openSettingMenu(btn);
	});
	const before = document.getElementById('session-warning');
	strip.insertBefore(btn, before && before.parentNode === strip ? before : null);
}

/** The setting button is there while paintings can happen, and only then. */
function syncSettingButton() {
	const btn = document.getElementById(SETTING_BUTTON_ID);
	const wanted = vikingActive(gameState);
	if (wanted && !btn) mountSettingButton();
	else if (!wanted && btn) { closeSettingMenu(); btn.remove(); }
}

function applySetting(btn, value) {
	const v = setPaintingSetting(value);
	btn.textContent = paintingSettingLabel(v);
	if (v === 'off') {
		queue?.clear();
		closePaintingCard();
	}
}

function injectMenuStyles() {
	if (document.getElementById(MENU_STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = MENU_STYLE_ID;
	// Items fill the menu edge to edge: inputManager.js reads a click on
	// anything but a button over the canvas as a board click.
	style.textContent = `
#${SETTING_MENU_ID} {
  position: fixed; z-index: 11600; display: flex; flex-direction: column; min-width: 190px;
  background: rgba(20, 22, 32, 0.96); border: 1px solid rgba(255, 204, 0, 0.75); border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45); overflow: hidden; font-family: 'Playfair Display', serif;
}
#${SETTING_MENU_ID} button {
  display: block; width: 100%; margin: 0; padding: 9px 14px; border: 0; border-radius: 0;
  background: transparent; color: #ffd84d; font: inherit; font-size: 14px; text-align: left; cursor: pointer;
}
#${SETTING_MENU_ID} button[aria-checked="true"]::before { content: '✓ '; }
#${SETTING_MENU_ID} button[aria-checked="false"]::before { content: '\\2003'; }
#${SETTING_MENU_ID} button:hover, #${SETTING_MENU_ID} button:focus-visible { background: #ffcc00; color: #1a1400; outline: none; }
#${SETTING_MENU_ID} .tp-menu-leave { border-top: 1px solid rgba(255, 204, 0, 0.4); color: #efe0b6; }`;
	document.head.appendChild(style);
}

let menuCleanup = null;

function openSettingMenu(btn) {
	closeSettingMenu();
	injectMenuStyles();
	const menu = document.createElement('div');
	menu.id = SETTING_MENU_ID;
	menu.setAttribute('role', 'menu');
	menu.setAttribute('aria-label', 'Paintings');
	const current = getPaintingSetting();
	for (const value of PAINTING_SETTINGS) {
		const item = document.createElement('button');
		item.type = 'button';
		item.setAttribute('role', 'menuitemradio');
		item.setAttribute('aria-checked', String(value === current));
		item.textContent = `Paintings: ${SETTING_NAMES[value]}`;
		item.addEventListener('click', () => {
			applySetting(btn, value);
			closeSettingMenu({ refocus: true });
		});
		menu.appendChild(item);
	}
	// The way out of the edition — not offered to a standard-game player
	// who is only visiting a Viking battle.
	if (isViking()) menu.appendChild(leaveEditionItem());
	document.body.appendChild(menu);
	placeSettingMenu(menu, btn);
}

function leaveEditionItem() {
	const leave = document.createElement('button');
	leave.type = 'button';
	leave.className = 'tp-menu-leave';
	leave.setAttribute('role', 'menuitem');
	leave.textContent = 'Return to the standard game';
	leave.addEventListener('click', () => {
		closeSettingMenu();
		let ok = true;
		try { ok = window.confirm('Leave the Viking edition? The page reloads as the standard game.'); } catch (_e) { /* no dialogs: go */ }
		if (ok) returnToStandardEdition();
	});
	return leave;
}

function placeSettingMenu(menu, btn) {
	// Above the button when it sits low (desktop strip), below it when
	// high (the strip moves under the title on phones).
	const r = btn.getBoundingClientRect();
	const left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8));
	menu.style.left = `${left}px`;
	if (r.top > window.innerHeight / 2) menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
	else menu.style.top = `${r.bottom + 6}px`;
	btn.setAttribute('aria-expanded', 'true');

	const onPointer = (e) => {
		if (!menu.contains(e.target) && e.target !== btn) closeSettingMenu();
	};
	const onKey = (e) => {
		if (e.key === 'Escape') closeSettingMenu({ refocus: true });
	};
	document.addEventListener('pointerdown', onPointer, true);
	document.addEventListener('keydown', onKey, true);
	menuCleanup = (refocus) => {
		document.removeEventListener('pointerdown', onPointer, true);
		document.removeEventListener('keydown', onKey, true);
		btn.setAttribute('aria-expanded', 'false');
		menu.remove();
		if (refocus) btn.focus();
	};
	(menu.querySelector('[aria-checked="true"]') || menu.firstChild)?.focus();
}

function closeSettingMenu({ refocus = false } = {}) {
	const cleanup = menuCleanup;
	menuCleanup = null;
	cleanup?.(refocus);
}

// ── Events in ──────────────────────────────────────────────────────────────

/**
 * A game event that may deserve a painting.
 *
 * @param {'chess_capture'|'chess_move'|'king_captured'|'promotion'|'battle_end'|'ship'|'chess_check'} type
 * @param {Object} payload  the server payload (battle_end: { battle, results, mySeatId, outcome };
 *   ship: the `tetches:ship` detail)
 */
export function handlePaintingEvent(type, payload) {
	const battleEnd = type === 'battle_end' && payload?.battle?.edition === 'viking';
	if (!vikingActive(gameState) && !battleEnd) return;
	initPaintings();
	if (!started) return;
	const localId = gameState.localPlayerId;
	const shipsNow = shipTracker();
	// Ship bookkeeping (voyages, landings) runs even with paintings
	// off, so turning them back on mid-battle paints the right scenes.
	let moment = null;
	if (type === 'ship') moment = shipsNow.fromShipEvent(payload, shipContext(localId));
	else if (type === 'chess_move' && payload?.ship) {
		// A move that touches a longship is its scene (or no painting);
		// its capture, if any, is keyed so chess_capture adds no second card.
		moment = shipsNow.fromShipEvent({ kind: payload.ship.kind, move: payload }, shipContext(localId));
		type = 'ship';
	} else if (type === 'chess_check') {
		moment = shipsNow.fromCheck(payload, shipContext(localId));
	}
	if (getPaintingSetting() === 'off') return;

	switch (type) {
		case 'ship':
		case 'chess_check':
			if (moment) {
				// Once per battle each (the queue's throttle), and let go if
				// it can't be shown within 3 s.
				const slot = slotCandidates(moment)[0] || moment.kind;
				// (news from afar has a throttle of its own: it never uses up
				// the viewer's own scene)
				moment.throttleKey = `${gameState.activeBattle?.id || 'world'}:${moment.distant ? 'distant:' : ''}${slot}`;
			}
			break;
		case 'chess_capture': moment = fromChessCapture(payload, localId); break;
		case 'chess_move': moment = fromChessMove(payload, localId); break;
		case 'king_captured': moment = fromKingCaptured(payload, localId); break;
		case 'promotion': moment = fromPromotion(payload, localId); break;
		case 'battle_end': {
			// The battle is over: whatever still waits belongs to it, and
			// would otherwise surface over the next one (Rematch) or after
			// "Keep watching".
			queue.clear();
			closePaintingCard();
			moment = fromBattleEnd({ battleId: payload?.battle?.id, outcome: payload?.outcome, playerId: localId });
			if (moment) {
				moment.playerName = battleName(payload) || nameOf(localId);
				if (decorateResultsCard(moment)) { noteReceived(type, moment); return; }
			}
			break;
		}
		default: return;
	}
	noteReceived(type, moment);
	if (!moment) return;

	moment.attackerName = nameOf(moment.attackerId);
	moment.victimName = nameOf(moment.victimId);
	moment.attackerIsYou = sameId(moment.attackerId, localId);
	moment.victimIsYou = sameId(moment.victimId, localId);
	if (!moment.playerName) moment.playerName = nameOf(moment.playerId);

	const pushedAt = Date.now();
	// A capture joining a run already queued or on screen is no new card.
	const joinsRun = moment.kind === 'capture' && !!queue.findRun(pushedAt);
	if (!joinsRun && !deservesCard(moment, pushedAt)) {
		noteReceived(`${type}:no-card`, moment);
		return;
	}
	const result = queue.push(moment, pushedAt);
	if (moment.kind === 'capture' && result === 'queued') lastCaptureCardAt = pushedAt;
	if (result === 'merged-current' && showing) {
		showing.handle.setCaption(captionFor(showing.moment));
	}
	pump();
}

/** The ship tracker for the battle on screen (a new battle starts clean). */
function shipTracker() {
	if (!ships) ships = new ShipMoments();
	const battleId = gameState.activeBattle?.id || null;
	if (battleId !== shipsBattleId) {
		ships.reset();
		shipsBattleId = battleId;
	}
	return ships;
}

/** What the ship moments need from the board and the sea. */
function shipContext(localId) {
	const battle = gameState.activeBattle;
	return {
		localId,
		now: Date.now(),
		cells: gameState.board?.cells,
		pieces: gameState.chessPieces,
		// Quick battles only: ms until the sea takes (x, z).
		sinkInMs: battle?.sea
			? (x, z) => {
				const at = seaSinkAt(battle, Number(x), Number(z));
				return Number.isFinite(at) ? at - serverNow(battle) : null;
			}
			: null,
	};
}

/** The viewer's name as the battle's standings show it. */
function battleName({ results, mySeatId } = {}) {
	const row = (results?.standings || []).find(r => r && r.seatId === mySeatId);
	return isPlaceholderName(row?.name) ? null : cleanName(row.name);
}

// ── Showing ────────────────────────────────────────────────────────────────

function suppressed() {
	try { if (isDefenderInCheck()) return true; } catch (_e) { /* check UI not up */ }
	return !!document.getElementById(RESULTS_ID);
}

function schedule(ms) {
	if (retryTimer) return;
	retryTimer = setTimeout(() => { retryTimer = null; pump(); }, ms);
}

function pump() {
	if (!queue || showing || presenting || queue.size === 0) return;
	if (getPaintingSetting() === 'off') { queue.clear(); return; }
	if (suppressed()) { schedule(RETRY_MS); return; }
	// Stale moments (20 s; ship scenes 3 s) are let go inside next().
	const moment = queue.next(Date.now());
	if (!moment) return;
	present(moment);
}

/**
 * The real painting if it is ready within ART_RACE_MS, else the
 * woodcut (and `late`, which resolves the real one if it turns up).
 */
async function pickArt(moment, caption) {
	const candidates = artSlots(moment);
	const real = (async () => {
		const manifest = await loadManifest();
		if (manifest) manifestNow = manifest;
		const entry = resolvePainting(manifest, candidates);
		if (!entry) return null;
		await loadImage(entry.src);
		return entry;
	})().catch(() => null);

	const TIMEOUT = {};
	const first = await Promise.race([real, sleep(ART_RACE_MS).then(() => TIMEOUT)]);
	const woodcut = () => drawWoodcut(moment, {
		seed: candidates[0] || moment.kind,
		label: `A woodcut: ${caption}`,
	});
	if (first && first !== TIMEOUT) return { art: imageFor(first) };
	return {
		art: woodcut(),
		late: first === TIMEOUT ? real.then(entry => (entry ? imageFor(entry) : null)) : null,
	};
}

function imageFor(entry) {
	const img = new Image();
	img.decoding = 'async';
	img.alt = entry.alt || '';
	img.src = entry.src;
	img.draggable = false;
	return img;
}

async function present(moment) {
	presenting = true;
	const caption = captionFor(moment);
	let picked;
	try {
		picked = await pickArt(moment, caption);
	} finally {
		presenting = false;
	}
	const setting = getPaintingSetting();
	// News from afar is hung smaller than the viewer's own moments.
	const size = moment.distant && setting === 'full' ? 'small' : setting;
	if (size === 'off' || suppressed()) {
		// Turned off or a check began during the race: let it go.
		queue.finish();
		schedule(RETRY_MS);
		return;
	}

	const entry = { moment, handle: null, closeAt: null, mountedAt: Date.now() };
	entry.handle = showPaintingCard({
		art: picked.art,
		// Fresh: captures may have joined the run during the art race.
		caption: captionFor(moment),
		size,
		// Once it starts to fade, a new capture is a new painting rather
		// than an unseen "…and 1 more" on a card going away.
		onClosing: () => { if (showing === entry) queue.finish(); },
		// Its time on screen counts from when it can be seen: the picture
		// decoded and the fade-in begun, not from when it was mounted.
		onVisible: () => {
			if (showing !== entry) return;
			entry.visibleAt = Date.now();
			entry.closeAt = entry.visibleAt + durationFor(moment);
		},
		onClosed: () => {
			if (showing !== entry) return;
			showing = null;
			clearInterval(watchTimer);
			watchTimer = null;
			queue.finish();
			setTimeout(pump, GAP_MS);
		},
	});
	showing = entry;
	picked.late?.then((img) => { if (img && showing === entry) entry.handle.replaceArt(img); });

	clearInterval(watchTimer);
	watchTimer = setInterval(() => {
		if (showing !== entry) return;
		// The viewer's own check takes the screen: step aside at once.
		const now = Date.now();
		const due = entry.closeAt != null
			? now >= entry.closeAt
			// Never got to fade in (a hidden tab runs no frames): let it go
			// rather than surface long after the moment.
			: now - entry.mountedAt > NEVER_SHOWN_MS;
		const shownFor = entry.visibleAt != null ? now - entry.visibleAt : -1;
		const rank = priorityOf(moment);
		const makeWay = (shownFor >= MAKE_WAY_MS && queue.hasUrgent(rank, now))
			// a ship scene waiting behind a lesser card (a capture) cuts in sooner
			|| (shownFor >= MAKE_WAY_LESSER_MS && queue.hasUrgent(rank + 0.25, now));
		if (due || makeWay || suppressed()) entry.handle.close();
	}, 250);
}

// ── The battle results card ────────────────────────────────────────────────

/**
 * Hang the battle's painting at the top of the results card, which is
 * modal and would cover a floating card anyway. Returns false when the
 * results card isn't open.
 */
function decorateResultsCard(moment) {
	const card = document.querySelector(`#${RESULTS_ID} .results-card`);
	if (!card) return false;
	card.querySelector('.tp-results-painting')?.remove();
	const caption = captionFor(moment);
	const holder = document.createElement('div');
	// Sized by the viewport's height (paintingCard.js styles) so the
	// buttons under it stay in view on short phones.
	holder.className = 'tp-results-painting';
	card.insertBefore(holder, card.firstChild);

	pickArt(moment, caption).then(({ art, late }) => {
		if (!holder.isConnected) return;
		const figure = buildFramedPainting(art, caption);
		holder.appendChild(figure);
		// Lost the race: the real picture fades in over the woodcut.
		late?.then((img) => { if (img && holder.isConnected) replaceArt(figure, img); });
	});
	return true;
}
