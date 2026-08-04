/**
 * Lite mode — a 2D canvas client for browsers without WebGL.
 *
 * The full game renders through Three.js; when no WebGL context can be
 * created (VMs, remote desktops, locked-down corporate browsers, text
 * clients with basic canvas), this module drives the same server
 * protocol onto a plain 2D `<canvas>`:
 *
 *   • top-down board with pan (drag) and zoom (wheel / ±)
 *   • chess play: click your piece, click the destination
 *   • tetromino play: a ghost follows the pointer, R rotates, click
 *     places (the server remains fully authoritative)
 *   • battles: the ⚔ dialog, seats, invite links and view switching
 *     all reuse the standard battle module — only rendering differs
 *
 * Activate with `/2d`, `?lite=1`, or automatically when WebGL is
 * unavailable. Everything here is DOM + 2D canvas: no THREE imports.
 */

import * as NetworkManager from './utils/networkManager.js';
import gameState from './utils/gameState.js';
import { showToastMessage } from './showToastMessage.js';
import { initBattleMode, enterBattleFlow, inviteCodeFromUrl } from './battle/battleMode.js';
import { isCellVisibleInCurrentView } from './battle/battleRules.js';
import { getPlayerColor } from './boardFunctions/colours.js';
import { TETROMINO_SHAPES } from './tetromino/shapes.js';
import { showKingdomRestoreDialog } from './kingdomRestoreDialog.js';

const LITE = Object.freeze({
	CELL_PX: 26,          // pixels per cell at zoom 1
	MIN_ZOOM: 0.35,
	MAX_ZOOM: 3,
	CLICK_SLOP_PX: 6,     // pointer travel below this is a click, not a pan
	GRID_COLOUR: 'rgba(0, 0, 0, 0.08)',
	SEA_COLOUR: '#66b9e0',
	CELL_RADIUS: 3,       // rounded-corner radius for cells
	GHOST_ALPHA: 0.5,
	FONT: 'serif',
});

const PIECE_GLYPHS = Object.freeze({
	KING: '\u265A', QUEEN: '\u265B', ROOK: '\u265C',
	BISHOP: '\u265D', KNIGHT: '\u265E', PAWN: '\u265F',
});

let canvas = null;
let ctx = null;
let rafHandle = null;
let joinedWorld = false;
let playing = false;

/** Camera: board cell at the canvas centre + pixels per cell. */
const view = { x: 0, z: 0, scale: LITE.CELL_PX };

/** Current pointer state (panning vs clicking, ghost position). */
const pointer = { down: false, panned: false, startX: 0, startY: 0, lastX: 0, lastY: 0, cellX: 0, cellZ: 0 };

let selectedPieceId = null;
let ghost = null;            // { type, rotation }
let tetrominoBag = [];
let placementBusy = false;
let skipChessBtn = null;

// ── Shapes ──────────────────────────────────────────────────────────────────

function rotateMatrix(matrix) {
	const size = matrix.length;
	const out = Array.from({ length: size }, () => new Array(size).fill(0));
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) out[c][size - 1 - r] = matrix[r][c];
	}
	return out;
}

/** Shape matrix for a type at a rotation (client mirror of the server). */
function shapeFor(type, rotation) {
	let m = (TETROMINO_SHAPES[type] || TETROMINO_SHAPES.O).map(row => row.slice());
	// Pad to square so rotation is a clean transpose.
	const size = Math.max(m.length, ...m.map(r => r.length));
	m = m.map(row => { while (row.length < size) row.push(0); return row; });
	while (m.length < size) m.push(new Array(size).fill(0));
	for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) m = rotateMatrix(m);
	return m;
}

function refillBag() {
	tetrominoBag = Object.keys(TETROMINO_SHAPES);
	for (let i = tetrominoBag.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[tetrominoBag[i], tetrominoBag[j]] = [tetrominoBag[j], tetrominoBag[i]];
	}
}

function drawNextGhost() {
	if (tetrominoBag.length === 0) refillBag();
	ghost = { type: tetrominoBag.pop(), rotation: 0 };
	updateHud();
}

// ── Colours ─────────────────────────────────────────────────────────────────

function cssColour(value, fallback = '#888888') {
	if (typeof value === 'string' && value.startsWith('#')) return value;
	if (Number.isFinite(value)) return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
	return fallback;
}

function colourForItem(item) {
	if (!item) return '#d8d2c0';
	if (item.fromHomeZone === true || item.pieceType === 'home_converted') {
		return 'rgba(180, 170, 150, 0.72)';
	}
	if (typeof item.color === 'string') return item.color;   // battle ring etc.
	if (item.player) {
		const context = item.type === 'home' ? 'home' : 'tetromino';
		return cssColour(getPlayerColor(item.player, gameState, context));
	}
	return '#d8d2c0';
}

function rotateGhost(direction = 1) {
	if (!ghost || gameState.turnPhase === 'chess') return;
	ghost.rotation = (ghost.rotation + direction + 4) % 4;
	updateHud();
}

function enterChessPhase() {
	gameState.turnPhase = 'chess';
	selectedPieceId = null;
	updateHud();
}

function enterTetrisPhase() {
	gameState.turnPhase = 'tetris';
	selectedPieceId = null;
	if (!ghost) drawNextGhost();
	else updateHud();
}

// ── Coordinate transforms ───────────────────────────────────────────────────

function cellToScreen(x, z) {
	return {
		px: canvas.width / 2 + (x - view.x) * view.scale,
		py: canvas.height / 2 + (z - view.z) * view.scale,
	};
}

function screenToCell(px, py) {
	return {
		x: Math.round(view.x + (px - canvas.width / 2) / view.scale),
		z: Math.round(view.z + (py - canvas.height / 2) / view.scale),
	};
}

// ── Rendering ───────────────────────────────────────────────────────────────

function drawRoundedCell(px, py, size, fill, alpha = 1) {
	const pad = Math.max(0.5, size * 0.04);
	ctx.globalAlpha = alpha;
	ctx.fillStyle = fill;
	ctx.beginPath();
	if (typeof ctx.roundRect === 'function') {
		ctx.roundRect(px - size / 2 + pad, py - size / 2 + pad, size - pad * 2, size - pad * 2, LITE.CELL_RADIUS);
	} else {
		ctx.rect(px - size / 2 + pad, py - size / 2 + pad, size - pad * 2, size - pad * 2);
	}
	ctx.fill();
	ctx.globalAlpha = 1;
}

function render() {
	rafHandle = requestAnimationFrame(render);
	if (!ctx) return;

	ctx.fillStyle = LITE.SEA_COLOUR;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const halfW = canvas.width / 2 / view.scale;
	const halfH = canvas.height / 2 / view.scale;
	const minX = Math.floor(view.x - halfW) - 1;
	const maxX = Math.ceil(view.x + halfW) + 1;
	const minZ = Math.floor(view.z - halfH) - 1;
	const maxZ = Math.ceil(view.z + halfH) + 1;

	// Terrain cells.
	const cells = gameState.board?.cells || {};
	for (const [key, contents] of Object.entries(cells)) {
		if (!Array.isArray(contents) || contents.length === 0) continue;
		const [xs, zs] = key.split(',');
		const x = Number(xs);
		const z = Number(zs);
		if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
		if (!isCellVisibleInCurrentView(gameState, x, z)) continue;
		const item = contents.find(i => i && i.type === 'home')
			|| contents.find(i => i && i.fromHomeZone)
			|| contents.find(i => i && (i.type === 'home' || i.color))
			|| contents[0];
		const degraded = contents.some(i => i && (i.fromHomeZone === true || i.pieceType === 'home_converted'));
		const { px, py } = cellToScreen(x, z);
		drawRoundedCell(px, py, view.scale, colourForItem(item), degraded ? 0.72 : 1);
	}

	// Grid (only when zoomed in enough for it to help).
	if (view.scale >= 14) {
		ctx.strokeStyle = LITE.GRID_COLOUR;
		ctx.lineWidth = 1;
		for (let x = minX; x <= maxX; x++) {
			const { px } = cellToScreen(x, 0);
			ctx.beginPath();
			ctx.moveTo(px - view.scale / 2, 0);
			ctx.lineTo(px - view.scale / 2, canvas.height);
			ctx.stroke();
		}
		for (let z = minZ; z <= maxZ; z++) {
			const { py } = cellToScreen(0, z);
			ctx.beginPath();
			ctx.moveTo(0, py - view.scale / 2);
			ctx.lineTo(canvas.width, py - view.scale / 2);
			ctx.stroke();
		}
	}

	// Power-up orbs.
	for (const orb of gameState.powerUps || []) {
		if (!orb || !Number.isFinite(orb.x) || !Number.isFinite(orb.z)) continue;
		if (orb.x < minX || orb.x > maxX || orb.z < minZ || orb.z > maxZ) continue;
		if (!isCellVisibleInCurrentView(gameState, orb.x, orb.z)) continue;
		const { px, py } = cellToScreen(orb.x, orb.z);
		ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
		ctx.beginPath();
		ctx.arc(px, py, view.scale * 0.28, 0, Math.PI * 2);
		ctx.fill();
	}

	// Chess pieces (and king nameplates).
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for (const piece of gameState.chessPieces || []) {
		if (!piece) continue;
		const x = piece.position?.x ?? piece.x;
		const z = piece.position?.z ?? piece.z;
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
		if (!isCellVisibleInCurrentView(gameState, x, z)) continue;

		const { px, py } = cellToScreen(x, z);
		const glyph = PIECE_GLYPHS[String(piece.type || '').toUpperCase()] || '?';
		const colour = cssColour(getPlayerColor(piece.player, gameState, 'chess'));

		if (piece.id === selectedPieceId) {
			ctx.strokeStyle = '#ffcc00';
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(px, py, view.scale * 0.46, 0, Math.PI * 2);
			ctx.stroke();
		}

		ctx.font = `${Math.round(view.scale * 0.85)}px ${LITE.FONT}`;
		// Outline first so light pieces stay readable on light cells.
		ctx.strokeStyle = 'rgba(0,0,0,0.75)';
		ctx.lineWidth = Math.max(1.5, view.scale * 0.06);
		ctx.strokeText(glyph, px, py);
		ctx.fillStyle = colour;
		ctx.fillText(glyph, px, py);
	}

	// Tetromino ghost under the pointer (build mode only).
	if (ghost && playing && gameState.turnPhase !== 'chess' && !selectedPieceId) {
		const matrix = shapeFor(ghost.type, ghost.rotation);
		const colour = cssColour(getPlayerColor(
			gameState.localPlayerId || 'me', gameState, 'tetromino'));
		for (let r = 0; r < matrix.length; r++) {
			for (let c = 0; c < matrix[r].length; c++) {
				if (!matrix[r][c]) continue;
				const { px, py } = cellToScreen(pointer.cellX + c, pointer.cellZ + r);
				drawRoundedCell(px, py, view.scale, colour, LITE.GHOST_ALPHA);
			}
		}
	}
}

// ── State intake ────────────────────────────────────────────────────────────

function normalisePlayers(list) {
	if (Array.isArray(list)) {
		const map = {};
		for (const entry of list) {
			if (!entry || !entry.id) continue;
			map[entry.id] = { ...(gameState.players?.[entry.id] || {}), ...entry };
		}
		return map;
	}
	return list && typeof list === 'object' ? list : {};
}

function applyGameUpdate(data) {
	if (!data) return;
	if (data.board && data.fullUpdate !== false) {
		gameState.board = data.board;
	} else if (Array.isArray(data.boardChanges) || Array.isArray(data.removedCells)) {
		if (!gameState.board) gameState.board = { cells: {} };
		if (!gameState.board.cells) gameState.board.cells = {};
		for (const change of data.boardChanges || []) {
			gameState.board.cells[`${change.x},${change.z}`] = change.value;
		}
		for (const removed of data.removedCells || []) {
			delete gameState.board.cells[`${removed.x},${removed.z}`];
		}
	}
	if (Array.isArray(data.chessPieces)) gameState.chessPieces = data.chessPieces;
	if (data.homeZones) gameState.homeZones = data.homeZones;
	if (data.players) gameState.players = normalisePlayers(data.players);
	if (Array.isArray(data.powerUps)) gameState.powerUps = data.powerUps;
	renderPlayersPanel();
}

// ── Interaction ─────────────────────────────────────────────────────────────

function myPieceAt(x, z) {
	const me = String(gameState.localPlayerId || '');
	if (!me) return null;
	return (gameState.chessPieces || []).find(p => {
		if (!p || String(p.player) !== me) return false;
		const px = p.position?.x ?? p.x;
		const pz = p.position?.z ?? p.z;
		return px === x && pz === z;
	}) || null;
}

async function submitChessMove(piece, x, z) {
	try {
		await NetworkManager.submitChessMove({ pieceId: piece.id, targetPosition: { x, z } });
		selectedPieceId = null;
		enterTetrisPhase();
		showToastMessage('Chess move made — place your next piece', { variant: 'success' });
		updateHud();
	} catch (err) {
		showToastMessage(err?.details?.message || err?.message || 'Move rejected', { variant: 'alert' });
	}
}

async function skipChessMove() {
	try {
		const response = await NetworkManager.sendMessage('skip_chess_move', {});
		if (response?.success === false) {
			showToastMessage(response?.message || response?.error || 'Could not skip chess', { variant: 'alert' });
			return;
		}
		enterTetrisPhase();
		showToastMessage('Chess skipped — place your next piece');
	} catch (err) {
		showToastMessage(err?.message || 'Could not skip chess', { variant: 'alert' });
	}
}

async function submitPlacement(x, z) {
	if (!ghost || placementBusy || gameState.turnPhase === 'chess') return;
	placementBusy = true;
	try {
		const result = await NetworkManager.submitTetrominoPlacement({
			pieceType: ghost.type,
			type: ghost.type,
			rotation: ghost.rotation,
			position: { x, z },
		});
		if (result && result.success !== false) {
			drawNextGhost();
			// Mirror the 3D client: after a placement you owe a chess move
			// unless the server later says there are none.
			enterChessPhase();
			showToastMessage('Make your chess move (or Skip)', { variant: 'success' });
		} else {
			showToastMessage(result?.message || 'Placement rejected', { variant: 'alert' });
		}
	} catch (err) {
		const message = err?.details?.message || err?.message || 'Placement rejected';
		showToastMessage(message === 'rate_limited' ? 'Too fast — wait a moment' : message, { variant: 'alert' });
	} finally {
		placementBusy = false;
	}
}

function handleClick(px, py) {
	const { x, z } = screenToCell(px, py);
	if (!playing) return;

	const clickedPiece = myPieceAt(x, z);
	if (clickedPiece) {
		// Toggle selection.
		selectedPieceId = selectedPieceId === clickedPiece.id ? null : clickedPiece.id;
		updateHud();
		return;
	}
	if (selectedPieceId) {
		const piece = (gameState.chessPieces || []).find(p => p && p.id === selectedPieceId);
		if (piece) submitChessMove(piece, x, z);
		return;
	}
	if (gameState.turnPhase === 'chess') return;
	submitPlacement(x, z);
}

function wireCanvasInput() {
	canvas.addEventListener('pointerdown', (e) => {
		pointer.down = true;
		pointer.panned = false;
		pointer.startX = e.clientX;
		pointer.startY = e.clientY;
		pointer.lastX = e.clientX;
		pointer.lastY = e.clientY;
		canvas.setPointerCapture(e.pointerId);
	});
	canvas.addEventListener('pointermove', (e) => {
		const cell = screenToCell(e.clientX, e.clientY);
		pointer.cellX = cell.x;
		pointer.cellZ = cell.z;
		if (!pointer.down) return;
		const dx = e.clientX - pointer.lastX;
		const dy = e.clientY - pointer.lastY;
		if (Math.abs(e.clientX - pointer.startX) > LITE.CLICK_SLOP_PX
			|| Math.abs(e.clientY - pointer.startY) > LITE.CLICK_SLOP_PX) {
			pointer.panned = true;
		}
		if (pointer.panned) {
			view.x -= dx / view.scale;
			view.z -= dy / view.scale;
		}
		pointer.lastX = e.clientX;
		pointer.lastY = e.clientY;
	});
	canvas.addEventListener('pointerup', (e) => {
		pointer.down = false;
		if (!pointer.panned) handleClick(e.clientX, e.clientY);
	});
	canvas.addEventListener('wheel', (e) => {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
		view.scale = Math.min(LITE.MAX_ZOOM * LITE.CELL_PX,
			Math.max(LITE.MIN_ZOOM * LITE.CELL_PX, view.scale * factor));
	}, { passive: false });

	window.addEventListener('keydown', (e) => {
		if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
		const key = e.key.toLowerCase();
		switch (key) {
			case 'r':
			case 'x':
				rotateGhost(1);
				break;
			case 'z':
				rotateGhost(-1);
				break;
			case 'escape':
				selectedPieceId = null;
				updateHud();
				break;
			case 'arrowup': view.z -= 3; break;
			case 'arrowdown': view.z += 3; break;
			case 'arrowleft': view.x -= 3; break;
			case 'arrowright': view.x += 3; break;
			case '+': case '=': view.scale = Math.min(LITE.MAX_ZOOM * LITE.CELL_PX, view.scale * 1.15); break;
			case '-': view.scale = Math.max(LITE.MIN_ZOOM * LITE.CELL_PX, view.scale / 1.15); break;
			default: return;
		}
	});
}

// ── HUD / DOM ───────────────────────────────────────────────────────────────

function el(tag, css = '', text = '') {
	const node = document.createElement(tag);
	if (css) node.style.cssText = css;
	if (text) node.textContent = text;
	return node;
}

let hudPieceCanvas = null;
let hudStatus = null;

function updateHud() {
	const inChess = gameState.turnPhase === 'chess';
	if (hudStatus) {
		hudStatus.textContent = selectedPieceId
			? 'Chess: click a destination (Esc cancels)'
			: (inChess
				? 'Chess phase — click your piece, then a square (or Skip)'
				: (playing ? 'Click board to place — Z/X or R rotates' : 'Spectating'));
	}
	if (skipChessBtn) {
		skipChessBtn.style.display = inChess ? 'inline-block' : 'none';
	}
	if (hudPieceCanvas && ghost) {
		const pctx = hudPieceCanvas.getContext('2d');
		pctx.clearRect(0, 0, hudPieceCanvas.width, hudPieceCanvas.height);
		const matrix = shapeFor(ghost.type, ghost.rotation);
		const size = 12;
		const offX = (hudPieceCanvas.width - matrix[0].length * size) / 2;
		const offY = (hudPieceCanvas.height - matrix.length * size) / 2;
		pctx.fillStyle = cssColour(getPlayerColor(gameState.localPlayerId || 'me', gameState, 'tetromino'), '#deb887');
		for (let r = 0; r < matrix.length; r++) {
			for (let c = 0; c < matrix[r].length; c++) {
				if (matrix[r][c]) pctx.fillRect(offX + c * size, offY + r * size, size - 1, size - 1);
			}
		}
	}
}

function buildHud(container) {
	const hud = el('div',
		'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:1000;'
		+ 'display:flex;align-items:center;gap:12px;padding:8px 14px;'
		+ 'background:rgba(20,20,20,0.85);border:1px solid #ffcc00;border-radius:8px;'
		+ `color:#ffcc00;font-family:${LITE.FONT};font-size:13px;`);
	hud.id = 'lite-hud';

	hudPieceCanvas = document.createElement('canvas');
	hudPieceCanvas.width = 56;
	hudPieceCanvas.height = 56;
	hudPieceCanvas.style.cssText = 'background:#111;border-radius:4px;';
	hud.appendChild(hudPieceCanvas);

	const rotateBtn = el('button',
		'padding:6px 10px;background:#333;color:#ffcc00;border:1px solid #ffcc00;'
		+ 'border-radius:4px;cursor:pointer;font-family:inherit;', '↻ Rotate (R)');
	rotateBtn.addEventListener('click', () => rotateGhost(1));
	hud.appendChild(rotateBtn);

	skipChessBtn = el('button',
		'padding:6px 10px;background:#333;color:#ffcc00;border:1px solid #ffcc00;'
		+ 'border-radius:4px;cursor:pointer;font-family:inherit;display:none;', 'Skip chess');
	skipChessBtn.addEventListener('click', () => skipChessMove());
	hud.appendChild(skipChessBtn);

	const battleBtn = el('button',
		'padding:6px 10px;background:#333;color:#ffcc00;border:1px solid #ffcc00;'
		+ 'border-radius:4px;cursor:pointer;font-family:inherit;', '⚔ Battle');
	battleBtn.id = 'battle-btn';
	hud.appendChild(battleBtn);

	hudStatus = el('span', 'color:#ccc;', 'Spectating');
	hud.appendChild(hudStatus);

	container.appendChild(hud);
}

let playersPanel = null;

function renderPlayersPanel() {
	if (!playersPanel) return;
	playersPanel.innerHTML = '';
	playersPanel.appendChild(el('div',
		'font-weight:bold;letter-spacing:2px;font-size:11px;margin-bottom:6px;', 'PLAYERS'));
	const activeBattleId = gameState.activeBattle?.id || null;
	for (const [id, player] of Object.entries(gameState.players || {})) {
		if (!player) continue;
		// Same view isolation as the 3D player bar.
		if (activeBattleId ? player.battleId !== activeBattleId : !!player.battleId) continue;
		const row = el('div',
			'display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;font-size:12px;');
		const swatch = el('span',
			`display:inline-block;width:10px;height:10px;border-radius:2px;`
			+ `background:${cssColour(getPlayerColor(id, gameState, 'chess'))};`);
		row.appendChild(swatch);
		const you = String(id) === String(gameState.localPlayerId) ? ' (you)' : '';
		row.appendChild(el('span', 'color:#eee;', `${player.name || id}${you}`));
		row.addEventListener('click', () => centreOnPlayerKing(id));
		playersPanel.appendChild(row);
	}
}

function buildPlayersPanel(container) {
	playersPanel = el('div',
		'position:fixed;top:10px;left:10px;z-index:1000;min-width:140px;max-width:220px;'
		+ 'max-height:50vh;overflow-y:auto;padding:10px;background:rgba(20,20,20,0.85);'
		+ `border:1px solid #ffcc00;border-radius:8px;color:#ffcc00;font-family:${LITE.FONT};`);
	playersPanel.id = 'lite-players';
	container.appendChild(playersPanel);
	renderPlayersPanel();
}

function centreOnPlayerKing(playerId) {
	const king = (gameState.chessPieces || []).find(p =>
		p && String(p.player) === String(playerId)
		&& String(p.type || '').toUpperCase() === 'KING');
	if (!king) return false;
	view.x = king.position?.x ?? king.x ?? view.x;
	view.z = king.position?.z ?? king.z ?? view.z;
	return true;
}

// ── Welcome overlay ─────────────────────────────────────────────────────────

function buildWelcome(container, reason) {
	const overlay = el('div',
		'position:fixed;inset:0;z-index:11000;display:flex;justify-content:center;'
		+ 'align-items:center;background:rgba(0,0,0,0.65);');
	overlay.id = 'lite-welcome';

	const card = el('div',
		'background:#222;border:2px solid #ffcc00;border-radius:8px;padding:28px;'
		+ `max-width:420px;color:#ffcc00;font-family:${LITE.FONT};text-align:center;`);
	card.appendChild(el('h1', 'margin:0 0 4px 0;letter-spacing:4px;', 'TETCHES'));
	card.appendChild(el('div', 'font-size:12px;color:#998;margin-bottom:14px;',
		'LITE MODE — 2D board, full game'));
	if (reason) {
		card.appendChild(el('div',
			'font-size:12px;color:#ccc;margin-bottom:14px;line-height:1.5;', reason));
	}

	const nameInput = el('input',
		'width:100%;box-sizing:border-box;padding:9px;font-size:14px;background:#111;'
		+ 'color:#ffcc00;border:1px solid #ffcc00;border-radius:4px;font-family:inherit;'
		+ 'margin-bottom:12px;text-align:center;');
	nameInput.placeholder = 'Your name (optional)';
	nameInput.value = localStorage.getItem('playerName') || '';
	card.appendChild(nameInput);

	const saveName = () => {
		const name = nameInput.value.trim();
		if (name) localStorage.setItem('playerName', name);
		return name;
	};

	const playBtn = el('button',
		'width:100%;padding:12px;font-size:16px;font-weight:bold;background:#ffcc00;'
		+ 'color:#000;border:none;border-radius:4px;cursor:pointer;font-family:inherit;'
		+ 'margin-bottom:8px;', '▶ PLAY NOW');
	playBtn.addEventListener('click', async () => {
		saveName();
		playBtn.disabled = true;
		playBtn.textContent = 'Joining…';
		const ok = await joinWorld();
		if (ok) hideWelcome();
		else {
			playBtn.disabled = false;
			playBtn.textContent = '▶ PLAY NOW';
		}
	});
	card.appendChild(playBtn);

	const inviteCode = inviteCodeFromUrl();
	const battleBtn = el('button',
		'width:100%;padding:10px;font-size:14px;background:#333;color:#ffcc00;'
		+ 'border:1px solid #ffcc00;border-radius:4px;cursor:pointer;font-family:inherit;',
		inviteCode ? `⚔ JOIN BATTLE ${inviteCode}` : '⚔ BATTLE');
	battleBtn.id = 'welcome-battle-btn';
	battleBtn.addEventListener('click', async () => {
		saveName();
		hideWelcome();
		await enterBattleFlow(inviteCode);
	});
	card.appendChild(battleBtn);

	overlay.appendChild(card);
	container.appendChild(overlay);
}

function hideWelcome() {
	const overlay = document.getElementById('lite-welcome');
	if (overlay) overlay.style.display = 'none';
	playing = true;
	updateHud();
}

function showKingdomChoiceOverlay(summary) {
	showKingdomRestoreDialog(summary, {
		onComplete: (response) => {
			if (response.gameState) applyGameUpdate(response.gameState);
			joinedWorld = true;
			playing = true;
			enterTetrisPhase();
			hideWelcome();
			setTimeout(() => centreOnPlayerKing(gameState.localPlayerId), 600);
		},
	});
}

function showWelcome() {
	const overlay = document.getElementById('lite-welcome');
	if (overlay) overlay.style.display = 'flex';
}

// ── Networking ──────────────────────────────────────────────────────────────

async function connectAndSpectate() {
	const name = localStorage.getItem('playerName') || 'Guest';
	try {
		const connected = await NetworkManager.initialize(name);
		if (!connected) return false;
		NetworkManager.on('game_update', applyGameUpdate);
		NetworkManager.on('tetrominoFailed', (data) => {
			if (data?.message) showToastMessage(data.message, { variant: 'alert' });
		});
		NetworkManager.on('chessFailed', (data) => {
			if (data?.message) showToastMessage(data.message, { variant: 'alert' });
		});
		NetworkManager.on('no_valid_chess_moves', (data) => {
			if (String(data?.playerId) !== String(gameState.localPlayerId)) return;
			enterTetrisPhase();
			showToastMessage('No chess moves — place your next piece');
		});
		NetworkManager.on('new_tetromino', () => {
			enterTetrisPhase();
		});
		const socket = NetworkManager.getSocket();
		if (socket) {
			socket.emit('get_game_state', {}, (response) => {
				if (response?.gameId && NetworkManager.adoptSpectatorGameId) {
					NetworkManager.adoptSpectatorGameId(response.gameId);
				}
				applyGameUpdate(response);
			});
		}
		return true;
	} catch (err) {
		console.warn('Lite mode: connection failed:', err);
		showToastMessage('Could not reach the server — retrying…', { variant: 'alert' });
		return false;
	}
}

async function joinWorld() {
	if (joinedWorld) return true;
	try {
		const result = await NetworkManager.joinGame();
		if (!result || !result.gameId) throw new Error('join_game gave no game id');
		if (result.playerId) gameState.localPlayerId = result.playerId;
		if (result.needsKingdomChoice) {
			hideWelcome();
			showKingdomChoiceOverlay(result.stowedKingdom);
			return true;
		}
		joinedWorld = true;
		playing = true;
		enterTetrisPhase();
		setTimeout(() => centreOnPlayerKing(gameState.localPlayerId), 800);
		return true;
	} catch (err) {
		console.error('Lite mode: world join failed:', err);
		showToastMessage('Could not enter the world — try again', { variant: 'alert' });
		return false;
	}
}

// ── gameCore shim ───────────────────────────────────────────────────────────
// The battle module (and other DOM UI) talks to `window.gameCore`; in
// lite mode those hooks map onto the 2D view.

function installGameCoreShim() {
	window.gameCore = {
		flyToPlayerKing: (playerId) => {
			const moved = centreOnPlayerKing(playerId);
			return moved;
		},
		flyToCell: (x, z) => {
			view.x = Number(x) || view.x;
			view.z = Number(z) || view.z;
			return true;
		},
		startBattleSession: () => {
			hideWelcome();
			playing = true;
			updateHud();
			renderPlayersPanel();
		},
		showWelcomeOverview: () => showWelcome(),
		isWorldEntered: () => joinedWorld,
	};
}

// ── Entry ───────────────────────────────────────────────────────────────────

/**
 * Boot the lite client.
 * @param {{ reason?: string }} [options] Shown on the welcome card
 *        (e.g. "WebGL is unavailable in this browser").
 */
export async function initLiteMode({ reason = '' } = {}) {
	// Remove the static 3D chrome (title, camera/render buttons). It
	// overlaps the lite panels and its buttons drive Three.js features
	// that don't exist here. Removing (not hiding) the strip also kills
	// the static #battle-btn so the lite HUD's own ⚔ button — same id —
	// is the one initBattleMode() finds and wires.
	for (const selector of ['.game-title', '.debug-indicator']) {
		document.querySelector(selector)?.remove();
	}

	const container = document.getElementById('game-container') || document.body;
	container.style.display = 'block';
	container.innerHTML = '';

	canvas = document.createElement('canvas');
	canvas.id = 'lite-canvas';
	canvas.style.cssText = 'position:fixed;inset:0;display:block;touch-action:none;cursor:crosshair;';
	container.appendChild(canvas);
	ctx = canvas.getContext('2d');

	const resize = () => {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	};
	resize();
	window.addEventListener('resize', resize);

	gameState.board = gameState.board || { cells: {} };
	gameState.players = gameState.players || {};
	gameState.chessPieces = gameState.chessPieces || [];
	gameState.liteMode = true;
	gameState.turnPhase = 'tetris';
	// Same global the 3D client exposes — debug console + UI helpers rely on it.
	window.gameState = gameState;

	installGameCoreShim();
	buildHud(container);
	buildPlayersPanel(container);
	buildWelcome(container, reason);
	wireCanvasInput();
	refillBag();
	drawNextGhost();

	await connectAndSpectate();
	try { initBattleMode(gameState); }
	catch (err) { console.warn('Lite mode: battle init failed:', err); }

	if (rafHandle) cancelAnimationFrame(rafHandle);
	render();
	console.log('Tetches lite mode running (2D canvas, no WebGL)');
	return true;
}

/** True when the page asked for lite mode explicitly. */
export function liteModeRequested() {
	try {
		const params = new URLSearchParams(window.location.search);
		return params.has('lite') || window.location.pathname === '/2d';
	} catch (_e) {
		return false;
	}
}
