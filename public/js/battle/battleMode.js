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

const DIALOG_ID = 'tetches-battle-dialog';
const CAMERA_FLY_DELAY_MS = 1200;  // let the battle board arrive first
const CAMERA_FLY_RETRY_MS = 900;   // board updates land asynchronously
const CAMERA_FLY_MAX_TRIES = 6;
const BATTLE_CODE_PATTERN = /^[A-Za-z0-9]{4,8}$/;

/** Bot difficulty choices offered at battle creation. */
const BOT_DIFFICULTY_OPTIONS = [
	{ value: 'auto', label: 'Bots: Auto pace' },
	{ value: 'easy', label: 'Bots: Easy' },
	{ value: 'medium', label: 'Bots: Medium' },
	{ value: 'hard', label: 'Bots: Hard' },
];

let gameStateRef = null;
let savedRealPlayerId = null;
let battleModeWired = false;
/** Latest `publicState` list of every battle this player holds a seat in. */
let myBattles = [];

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
 * Keep the address bar honest: while in a battle (lobby or active) the
 * URL carries `?battle=CODE` — shareable directly — and drops the
 * `gameId=global_game` param. Leaving a battle restores the world id
 * for players who have one.
 */
function syncBattleUrl(code) {
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
function adoptSeat(battle, { announce = true } = {}) {
	if (!gameStateRef) return;
	const seat = mySeat(battle);
	if (!seat) return;
	// Idempotent: the push event and the poll/ack fallbacks can both
	// land — the second call must not re-fly the camera.
	if (gameStateRef.activeBattle?.id === battle.id
		&& gameStateRef.localPlayerId === seat.seatId) return;
	if (!savedRealPlayerId) {
		savedRealPlayerId = gameStateRef.localPlayerId || getPlayerId() || null;
	}
	gameStateRef.activeBattle = {
		id: battle.id,
		code: battle.code,
		centre: battle.centre,
		playRadius: battle.playRadius,
	};
	gameStateRef.localPlayerId = seat.seatId;
	gameStateRef.myPlayerId = seat.seatId;
	gameStateRef.currentPlayer = seat.seatId;
	// A seat has placed nothing yet — its first tetromino anchors on the
	// seat's fresh home zone.
	gameStateRef._hasPlacedTetromino = false;
	gameStateRef.turnPhase = 'tetris';
	emitFocus(battle.id);
	// Battle-only players never ran the world-entry start-up — spin the
	// gameplay systems up now (no world join; the seat IS the identity).
	// World players need it too: it clears modals and flips the session
	// into "playing" for the arena.
	try { window.gameCore?.startBattleSession?.(); }
	catch (err) { console.warn('startBattleSession failed:', err); }
	syncBattleUrl(battle.code);
	if (announce) {
		showToastMessage(`⚔ Battle ${battle.code} — fight!`, { variant: 'success', duration: 5000 });
	}
	flyToSeat(seat.seatId);
}

/** Return to the player's real kingdom identity (the world view). */
function releaseSeat({ silent = false } = {}) {
	if (!gameStateRef) return;
	gameStateRef.activeBattle = null;
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

export function createBattle(seatCount, botDifficulty = 'auto') {
	return emitBattle('battle_create', { seatCount, botDifficulty });
}

export function joinBattle(code) {
	return emitBattle('battle_join', { code });
}

export function startBattle(battleId = null) {
	return emitBattle('battle_start', battleId ? { battleId } : {});
}

export function leaveBattle(battleId = null) {
	return emitBattle('battle_leave', battleId ? { battleId } : {});
}

export async function fetchBattleState() {
	const state = await emitBattle('battle_state');
	if (state && Array.isArray(state.battles)) {
		myBattles = state.battles;
		if (gameStateRef) gameStateRef.myBattles = myBattles;
	}
	return state;
}

// ── Dialog UI ───────────────────────────────────────────────────────────────

function el(tag, styles = {}, text = '') {
	const node = document.createElement(tag);
	Object.assign(node.style, styles);
	if (text) node.textContent = text;
	return node;
}

function themedButton(label, { primary = false, danger = false } = {}) {
	const btn = el('button', {
		padding: '8px 16px',
		backgroundColor: primary ? '#ffcc00' : '#333',
		color: primary ? '#000' : (danger ? '#ff8866' : '#ffcc00'),
		border: `1px solid ${danger ? '#aa4433' : '#ffcc00'}`,
		borderRadius: '4px',
		cursor: 'pointer',
		fontFamily: 'inherit',
		fontSize: '14px',
		fontWeight: primary ? 'bold' : 'normal',
	}, label);
	return btn;
}

function inviteLinkFor(code) {
	return `${window.location.origin}/?battle=${encodeURIComponent(code)}`;
}

function closeBattleDialog() {
	stopLobbyPoll();
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
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		zIndex: '12000',
		display: 'flex', justifyContent: 'center', alignItems: 'center',
		fontFamily: 'serif',
	});
	overlay.id = DIALOG_ID;

	const card = el('div', {
		backgroundColor: '#222',
		border: '2px solid #ffcc00',
		borderRadius: '8px',
		padding: '24px',
		minWidth: '320px',
		maxWidth: '92%',
		maxHeight: '86vh',
		overflowY: 'auto',
		color: '#ffcc00',
		boxShadow: '0 0 30px rgba(255, 204, 0, 0.3)',
	});
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
	card.innerHTML = '';
	delete card.dataset.lobbyCode;

	const heading = el('h3', { margin: '0 0 8px 0', fontSize: '20px' }, '⚔ Battle Arena');
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
		const row = el('div', {
			display: 'flex', alignItems: 'center', gap: '8px',
			padding: '6px 8px', marginBottom: '6px',
			backgroundColor: viewing ? 'rgba(255,204,0,0.12)' : '#1a1a1a',
			border: `1px solid ${viewing ? '#ffcc00' : '#443'}`,
			borderRadius: '5px', fontSize: '13px',
		});
		row.appendChild(el('span', { flex: '1', color: viewing ? '#ffcc00' : '#ccc' }, labelText));
		if (viewing) {
			row.appendChild(el('span', { fontSize: '11px', color: '#ffcc00', fontWeight: 'bold' }, '● VIEWING'));
		} else if (onSwitch) {
			const btn = themedButton('Switch');
			btn.style.padding = '4px 10px';
			btn.style.fontSize = '12px';
			btn.addEventListener('click', onSwitch);
			row.appendChild(btn);
		}
		if (onLeave) {
			const btn = themedButton('✕', { danger: true });
			btn.style.padding = '4px 8px';
			btn.style.fontSize = '12px';
			btn.title = leaveTitle;
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
		const label = `⚔ ${battle.code} — ${statusText}`;

		if (battle.status === 'lobby') {
			const row = el('div', {
				display: 'flex', alignItems: 'center', gap: '8px',
				padding: '6px 8px', marginBottom: '6px',
				backgroundColor: '#1a1a1a', border: '1px solid #443',
				borderRadius: '5px', fontSize: '13px',
			});
			row.appendChild(el('span', { flex: '1', color: '#ccc' }, label));
			const openBtn = themedButton('Open lobby');
			openBtn.style.padding = '4px 10px';
			openBtn.style.fontSize = '12px';
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

function sectionLabel(text) {
	return el('div', {
		fontSize: '11px', letterSpacing: '2px', color: '#ffcc00',
		opacity: '0.85', margin: '0 0 8px 0', fontWeight: 'bold',
	}, text);
}

function orDivider() {
	const wrap = el('div', {
		display: 'flex', alignItems: 'center', gap: '10px',
		margin: '16px 0', color: '#886', fontSize: '11px',
	});
	const line = () => el('div', { flex: '1', borderBottom: '1px solid rgba(255,204,0,0.25)' });
	wrap.appendChild(line());
	wrap.appendChild(el('span', {}, 'OR'));
	wrap.appendChild(line());
	return wrap;
}

function renderCreateJoin(card, options = {}) {
	const help = el('p', { margin: '0 0 16px 0', fontSize: '12px', color: '#ccc', lineHeight: '1.5' },
		'A private arena for 2-4 players, far away from the shared world. Bots fill any seat a friend doesn\u2019t take.');
	card.appendChild(help);

	// ── Host a battle ────────────────────────────────────────────
	card.appendChild(sectionLabel('START A NEW BATTLE'));
	const selectStyles = {
		padding: '8px', fontSize: '14px', backgroundColor: '#111', color: '#ffcc00',
		border: '1px solid #ffcc00', borderRadius: '4px', fontFamily: 'inherit',
		flex: '1', minWidth: '0',
	};
	const createRow = el('div', { display: 'flex', gap: '8px', alignItems: 'center' });
	const seatSelect = el('select', selectStyles);
	for (const n of [2, 3, 4]) {
		const opt = document.createElement('option');
		opt.value = String(n);
		opt.textContent = n === 2 ? '1 v 1' : `${n} players`;
		seatSelect.appendChild(opt);
	}
	// Bot difficulty: Auto (bots mirror the humans' tempo) or a fixed
	// level for players who want a predictable challenge.
	const diffSelect = el('select', selectStyles);
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

	const createBtn = themedButton('Create battle', { primary: true });
	createBtn.style.width = '100%';
	createBtn.style.marginTop = '8px';
	createBtn.addEventListener('click', async () => {
		createBtn.disabled = true;
		const result = await createBattle(Number(seatSelect.value), diffSelect.value);
		createBtn.disabled = false;
		if (result.success) {
			await fetchBattleState();
			renderDialogContent(card, result.battle);
		} else {
			showToastMessage(result.error || 'Could not create battle', { variant: 'alert' });
		}
	});
	card.appendChild(createBtn);
	card.appendChild(el('div', { fontSize: '11px', color: '#998', marginTop: '6px' },
		'You\u2019ll get a code to share \u2014 or start straight away against bots.'));

	card.appendChild(orDivider());

	// ── Join with a code ─────────────────────────────────────────
	card.appendChild(sectionLabel('JOIN A FRIEND\u2019S BATTLE'));
	const joinRow = el('div', { display: 'flex', gap: '8px', alignItems: 'center' });
	const codeInput = el('input', {
		flex: '1', padding: '8px', fontSize: '16px', backgroundColor: '#111',
		color: '#ffcc00', border: '1px solid #ffcc00', borderRadius: '4px',
		fontFamily: 'inherit', textTransform: 'uppercase', boxSizing: 'border-box',
		minWidth: '0', letterSpacing: '3px',
	});
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

	const closeRow = el('div', { display: 'flex', justifyContent: 'flex-end', marginTop: '18px' });
	const closeBtn = themedButton(hasEnteredWorld() ? 'Close' : '← Back');
	closeBtn.addEventListener('click', () => {
		closeBattleDialog();
		returnToWelcomeIfHomeless();
	});
	closeRow.appendChild(closeBtn);
	card.appendChild(closeRow);

	if (options.prefillCode) codeInput.focus();
}

function renderLobby(card, battle) {
	const realId = String(getPlayerId() || '');
	const isHost = String(battle.hostId) === realId;
	const humanSeats = battle.seats.length;
	const emptySeats = battle.seatCount - humanSeats;

	// Multi-battle players can hop back to the full list.
	if (myBattles.length > 1) {
		const backBtn = themedButton('← All battles');
		backBtn.style.padding = '4px 10px';
		backBtn.style.fontSize = '12px';
		backBtn.style.marginBottom = '10px';
		backBtn.addEventListener('click', () => renderDialogContent(card, null));
		card.appendChild(backBtn);
	}

	card.appendChild(sectionLabel(isHost
		? 'YOUR BATTLE LOBBY — SHARE THIS CODE'
		: 'BATTLE LOBBY'));

	const codeLine = el('div', {
		fontSize: '30px', letterSpacing: '8px', textAlign: 'center',
		padding: '12px', backgroundColor: '#111', borderRadius: '6px',
		border: '1px dashed #ffcc00', marginBottom: '8px', userSelect: 'all',
		fontWeight: 'bold',
	}, battle.code);
	card.appendChild(codeLine);

	const copyRow = el('div', { display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '14px' });
	const copyBtn = themedButton('📋 Copy invite link');
	copyBtn.addEventListener('click', () => {
		const link = inviteLinkFor(battle.code);
		try {
			navigator.clipboard.writeText(link);
			showToastMessage('Invite link copied', { variant: 'success' });
		} catch (_e) {
			window.prompt('Copy this invite link:', link);
		}
	});
	copyRow.appendChild(copyBtn);
	card.appendChild(copyRow);

	// Seat roster — refreshed live by `battle_lobby_update` broadcasts.
	const seatList = el('div', { marginBottom: '12px', fontSize: '14px' });
	for (let i = 0; i < battle.seatCount; i++) {
		const seat = battle.seats[i];
		const line = el('div', { padding: '4px 0', color: seat ? '#ffcc00' : '#777' });
		if (seat) {
			const you = String(seat.controlledBy) === realId ? ' — you' : '';
			const host = String(seat.controlledBy) === String(battle.hostId) ? ' (host)' : '';
			line.textContent = `✓ ${seat.name}${host}${you}`;
		} else {
			line.textContent = `○ Open seat — a bot takes it if nobody joins`;
		}
		seatList.appendChild(line);
	}
	card.appendChild(seatList);

	// Bot pacing chosen at creation — visible to everyone in the lobby.
	const diffChoice = BOT_DIFFICULTY_OPTIONS.find(o => o.value === battle.botDifficulty);
	if (diffChoice && emptySeats > 0) {
		card.appendChild(el('div', { fontSize: '12px', color: '#8b8', marginBottom: '8px' },
			battle.botDifficulty === 'auto'
				? '🤖 Bots pace themselves to the players\u2019 speed'
				: `🤖 ${diffChoice.label}`));
	}

	const note = el('div', { fontSize: '12px', color: '#ccc', marginBottom: '12px', lineHeight: '1.5' });
	if (!isHost) {
		note.textContent = 'You\u2019re seated. Waiting for the host to press start\u2026';
	} else if (emptySeats > 0) {
		note.textContent = `Waiting for friends? Share the code above. Or start now \u2014 ${emptySeats} empty seat${emptySeats === 1 ? '' : 's'} will be filled by bots.`;
	} else {
		note.textContent = 'All seats taken \u2014 ready when you are!';
	}
	card.appendChild(note);

	// Destructive action on the left, safe actions on the right. "Close"
	// just hides the dialog and KEEPS the lobby (reopen it with the
	// ⚔ Battle button); "Cancel battle" / "Leave" gives up the seat.
	const row = el('div', { display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' });
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
		const battle = data?.battle;
		if (!battle) return;
		myBattles = myBattles.filter(b => b.id !== battle.id);
		if (gameStateRef) gameStateRef.myBattles = myBattles;
		const seat = mySeat(battle);
		const won = !!(seat && battle.winnerSeatId === seat.seatId);
		showToastMessage(
			won
				? `👑 Victory! You won battle ${battle.code}!`
				: `⚔ Battle ${battle.code} over — you were defeated.`,
			{ variant: won ? 'success' : 'alert', duration: 8000 }
		);
		// Only the battle being WATCHED sends the camera home — a
		// background battle ending must not interrupt the current fight.
		if (gameStateRef?.activeBattle?.id === battle.id) {
			releaseSeat();
			setTimeout(returnToWelcomeIfHomeless, 2500);
		}
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
	// current view so gameplay events keep acting as the right seat.
	onNetworkEvent('connect', () => {
		if (gameStateRef?.activeBattle?.id) emitFocus(gameStateRef.activeBattle.id);
	});

	// World-wide announcements (battle winners etc.).
	onNetworkEvent('server_toast', (data) => {
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
