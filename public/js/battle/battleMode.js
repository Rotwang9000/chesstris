/**
 * Battle mode client — create/join dialog, invite links, seat adoption,
 * and view switching.
 *
 * Battles are private 2-4 player arenas parked far from the organic
 * world. The server gives each participant a dedicated SEAT player id;
 * while a battle view is focused this module swaps
 * `gameState.localPlayerId` to the seat so rendering, input and the
 * camera all act as the seat. The player's real kingdom carries on
 * untouched back home.
 *
 * A player may hold seats in SEVERAL battles at once. The ⚔ dialog
 * lists them all with switch buttons; `battle_focus` tells the server
 * which seat this socket's gameplay events act as (null = the world).
 */

import { getSocket, getPlayerId, getGameId, on as onNetworkEvent, ensureConnected } from '../utils/networkManager.js';
import { showToastMessage } from '../showToastMessage.js';
import { isPortal } from '../portal.js';
import { playSound } from '../audio/soundManager.js';
import { showBattleResults, closeBattleResults } from './battleResults.js';
import { withClockOffset } from './battleRules.js';
import { updateNextPieceHint } from '../tetromino/nextPiece.js';
import { startSeaOverlay, stopSeaOverlay } from './seaOverlay.js';
import { isOffline } from '../offline/offlineMode.js';
import { vikingActive, isVikingBattle, requestedBattleEdition } from '../edition.js';
import {
	VIKING_LITE_REFUSAL, VIKING_RULES, vikingBattleBadgeText, adoptedEdition, longshipsInPlayText,
} from './vikingRules.js';
import { isTouchPrimary } from '../utils/inputMode.js';
import { paintingEvent, startPaintings } from '../paintings/index.js';
import { setSeatHold } from './seatHold.js';

const DIALOG_ID = 'tetches-battle-dialog';
const CAMERA_FLY_DELAY_MS = 1200;  // let the battle board arrive first
const CAMERA_FLY_RETRY_MS = 900;   // board updates land asynchronously
const CAMERA_FLY_MAX_TRIES = 6;
const BATTLE_CODE_PATTERN = /^[A-Za-z0-9]{4,8}$/;

/** How a battle ends: the sea closes in, or fight to the last king. */
const MODE_OPTIONS = [
	{ value: 'quick', label: 'Quick: sea rises, ~7 min' },
	{ value: 'classic', label: 'Classic: no limit' },
];

/** Bot difficulty choices offered at battle creation. */
const BOT_DIFFICULTY_OPTIONS = [
	{ value: 'auto', label: 'Bots: Auto' },
	{ value: 'easy', label: 'Bots: Easy' },
	{ value: 'medium', label: 'Bots: Medium' },
	{ value: 'hard', label: 'Bots: Hard' },
];

let gameStateRef = null;
let savedRealPlayerId = null;
let battleModeWired = false;
/** Latest `publicState` list of every battle this player holds a seat in. */
let myBattles = [];
// Battles this player was in that have finished (their world-wide
// winner toast is redundant here).
const finishedBattleIds = new Set();

/** The battle code carried in the page URL (invite link), or null. */
export function inviteCodeFromUrl() {
	try {
		const code = new URLSearchParams(window.location.search).get('battle');
		return (code && BATTLE_CODE_PATTERN.test(code)) ? code.toUpperCase() : null;
	} catch (_e) {
		return null;
	}
}

/**
 * Battle-first entry (`?play=battle`, used by the "Tetches: Battle"
 * portal page): the welcome screen leads with battles, not the world.
 */
export function isBattleFirstEntry() {
	if (isOffline()) return true;
	try {
		return new URLSearchParams(window.location.search).get('play') === 'battle';
	} catch (_e) {
		return false;
	}
}

/**
 * Keep the address bar honest: while in a battle (lobby or active) the
 * URL carries `?battle=CODE` — shareable directly — and drops the
 * `gameId=global_game` param. Leaving a battle restores the world id
 * for players who have one.
 */
function syncBattleUrl(code) {
	if (isOffline()) return;
	try {
		const url = new URL(window.location);
		if (code) {
			url.searchParams.set('battle', code);
			url.searchParams.delete('gameId');
		} else {
			url.searchParams.delete('battle');
			const worldId = getGameId?.();
			if (hasEnteredWorld() && worldId) url.searchParams.set('gameId', worldId);
		}
		window.history.replaceState({}, '', url);
	} catch (_e) { /* URL API unavailable (tests) */ }
}

function mySeat(battle) {
	const realId = String(getPlayerId() || savedRealPlayerId || '');
	if (!battle || !realId) return null;
	return (battle.seats || []).find(
		s => !s.isAi && String(s.controlledBy) === realId
	) || null;
}

/** My seat, or the one a bot took over when I dropped out. */
function myOwnSeat(battle) {
	const seat = mySeat(battle);
	if (seat || !battle) return seat;
	const ids = [getPlayerId(), savedRealPlayerId].filter(Boolean).map(String);
	return (battle.seats || []).find(s => s.leftBy && ids.includes(String(s.leftBy))) || null;
}

/** Has this player entered the shared world (kingdom exists)? */
function hasEnteredWorld() {
	try { return window.gameCore?.isWorldEntered?.() === true; }
	catch (_e) { return false; }
}

/**
 * Battle-only players (never clicked PLAY) have no kingdom to return
 * to after a battle — bring the welcome overview back instead so they
 * can pick PLAY or another BATTLE.
 */
function returnToWelcomeIfHomeless() {
	if (hasEnteredWorld()) return;
	if (document.getElementById('tutorial-message')) return;
	try { window.gameCore?.showWelcomeOverview?.(); }
	catch (err) { console.warn('Could not return to welcome screen:', err); }
}

/**
 * Fly the camera to a player's king, retrying while the board data for
 * a freshly built arena is still in flight.
 */
function flyToSeat(seatId, attempt = 0) {
	setTimeout(() => {
		let moved = false;
		try { moved = window.gameCore?.flyToPlayerKing?.(seatId) === true; }
		catch (_e) { /* camera not ready */ }
		if (!moved && attempt < CAMERA_FLY_MAX_TRIES) flyToSeat(seatId, attempt + 1);
	}, attempt === 0 ? CAMERA_FLY_DELAY_MS : CAMERA_FLY_RETRY_MS);
}

/**
 * Tell the server which view this socket's gameplay events act in:
 * a battle id (act as that battle's seat) or null (the world).
 */
function emitFocus(battleId) {
	try {
		const socket = getSocket();
		if (socket) socket.emit('battle_focus', { battleId: battleId ?? null });
	} catch (_e) { /* focus is best-effort; reconnect re-sends it */ }
}

/** Adopt the battle seat as the local identity (switching views). */
/**
 * A page left open across a server update runs the old app bundle, but
 * the lazily loaded Viking chunk (and the battle rules) come from the
 * new build — the mix left battles blank. Reload once, straight back
 * into the battle (`?battle=CODE`), instead. Returns true if reloading.
 */
function reloadIfStaleBuild(battle) {
	if (isOffline() || typeof window === 'undefined') return false;
	const stale = window.__TETCHES_STALE_BUILD__;
	if (!stale || !battle?.code) return false;
	try {
		const key = 'tetches_stale_reload';
		if (window.sessionStorage.getItem(key) === String(stale)) return false;  // once per build
		window.sessionStorage.setItem(key, String(stale));
		const url = new URL(window.location);
		url.searchParams.set('battle', battle.code);
		url.searchParams.delete('gameId');
		window.location.replace(url.toString());
		return true;
	} catch (_e) {
		return false;
	}
}

function adoptSeat(battle, { announce = true } = {}) {
	if (!gameStateRef) return;
	const seat = mySeat(battle);
	if (!seat) return;
	if (gameStateRef.activeBattle?.id !== battle.id && reloadIfStaleBuild(battle)) return;
	// Lite (2D) mode cannot show longships: refuse Viking battles.
	if (gameStateRef.liteMode && isVikingBattle(battle)) {
		showToastMessage(VIKING_LITE_REFUSAL, { variant: 'alert', duration: 8000 });
		return;
	}
	// Idempotent: the push event and the poll/ack fallbacks can both
	// land — the second call must not re-fly the camera.
	if (gameStateRef.activeBattle?.id === battle.id
		&& gameStateRef.localPlayerId === seat.seatId) {
		// …but a fresher record still carries the battle's edition.
		gameStateRef.activeBattle.edition = adoptedEdition(battle, gameStateRef.activeBattle.edition);
		if (vikingActive(gameStateRef)) startPaintings();
		return;
	}
	if (!savedRealPlayerId) {
		savedRealPlayerId = gameStateRef.localPlayerId || getPlayerId() || null;
	}
	gameStateRef.activeBattle = {
		id: battle.id,
		code: battle.code,
		centre: battle.centre,
		playRadius: battle.playRadius,
		mode: battle.mode || 'classic',
		sea: withClockOffset(battle.sea),
		// The battle's edition (never the URL's): 'viking' turns on the
		// longship rules, controls and art for this seat.
		edition: adoptedEdition(battle),
	};
	gameStateRef.localPlayerId = seat.seatId;
	gameStateRef.myPlayerId = seat.seatId;
	gameStateRef.currentPlayer = seat.seatId;
	// A seat has placed nothing yet — its first tetromino anchors on the
	// seat's fresh home zone.
	gameStateRef._hasPlacedTetromino = false;
	gameStateRef.turnPhase = 'tetris';
	// The seat has its own deal; the next spawn fetches it.
	gameStateRef.dealtPieces = null;
	emitFocus(battle.id);
	// Battle-only players never ran the world-entry start-up — spin the
	// gameplay systems up now (no world join; the seat IS the identity).
	// World players need it too: it clears modals and flips the session
	// into "playing" for the arena.
	try { window.gameCore?.startBattleSession?.(); }
	catch (err) { console.warn('startBattleSession failed:', err); }
	syncBattleUrl(battle.code);
	if (battle.sea) startSeaOverlay();
	else stopSeaOverlay();
	// A Viking battle paints its great moments, even for a player who
	// joined it by code from the standard game (paintings/index.js).
	if (vikingActive(gameStateRef)) startPaintings();
	if (announce) {
		showToastMessage(battle.sea
			? '⚔ Fight! The sea rises soon: keep your king off the flashing cells.'
			: `⚔ Battle ${battle.code} — fight!`,
		{ variant: 'success', duration: battle.sea ? 7000 : 5000 });
		if (isVikingBattle(battle)) {
			// After the opening toasts have gone (one message at a time, so
			// the fjord gets a clean first look, on a phone above all).
			const battleId = battle.id;
			setTimeout(() => {
				if (gameStateRef?.activeBattle?.id !== battleId) return;
				showToastMessage(longshipsInPlayText(isTouchPrimary()), { duration: 6000, icon: 'longship' });
			}, 11000);
		}
	}
	flyToSeat(seat.seatId);
}

/**
 * The socket reconnected and the server re-announced the player's real
 * id. While seated in a battle the seat stays the local identity (your
 * pieces, turn, HUD, longship controls and detail levels all go by it);
 * the real id waits for the battle's end. Returns true when it kept the
 * seat (the caller must then not overwrite localPlayerId).
 * Standard battles too: swapping in the real id mid-battle left the
 * player owning none of their army after any connection blip.
 */
export function keepBattleSeatOnRejoin(realId) {
	const battle = gameStateRef?.activeBattle;
	if (!battle || !savedRealPlayerId || !realId) return false;
	const seatId = gameStateRef.localPlayerId;
	if (!seatId || String(seatId) === String(realId)) return false;
	savedRealPlayerId = realId;
	return true;
}

/**
 * A battle ended (live `battle_finished`, or learnt on reconnect).
 * Returns true when it was the battle on screen.
 */
function battleHasFinished(battle, results, { whileOffline = false } = {}) {
	if (finishedBattleIds.has(battle.id) && gameStateRef?.activeBattle?.id !== battle.id) return false;
	finishedBattleIds.add(battle.id);
	myBattles = myBattles.filter(b => b.id !== battle.id);
	if (gameStateRef) gameStateRef.myBattles = myBattles;
	const seat = myOwnSeat(battle);
	const won = !!(seat && battle.winnerSeatId === seat.seatId);
	// A background battle ending must not interrupt the current
	// fight (or the world) — just a toast.
	if (gameStateRef?.activeBattle?.id !== battle.id) {
		showToastMessage(
			won
				? `👑 Victory! You won battle ${battle.code}!`
				: `⚔ Battle ${battle.code} over — you were defeated.`,
			{ variant: won ? 'success' : 'alert', duration: 8000 }
		);
		return false;
	}
	// The watched battle: identity goes home now, but the camera
	// stays on the arena behind the results card until the player
	// picks what's next.
	const realId = savedRealPlayerId || getPlayerId();
	releaseSeat({ silent: true });
	showEndScene(battle, results, seat, {
		realId,
		note: whileOffline ? '📡 This battle ended while you were offline.' : null,
	});
	return true;
}

/**
 * Back online mid-battle: the server may have finished the battle
 * (the `battle_finished` message went out while we were away), or
 * handed our army to a bot. Ask, then play on, take the seat back, or
 * show how it ended — never sit on in a dead arena.
 */
export async function resumeBattleAfterReconnect(battleId) {
	const res = await emitBattle('battle_resume', { battleId });
	// Moved on meanwhile (the live end message got here first, etc.).
	if (gameStateRef?.activeBattle?.id !== battleId) return null;
	// No answer (old server, another drop): the next reconnect asks again.
	if (!res?.success) return null;
	const watched = gameStateRef.activeBattle;
	switch (res.status) {
		case 'reclaimed':
			emitFocus(battleId);
			showToastMessage('📡 Back online: your army is yours again', { variant: 'success', duration: 5000 });
			break;
		case 'finished':
			if (res.battle) battleHasFinished(res.battle, res.results, { whileOffline: true });
			break;
		case 'lost':
		case 'gone': {
			finishedBattleIds.add(battleId);
			myBattles = myBattles.filter(b => b.id !== battleId);
			if (gameStateRef) gameStateRef.myBattles = myBattles;
			const realId = savedRealPlayerId || getPlayerId();
			releaseSeat({ silent: true });
			const lost = res.status === 'lost';
			showBattleResults({
				battle: res.battle || { id: battleId, code: watched.code, mode: watched.mode },
				results: null,
				mode: 'gone',
				subtitle: lost
					? 'Your army fell while you were offline.'
					: 'This battle ended while you were offline.',
				actions: [{
					label: hasEnteredWorld() ? '🏰 Back to my kingdom' : 'Done',
					primary: true,
					onClick: () => {
						closeBattleResults();
						goHomeAfterBattle(realId);
					},
				}],
			});
			break;
		}
		default:
			break;
	}
	return res.status || null;
}

/** Return to the player's real kingdom identity (the world view). */
function releaseSeat({ silent = false } = {}) {
	if (!gameStateRef) return;
	gameStateRef.activeBattle = null;
	gameStateRef.dealtPieces = null;
	stopSeaOverlay();
	syncBattleUrl(null);
	emitFocus(null);
	if (savedRealPlayerId) {
		gameStateRef.localPlayerId = savedRealPlayerId;
		gameStateRef.myPlayerId = savedRealPlayerId;
		gameStateRef.currentPlayer = savedRealPlayerId;
		gameStateRef.turnPhase = 'tetris';
		// Only fly "home" if there is a home — battle-only players have
		// no kingdom, so the camera would chase a king that isn't there.
		if (!silent && hasEnteredWorld()) flyToSeat(savedRealPlayerId);
		savedRealPlayerId = null;
	}
}

/**
 * Switch the view to another battle (or back to the world with null).
 * Unlike a fresh adoption this never re-announces "battle started".
 */
function switchViewTo(battle) {
	if (!battle) {
		releaseSeat();
		showToastMessage('🌍 Back to the world', { duration: 3000 });
		return;
	}
	adoptSeat(battle, { announce: false });
	showToastMessage(`⚔ Switched to battle ${battle.code}`, { duration: 3000 });
}

/**
 * After a battle: fly to the player's kingdom, or (battle-only players,
 * who have none) bring the welcome screen back.
 */
function goHomeAfterBattle(realId) {
	if (gameStateRef?.activeBattle) releaseSeat({ silent: true });
	if (hasEnteredWorld()) {
		if (realId) flyToSeat(realId);
	} else {
		returnToWelcomeIfHomeless();
	}
}

/**
 * Same table again: a new battle with the same size and bot pace.
 * Against bots only it starts straight away; with friends it opens the
 * new lobby so the code can be shared again.
 */
async function rematch(battle) {
	const realId = String(getPlayerId() || '');
	const friends = (battle.seats || []).filter(s => !s.isAi && String(s.controlledBy) !== realId);
	const seatCount = battle.seatCount || (battle.seats || []).length || 2;
	const created = await createBattle(seatCount, battle.botDifficulty || 'auto', battle.mode || 'quick',
		adoptedEdition(battle));
	if (!created.success) {
		showToastMessage(created.error || 'Could not start a rematch', { variant: 'alert' });
		return;
	}
	await fetchBattleState();
	closeBattleResults();
	if (friends.length > 0) {
		await showBattleDialog();
		showToastMessage('New battle ready: share the code with your friends', { duration: 6000 });
		return;
	}
	const started = await startBattle(created.battle.id);
	if (!started.success) {
		showToastMessage(started.error || 'Could not start the rematch', { variant: 'alert' });
		await showBattleDialog();
		return;
	}
	// The battle_started push adopts the seat too; adoptSeat is idempotent.
	if (started.battle?.status === 'active') adoptSeat(started.battle);
}

/** The end-of-battle card for the battle being watched. */
function showEndScene(battle, results, seat, { realId, note = null } = {}) {
	const { outcome } = showBattleResults({
		battle,
		results,
		note,
		mySeatId: seat?.seatId,
		actions: [
			{ label: '⚔ Rematch', primary: true, onClick: () => rematch(battle) },
			{
				label: hasEnteredWorld() ? '🏰 Back to my kingdom' : 'Done',
				onClick: () => {
					closeBattleResults();
					goHomeAfterBattle(realId);
				},
			},
		],
	});
	// The seat is already released here: the battle itself says Viking.
	if (vikingActive(gameStateRef) || isVikingBattle(battle)) paintingEvent('battle_end', { battle, results, mySeatId: seat?.seatId, outcome });
	// Defeat already played the king's fall with the capture.
	if (outcome === 'victory') {
		try { playSound('promotion'); } catch (_e) { /* sound is best-effort */ }
	}
}

// ── Socket plumbing ─────────────────────────────────────────────────────────

function emitBattle(event, data = {}) {
	return new Promise((resolve) => {
		const socket = getSocket();
		if (!socket) {
			resolve({ success: false, error: 'Not connected' });
			return;
		}
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) { settled = true; resolve({ success: false, error: 'Server timeout' }); }
		}, 8000);
		socket.emit(event, data, (response) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(response || { success: false, error: 'No response' });
		});
	});
}

/** Lite (2D) mode can't draw longships: Viking battles are refused there. */
function liteRefusesViking(edition) {
	return !!gameStateRef?.liteMode && edition === 'viking';
}

/**
 * @param {string} [edition] 'viking' | 'standard'; defaults to this
 *        client's edition (?edition=viking asks for a Viking battle).
 */
export function createBattle(seatCount, botDifficulty = 'auto', mode = 'quick', edition = requestedBattleEdition()) {
	if (liteRefusesViking(edition)) return Promise.resolve({ success: false, error: VIKING_LITE_REFUSAL });
	return emitBattle('battle_create', { seatCount, botDifficulty, mode, edition });
}

export async function joinBattle(code) {
	const result = await emitBattle('battle_join', { code });
	// The server lets anyone in; lite mode gives a Viking seat straight back.
	if (result?.success && liteRefusesViking(adoptedEdition(result.battle))) {
		await emitBattle('battle_leave', result.battle?.id ? { battleId: result.battle.id } : {});
		return { success: false, error: VIKING_LITE_REFUSAL };
	}
	return result;
}

/** Pair with whoever else is looking (a bot steps in after a short wait). */
export function quickMatch(edition = requestedBattleEdition()) {
	if (liteRefusesViking(edition)) return Promise.resolve({ success: false, error: VIKING_LITE_REFUSAL });
	// Viking players are paired only with Viking players.
	return emitBattle('battle_quickmatch', { edition });
}

/** How many players are looking for / playing quick battles right now. */
export function quickMatchInfo() {
	return emitBattle('battle_quickmatch_info');
}

export function startBattle(battleId = null) {
	return emitBattle('battle_start', battleId ? { battleId } : {});
}

// Battles this page forfeited: the server keeps listing them (the seat
// is still ours) until its next sweep ends them, so the hub showed a
// battle just forfeited as "— active" with a Switch button.
const forfeitedIds = new Set();

export function leaveBattle(battleId = null) {
	if (battleId) forfeitedIds.add(String(battleId));
	return emitBattle('battle_leave', battleId ? { battleId } : {});
}

export async function fetchBattleState() {
	const state = await emitBattle('battle_state');
	if (state && Array.isArray(state.battles)) {
		myBattles = state.battles.filter(b => !(b.status === 'active' && forfeitedIds.has(String(b.id))));
		if (gameStateRef) gameStateRef.myBattles = myBattles;
	}
	return state;
}

// ── Dialog UI ───────────────────────────────────────────────────────────────

// The look (colours, borders, type) comes from the shared `.tx-*` UI
// theme in index.html; only layout stays inline here.
function el(tag, styles = {}, text = '', className = '') {
	const node = document.createElement(tag);
	Object.assign(node.style, styles);
	if (className) node.className = className;
	if (text) node.textContent = text;
	return node;
}

function themedButton(label, { primary = false, danger = false, small = false } = {}) {
	const cls = ['tx-btn'];
	if (primary) cls.push('tx-btn--primary');
	if (danger) cls.push('tx-btn--danger');
	if (small) cls.push('tx-btn--sm');
	const btn = el('button', {}, label, cls.join(' '));
	btn.type = 'button';
	return btn;
}

/**
 * "Quick match" with a lightning bolt in the button's own ink (the ⚡
 * emoji was a yellow smudge on the yellow primary button).
 */
function setQuickMatchLabel(btn) {
	btn.textContent = '';
	const svgNs = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(svgNs, 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('class', 'tx-btn-icon');
	const bolt = document.createElementNS(svgNs, 'path');
	bolt.setAttribute('d', 'M9.5 0.5 2.5 9h4.5l-1 6.5L13.5 7H9z');
	bolt.setAttribute('fill', 'currentColor');
	svg.appendChild(bolt);
	btn.appendChild(svg);
	btn.appendChild(document.createTextNode('Quick match'));
}

/** A muted line of small print; `tone` 'sea' / 'good' tints it. */
function note(text, tone = '', styles = {}) {
	return el('div', styles, text, `tx-note${tone ? ` tx-${tone}` : ''}`);
}

function inviteLinkFor(code) {
	return `${window.location.origin}/?battle=${encodeURIComponent(code)}`;
}

function closeBattleDialog() {
	stopLobbyPoll();
	stopMatchCountdown();
	const existing = document.getElementById(DIALOG_ID);
	if (existing) {
		try { document.body.removeChild(existing); } catch (_e) { /* gone */ }
	}
}

// ── Lobby poll — belt-and-braces beside the push events ────────────────────
// If a `battle_lobby_update` / `battle_started` push is ever lost (flaky
// network, tab juggling), the open lobby still refreshes within a few
// seconds and a started battle still gets adopted.

const LOBBY_POLL_MS = 4000;
let lobbyPollTimer = null;
let lobbyPollBusy = false;
let lastLobbyRenderJson = '';

function stopLobbyPoll() {
	if (lobbyPollTimer) {
		clearInterval(lobbyPollTimer);
		lobbyPollTimer = null;
	}
	lastLobbyRenderJson = '';
}

function startLobbyPoll(card, code) {
	stopLobbyPoll();
	const codeUp = String(code || '').toUpperCase();
	lobbyPollTimer = setInterval(async () => {
		if (lobbyPollBusy) return;
		if (!document.getElementById(DIALOG_ID)) {
			stopLobbyPoll();
			return;
		}
		lobbyPollBusy = true;
		try {
			const state = await fetchBattleState();
			if (!document.getElementById(DIALOG_ID)) return;
			const battle = (state?.battles || [])
				.find(b => String(b.code).toUpperCase() === codeUp) || null;
			if (!battle) return; // cancelled/expired — push event handles it
			if (battle.status === 'active' && mySeat(battle)) {
				// Missed battle_started — adopt now unless the player is
				// busy fighting in a different battle view.
				if (!gameStateRef?.activeBattle || gameStateRef.activeBattle.id === battle.id) {
					closeBattleDialog();
					adoptSeat(battle);
				} else {
					showToastMessage(
						`⚔ Battle ${battle.code} started — the ⚔ Battle button switches to it`,
						{ duration: 6000 });
					closeBattleDialog();
				}
				return;
			}
			if (battle.status === 'lobby') {
				const snapshot = JSON.stringify(battle.seats) + battle.seatCount;
				if (snapshot !== lastLobbyRenderJson) {
					lastLobbyRenderJson = snapshot;
					renderDialogContent(card, battle);
				}
			}
		} finally {
			lobbyPollBusy = false;
		}
	}, LOBBY_POLL_MS);
}

/**
 * Show the battle dialog. A single fresh lobby renders straight into
 * the lobby view; anything else (multiple battles, active battles, or
 * none) renders the hub — a switcher over "your battles" plus the
 * create/join menu.
 * @param {{ prefillCode?: string }} [options]
 */
export async function showBattleDialog(options = {}) {
	if (document.getElementById(DIALOG_ID)) return;

	const overlay = el('div', {
		position: 'fixed',
		top: '0', left: '0', width: '100%', height: '100%',
		zIndex: '12000',
		display: 'flex', justifyContent: 'center', alignItems: 'center',
	}, '', 'tx-scrim');
	overlay.id = DIALOG_ID;

	const card = el('div', {}, '', 'tx-panel tx-dialog');
	card.setAttribute('role', 'dialog');
	card.setAttribute('aria-label', 'Battle Arena');
	overlay.appendChild(card);
	overlay.addEventListener('click', (e) => {
		if (e.target !== overlay) return;
		closeBattleDialog();
		// Battle-only players who back out of the dialog would be
		// stranded on the spectator view — bring the welcome screen back.
		returnToWelcomeIfHomeless();
	});
	document.body.appendChild(overlay);

	const state = await fetchBattleState();
	const battles = state?.battles || (state?.battle ? [state.battle] : []);
	const single = battles.length === 1 ? battles[0] : null;
	if (single && single.status === 'lobby' && !options.forceHub) {
		renderDialogContent(card, single, options);
	} else {
		renderDialogContent(card, null, options);
	}
}

function renderDialogContent(card, battle, options = {}) {
	stopMatchCountdown();
	card.innerHTML = '';
	delete card.dataset.lobbyCode;

	const heading = el('h3', {}, '⚔ Battle Arena', 'tx-title');
	card.appendChild(heading);

	if (battle && battle.status === 'lobby') {
		card.dataset.lobbyCode = String(battle.code).toUpperCase();
		syncBattleUrl(battle.code);
		renderLobby(card, battle);
		startLobbyPoll(card, battle.code);
		return;
	}

	stopLobbyPoll();
	renderBattleSwitcher(card);
	renderCreateJoin(card, options);
}

/**
 * "Your battles" hub section: one row per held seat plus a world row,
 * with view-switch and leave/forfeit actions. Lets a player fight in
 * several battles and hop between them and their kingdom.
 */
function renderBattleSwitcher(card) {
	const currentId = gameStateRef?.activeBattle?.id || null;
	if (myBattles.length === 0 && !currentId) return;

	card.appendChild(sectionLabel('YOUR BATTLES — SWITCH VIEW'));
	const list = el('div', { marginBottom: '4px' });

	const addRow = (labelText, { viewing = false, onSwitch = null, onLeave = null, leaveTitle = '' } = {}) => {
		const row = el('div', {}, '', `tx-row${viewing ? ' is-current' : ''}`);
		row.appendChild(el('span', {}, labelText, 'tx-row-label'));
		if (viewing) {
			row.appendChild(el('span', {}, '● VIEWING', 'tx-badge'));
		} else if (onSwitch) {
			const btn = themedButton('Switch', { small: true });
			btn.addEventListener('click', onSwitch);
			row.appendChild(btn);
		}
		if (onLeave) {
			const btn = themedButton('✕', { danger: true, small: true });
			btn.title = leaveTitle;
			btn.setAttribute('aria-label', leaveTitle);
			btn.addEventListener('click', onLeave);
			row.appendChild(btn);
		}
		list.appendChild(row);
	};

	// The shared world — always available to return to.
	addRow('🌍 Shared world', {
		viewing: currentId === null,
		onSwitch: () => {
			closeBattleDialog();
			switchViewTo(null);
		},
	});

	for (const battle of myBattles) {
		const statusText = battle.status === 'lobby'
			? `lobby ${battle.seats.length}/${battle.seatCount}`
			: battle.status;
		const label = `⚔ ${battle.code}${isVikingBattle(battle) ? ' (Viking)' : ''} — ${statusText}`;

		if (battle.status === 'lobby') {
			const row = el('div', {}, '', 'tx-row');
			row.appendChild(el('span', {}, label, 'tx-row-label'));
			const openBtn = themedButton('Open lobby', { small: true });
			openBtn.addEventListener('click', () => renderDialogContent(card, battle));
			row.appendChild(openBtn);
			list.appendChild(row);
			continue;
		}

		addRow(label, {
			viewing: currentId === battle.id,
			onSwitch: () => {
				closeBattleDialog();
				switchViewTo(battle);
			},
			onLeave: async () => {
				await leaveBattle(battle.id);
				if (gameStateRef?.activeBattle?.id === battle.id) releaseSeat({ silent: true });
				await fetchBattleState();
				renderDialogContent(card, null);
				showToastMessage(`Forfeited battle ${battle.code}`, { duration: 3500 });
			},
			leaveTitle: 'Forfeit this battle (your seat is eliminated)',
		});
	}

	card.appendChild(list);
	card.appendChild(orDivider());
}

/**
 * "⛵ Viking battle: longships in play" — on the lobby, matchmaking
 * and create screens when the battle (or the battle you'd create) is a
 * Viking one. Nothing at all for the standard game.
 */
function appendVikingBadge(card, battle) {
	const text = vikingBattleBadgeText(battle);
	if (!text) return null;
	const badge = el('div', {}, '', 'viking-battle-badge');
	// (a drawn longship: the UI theme's .tx-badge-glyph)
	const glyph = el('span', {}, '', 'tx-badge-glyph');
	glyph.setAttribute('aria-hidden', 'true');
	badge.appendChild(glyph);
	badge.appendChild(el('span', {}, text, 'tx-badge-text'));
	const rulesBtn = themedButton('Rules', { small: true });
	rulesBtn.setAttribute('aria-expanded', 'false');
	const rules = el('ol', { display: 'none' }, '', 'viking-battle-rules');
	for (const line of VIKING_RULES) rules.appendChild(el('li', {}, line));
	rulesBtn.addEventListener('click', () => {
		const open = rules.style.display === 'none';
		rules.style.display = open ? 'block' : 'none';
		rulesBtn.setAttribute('aria-expanded', String(open));
	});
	badge.appendChild(rulesBtn);
	card.appendChild(badge);
	card.appendChild(rules);
	return badge;
}

function sectionLabel(text) {
	return el('div', {}, text, 'tx-kicker');
}

function orDivider() {
	// The rules either side are the divider's ::before / ::after.
	return el('div', {}, 'OR', 'tx-divider');
}

const OFFLINE_PREFS_KEY = 'tetches_offline_battle_prefs';

function loadOfflinePrefs() {
	try {
		return JSON.parse(localStorage.getItem(OFFLINE_PREFS_KEY) || 'null') || {};
	} catch (_e) {
		return {};
	}
}

function saveOfflinePrefs(prefs) {
	try { localStorage.setItem(OFFLINE_PREFS_KEY, JSON.stringify(prefs)); } catch (_e) { /* storage blocked */ }
}

/** A labelled row of toggle buttons; returns a getter for the choice. */
function choiceRow(card, label, choices, initial) {
	card.appendChild(sectionLabel(label));
	const row = el('div', {}, '', 'tx-segmented');
	row.setAttribute('role', 'group');
	row.setAttribute('aria-label', label);
	let value = choices.some(c => c.value === initial) ? initial : choices[0].value;
	const buttons = choices.map(({ value: v, label: text, title }) => {
		const btn = themedButton(text);
		if (title) btn.title = title;
		btn.dataset.value = v;
		btn.addEventListener('click', () => {
			value = v;
			paint();
		});
		row.appendChild(btn);
		return btn;
	});
	function paint() {
		for (const btn of buttons) {
			const on = btn.dataset.value === value;
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		}
	}
	paint();
	card.appendChild(row);
	return () => value;
}

/**
 * Offline (no server): battles against the computer only, started
 * straight away — no lobby, codes or matchmaking.
 */
function renderOfflineSetup(card) {
	const prefs = loadOfflinePrefs();
	card.appendChild(el('p', {},
		'Play the computer. Drop blocks to build ground, march your pieces across it and take the enemy king.', 'tx-text'));
	appendVikingBadge(card, { edition: requestedBattleEdition() });

	const seats = choiceRow(card, 'OPPONENTS', [
		{ value: '2', label: '1 bot' },
		{ value: '3', label: '2 bots' },
		{ value: '4', label: '3 bots' },
	], String(prefs.seatCount || 2));
	const difficulty = choiceRow(card, 'DIFFICULTY', [
		{ value: 'easy', label: 'Easy' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'hard', label: 'Hard' },
		{ value: 'auto', label: 'Auto', title: 'Bots pace themselves to your speed' },
	], prefs.botDifficulty || 'medium');
	const mode = choiceRow(card, 'GAME', [
		{ value: 'quick', label: '🌊 Quick', title: 'The sea rises: about 7 minutes' },
		{ value: 'classic', label: '♟ Classic', title: 'No time limit' },
	], prefs.mode || 'quick');

	const playBtn = themedButton('⚔ Play', { primary: true });
	playBtn.classList.add('tx-btn--lg', 'tx-btn--block');
	playBtn.style.marginTop = '4px';
	playBtn.addEventListener('click', async () => {
		const choice = { seatCount: Number(seats()), botDifficulty: difficulty(), mode: mode() };
		saveOfflinePrefs(choice);
		playBtn.disabled = true;
		playBtn.textContent = 'Setting up…';
		const created = await createBattle(choice.seatCount, choice.botDifficulty, choice.mode);
		const started = created.success ? await startBattle(created.battle.id) : created;
		if (!started.success) {
			playBtn.disabled = false;
			playBtn.textContent = '⚔ Play';
			showToastMessage(started.error || 'Could not start the battle', { variant: 'alert' });
			return;
		}
		// `battle_started` adopts the seat and closes this dialog.
		await fetchBattleState();
	});
	card.appendChild(playBtn);
	card.appendChild(note('Quick: the sea sweeps the arena away, last king above water wins. Classic: fight to the last king.',
		'', { marginTop: '8px' }));
}

function renderCreateJoin(card, options = {}) {
	if (isOffline()) {
		renderOfflineSetup(card);
		return;
	}
	// ── Quick match ──────────────────────────────────────────────
	card.appendChild(sectionLabel('PLAY SOMEONE NOW'));
	appendVikingBadge(card, { edition: requestedBattleEdition() });
	const matchBtn = themedButton('', { primary: true });
	matchBtn.classList.add('tx-btn--lg', 'tx-btn--block');
	setQuickMatchLabel(matchBtn);
	matchBtn.addEventListener('click', async () => {
		matchBtn.disabled = true;
		matchBtn.textContent = 'Finding a game…';
		const result = await quickMatch();
		matchBtn.disabled = false;
		setQuickMatchLabel(matchBtn);
		if (!result.success) {
			showToastMessage(result.error || 'Could not find a game', { variant: 'alert' });
			return;
		}
		await fetchBattleState();
		if (result.battle?.status === 'active') {
			closeBattleDialog();
			adoptSeat(result.battle);
		} else {
			renderDialogContent(card, result.battle);
		}
	});
	card.appendChild(matchBtn);
	const matchInfo = note('1 v 1 against another player. If nobody turns up in 20 seconds, a bot takes the seat.',
		'', { marginTop: '6px', marginBottom: '4px' });
	card.appendChild(matchInfo);
	quickMatchInfo().then((info) => {
		if (!info?.success) return;
		const others = info.looking > 0
			? `${info.looking} player${info.looking === 1 ? '' : 's'} looking now`
			: 'Nobody else looking right now';
		const playing = info.playing > 0 ? ` · ${info.playing} in battles` : '';
		matchInfo.textContent = `${others}${playing}. A bot steps in after ${Math.round((info.waitMs || 20000) / 1000)}s.`;
	}).catch(() => { /* the default line stands */ });

	card.appendChild(orDivider());

	const help = el('p', {},
		'Set up a private arena for 2-4 players. Bots fill any seat a friend doesn\u2019t take.', 'tx-text tx-hub-blurb');
	card.appendChild(help);

	// ── Host a battle ────────────────────────────────────────────
	card.appendChild(sectionLabel('START A NEW BATTLE'));
	const selectStyles = { flex: '1', minWidth: '0' };
	const createRow = el('div', { display: 'flex', gap: '8px', alignItems: 'center' });
	const seatSelect = el('select', selectStyles, '', 'tx-field');
	for (const n of [2, 3, 4]) {
		const opt = document.createElement('option');
		opt.value = String(n);
		opt.textContent = n === 2 ? '1 v 1' : `${n} players`;
		seatSelect.appendChild(opt);
	}
	// Bot difficulty: Auto (bots mirror the humans' tempo) or a fixed
	// level for players who want a predictable challenge.
	const diffSelect = el('select', selectStyles, '', 'tx-field');
	for (const { value, label } of BOT_DIFFICULTY_OPTIONS) {
		const opt = document.createElement('option');
		opt.value = value;
		opt.textContent = label;
		diffSelect.appendChild(opt);
	}
	diffSelect.title = 'Auto: bots pace themselves to your speed. Or pick a fixed difficulty.';
	createRow.appendChild(seatSelect);
	createRow.appendChild(diffSelect);
	card.appendChild(createRow);

	const modeSelect = el('select', { width: '100%', marginTop: '8px' }, '', 'tx-field');
	for (const { value, label } of MODE_OPTIONS) {
		const opt = document.createElement('option');
		opt.value = value;
		opt.textContent = label;
		modeSelect.appendChild(opt);
	}
	modeSelect.title = 'Quick: the sea sweeps round the arena and swallows it; the last king above water wins.';
	card.appendChild(modeSelect);

	const createBtn = themedButton('Create battle');
	createBtn.classList.add('tx-btn--block');
	createBtn.style.marginTop = '10px';
	createBtn.addEventListener('click', async () => {
		createBtn.disabled = true;
		const result = await createBattle(Number(seatSelect.value), diffSelect.value, modeSelect.value);
		createBtn.disabled = false;
		if (result.success) {
			await fetchBattleState();
			renderDialogContent(card, result.battle);
		} else {
			showToastMessage(result.error || 'Could not create battle', { variant: 'alert' });
		}
	});
	card.appendChild(createBtn);
	const codeNote = note('You\u2019ll get a code to share \u2014 or start straight away against bots.',
		'', { marginTop: '6px' });
	// (small print a short phone drops so ← Back stays in view)
	codeNote.classList.add('tx-hub-blurb');
	card.appendChild(codeNote);

	card.appendChild(orDivider());

	// ── Join with a code ─────────────────────────────────────────
	card.appendChild(sectionLabel('JOIN A FRIEND\u2019S BATTLE'));
	const joinRow = el('div', { display: 'flex', gap: '8px', alignItems: 'center' });
	const codeInput = el('input', { flex: '1', minWidth: '0' }, '', 'tx-field tx-code-input');
	codeInput.setAttribute('aria-label', 'Battle code');
	codeInput.autocomplete = 'off';
	codeInput.placeholder = 'ENTER CODE';
	codeInput.maxLength = 6;
	codeInput.value = options.prefillCode || '';
	const joinBtn = themedButton('Join');
	const doJoin = async () => {
		const code = codeInput.value.trim().toUpperCase();
		if (!code) {
			codeInput.focus();
			return;
		}
		joinBtn.disabled = true;
		const result = await joinBattle(code);
		joinBtn.disabled = false;
		if (result.success) {
			if (result.battle?.status === 'active') {
				// Mid-battle join (took over a bot) — straight to the arena.
				closeBattleDialog();
				adoptSeat(result.battle);
			} else {
				renderDialogContent(card, result.battle);
			}
		} else {
			showToastMessage(result.error || 'Could not join battle', { variant: 'alert' });
		}
	};
	joinBtn.addEventListener('click', doJoin);
	codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
	joinRow.appendChild(codeInput);
	joinRow.appendChild(joinBtn);
	card.appendChild(joinRow);

	const closeRow = el('div', {}, '', 'tx-actions');
	const closeBtn = themedButton(hasEnteredWorld() ? 'Close' : '← Back');
	closeBtn.addEventListener('click', () => {
		closeBattleDialog();
		returnToWelcomeIfHomeless();
	});
	closeRow.appendChild(closeBtn);
	card.appendChild(closeRow);

	if (options.prefillCode) codeInput.focus();
}

// ── Quick match: waiting for an opponent ────────────────────────────────────

let matchCountdownTimer = null;

function stopMatchCountdown() {
	if (matchCountdownTimer) {
		clearInterval(matchCountdownTimer);
		matchCountdownTimer = null;
	}
}

function renderMatchmaking(card, battle) {
	card.appendChild(sectionLabel('QUICK MATCH'));
	appendVikingBadge(card, battle);
	card.appendChild(el('div', {}, 'Looking for an opponent…', 'tx-searching'));
	const countdown = el('div', { textAlign: 'center', marginBottom: '6px' }, '', 'tx-text');
	card.appendChild(countdown);
	card.appendChild(note('🌊 Quick battle: the sea swallows the arena, round and round. Last king above water wins.',
		'sea', { textAlign: 'center', marginBottom: '16px' }));

	const deadline = Date.now() + (Number(battle.startsInMs) || 0);
	const tick = () => {
		const secs = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
		countdown.textContent = secs > 0
			? `A bot takes the other seat in ${secs}s if nobody turns up.`
			: 'Starting…';
	};
	tick();
	stopMatchCountdown();
	matchCountdownTimer = setInterval(tick, 500);

	const row = el('div', { justifyContent: 'space-between' }, '', 'tx-actions');
	const cancelBtn = themedButton('✕ Cancel', { danger: true });
	cancelBtn.addEventListener('click', async () => {
		await leaveBattle(battle.id);
		await fetchBattleState();
		closeBattleDialog();
		syncBattleUrl(null);
		returnToWelcomeIfHomeless();
	});
	const botNowBtn = themedButton('▶ Play a bot now', { primary: true });
	botNowBtn.addEventListener('click', async () => {
		botNowBtn.disabled = true;
		const result = await startBattle(battle.id);
		if (!result.success) {
			botNowBtn.disabled = false;
			showToastMessage(result.error || 'Could not start', { variant: 'alert' });
		}
	});
	row.appendChild(cancelBtn);
	row.appendChild(botNowBtn);
	card.appendChild(row);
}

function renderLobby(card, battle) {
	if (battle.isPublic) {
		renderMatchmaking(card, battle);
		return;
	}
	const realId = String(getPlayerId() || '');
	const isHost = String(battle.hostId) === realId;
	const humanSeats = battle.seats.length;
	const emptySeats = battle.seatCount - humanSeats;

	// Multi-battle players can hop back to the full list.
	if (myBattles.length > 1) {
		const backBtn = themedButton('← All battles', { small: true });
		backBtn.style.marginBottom = '10px';
		backBtn.addEventListener('click', () => renderDialogContent(card, null));
		card.appendChild(backBtn);
	}

	card.appendChild(sectionLabel(isHost
		? 'YOUR BATTLE LOBBY — SHARE THIS CODE'
		: 'BATTLE LOBBY'));

	const codeLine = el('div', {}, battle.code, 'tx-code');
	card.appendChild(codeLine);

	const copyRow = el('div', { display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '14px' });
	// On a portal, a link to tetches.com would send players off it
	// (against portal rules); share the code, which works from the
	// Battle button anywhere the game runs.
	const portal = isPortal();
	const copyBtn = themedButton(portal ? 'Copy battle code' : 'Copy invite link');
	copyBtn.addEventListener('click', () => {
		const link = portal ? battle.code : inviteLinkFor(battle.code);
		try {
			navigator.clipboard.writeText(link);
			showToastMessage(portal ? 'Battle code copied' : 'Invite link copied', { variant: 'success' });
		} catch (_e) {
			window.prompt(portal ? 'Copy this battle code:' : 'Copy this invite link:', link);
		}
	});
	copyRow.appendChild(copyBtn);
	card.appendChild(copyRow);

	// Seat roster — refreshed live by `battle_lobby_update` broadcasts.
	const seatList = el('div', {}, '', 'tx-seats');
	for (let i = 0; i < battle.seatCount; i++) {
		const seat = battle.seats[i];
		const line = el('div', {}, '', `tx-seat${seat ? ' is-taken' : ''}`);
		if (seat) {
			const you = String(seat.controlledBy) === realId ? ' — you' : '';
			const host = String(seat.controlledBy) === String(battle.hostId) ? ' (host)' : '';
			line.textContent = `${seat.name}${host}${you}`;
		} else {
			line.textContent = 'Open seat — a bot takes it if nobody joins';
		}
		seatList.appendChild(line);
	}
	card.appendChild(seatList);

	// Bot pacing chosen at creation — visible to everyone in the lobby.
	const diffChoice = BOT_DIFFICULTY_OPTIONS.find(o => o.value === battle.botDifficulty);
	if (diffChoice && emptySeats > 0) {
		card.appendChild(note(
			battle.botDifficulty === 'auto'
				? 'Bots pace themselves to the players\u2019 speed'
				: diffChoice.label, 'good', { marginBottom: '6px' }));
	}

	card.appendChild(note(
		battle.mode === 'classic'
			? 'Classic: fight until one king is left'
			: 'Quick: the sea swallows the arena, round and round. Last king above water wins',
		'sea', { marginBottom: '10px' }));
	appendVikingBadge(card, battle);

	const waitNote = el('div', {}, '', 'tx-text');
	if (!isHost) {
		waitNote.textContent = 'You\u2019re seated. Waiting for the host to press start\u2026';
	} else if (emptySeats > 0) {
		waitNote.textContent = `Waiting for friends? Share the code above. Or start now \u2014 ${emptySeats} empty seat${emptySeats === 1 ? '' : 's'} will be filled by bots.`;
	} else {
		waitNote.textContent = 'All seats taken \u2014 ready when you are!';
	}
	card.appendChild(waitNote);

	// Destructive action on the left, safe actions on the right. "Close"
	// just hides the dialog and KEEPS the lobby (reopen it with the
	// ⚔ Battle button); "Cancel battle" / "Leave" gives up the seat.
	const row = el('div', { justifyContent: 'space-between' }, '', 'tx-actions tx-lobby-actions');
	const leaveBtn = themedButton(isHost ? '✕ Cancel battle' : '✕ Leave', { danger: true });
	leaveBtn.title = isHost
		? 'Delete this lobby (the code stops working)'
		: 'Give up your seat in this lobby';
	leaveBtn.addEventListener('click', async () => {
		await leaveBattle(battle.id);
		await fetchBattleState();
		closeBattleDialog();
		syncBattleUrl(null);
		showToastMessage(isHost ? 'Battle cancelled' : 'Left the battle lobby', { duration: 3500 });
		returnToWelcomeIfHomeless();
	});
	row.appendChild(leaveBtn);

	const rightSide = el('div', { display: 'flex', gap: '8px' });
	const closeBtn = themedButton('Close');
	closeBtn.title = 'Hide this dialog — the lobby stays open (⚔ Battle button reopens it)';
	closeBtn.addEventListener('click', () => {
		closeBattleDialog();
		showToastMessage('Lobby still open — the ⚔ Battle button brings it back', { duration: 4000 });
	});
	rightSide.appendChild(closeBtn);

	if (isHost) {
		const startBtn = themedButton(
			emptySeats > 0 ? `▶ Start (${emptySeats} bot${emptySeats === 1 ? '' : 's'})` : '▶ Start battle',
			{ primary: true });
		startBtn.title = emptySeats > 0
			? `Begin now — bots take the ${emptySeats} open seat${emptySeats === 1 ? '' : 's'}`
			: 'Begin the battle';
		startBtn.addEventListener('click', async () => {
			startBtn.disabled = true;
			startBtn.textContent = 'Starting…';
			const result = await startBattle(battle.id);
			if (!result.success) {
				startBtn.disabled = false;
				startBtn.textContent = '▶ Start battle';
				showToastMessage(result.error || 'Could not start battle', { variant: 'alert' });
			} else {
				closeBattleDialog();
			}
		});
		rightSide.appendChild(startBtn);
	}
	row.appendChild(rightSide);
	card.appendChild(row);
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function refreshOpenLobby(battle) {
	const overlay = document.getElementById(DIALOG_ID);
	if (!overlay) return;
	const card = overlay.firstChild;
	if (!card) return;
	// Only live-refresh when the dialog is showing THIS battle's lobby —
	// a player browsing the hub (or another lobby) must not be yanked.
	const showing = card.dataset?.lobbyCode || null;
	if (showing && battle?.code && showing === String(battle.code).toUpperCase()) {
		renderDialogContent(card, battle);
	}
}

/**
 * Register socket listeners and handle `?battle=CODE` invite links.
 * Call once during game initialisation, after the network manager has
 * connected and `gameState` exists.
 *
 * @param {Object} gameState The live client game state object.
 */
export function initBattleMode(gameState) {
	gameStateRef = gameState;
	// A reconnect mid-battle keeps the seat as the local identity.
	setSeatHold(keepBattleSeatOnRejoin);

	// Bottom-left HUD strip button (static markup in index.html).
	const hudBtn = document.getElementById('battle-btn');
	if (hudBtn && !hudBtn.dataset.battleWired) {
		hudBtn.dataset.battleWired = '1';
		hudBtn.addEventListener('click', () => showBattleDialog());
	}

	// Register the socket-event listeners exactly once (initBattleMode
	// can legitimately run again, e.g. after a world re-join).
	//
	// NOTE these are plain forwarded socket events (`on`), NOT
	// `message:` subtypes — subscribing via `onMessage` left every
	// battle event unheard, which is why "Start battle" used to do
	// nothing for either player.
	if (battleModeWired) return;
	battleModeWired = true;

	onNetworkEvent('battle_lobby_update', (data) => {
		fetchBattleState().catch(() => { /* list refresh is best-effort */ });
		if (data?.battle) refreshOpenLobby(data.battle);
	});

	onNetworkEvent('battle_started', (data) => {
		const battle = data?.battle;
		if (!battle) return;
		fetchBattleState().catch(() => { /* list refresh is best-effort */ });
		// Busy fighting somewhere else? Don't yank the view — offer the
		// switch instead.
		const current = gameStateRef?.activeBattle;
		if (current && current.id !== battle.id) {
			showToastMessage(
				`⚔ Battle ${battle.code} started — the ⚔ Battle button switches to it`,
				{ duration: 7000 });
			return;
		}
		closeBattleDialog();
		adoptSeat(battle);
	});

	onNetworkEvent('battle_finished', (data) => {
		if (data?.battle) battleHasFinished(data.battle, data.results);
	});

	// Knocked out of a 3-4 seat battle that carries on: the results so
	// far, with the choice to keep watching or go.
	onNetworkEvent('battle_seat_out', (data) => {
		const battle = data?.battle;
		if (!battle || gameStateRef?.activeBattle?.id !== battle.id) return;
		const seat = mySeat(battle);
		try { playSound('kingFall'); } catch (_e) { /* sound is best-effort */ }
		// (the Next piece panel says so instead of "Playing tetris turn")
		if (gameStateRef) gameStateRef.battleWatching = battle.id;
		try { updateNextPieceHint(gameStateRef); } catch (_e) { /* HUD is best-effort */ }
		const { outcome } = showBattleResults({
			battle,
			results: data.results,
			mySeatId: seat?.seatId,
			mode: 'out',
			actions: [
				{ label: '👁 Keep watching', primary: true, onClick: () => closeBattleResults() },
				{
					label: hasEnteredWorld() ? '🏰 Back to my kingdom' : 'Leave battle',
					onClick: async () => {
						closeBattleResults();
						await leaveBattle(battle.id);
						goHomeAfterBattle(savedRealPlayerId || getPlayerId());
					},
				},
			],
		});
		if (vikingActive(gameStateRef)) paintingEvent('battle_end', { battle, results: data.results, mySeatId: seat?.seatId, outcome });
	});

	onNetworkEvent('battle_cancelled', (data) => {
		const battleId = data?.battleId || null;
		myBattles = myBattles.filter(b => b.id !== battleId);
		if (gameStateRef) gameStateRef.myBattles = myBattles;
		closeBattleDialog();
		// Only the battle being WATCHED needs its seat released; a
		// cancelled lobby was never adopted in the first place.
		if (battleId && gameStateRef?.activeBattle?.id === battleId) {
			releaseSeat({ silent: true });
		}
		showToastMessage(
			data?.reason === 'timeout' ? 'Battle lobby expired' : 'Battle cancelled',
			{ duration: 4000 }
		);
		// Homeless players with nothing else on the go get the welcome
		// screen back — but never interrupt a different battle view.
		if (!gameStateRef?.activeBattle) returnToWelcomeIfHomeless();
	});

	// Server sockets forget their focus on reconnect — re-assert the
	// current view so gameplay events keep acting as the right seat,
	// then find out what became of the battle while we were away.
	onNetworkEvent('connect', () => {
		const battleId = gameStateRef?.activeBattle?.id;
		if (!battleId) return;
		emitFocus(battleId);
		resumeBattleAfterReconnect(battleId).catch(() => { /* next reconnect retries */ });
	});

	// World-wide announcements (battle winners etc.).
	onNetworkEvent('server_toast', (data) => {
		// The battle's own players already have its results card.
		if (data?.battleId && finishedBattleIds.has(data.battleId)) return;
		if (data?.message) {
			showToastMessage(data.message, {
				variant: data.tone === 'success' ? 'success' : 'info',
				duration: 6000,
			});
		}
	});

	// Reconnect mid-battle: waits for the socket (page init calls us
	// before the preview connection settles), then decides what to do
	// with an existing seat. CRUCIALLY, if the welcome screen is up we
	// do NOT yank the player into the battle — a second tab (or a
	// deliberate fresh visit) keeps the arrival screen, and the battle
	// button becomes "RETURN TO BATTLE" instead. Auto-adoption only
	// happens on modal-less loads (mode-switch resume, crash recovery
	// mid-session).
	const reAdoptWhenConnected = (attempt = 0) => {
		if (!getSocket()) {
			if (attempt < 10) setTimeout(() => reAdoptWhenConnected(attempt + 1), 1000);
			return;
		}
		fetchBattleState().then((state) => {
			const battles = state?.battles || (state?.battle ? [state.battle] : []);
			if (battles.length === 0 || gameStateRef?.activeBattle) return;
			// Prefer resuming an active fight over an idle lobby.
			const battle = battles.find(b => b.status === 'active') || battles[0];
			// Give the welcome modal a beat to render before deciding —
			// it appears ~500 ms after WebGL spins up.
			setTimeout(() => {
				if (gameStateRef?.activeBattle) return;
				if (document.getElementById('tutorial-message')) {
					offerBattleResumeOnWelcome(battle);
					return;
				}
				if (battle.status === 'active') adoptSeat(battle);
				else showBattleDialog();
			}, 1500);
		}).catch(() => { /* best-effort */ });
	};
	reAdoptWhenConnected();

	// Invite links (/?battle=CODE): when the welcome modal is up, its
	// "JOIN BATTLE" button owns the flow — don't auto-join underneath
	// it. This path only fires for modal-less loads (e.g. a mode-switch
	// resume with the code still in the URL).
	const code = inviteCodeFromUrl();
	if (code) {
		setTimeout(() => {
			if (document.getElementById('tutorial-message')) return;
			if (gameStateRef?.activeBattle) return;
			enterBattleFlow(code).catch(() => { /* toasts already shown */ });
		}, 2000);
	}
}

/**
 * Relabel the welcome modal's battle button as a "return to battle"
 * action when the player already holds a seat (second tab, refresh
 * mid-lobby, crash during a battle).
 */
function offerBattleResumeOnWelcome(battle) {
	const btn = document.getElementById('welcome-battle-btn');
	if (!btn) return;
	btn.textContent = battle.status === 'active'
		? `⚔ RETURN TO BATTLE ${battle.code}`
		: `⚔ REJOIN LOBBY ${battle.code}`;
	btn.classList.add('primary');
}

/**
 * Welcome-modal BATTLE button entry: open the dialog without joining
 * the shared world. With an invite code the seat is claimed first so
 * the lobby renders straight away; joining an ACTIVE battle takes over
 * a bot seat and drops the player straight into the arena. A player
 * who already holds seats resumes them — and may join further battles
 * on top (the view switcher hops between them).
 * @param {string|null} inviteCode Optional code from a /?battle= link.
 */
export async function enterBattleFlow(inviteCode = null) {
	// The page-load preview normally connected already; make sure of it
	// (battle commands need a live socket, there is no join_game here).
	try { await ensureConnected(); }
	catch (err) { console.warn('Battle flow: connection attempt failed:', err); }

	const codeUp = inviteCode ? String(inviteCode).toUpperCase() : null;
	const state = await fetchBattleState();
	const battles = state?.battles || (state?.battle ? [state.battle] : []);

	if (codeUp) {
		// Already seated in the invited battle? Resume it.
		const mine = battles.find(b => String(b.code).toUpperCase() === codeUp);
		if (mine) {
			if (mine.status === 'active') {
				adoptSeat(mine);
				return true;
			}
			await showBattleDialog();   // back to the lobby
			return true;
		}
		// A fresh battle — join it outright. Other seats are untouched;
		// the switcher hops between all of them.
		const result = await joinBattle(codeUp);
		if (result.success) {
			await fetchBattleState();
			if (result.battle?.status === 'active') {
				adoptSeat(result.battle);
				return true;
			}
			await showBattleDialog();
			return true;
		}
		showToastMessage(result.error || 'Could not join that battle', { variant: 'alert' });
		await showBattleDialog({ prefillCode: codeUp });
		return false;
	}

	// No code. One active battle and nothing focused → resume it
	// directly; anything else goes through the hub.
	if (battles.length === 1 && battles[0].status === 'active' && !gameStateRef?.activeBattle) {
		adoptSeat(battles[0]);
		return true;
	}
	await showBattleDialog();
	return true;
}
