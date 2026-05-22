/**
 * Selected-piece info card.
 *
 * Sits in the bottom-right of the viewport whenever the local player
 * has a chess piece selected. Shows:
 *
 *   • Piece type (Queen / Rook / Pawn …)
 *   • Owner name + colour stripe
 *   • Moves made (`moveCount`)
 *   • Cells travelled (`distanceTravelled`, Manhattan)
 *   • Pieces captured (`captureCount`)
 *   • Forward distance (pawns only — relevant to promotion)
 *
 * Lifecycle is driven by `setSelectedPiece(piece)` from
 * `chessInteraction.js`; pass `null` to hide. The card pulls the
 * latest stats from `gameState.chessPieces` on every update so the
 * numbers stay in sync as moves arrive via `game_update`.
 *
 * Why a tiny dedicated module instead of stuffing it into the player
 * bar: the player bar already renders left-side; this is a quick
 * "what am I about to move?" affordance and sits on the opposite
 * side so it doesn't fight for space. Pure DOM/CSS — no Three.js
 * dependencies, so it can render even when the renderer is paused.
 */

import { getGameState } from './gameContext.js';

const CARD_ID = 'selected-piece-card';

const PIECE_LABELS = Object.freeze({
	KING:   'King',
	QUEEN:  'Queen',
	ROOK:   'Rook',
	BISHOP: 'Bishop',
	KNIGHT: 'Knight',
	PAWN:   'Pawn',
});

let cardEl = null;
let currentPieceId = null;
let refreshTimer = null;

function colourToCss(value) {
	if (value === null || value === undefined || value === '') return '#888';
	if (typeof value === 'number' && Number.isFinite(value)) {
		return '#' + (value & 0xFFFFFF).toString(16).padStart(6, '0');
	}
	const str = String(value).trim();
	if (!str) return '#888';
	if (str.startsWith('#')) return str;
	if (/^0x[0-9a-f]{6}$/i.test(str)) return '#' + str.slice(2);
	if (/^[0-9a-f]{6}$/i.test(str)) return '#' + str;
	return str;
}

function ensureCard() {
	if (cardEl && document.body.contains(cardEl)) return cardEl;
	cardEl = document.getElementById(CARD_ID);
	if (cardEl) return cardEl;

	cardEl = document.createElement('div');
	cardEl.id = CARD_ID;
	cardEl.setAttribute('role', 'status');
	cardEl.setAttribute('aria-live', 'polite');
	Object.assign(cardEl.style, {
		position: 'fixed',
		right: '18px',
		bottom: '18px',
		minWidth: '180px',
		maxWidth: '260px',
		padding: '12px 14px',
		background: 'rgba(15, 20, 30, 0.88)',
		color: '#f0eada',
		border: '1px solid #ffcc00',
		borderRadius: '8px',
		fontFamily: '"Segoe UI", system-ui, sans-serif',
		fontSize: '13px',
		lineHeight: '1.35',
		boxShadow: '0 4px 18px rgba(0, 0, 0, 0.45)',
		pointerEvents: 'none',
		zIndex: '9000',
		display: 'none',
		transition: 'opacity 120ms ease-out',
		opacity: '0',
	});
	document.body.appendChild(cardEl);
	return cardEl;
}

function findCanonicalPiece(pieceId, fallback) {
	const gameState = getGameState();
	const id = pieceId != null ? String(pieceId) : null;
	if (id && Array.isArray(gameState?.chessPieces)) {
		for (const p of gameState.chessPieces) {
			if (!p) continue;
			if (String(p.id) === id) return p;
		}
	}
	return fallback || null;
}

function findOwnerName(playerId) {
	const gameState = getGameState();
	const players = gameState?.players;
	if (!players) return playerId || 'Unknown';
	const entry = players[playerId];
	if (!entry) return playerId || 'Unknown';
	return entry.username || entry.name || playerId || 'Unknown';
}

function renderCard(piece) {
	const el = ensureCard();
	if (!piece) {
		el.style.display = 'none';
		el.style.opacity = '0';
		el.innerHTML = '';
		return;
	}

	const type = String(piece.type || piece.pieceType || '').toUpperCase();
	const label = PIECE_LABELS[type] || (type
		? type.charAt(0) + type.slice(1).toLowerCase()
		: 'Piece');
	const ownerName = findOwnerName(piece.player);
	const ownerColour = colourToCss(piece.color);
	const moves = Number.isFinite(piece.moveCount) ? piece.moveCount : 0;
	const distance = Number.isFinite(piece.distanceTravelled) ? piece.distanceTravelled : 0;
	const captures = Number.isFinite(piece.captureCount) ? piece.captureCount : 0;
	const forward = Number.isFinite(piece.forwardDistance) ? piece.forwardDistance : 0;
	const isPawn = type === 'PAWN';
	const isKing = type === 'KING';
	const livesRemaining = isKing
		? (Number.isFinite(piece.kingLives) ? piece.kingLives
			: (getGameState()?.players?.[piece.player]?.kingLives))
		: null;

	const moveLabel = moves === 1 ? 'move' : 'moves';
	const cellLabel = distance === 1 ? 'cell' : 'cells';
	const captureLabel = captures === 1 ? 'capture' : 'captures';

	el.innerHTML = `
		<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
			<div style="
				width:12px; height:12px; border-radius:50%;
				background:${ownerColour}; box-shadow: 0 0 6px ${ownerColour};
			"></div>
			<div style="font-weight:700; font-size:14px; color:#ffcc00;">${label}</div>
		</div>
		<div style="font-size:12px; color:#cbb;">${ownerName}</div>
		<div style="margin-top:8px; display:grid; grid-template-columns: 1fr auto; gap:2px 8px;">
			<div>Moves</div><div style="text-align:right; font-variant-numeric: tabular-nums;">${moves} ${moveLabel}</div>
			<div>Travelled</div><div style="text-align:right; font-variant-numeric: tabular-nums;">${distance} ${cellLabel}</div>
			<div>Captures</div><div style="text-align:right; font-variant-numeric: tabular-nums;">${captures} ${captureLabel}</div>
			${isPawn ? `
				<div>Forward</div>
				<div style="text-align:right; font-variant-numeric: tabular-nums;">${forward} ${forward === 1 ? 'cell' : 'cells'}</div>
			` : ''}
			${isKing && Number.isFinite(livesRemaining) ? `
				<div>Lives</div>
				<div style="text-align:right; font-variant-numeric: tabular-nums;">${livesRemaining}</div>
			` : ''}
		</div>
	`;
	el.style.display = 'block';
	// Trigger transition next frame so the fade is visible.
	requestAnimationFrame(() => { el.style.opacity = '1'; });
}

/**
 * Show or update the card for `piece` (a Three.js mesh from the
 * chess-piece group). Pass `null` to hide.
 */
export function setSelectedPiece(piece) {
	if (!piece) {
		stopAutoRefresh();
		currentPieceId = null;
		renderCard(null);
		return;
	}

	const userData = piece.userData || {};
	const meshPiece = {
		id: userData.id || userData.pieceId,
		type: userData.pieceType || userData.type,
		player: userData.player,
		color: userData.color,
		moveCount: userData.moveCount,
		captureCount: userData.captureCount,
		distanceTravelled: userData.distanceTravelled,
		forwardDistance: userData.forwardDistance,
		position: userData.position,
		kingLives: userData.kingLives,
	};

	currentPieceId = meshPiece.id != null ? String(meshPiece.id) : null;
	const canonical = findCanonicalPiece(currentPieceId, meshPiece);
	const merged = { ...meshPiece, ...canonical };
	if (merged.color == null) merged.color = meshPiece.color;
	renderCard(merged);

	startAutoRefresh();
}

function startAutoRefresh() {
	stopAutoRefresh();
	// 500 ms is fast enough to feel responsive when the player just
	// captured something with the selected piece, but slow enough
	// that we're not redrawing on every render frame.
	refreshTimer = setInterval(() => {
		if (!currentPieceId) {
			stopAutoRefresh();
			return;
		}
		const canonical = findCanonicalPiece(currentPieceId, null);
		if (canonical) renderCard(canonical);
	}, 500);
}

function stopAutoRefresh() {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = null;
	}
}

/** Useful from devtools / tests. */
export function getSelectedPieceCardElement() {
	return ensureCard();
}
