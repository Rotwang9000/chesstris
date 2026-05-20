/**
 * Network-event wiring for the enhanced game-core client.
 *
 * Subscribes to all `NetworkManager` events the renderer cares about and
 * either updates `gameState` directly (board deltas, player roster) or
 * dispatches a `gameupdate` CustomEvent for downstream listeners (UI,
 * gameLoop).
 *
 * `setupNetworkEvents` is idempotent — repeat calls are a no-op after
 * the first successful invocation.
 *
 * Local-only side effects (game-over pulse overlay, current-tetromino
 * re-render) are passed in by the caller so this module can stay
 * focused on the message dispatch.
 */

import gameState from '../utils/gameState.js';
import * as NetworkManager from '../utils/networkManager.js';
import { showToastMessage } from '../showToastMessage.js';
import { clearChessSelection, findChessPieceMeshAt, clearInFlightMove } from '../chessInteraction.js';
import {
	ensureActivityLogUI,
	pushActivityEvent,
	loadActivityLogSnapshot,
	toggleActivityLog,
} from '../activityLog.js';
import { updateGameStatusDisplay } from '../createLoadingIndicator.js';
import * as tetrominoModule from '../tetromino.js';
import { flashCellsBeforeClear, showChessCaptureAnimation } from '../tetromino/animations.js';
import {
	liftAirbornePieces,
	settleAirbornePieces,
} from '../wingAnimations.js';
import { cancelSkipChessTimer, cancelSkipDropTimer } from '../skipChessButton.js';
import { updateNextPieceHint } from '../tetromino/nextPiece.js';
import { getChessPiecesGroup } from '../gameContext.js';
import {
	showPawnPromotionDialog,
	showKingBattleOverlay,
	showKingDuelOverlay,
	handleDuelRoundResult,
	handleDuelNewRound,
	showKingDuelResult,
} from '../uiOverlays.js';

// `king_detonation` and `island_decay` cap how many simultaneous
// particle animations we'll spawn so a 100×100 detonation doesn't pin
// the CPU.
const KING_ANIM_LIMITS = Object.freeze({
	maxAnimsPerLayer: 12,
	maxLayers: 20,
	maxTotalMs: 8000,
});

const ISLAND_DECAY_LIMITS = Object.freeze({
	maxAnims: 40,
	staggerMs: 50,
	maxTotalMs: 3000,
	// Don't restart a sand-dissolve on the same cell within this window.
	// Without it, repeated integrity ticks (every 10s) plus per-action
	// decay broadcasts can stack multiple animations on top of each other
	// for the same cell — that's most of the "lots of dissolving" the
	// user noticed.
	dedupeMs: 1500,
});

// `"x,z"` → last-playback-ms map used to suppress overlapping replays.
const recentIslandDecayPlaybacks = new Map();

let networkEventsInitialised = false;

function dispatchGameUpdate(detail) {
	try {
		if (!detail) return;
		window.dispatchEvent(new CustomEvent('gameupdate', { detail }));
	} catch (error) {
		console.warn('networkEvents: failed to dispatch gameupdate event:', error);
	}
}

function normalisePlayersArrayToMap(playersArray) {
	const map = {};
	if (!Array.isArray(playersArray)) return map;
	for (const p of playersArray) {
		if (!p || !p.id) continue;
		map[p.id] = {
			id: p.id,
			name: p.name || p.id,
			isComputer: !!p.isComputer,
			// Forwarded so the sidebar can hide beaten players and
			// the spacing helpers can ignore them.
			eliminated: !!p.eliminated,
		};
	}
	return map;
}

function applyBoardDelta(state) {
	if (!gameState.board) {
		gameState.board = { cells: {}, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
	}
	if (!gameState.board.cells) gameState.board.cells = {};

	for (const change of state.boardChanges) {
		if (!change) continue;
		const x = Number(change.x);
		const z = Number(change.z);
		if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
		const key = `${x},${z}`;
		if (change.value === null || change.value === undefined) {
			delete gameState.board.cells[key];
		} else {
			gameState.board.cells[key] = change.value;
		}
	}

	if (Array.isArray(state.removedCells)) {
		for (const cell of state.removedCells) {
			if (!cell) continue;
			const x = Number(cell.x);
			const z = Number(cell.z);
			if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
			delete gameState.board.cells[`${x},${z}`];
		}
	}

	if (state.boardBounds) {
		gameState.board.minX = state.boardBounds.minX;
		gameState.board.maxX = state.boardBounds.maxX;
		gameState.board.minZ = state.boardBounds.minZ;
		gameState.board.maxZ = state.boardBounds.maxZ;
		gameState.boardBounds = { ...state.boardBounds };
	}
}

function handleRowCleared(payload) {
	try {
		const rows = Array.isArray(payload?.rows) ? payload.rows : [];
		const cols = Array.isArray(payload?.cols) ? payload.cols : [];
		if (rows.length === 0 && cols.length === 0) return;
		// Even when the clear was triggered by someone else, settle our
		// own airborne meshes — pieces on those cells need to land or
		// fall regardless of who finished the line.
		if (Array.isArray(payload?.settleOutcomes)) {
			settleAirbornePieces(payload.settleOutcomes);
		}
		if (!payload?.playerId || String(payload.playerId) !== String(gameState.localPlayerId)) return;
		const parts = [];
		if (rows.length) parts.push(`row${rows.length === 1 ? '' : 's'} ${rows.join(', ')}`);
		if (cols.length) parts.push(`col${cols.length === 1 ? '' : 's'} ${cols.join(', ')}`);
		const iter = Number(payload?.iteration);
		const suffix = Number.isFinite(iter) && iter > 0 ? ` (chain ×${iter + 1})` : '';
		showToastMessage(`Line cleared!${suffix} ${parts.join(' · ')}`);
	} catch (e) {
		console.error('Error handling row_cleared:', e);
	}
}

function handleCellsClearing(payload) {
	try {
		if (!payload || !Array.isArray(payload.cells) || payload.cells.length === 0) return;
		flashCellsBeforeClear(payload.cells, payload.durationMs, gameState);
		// Pieces that are about to be lifted off cleared squares grow
		// wings and hover until the row_cleared / game_update arrives
		// with the settle outcomes.
		if (Array.isArray(payload.airbornePieceIds) && payload.airbornePieceIds.length > 0) {
			liftAirbornePieces(payload.airbornePieceIds);
		}
	} catch (e) {
		console.error('Error handling cells_clearing:', e);
	}
}

function handleChessMoveBroadcast(payload) {
	try {
		const captured = payload?.capturedPiece;
		if (!captured) return;
		const localId = gameState.localPlayerId;
		const localMoved = localId && payload?.playerId && String(payload.playerId) === String(localId);
		const localLost = localId && captured.player && String(captured.player) === String(localId);
		if (!localMoved && !localLost) return;
		const capturedType = String(captured.type || 'piece').toLowerCase();
		// Toast with the *exact* server-authoritative capture cell so the
		// user can tell what really happened — previously the toast was a
		// generic "Your knight was captured!" with no location, leaving
		// the user staring at a random sand dissolve animation wondering
		// where their piece had actually died.
		const pos = captured.position
			|| payload.movedTo
			|| (Number.isFinite(payload.x) ? { x: payload.x, z: payload.z } : null);
		const atSuffix = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
			? ` at (${pos.x}, ${pos.z})`
			: '';
		if (localLost) {
			showToastMessage(
				`Your ${capturedType}${atSuffix} was captured!`,
				{ variant: 'alert', duration: 5000 },
			);
		} else {
			showToastMessage(`Captured ${capturedType}${atSuffix}`, { variant: 'success' });
		}
	} catch (_) { /* toast is best-effort */ }
}

/**
 * Dedicated capture VFX driven by the server's new `chess_capture` event.
 *
 * Plays a flash + ring + particle burst at the server-authoritative cell
 * and (if the captured piece's mesh is still in the chess group) fades
 * the piece out in place. Crucially, we look up the mesh *by id* — if
 * the client has already removed the mesh (a stale game_update can yank
 * it before this event arrives), we still play the VFX at the correct
 * server cell instead of guessing from a now-gone client position.
 *
 * @param {Object} payload See `server/sockets/chess.js`.
 */
function handleChessCapture(payload) {
	try {
		if (!payload || !payload.at) return;
		const x = Number(payload.at.x);
		const z = Number(payload.at.z);
		if (!Number.isFinite(x) || !Number.isFinite(z)) return;

		let pieceMesh = null;
		const capturedId = payload?.capturedPiece?.id;
		if (capturedId) {
			const group = getChessPiecesGroup();
			if (group && Array.isArray(group.children)) {
				for (const child of group.children) {
					if (child?.userData?.id && String(child.userData.id) === String(capturedId)) {
						pieceMesh = child;
						break;
					}
				}
			}
		}
		if (!pieceMesh) {
			pieceMesh = findChessPieceMeshAt(x, z);
		}

		showChessCaptureAnimation(x, z, gameState, { pieceMesh });
	} catch (e) {
		console.error('Error handling chess_capture:', e);
	}
}

/**
 * `chessFailed` recovery — server has told us the requested move could
 * not happen (piece already gone, source cell missing, etc.). The
 * previous client behaviour was to silently swallow the event, which is
 * how the user wound up with a knight that "vanished" from the screen
 * with no explanation. We now:
 *   1. Show a clear, position-free toast describing the reason.
 *   2. Force-clear any in-flight optimistic move (so the visual snap-back
 *      to the canonical server position happens immediately, not after
 *      the broken revert tween times out).
 *   3. Mark the chess piece group for an immediate re-sync, which will
 *      remove a stale piece mesh (if any) using the server-authoritative
 *      chess pieces list that arrived alongside this event.
 */
function handleChessFailed(payload) {
	try {
		const reason = payload && typeof payload.reason === 'string' ? payload.reason : null;
		const message = payload && payload.message ? String(payload.message) : 'Move could not be completed';

		switch (reason) {
			case 'piece_gone':
				showToastMessage(
					'That piece is no longer on the board — the board has been refreshed.',
					{ variant: 'alert', duration: 4500 },
				);
				break;
			case 'desync_repaired':
				showToastMessage(message, { duration: 4500 });
				break;
			case 'rate_limited':
				// Rate limiting is already handled by the ack callback —
				// don't double-toast.
				break;
			default:
				showToastMessage(message, { variant: 'alert', duration: 4000 });
		}

		clearInFlightMove(gameState);
		gameState.processingMove = false;
		gameState._forceUpdate = true;
		clearChessSelection();
	} catch (e) {
		console.error('Error handling chessFailed:', e);
	}
}

function handlePawnDetonation(payload) {
	try {
		if (!payload) return;
		const localId = gameState.localPlayerId;
		const isLocal = localId && payload.playerId && String(payload.playerId) === String(localId);
		if (isLocal) return;
		const pieceType = String(payload.pieceType || 'PAWN').toUpperCase();
		showToastMessage(pieceType === 'KING'
			? 'Opponent detonated their king!'
			: 'Opponent detonated a pawn!');
	} catch (_) { /* toast is best-effort */ }
}

function handleKingDetonation(payload, { showGameOverPulseOverlay }) {
	try {
		if (!payload || !Array.isArray(payload.explosionSequence)) return;

		const layerIntervalMs = Number(payload.layerIntervalMs) > 0
			? Number(payload.layerIntervalMs)
			: 500;

		const sequence = payload.explosionSequence
			.filter(cell => cell && Number.isFinite(cell.x) && Number.isFinite(cell.z))
			.map(cell => {
				const hasDistance = Number.isFinite(cell.distance);
				const fallbackDistance =
					Number.isFinite(payload?.detonatedAt?.x) && Number.isFinite(payload?.detonatedAt?.z)
						? Math.abs(cell.x - payload.detonatedAt.x) + Math.abs(cell.z - payload.detonatedAt.z)
						: 0;
				return {
					x: cell.x,
					z: cell.z,
					distance: hasDistance ? Number(cell.distance) : fallbackDistance,
				};
			});

		const localId = gameState.localPlayerId;
		const isLocalDetonation = localId && payload.playerId && String(payload.playerId) === String(localId);

		// Always announce — every player on the board should see the king
		// going up in a fireball, not just the unlucky one whose king it is.
		try {
			if (typeof showToastMessage === 'function') {
				const reason = String(payload?.reason || '').toLowerCase();
				const isAi = reason.startsWith('ai_');
				if (isLocalDetonation) {
					showToastMessage('Your king has detonated!', { variant: 'alert', duration: 6000 });
				} else if (isAi) {
					showToastMessage('An AI was reduced to a lone king — Lemmings!', { duration: 4500 });
				} else {
					showToastMessage('An opponent detonated their king!', { duration: 4500 });
				}
			}
		} catch (_) { /* toast is best-effort */ }

		if (typeof window.showExplosionAnimation !== 'function') return;

		const layerMap = new Map();
		for (const cell of sequence) {
			if (!layerMap.has(cell.distance)) layerMap.set(cell.distance, []);
			layerMap.get(cell.distance).push(cell);
		}

		const sortedDistances = [...layerMap.keys()]
			.sort((a, b) => b - a)
			.slice(0, KING_ANIM_LIMITS.maxLayers);

		const effectiveInterval = Math.min(
			layerIntervalMs,
			Math.floor(KING_ANIM_LIMITS.maxTotalMs / Math.max(sortedDistances.length, 1))
		);

		sortedDistances.forEach((distance, layerIdx) => {
			let layerCells = layerMap.get(distance);
			if (layerCells.length > KING_ANIM_LIMITS.maxAnimsPerLayer) {
				const step = Math.ceil(layerCells.length / KING_ANIM_LIMITS.maxAnimsPerLayer);
				layerCells = layerCells.filter((_, i) => i % step === 0);
			}
			setTimeout(() => {
				for (const cell of layerCells) {
					try { window.showExplosionAnimation(cell.x, cell.z, gameState); } catch (_) { /* ignore */ }
				}
			}, layerIdx * effectiveInterval);
		});

		if (isLocalDetonation && typeof showGameOverPulseOverlay === 'function') {
			const totalDuration = sortedDistances.length * effectiveInterval;
			setTimeout(() => showGameOverPulseOverlay('GAME OVER'), totalDuration + 180);
		}
	} catch (e) {
		console.error('Error handling king_detonation:', e);
	}
}

// `king_detonation_layer` events are emitted server-side once per layer of
// cell removal so clients that joined mid-detonation can still react. The
// main `king_detonation` event already pre-schedules every layer's
// animation locally, so for already-connected clients we deliberately
// **don't** spawn additional particles here (it would double-up). We just
// observe the event so future extensions (sounds, accessibility cues) have
// a hook.
function handleKingDetonationLayer(_payload) {
	// no-op for now — see comment above.
}

function handleIslandAtRisk(payload) {
	try {
		if (!payload || !payload.playerId) return;
		const localId = gameState.localPlayerId;
		if (!localId || String(payload.playerId) !== String(localId)) return;

		const remainingMs = Number(payload.remainingMs) || 0;
		const remainingMoves = Number.isFinite(payload.remainingMoves) ? payload.remainingMoves : null;
		const hasPiece = !!payload.hasPiece;
		const cellCount = Array.isArray(payload.cells) ? payload.cells.length : 0;
		const thresholdType = payload.thresholdType === 'moves' ? 'moves' : 'ms';

		const subject = hasPiece
			? (cellCount > 1 ? `${cellCount} cells & a piece` : 'A piece')
			: (cellCount > 1 ? `${cellCount} cells` : 'A cell');

		let urgency;
		let message;
		if (thresholdType === 'moves' && remainingMoves !== null) {
			urgency = remainingMoves <= 1 ? 'alert' : undefined;
			const moveWord = remainingMoves === 1 ? 'move' : 'moves';
			message = `${subject} of yours will decay in ${remainingMoves} ${moveWord} — bridge back to your king!`;
		} else {
			urgency = remainingMs <= 15000 ? 'alert' : undefined;
			const secs = Math.max(0, Math.round(remainingMs / 1000));
			message = `${subject} of yours will decay in ~${secs}s — bridge back to your king!`;
		}

		showToastMessage(
			message,
			urgency ? { variant: urgency, duration: 6000 } : { duration: 5000 }
		);
	} catch (e) {
		console.error('Error handling island_at_risk:', e);
	}
}

function handleIslandDecay(payload) {
	try {
		const cells = payload?.cells;
		if (!Array.isArray(cells) || cells.length === 0) return;

		const playSand = (typeof window.showSandDissolveCellAnimation === 'function')
			? window.showSandDissolveCellAnimation
			: null;
		const playExplosion = (typeof window.showExplosionAnimation === 'function')
			? window.showExplosionAnimation
			: null;
		if (!playSand && !playExplosion) return;

		const now = Date.now();
		// Sweep stale dedupe entries so the map doesn't grow forever.
		for (const [key, ts] of recentIslandDecayPlaybacks) {
			if (now - ts > ISLAND_DECAY_LIMITS.dedupeMs * 2) {
				recentIslandDecayPlaybacks.delete(key);
			}
		}

		const validCells = cells.filter(cell => {
			if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.z)) return false;
			const key = `${cell.x},${cell.z}`;
			const last = recentIslandDecayPlaybacks.get(key);
			if (last && now - last < ISLAND_DECAY_LIMITS.dedupeMs) return false;
			return true;
		});
		if (validCells.length === 0) return;

		const capped = validCells.length > ISLAND_DECAY_LIMITS.maxAnims
			? validCells.filter((_, i) => i % Math.ceil(validCells.length / ISLAND_DECAY_LIMITS.maxAnims) === 0)
			: validCells;

		const stagger = Math.min(
			ISLAND_DECAY_LIMITS.staggerMs,
			Math.floor(ISLAND_DECAY_LIMITS.maxTotalMs / Math.max(capped.length, 1))
		);

		capped.forEach((cell, idx) => {
			recentIslandDecayPlaybacks.set(`${cell.x},${cell.z}`, now + idx * stagger);
			setTimeout(() => {
				try {
					if (playSand) playSand(cell.x, cell.z, gameState);
					else if (playExplosion) playExplosion(cell.x, cell.z, gameState);
				} catch (_) { /* ignore animation errors */ }
			}, idx * stagger);
		});
	} catch (e) {
		console.error('Error handling island_decay:', e);
	}
}

function handleNoValidChessMoves(payload) {
	try {
		if (!payload?.playerId || String(payload.playerId) !== String(gameState.localPlayerId)) return;
		clearChessSelection();
		cancelSkipChessTimer();
		cancelSkipDropTimer();
		gameState.processingMove = false;
		showToastMessage('No chess moves available — dropping next piece');
		gameState.turnPhase = 'tetris';
		updateGameStatusDisplay(gameState);
		updateNextPieceHint(gameState);
	} catch (e) {
		console.error('Error handling no_valid_chess_moves:', e);
	}
}

function handleNewTetromino(payload, { renderCurrentTetromino }) {
	try {
		const tetromino = payload?.tetromino;
		if (!tetromino) return;
		clearChessSelection();
		cancelSkipChessTimer();
		cancelSkipDropTimer();
		gameState.processingMove = false;
		const tetrominoType = tetromino.type || tetromino.pieceType;
		const newTetromino = tetrominoModule.initializeNewTetromino(gameState, tetrominoType);
		gameState.currentTetromino = newTetromino || tetrominoModule.initializeNextTetromino(gameState);
		gameState.turnPhase = 'tetris';
		if (typeof renderCurrentTetromino === 'function') renderCurrentTetromino();
		updateGameStatusDisplay(gameState);
		updateNextPieceHint(gameState);
	} catch (e) {
		console.error('Error handling new_tetromino:', e);
	}
}

function handlePawnPromotionAvailable(payload) {
	try {
		const { pieceId, position } = payload || {};
		if (!pieceId) return;
		showPawnPromotionDialog(pieceId, position);
	} catch (e) {
		console.error('Error handling pawn_promotion_available:', e);
	}
}

function handleKingCaptured(payload) {
	try {
		const { captorId, captorName, defeatedId, defeatedName, defeatedColor, inheritedPawnCount } = payload || {};
		if (!captorId || !defeatedId) return;
		showKingBattleOverlay(captorId, captorName, defeatedId, defeatedName, defeatedColor, inheritedPawnCount);
	} catch (e) {
		console.error('Error handling king_captured:', e);
	}
}

function handleSuicidalPawn(payload) {
	try {
		const { x, z, remaining } = payload || {};
		if (x === undefined || z === undefined) return;
		if (typeof window.showExplosionAnimation === 'function') {
			window.showExplosionAnimation(x, z, gameState);
		}
		if (remaining === 0) {
			showToastMessage('All inherited pawns have self-destructed!');
		}
	} catch (e) {
		console.error('Error handling suicidal_pawn:', e);
	}
}

function handleKingDuelStart(payload) {
	try {
		const { duelId, gridCols, gridRows, opponentName } = payload || {};
		if (!duelId) return;
		showKingDuelOverlay(duelId, gridCols || 4, gridRows || 2, opponentName || 'Opponent');
	} catch (e) {
		console.error('Error handling king_duel_start:', e);
	}
}

function handleKingDuelAnnounced(payload) {
	try {
		const { player1Name, player2Name } = payload || {};
		showToastMessage(
			`King's Duel! ${player1Name} vs ${player2Name} — both captured each other's king!`,
			5000,
		);
	} catch (e) {
		console.error('Error handling king_duel_announced:', e);
	}
}

/**
 * Wire up every NetworkManager event the renderer cares about.
 *
 * @param {Object} hooks
 * @param {Function} [hooks.showGameOverPulseOverlay]
 * @param {Function} [hooks.renderCurrentTetromino]
 */
export function setupNetworkEvents(hooks = {}) {
	if (networkEventsInitialised) return;
	networkEventsInitialised = true;

	if (!NetworkManager || typeof NetworkManager.on !== 'function') {
		console.warn('setupNetworkEvents: NetworkManager not available');
		return;
	}

	NetworkManager.on('game_state', (payload) => {
		const state = payload?.state || payload;
		if (!state || typeof state !== 'object') return;
		if (payload && Array.isArray(payload.players)) {
			state.players = normalisePlayersArrayToMap(payload.players);
		}
		dispatchGameUpdate(state);
	});

	NetworkManager.on('game_update', (payload) => {
		const state = payload?.state || payload;
		if (!state || typeof state !== 'object') return;

		if (Array.isArray(state.players)) {
			state.players = normalisePlayersArrayToMap(state.players);
		}

		if (state.fullUpdate === false && Array.isArray(state.boardChanges)) {
			applyBoardDelta(state);
			dispatchGameUpdate({ ...state, board: gameState.board });
			return;
		}
		dispatchGameUpdate(state);
	});

	NetworkManager.on('player_joined', (payload) => {
		if (!payload || !Array.isArray(payload.players)) return;
		dispatchGameUpdate({ players: normalisePlayersArrayToMap(payload.players) });
	});

	NetworkManager.on('player_left', (payload) => {
		if (!payload || !Array.isArray(payload.players)) return;
		dispatchGameUpdate({ players: normalisePlayersArrayToMap(payload.players) });
	});

	NetworkManager.on('player_id', (payload) => {
		if (!payload?.playerId) return;
		dispatchGameUpdate({ localPlayerId: payload.playerId });
	});

	const safe = (label, fn) => (payload) => {
		try { fn(payload); } catch (e) { console.error(`Error handling ${label}:`, e); }
	};

	NetworkManager.on('row_cleared', handleRowCleared);
	NetworkManager.on('cells_clearing', handleCellsClearing);
	NetworkManager.on('chess_move', handleChessMoveBroadcast);
	NetworkManager.on('chess_capture', handleChessCapture);
	NetworkManager.on('chessFailed', handleChessFailed);
	NetworkManager.on('pawn_detonation', handlePawnDetonation);
	NetworkManager.on('king_detonation', (payload) => handleKingDetonation(payload, hooks));
	NetworkManager.on('king_detonation_layer', handleKingDetonationLayer);
	NetworkManager.on('island_decay', handleIslandDecay);
	NetworkManager.on('island_at_risk', handleIslandAtRisk);
	NetworkManager.on('no_valid_chess_moves', handleNoValidChessMoves);
	NetworkManager.on('new_tetromino', (payload) => handleNewTetromino(payload, hooks));
	NetworkManager.on('pawn_promotion_available', handlePawnPromotionAvailable);
	NetworkManager.on('king_captured', handleKingCaptured);
	NetworkManager.on('suicidal_pawn', handleSuicidalPawn);
	NetworkManager.on('king_duel_start', handleKingDuelStart);
	NetworkManager.on('king_duel_round_result', safe('king_duel_round_result', handleDuelRoundResult));
	NetworkManager.on('king_duel_new_round', safe('king_duel_new_round', handleDuelNewRound));
	NetworkManager.on('king_duel_result', safe('king_duel_result', showKingDuelResult));
	NetworkManager.on('king_duel_announced', handleKingDuelAnnounced);
	NetworkManager.on('activity_event', (payload) => pushActivityEvent(payload));
	NetworkManager.on('activity_log_snapshot', (payload) => loadActivityLogSnapshot(payload));

	try {
		ensureActivityLogUI();
		window.gameCore = window.gameCore || {};
		window.gameCore.toggleActivityLog = toggleActivityLog;
	} catch (error) {
		console.warn('[NetworkEvents] Failed to set up activity log UI:', error);
	}

	let hadConnection = false;

	NetworkManager.on('disconnect', () => {
		showToastMessage('Connection lost — reconnecting…', 4000);
	});

	NetworkManager.on('connect', () => {
		if (!hadConnection) {
			hadConnection = true;
		} else {
			showToastMessage('Reconnected!', 2000);
			if (gameState.localPlayerId && typeof NetworkManager.joinGame === 'function') {
				NetworkManager.joinGame().catch(() => {});
			}
		}
		// Fetch activity log snapshot every (re)connect so a returning
		// player isn't staring at a stale empty panel.
		try {
			NetworkManager.sendMessage('get_activity_log', null);
		} catch (error) {
			// not connected yet; the snapshot will arrive via the
			// `activity_log_snapshot` broadcast on initial join.
		}
	});
}
