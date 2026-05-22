/**
 * Activity-log panel — a poor man's replay.
 *
 * The server streams an `activity_event` for every "interesting" thing
 * that happens in the world (placements, captures, decay, detonations
 * etc.). This module keeps a rolling buffer of the last ~200 events,
 * renders them into a collapsible side panel, and lets the user click
 * an event to fly the camera to its location.
 *
 * Plumbed in from `networkEvents.js` (subscribe + fetch initial
 * snapshot on connect) and exposed via `gameCore.openActivityLog()`
 * for the toolbar.
 */

import { showToastMessage } from './showToastMessage.js';

const MAX_EVENTS = 200;
const eventBuffer = [];
let listElement = null;
let bodyElement = null;
let badgeElement = null;
let panelElement = null;
let toggleButton = null;
let filterToggleEl = null;
let lastSeenEventId = 0;
let isOpen = false;
// `false` = show every event, `true` = only events involving the local
// player. The user asked for "a filter so we can select just what
// happened to our own player".
let filterMineOnly = false;
const FILTER_PREF_KEY = 'tetches.activityLog.mineOnly';
try {
	filterMineOnly = window.localStorage?.getItem(FILTER_PREF_KEY) === '1';
} catch (_) { /* localStorage unavailable — fine */ }

/**
 * The canonical source of the local player's id lives on
 * `window.gameState.localPlayerId` (set in `enhanced-gameCore.js`).
 * This module deliberately stays out of gameState lifecycle so it
 * keeps working in headless / pre-join states; we just look up the
 * id at filter-time.
 */
function getLocalPlayerId() {
	const gs = typeof window !== 'undefined' ? window.gameState : null;
	if (!gs) return null;
	return gs.localPlayerId || gs.myPlayerId || null;
}

/**
 * `true` when the event mentions the local player in any role.
 * Captures the obvious `playerId` plus the cross-player flavours
 * (`territory_captured`'s from/to, `chess_piece_captured`'s captor).
 */
function isLocalPlayerEvent(ev) {
	const localId = getLocalPlayerId();
	if (!localId) return false;
	const me = String(localId);
	const p = ev.payload || {};
	if (p.playerId != null && String(p.playerId) === me) return true;
	if (p.fromPlayerId != null && String(p.fromPlayerId) === me) return true;
	if (p.toPlayerId != null && String(p.toPlayerId) === me) return true;
	if (p.capturedBy && p.capturedBy.playerId != null
		&& String(p.capturedBy.playerId) === me) return true;
	return false;
}

function passesFilter(ev) {
	if (!filterMineOnly) return true;
	return isLocalPlayerEvent(ev);
}

function fmtTimeAgo(t) {
	const diffMs = Date.now() - t;
	if (diffMs < 0) return 'just now';
	if (diffMs < 5_000) return 'just now';
	if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
	if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60000)}m ago`;
	if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
	return new Date(t).toLocaleString();
}

function pieceIcon(pieceType) {
	switch (String(pieceType || '').toLowerCase()) {
		case 'king': return '\u265A';
		case 'queen': return '\u265B';
		case 'rook': return '\u265C';
		case 'bishop': return '\u265D';
		case 'knight': return '\u265E';
		case 'pawn': return '\u265F';
		default: return '';
	}
}

function describeEvent(ev) {
	const who = ev.payload && ev.payload.playerName ? ev.payload.playerName : 'Someone';
	switch (ev.type) {
		case 'tetromino_placed': {
			const at = ev.payload && Number.isFinite(ev.payload.x) ? `(${ev.payload.x}, ${ev.payload.z})` : '';
			return {
				icon: '\u25A0',
				color: '#9bd',
				text: `${who} placed a ${ev.payload.pieceType || ''} ${at}`,
				target: ev.payload ? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'tetromino_dissolved': {
			const at = ev.payload && Number.isFinite(ev.payload.x) ? `(${ev.payload.x}, ${ev.payload.z})` : '';
			const dissolveReasonLabels = {
				no_path_to_king: 'no path to king',
				no_connection: 'no connection',
				not_adjacent: 'not touching your territory',
				occupied: 'space already occupied',
				invalid_placement: 'invalid placement',
			};
			const rawReason = ev.payload && ev.payload.reason;
			const reason = rawReason
				? (dissolveReasonLabels[rawReason] || rawReason.replace(/_/g, ' '))
				: 'no connection';
			return {
				icon: '\u26A1',
				color: '#f88',
				text: `${who}'s ${ev.payload.pieceType || 'piece'} dissolved ${at} — ${reason}`,
				target: ev.payload ? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'chess_move': {
			const icon = pieceIcon(ev.payload.pieceType) || '\u265F';
			const from = ev.payload.from || {};
			const to = ev.payload.to || {};
			const captured = ev.payload.captured
				? ` — captured ${ev.payload.captured.pieceType}`
				: '';
			return {
				icon,
				color: '#cf9',
				text: `${who} moved ${ev.payload.pieceType} ${formatPos(from)} \u2192 ${formatPos(to)}${captured}`,
				target: { x: to.x, z: to.z },
			};
		}
		case 'chess_move_rejected': {
			// The user explicitly asked for the WHY of a rejected move
			// to land in Recent Activity rather than only as a toast.
			const icon = pieceIcon(ev.payload.pieceType) || '\u26A0';
			const from = ev.payload.from || {};
			const to = ev.payload.to || {};
			const reasonLabels = {
				destination_missing: 'square no longer exists',
				same_square: 'tried to land on its own square',
				friendly_blocker: 'square has a friendly piece',
				path_blocked: 'path blocked by a piece',
				path_off_board: 'path crosses empty space',
				bad_geometry: 'piece cannot reach there',
				invalid_geometry: 'piece cannot reach there',
				piece_gone: 'piece was already gone',
				not_your_piece: 'piece belongs to someone else',
				desync_repaired: 'board was out of sync — refreshed',
			};
			const reasonText = reasonLabels[ev.payload.reason]
				|| (ev.payload.reason ? ev.payload.reason.replace(/_/g, ' ') : 'unknown');
			const pieceName = ev.payload.pieceType || 'piece';
			return {
				icon,
				color: '#fa6',
				text: `${who}'s ${pieceName} ${formatPos(from)} \u2192 ${formatPos(to)} rejected — ${reasonText}`,
				target: Number.isFinite(to.x) && Number.isFinite(to.z) ? { x: to.x, z: to.z } : null,
			};
		}
		case 'rows_cleared': {
			const rows = (ev.payload.rows || []).length;
			const cols = (ev.payload.cols || []).length;
			const parts = [];
			if (rows) parts.push(`${rows} row${rows === 1 ? '' : 's'}`);
			if (cols) parts.push(`${cols} column${cols === 1 ? '' : 's'}`);
			return {
				icon: '\u2728',
				color: '#fc8',
				text: `${who} cleared ${parts.join(' + ')} (${ev.payload.cellCount || 0} cells)`,
				target: null,
			};
		}
		case 'island_decayed': {
			const sample = (ev.payload.sampleCells || [])[0];
			const at = sample ? ` near (${sample.x}, ${sample.z})` : '';
			return {
				icon: '\u26A0',
				color: '#fc6',
				text: `${who}'s territory lost ${ev.payload.cellCount || 0} cell${(ev.payload.cellCount || 0) === 1 ? '' : 's'} (disconnected)${at}`,
				target: sample ? { x: sample.x, z: sample.z } : null,
			};
		}
		case 'territory_captured': {
			const sample = (ev.payload.sampleCells || [])[0];
			const at = sample ? ` (${sample.x}, ${sample.z})` : '';
			const taker = ev.payload.toPlayerName || ev.payload.toPlayerId || 'someone';
			const loser = ev.payload.fromPlayerName || ev.payload.fromPlayerId || 'an opponent';
			return {
				icon: '\u2691',
				color: '#fcc',
				text: `${taker} captured a cell from ${loser}${at}`,
				target: sample ? { x: sample.x, z: sample.z } : null,
			};
		}
		case 'king_detonation': {
			const reasonLabels = {
				ai_lone_king: 'AI king detonated',
				lone_king_sweep: 'lone king detonated',
				self_destruct: 'detonated their king',
				voluntary_self_destruct: 'detonated their king',
				captured: 'king was captured',
			};
			const label = reasonLabels[ev.payload.reason] || 'king detonated';
			return {
				icon: '\u2620',
				color: '#f66',
				text: `${who} — ${label}`,
				target: ev.payload && Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'chess_piece_lost': {
			const reasonLabels = {
				no_supporting_cell: 'lost — cell collapsed underneath',
				invalid_position: 'lost — bad position',
				owner_gone: 'lost — owner removed',
				island_decay: 'stranded — island decayed',
				king_detonation_collateral: 'caught in king detonation',
				player_left: 'lost — player left',
				world_reset: 'lost — world reset',
				fell_to_water: 'wings failed — fell into the water',
				knocked_off: 'knocked off the board by a landing piece',
			};
			const reason = reasonLabels[ev.payload.reason] || ev.payload.reason || 'lost';
			const at = Number.isFinite(ev.payload.x)
				? ` (${ev.payload.x}, ${ev.payload.z})` : '';
			return {
				icon: pieceIcon(ev.payload.pieceType) || '\u2620',
				color: '#f99',
				text: `${who}'s ${ev.payload.pieceType || 'piece'}${at} — ${reason}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'chess_pieces_lost': {
			return {
				icon: '\u2620',
				color: '#f99',
				text: `${who} lost ${ev.payload.pieceCount} piece${ev.payload.pieceCount === 1 ? '' : 's'} (${ev.payload.reason || 'bulk_removal'})`,
				target: null,
			};
		}
		case 'chess_piece_captured': {
			const cap = ev.payload.capturedBy || {};
			const capName = cap.playerId || 'opponent';
			const at = Number.isFinite(ev.payload.x)
				? ` (${ev.payload.x}, ${ev.payload.z})` : '';
			return {
				icon: pieceIcon(ev.payload.pieceType) || '\u2620',
				color: '#f9a',
				text: `${who}'s ${ev.payload.pieceType || 'piece'}${at} captured by ${capName}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'chess_piece_detonated': {
			const at = Number.isFinite(ev.payload.x)
				? ` (${ev.payload.x}, ${ev.payload.z})` : '';
			const label = ev.payload.reason === 'suicidal_pawn'
				? 'detonated (suicidal)' : 'detonated';
			return {
				icon: '\u26A1',
				color: '#fc6',
				text: `${who}'s ${ev.payload.pieceType || 'piece'}${at} ${label}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'chess_piece_promoted': {
			const at = Number.isFinite(ev.payload.x)
				? ` (${ev.payload.x}, ${ev.payload.z})` : '';
			const viaBasket = ev.payload.fromBasket ? ' (from basket)' : '';
			return {
				icon: '\u2606',
				color: '#cf9',
				text: `${who}'s ${ev.payload.fromType || 'pawn'}${at} promoted to ${ev.payload.toType || 'queen'}${viaBasket}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'chess_piece_spawned': {
			const at = Number.isFinite(ev.payload.x)
				? ` at (${ev.payload.x}, ${ev.payload.z})` : '';
			const piece = String(ev.payload.pieceType || 'piece').toLowerCase();
			const reasonLabel = ev.payload.reason === 'powerup' ? ' from a power-up' : '';
			return {
				icon: '\u2728',
				color: '#ffe066',
				text: `${who} gained a ${piece}${at}${reasonLabel}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'powerup_spawned': {
			const at = Number.isFinite(ev.payload.x)
				? ` at (${ev.payload.x}, ${ev.payload.z})` : '';
			const piece = String(ev.payload.pieceType || 'piece').toLowerCase();
			const target = ev.payload.targetPlayerName
				? ` (near ${ev.payload.targetPlayerName})` : '';
			return {
				icon: '\uD83D\uDD2E',
				color: '#cdaaff',
				text: `A ${piece} power-up appeared${at}${target}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'powerup_claimed': {
			const piece = String(ev.payload.pieceType || 'piece').toLowerCase();
			const at = Number.isFinite(ev.payload.x)
				? ` at (${ev.payload.x}, ${ev.payload.z})` : '';
			return {
				icon: '\uD83C\uDF1F',
				color: '#ffcc66',
				text: `${who} claimed a ${piece} power-up${at}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'powerup_expired': {
			const piece = String(ev.payload.pieceType || 'piece').toLowerCase();
			return {
				icon: '\u29bf',
				color: '#888',
				text: `A ${piece} power-up faded away`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'pawn_promoted_to_credit': {
			const at = Number.isFinite(ev.payload.x)
				? ` at (${ev.payload.x}, ${ev.payload.z})` : '';
			return {
				icon: '\u2605',
				color: '#a8e6a3',
				text: `${who} banked a promotion credit${at}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'promotion_redeemed': {
			const piece = String(ev.payload.capturedType || 'piece').toLowerCase();
			const at = Number.isFinite(ev.payload.x)
				? ` at (${ev.payload.x}, ${ev.payload.z})` : '';
			const fallback = ev.payload.fallback ? ' (original cell gone — placed near king)' : '';
			return {
				icon: '\u2654',
				color: '#a8e6a3',
				text: `${who} redeemed a credit for a ${piece}${at}${fallback}`,
				target: Number.isFinite(ev.payload.x)
					? { x: ev.payload.x, z: ev.payload.z } : null,
			};
		}
		case 'player_joined':
			return { icon: '\u2795', color: '#9fc', text: `${who} joined`, target: null };
		case 'player_left':
			return { icon: '\u2796', color: '#bbb', text: `${who} left`, target: null };
		case 'player_reaped': {
			const reason = ev.payload.reason === 'boot_sweep'
				? 'cleared from a previous session'
				: 'cleared (no pieces left)';
			return {
				icon: '\u2620',
				color: '#888',
				text: `${who} ${reason}`,
				target: null,
			};
		}
		case 'chat':
			return { icon: '\uD83D\uDCAC', color: '#fff', text: `${who}: ${ev.payload.message}`, target: null };
		default:
			return { icon: '\u2022', color: '#aaa', text: `${who}: ${ev.type}`, target: null };
	}
}

function formatPos(p) {
	if (!p || typeof p !== 'object') return '?';
	if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return '?';
	return `(${p.x}, ${p.z})`;
}

function flyTo(target) {
	if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return;
	if (window.gameCore && typeof window.gameCore.flyToCell === 'function') {
		window.gameCore.flyToCell(target.x, target.z);
	} else {
		showToastMessage(`Camera not ready (target ${target.x},${target.z}).`);
	}
}

function renderEvent(ev) {
	if (!listElement) return;
	if (!passesFilter(ev)) return;
	const { icon, color, text, target } = describeEvent(ev);

	const row = document.createElement('div');
	row.dataset.eventId = String(ev.id);
	Object.assign(row.style, {
		padding: '8px 10px',
		borderBottom: '1px solid rgba(255, 204, 0, 0.12)',
		display: 'flex',
		alignItems: 'flex-start',
		gap: '8px',
		cursor: target ? 'pointer' : 'default',
		fontSize: '12px',
		color: '#eee',
		lineHeight: '1.4',
	});

	const iconEl = document.createElement('div');
	iconEl.textContent = icon;
	Object.assign(iconEl.style, { color, fontSize: '16px', minWidth: '20px', textAlign: 'center' });

	const body = document.createElement('div');
	Object.assign(body.style, { flex: '1 1 auto', overflow: 'hidden' });
	const textEl = document.createElement('div');
	textEl.textContent = text;
	const timeEl = document.createElement('div');
	timeEl.textContent = fmtTimeAgo(ev.t);
	timeEl.dataset.timestamp = String(ev.t);
	Object.assign(timeEl.style, { color: '#888', fontSize: '10px', marginTop: '2px' });
	body.appendChild(textEl);
	body.appendChild(timeEl);

	row.appendChild(iconEl);
	row.appendChild(body);

	if (target) {
		row.title = `Fly to (${target.x}, ${target.z})`;
		row.addEventListener('click', () => flyTo(target));
		row.addEventListener('mouseenter', () => { row.style.backgroundColor = 'rgba(255, 204, 0, 0.15)'; });
		row.addEventListener('mouseleave', () => { row.style.backgroundColor = ''; });
	}

	listElement.insertBefore(row, listElement.firstChild);

	while (listElement.children.length > MAX_EVENTS) {
		listElement.removeChild(listElement.lastChild);
	}
}

function tickRelativeTimes() {
	if (!listElement) return;
	const cells = listElement.querySelectorAll('[data-timestamp]');
	cells.forEach(c => {
		const t = Number(c.dataset.timestamp);
		if (Number.isFinite(t)) c.textContent = fmtTimeAgo(t);
	});
}

function updateUnreadBadge() {
	if (!badgeElement) return;
	const unread = eventBuffer.filter(
		e => e.id > lastSeenEventId && passesFilter(e)
	).length;
	if (unread === 0 || isOpen) {
		badgeElement.style.display = 'none';
	} else {
		badgeElement.style.display = 'inline-block';
		badgeElement.textContent = unread > 99 ? '99+' : String(unread);
	}
}

/**
 * Re-render the visible list using the current filter.  Used when the
 * filter toggle changes, since the existing DOM rows may now be a
 * mismatched subset.
 */
function rerenderList() {
	if (!listElement) return;
	listElement.innerHTML = '';
	// Render newest first to match the live insert order (insertBefore
	// at the top of the list).
	const ordered = [...eventBuffer].sort((a, b) => a.id - b.id);
	for (const ev of ordered) renderEvent(ev);
	updateUnreadBadge();
}

function setFilterMineOnly(value) {
	const next = !!value;
	if (next === filterMineOnly) return;
	filterMineOnly = next;
	try { window.localStorage?.setItem(FILTER_PREF_KEY, next ? '1' : '0'); } catch (_) {}
	if (filterToggleEl) {
		filterToggleEl.checked = next;
		filterToggleEl.parentElement.title = next
			? 'Showing only events involving you — click to see everyone.'
			: 'Showing all events — click to filter to just you.';
	}
	rerenderList();
}

export function pushActivityEvent(event) {
	if (!event || typeof event !== 'object') return;
	if (typeof event.id !== 'number') return;
	if (eventBuffer.some(e => e.id === event.id)) return;

	eventBuffer.push(event);
	eventBuffer.sort((a, b) => a.id - b.id);
	while (eventBuffer.length > MAX_EVENTS) eventBuffer.shift();

	if (panelElement) renderEvent(event);
	updateUnreadBadge();
}

export function loadActivityLogSnapshot(snapshot) {
	if (!snapshot || !Array.isArray(snapshot.events)) return;
	eventBuffer.length = 0;
	for (const ev of snapshot.events) eventBuffer.push(ev);
	eventBuffer.sort((a, b) => a.id - b.id);
	while (eventBuffer.length > MAX_EVENTS) eventBuffer.shift();

	rerenderList();
}

function openPanel() {
	if (!panelElement) return;
	isOpen = true;
	panelElement.style.transform = 'translateX(0)';
	if (eventBuffer.length > 0) {
		lastSeenEventId = Math.max(lastSeenEventId, ...eventBuffer.map(e => e.id));
	}
	updateUnreadBadge();
}

function closePanel() {
	if (!panelElement) return;
	isOpen = false;
	panelElement.style.transform = 'translateX(360px)';
	updateUnreadBadge();
}

export function toggleActivityLog() {
	if (isOpen) closePanel(); else openPanel();
}

export function ensureActivityLogUI() {
	if (panelElement) return panelElement;

	panelElement = document.createElement('div');
	panelElement.id = 'activity-log-panel';
	Object.assign(panelElement.style, {
		position: 'fixed',
		right: '0',
		top: '60px',
		bottom: '60px',
		width: '340px',
		backgroundColor: 'rgba(10, 10, 10, 0.93)',
		borderLeft: '2px solid #ffcc00',
		borderTop: '1px solid #ffcc00',
		borderBottom: '1px solid #ffcc00',
		borderRadius: '6px 0 0 6px',
		boxShadow: '0 0 20px rgba(0, 0, 0, 0.6)',
		zIndex: '11500',
		display: 'flex',
		flexDirection: 'column',
		transform: 'translateX(360px)',
		transition: 'transform 0.3s ease-in-out',
		fontFamily: 'Playfair Display, Times New Roman, serif',
	});

	const header = document.createElement('div');
	Object.assign(header.style, {
		display: 'flex', alignItems: 'center', justifyContent: 'space-between',
		padding: '8px 12px',
		borderBottom: '1px solid rgba(255, 204, 0, 0.3)',
		backgroundColor: 'rgba(255, 204, 0, 0.08)',
	});

	const title = document.createElement('div');
	title.textContent = 'Recent activity';
	Object.assign(title.style, { color: '#ffcc00', fontWeight: 'bold', fontSize: '14px' });

	// "Only mine" filter — the user asked for a way to show only events
	// involving their own player so the panel doesn't drown them in
	// other people's bot activity. The state is persisted via
	// localStorage so it survives reloads.
	const filterLabel = document.createElement('label');
	Object.assign(filterLabel.style, {
		display: 'flex', alignItems: 'center', gap: '4px',
		color: '#fc6', fontSize: '11px', cursor: 'pointer',
		userSelect: 'none',
	});
	filterLabel.title = filterMineOnly
		? 'Showing only events involving you — click to see everyone.'
		: 'Showing all events — click to filter to just you.';
	filterToggleEl = document.createElement('input');
	filterToggleEl.type = 'checkbox';
	filterToggleEl.checked = filterMineOnly;
	filterToggleEl.style.cursor = 'pointer';
	filterToggleEl.addEventListener('change', () => setFilterMineOnly(filterToggleEl.checked));
	const filterText = document.createElement('span');
	filterText.textContent = 'Only mine';
	filterLabel.appendChild(filterToggleEl);
	filterLabel.appendChild(filterText);

	const closeBtn = document.createElement('button');
	closeBtn.textContent = '\u00D7';
	Object.assign(closeBtn.style, {
		background: 'transparent', color: '#ffcc00', border: 'none',
		fontSize: '20px', cursor: 'pointer', padding: '0 4px',
	});
	closeBtn.addEventListener('click', closePanel);

	header.appendChild(title);
	header.appendChild(filterLabel);
	header.appendChild(closeBtn);

	bodyElement = document.createElement('div');
	Object.assign(bodyElement.style, { flex: '1 1 auto', overflowY: 'auto' });

	listElement = document.createElement('div');
	bodyElement.appendChild(listElement);

	const footer = document.createElement('div');
	Object.assign(footer.style, {
		padding: '6px 10px',
		fontSize: '10px',
		color: '#888',
		borderTop: '1px solid rgba(255, 204, 0, 0.15)',
		textAlign: 'center',
	});
	footer.textContent = 'Click any line to fly the camera there.';

	panelElement.appendChild(header);
	panelElement.appendChild(bodyElement);
	panelElement.appendChild(footer);
	document.body.appendChild(panelElement);

	toggleButton = document.createElement('button');
	toggleButton.id = 'activity-log-toggle';
	toggleButton.title = 'Recent activity (replay)';
	toggleButton.innerHTML = '\u23F1\uFE0F';
	Object.assign(toggleButton.style, {
		position: 'fixed',
		// Pinned to bottom-right so it doesn't collide with the
		// next-piece HUD, Skip-chess button or the Advertise link.
		right: '16px',
		bottom: '16px',
		width: '40px',
		height: '40px',
		borderRadius: '50%',
		border: '2px solid #ffcc00',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		color: '#ffcc00',
		fontSize: '18px',
		cursor: 'pointer',
		zIndex: '11600',
		boxShadow: '0 0 10px rgba(255, 204, 0, 0.4)',
	});
	toggleButton.addEventListener('click', toggleActivityLog);
	document.body.appendChild(toggleButton);

	badgeElement = document.createElement('span');
	Object.assign(badgeElement.style, {
		position: 'absolute',
		top: '-4px',
		right: '-4px',
		minWidth: '16px',
		height: '16px',
		padding: '0 4px',
		borderRadius: '8px',
		backgroundColor: '#e44',
		color: 'white',
		fontSize: '10px',
		lineHeight: '16px',
		textAlign: 'center',
		fontFamily: 'sans-serif',
		display: 'none',
	});
	toggleButton.appendChild(badgeElement);

	rerenderList();

	setInterval(tickRelativeTimes, 15000);

	return panelElement;
}

export function bindActivityLogToSocket(socket) {
	if (!socket || typeof socket.on !== 'function') return;
	socket.on('activity_event', (event) => pushActivityEvent(event));
	socket.on('activity_log_snapshot', (snapshot) => loadActivityLogSnapshot(snapshot));
	try {
		socket.emit('get_activity_log', null, (response) => {
			if (response && response.success) loadActivityLogSnapshot(response);
		});
	} catch (_) {
		// Some adapters don't support the ack form; fall through.
		try { socket.emit('get_activity_log'); } catch (_) { /* ignore */ }
	}
}
