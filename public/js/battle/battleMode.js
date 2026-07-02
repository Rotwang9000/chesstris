/**
 * Battle mode client — create/join dialog, invite links, seat adoption.
 *
 * Battles are private 2-4 player arenas parked far from the organic
 * world. The server gives each participant a dedicated SEAT player id;
 * while a battle is active this module swaps `gameState.localPlayerId`
 * to the seat so rendering, input and the camera all act as the seat.
 * The player's real kingdom carries on untouched back home.
 */

import { getSocket, getPlayerId, on as onNetworkEvent, ensureConnected } from '../utils/networkManager.js';
import { showToastMessage } from '../showToastMessage.js';

const DIALOG_ID = 'tetches-battle-dialog';
const CAMERA_FLY_DELAY_MS = 1200;  // let the battle board arrive first
const CAMERA_FLY_RETRY_MS = 900;   // board updates land asynchronously
const CAMERA_FLY_MAX_TRIES = 6;

let gameStateRef = null;
let savedRealPlayerId = null;
let battleModeWired = false;

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

/** Adopt the battle seat as the local identity. */
function adoptSeat(battle) {
	if (!gameStateRef) return;
	const seat = mySeat(battle);
	if (!seat) return;
	if (!savedRealPlayerId) {
		savedRealPlayerId = gameStateRef.localPlayerId || getPlayerId() || null;
	}
	gameStateRef.activeBattle = { id: battle.id, code: battle.code, centre: battle.centre };
	gameStateRef.localPlayerId = seat.seatId;
	gameStateRef.myPlayerId = seat.seatId;
	gameStateRef.currentPlayer = seat.seatId;
	// A seat has placed nothing yet — its first tetromino anchors on the
	// seat's fresh home zone.
	gameStateRef._hasPlacedTetromino = false;
	gameStateRef.turnPhase = 'tetris';
	// Battle-only players never ran the world-entry start-up — spin the
	// gameplay systems up now (no world join; the seat IS the identity).
	try { window.gameCore?.startBattleSession?.(); }
	catch (err) { console.warn('startBattleSession failed:', err); }
	showToastMessage('⚔ Battle started — fight!', { variant: 'success', duration: 5000 });
	flyToSeat(seat.seatId);
}

/** Return to the player's real kingdom identity. */
function releaseSeat({ silent = false } = {}) {
	if (!gameStateRef) return;
	gameStateRef.activeBattle = null;
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

export function createBattle(seatCount) {
	return emitBattle('battle_create', { seatCount });
}

export function joinBattle(code) {
	return emitBattle('battle_join', { code });
}

export function startBattle() {
	return emitBattle('battle_start');
}

export function leaveBattle() {
	return emitBattle('battle_leave');
}

export function fetchBattleState() {
	return emitBattle('battle_state');
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
	const existing = document.getElementById(DIALOG_ID);
	if (existing) {
		try { document.body.removeChild(existing); } catch (_e) { /* gone */ }
	}
}

/**
 * Show the battle dialog. Renders the lobby if the player is already in
 * one, otherwise the create/join menu.
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
	renderDialogContent(card, state?.battle || null, options);
}

function renderDialogContent(card, battle, options = {}) {
	card.innerHTML = '';

	const heading = el('h3', { margin: '0 0 8px 0', fontSize: '20px' }, '⚔ Battle Arena');
	card.appendChild(heading);

	if (battle && battle.status === 'lobby') {
		renderLobby(card, battle);
		return;
	}
	if (battle && battle.status === 'active') {
		const note = el('p', { fontSize: '13px', color: '#ccc' },
			'You are in an active battle. To the death!');
		card.appendChild(note);
		const row = el('div', { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
		const forfeitBtn = themedButton('Forfeit');
		forfeitBtn.addEventListener('click', async () => {
			await leaveBattle();
			closeBattleDialog();
		});
		const closeBtn = themedButton('Close', { primary: true });
		closeBtn.addEventListener('click', closeBattleDialog);
		row.appendChild(forfeitBtn);
		row.appendChild(closeBtn);
		card.appendChild(row);
		return;
	}

	renderCreateJoin(card, options);
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
	const createRow = el('div', { display: 'flex', gap: '8px', alignItems: 'center' });
	const seatSelect = el('select', {
		padding: '8px', fontSize: '14px', backgroundColor: '#111', color: '#ffcc00',
		border: '1px solid #ffcc00', borderRadius: '4px', fontFamily: 'inherit',
	});
	for (const n of [2, 3, 4]) {
		const opt = document.createElement('option');
		opt.value = String(n);
		opt.textContent = n === 2 ? '1 v 1' : `${n} players`;
		seatSelect.appendChild(opt);
	}
	const createBtn = themedButton('Create battle', { primary: true });
	createBtn.style.flex = '1';
	createBtn.addEventListener('click', async () => {
		createBtn.disabled = true;
		const result = await createBattle(Number(seatSelect.value));
		createBtn.disabled = false;
		if (result.success) {
			renderDialogContent(card, result.battle);
		} else {
			showToastMessage(result.error || 'Could not create battle', { variant: 'alert' });
		}
	});
	createRow.appendChild(seatSelect);
	createRow.appendChild(createBtn);
	card.appendChild(createRow);
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
			renderDialogContent(card, result.battle);
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
		await leaveBattle();
		closeBattleDialog();
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
			const result = await startBattle();
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
	if (card) renderDialogContent(card, battle);
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
		if (data?.battle) refreshOpenLobby(data.battle);
	});

	onNetworkEvent('battle_started', (data) => {
		closeBattleDialog();
		if (data?.battle) adoptSeat(data.battle);
	});

	onNetworkEvent('battle_finished', (data) => {
		const battle = data?.battle;
		const seat = battle ? mySeat(battle) : null;
		const won = !!(seat && battle.winnerSeatId === seat.seatId);
		showToastMessage(
			won ? '👑 Victory! You won the battle!' : '⚔ Battle over — you were defeated.',
			{ variant: won ? 'success' : 'alert', duration: 8000 }
		);
		// The server clears the arena shortly after; head home now —
		// or, for battle-only players, back to the welcome overview.
		releaseSeat();
		setTimeout(returnToWelcomeIfHomeless, 2500);
	});

	onNetworkEvent('battle_cancelled', (data) => {
		closeBattleDialog();
		releaseSeat({ silent: true });
		showToastMessage(
			data?.reason === 'timeout' ? 'Battle lobby expired' : 'Battle cancelled',
			{ duration: 4000 }
		);
		returnToWelcomeIfHomeless();
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

	// Reconnect mid-battle: re-adopt the seat. Waits for the socket
	// (page init calls us before the preview connection settles).
	const reAdoptWhenConnected = (attempt = 0) => {
		if (!getSocket()) {
			if (attempt < 10) setTimeout(() => reAdoptWhenConnected(attempt + 1), 1000);
			return;
		}
		fetchBattleState().then((state) => {
			if (state?.battle && state.battle.status === 'active') {
				adoptSeat(state.battle);
			} else if (state?.battle && state.battle.status === 'lobby') {
				showBattleDialog();
			}
		}).catch(() => { /* best-effort */ });
	};
	reAdoptWhenConnected();

	// Invite links (/?battle=CODE): when the welcome modal is up, its
	// "JOIN BATTLE" button owns the flow — don't auto-join underneath
	// it. This path only fires for modal-less loads (e.g. a mode-switch
	// resume with the code still in the URL).
	try {
		const params = new URLSearchParams(window.location.search);
		const code = params.get('battle');
		if (code && /^[A-Za-z0-9]{4,8}$/.test(code)) {
			setTimeout(() => {
				if (document.getElementById('tutorial-message')) return;
				if (gameStateRef?.activeBattle) return;
				joinBattle(code).then((result) => {
					if (result.success) {
						showBattleDialog();
					} else {
						showBattleDialog({ prefillCode: code.toUpperCase() });
						showToastMessage(result.error || 'Could not join battle', { variant: 'alert' });
					}
				});
			}, 2000);
		}
	} catch (_e) { /* no URL params */ }
}

/**
 * Welcome-modal BATTLE button entry: open the dialog without joining
 * the shared world. With an invite code the seat is claimed first so
 * the lobby renders straight away.
 * @param {string|null} inviteCode Optional code from a /?battle= link.
 */
export async function enterBattleFlow(inviteCode = null) {
	// The page-load preview normally connected already; make sure of it
	// (battle commands need a live socket, there is no join_game here).
	try { await ensureConnected(); }
	catch (err) { console.warn('Battle flow: connection attempt failed:', err); }

	if (inviteCode) {
		const result = await joinBattle(inviteCode);
		if (result.success) {
			await showBattleDialog();
			return true;
		}
		showToastMessage(result.error || 'Could not join that battle', { variant: 'alert' });
		await showBattleDialog({ prefillCode: String(inviteCode).toUpperCase() });
		return false;
	}
	await showBattleDialog();
	return true;
}
