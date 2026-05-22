/**
 * Chess Interaction Module
 *
 * Handles chess piece selection, raycasting, valid-move highlighting,
 * move animation, and server communication for chess moves.
 */

import {
	getTHREE, getGameState,
	getScene, getCamera, getRenderer,
	getBoardGroup, getChessPiecesGroup,
	getRaycaster, getMouse
} from './gameContext.js';
import { boardFunctions } from './boardFunctions.js';
import { highlightSinglePiece, clearSinglePieceHighlight } from './pieceHighlightManager.js';
import { updateUnifiedPlayerBar } from './unifiedPlayerBar.js';
import { translatePosition } from './centreBoardMarker.js';
import * as NetworkManager from './utils/networkManager.js';
import { updateGameStatusDisplay } from './createLoadingIndicator.js';
import * as tetrominoModule from './tetromino.js';
import {
	cancelSkipChessTimer,
	ensureActionStack,
	positionUnderNextPiece,
} from './skipChessButton.js';
import { updateNextPieceHint } from './tetromino/nextPiece.js';
import { showToastMessage } from './showToastMessage.js';

/**
 * In-flight chess move tracker.
 *
 * Set when the user clicks to move (and the optimistic animation starts),
 * cleared when the server ack arrives (success or failure) or the move is
 * abandoned via `chessFailed`.
 *
 * The `updateChessPieces` reconciler reads this from `gameState` so it
 * can keep the moving piece's mesh visible during the optimistic
 * animation even if a concurrent `game_update` removes the piece from
 * `chessPieces`. Without this protection the mesh blinked out the
 * moment the server-side capture arrived, which is the "knight just
 * disappeared" symptom the user reported.
 */
export function setInFlightMove(gameState, move) {
	if (!gameState) return;
	gameState.inFlightMove = move || null;
}

export function clearInFlightMove(gameState) {
	if (!gameState) return;
	gameState.inFlightMove = null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function findChessPieceMeshAt(x, z) {
	const chessPiecesGroup = getChessPiecesGroup();
	if (!chessPiecesGroup) return null;

	for (const child of chessPiecesGroup.children) {
		const userData = child.userData;
		if (!userData) continue;
		if (userData.type === 'chessPiece' || userData.pieceType) {
			const pos = userData.position;
			if (pos && Number(pos.x) === Number(x) && Number(pos.z) === Number(z)) {
				return child;
			}
		}
	}
	return null;
}

// ── Raycasting ──────────────────────────────────────────────────────────────

export function performRaycast() {
	const raycaster = getRaycaster();
	const camera = getCamera();
	const mouse = getMouse();
	const boardGroup = getBoardGroup();
	const chessPiecesGroup = getChessPiecesGroup();
	const scene = getScene();
	const gameState = getGameState();

	if (!raycaster || !camera) return;
	if (!gameState || gameState.turnPhase !== 'chess') return;

	raycaster.setFromCamera(mouse, camera);

	// Check move highlights first
	if (window.moveHighlightsGroup && window.moveHighlightsGroup.children.length > 0) {
		const moveHighlights = raycaster.intersectObjects(window.moveHighlightsGroup.children, true);
		if (moveHighlights.length > 0) {
			const highlight = moveHighlights[0].object;
			if (highlight.userData && highlight.userData.moveTarget) {
				moveChessPieceToCell(highlight.userData.x, highlight.userData.z);
				return;
			}
		}
	}

	const pieceIntersections = chessPiecesGroup
		? raycaster.intersectObjects([chessPiecesGroup], true)
		: [];
	const boardIntersections = boardGroup
		? raycaster.intersectObjects([boardGroup], true)
		: [];

	const PIECE_TYPES = ['chess', 'chessPiece', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'PAWN'];
	const resolveParentHit = (intersections, matcher) => {
		for (let i = 0; i < intersections.length; i++) {
			let parentObj = intersections[i].object;
			while (parentObj.parent &&
				parentObj.parent !== chessPiecesGroup &&
				parentObj.parent !== boardGroup &&
				parentObj.parent !== scene) {
				parentObj = parentObj.parent;
			}
			if (matcher(parentObj)) return parentObj;
		}
		return null;
	};

	let chessPieceHit = resolveParentHit(
		pieceIntersections,
		(obj) => obj.userData && (PIECE_TYPES.includes(obj.userData.type) || obj.userData.pieceType)
	);
	const cellHit = resolveParentHit(
		boardIntersections,
		(obj) => obj.userData && obj.userData.type === 'cell'
	);

	// If both board cell and piece hits exist but disagree, prefer the piece on the clicked cell.
	// This fixes occasional "one square ahead/behind" picks from overlapping hitboxes.
	if (cellHit?.userData?.position) {
		const cellPiece = findChessPieceMeshAt(cellHit.userData.position.x, cellHit.userData.position.z);
		if (cellPiece) {
			if (!chessPieceHit || chessPieceHit !== cellPiece) chessPieceHit = cellPiece;
		}
	}

	if (chessPieceHit) {
		if (!gameState.processingMove) {
			const piecePlayer = chessPieceHit.userData.player;
			const isLocalPlayerPiece = String(piecePlayer) === String(gameState.localPlayerId);
			if (isLocalPlayerPiece) {
				selectChessPiece(chessPieceHit);
			} else {
				showPieceInfo(chessPieceHit);
			}
		}
	} else if (cellHit) {
		const cellPosition = cellHit.userData.position;
		if (gameState.selectedChessPiece && !gameState.processingMove) {
			const isValidMove = (gameState.validMoves || []).some(
				m => m.x === cellPosition.x && m.z === cellPosition.z,
			);
			if (isValidMove) {
				moveChessPieceToCell(cellPosition.x, cellPosition.z);
			} else {
				// Clicking an empty / non-target cell while a piece is
				// selected should cancel the selection (and dismiss any
				// pending detonate button), so the player isn't locked
				// out of clicking elsewhere on the board.
				clearChessSelection();
			}
		}
	} else if (gameState.selectedChessPiece && !gameState.processingMove) {
		// Click on empty space (sky / off-board) — treat as deselect.
		clearChessSelection();
	}
}

// ── Hover ───────────────────────────────────────────────────────────────────

let _hoverLastRun = 0;
const HOVER_THROTTLE_MS = 80;
let _pieceInfoPopup = null;

export function handleMouseHover() {
	const now = performance.now();
	if (now - _hoverLastRun < HOVER_THROTTLE_MS) return;
	_hoverLastRun = now;

	const mouse = getMouse();
	const raycaster = getRaycaster();
	const camera = getCamera();
	const chessPiecesGroup = getChessPiecesGroup();
	const boardGroup = getBoardGroup();
	const scene = getScene();
	const gameState = getGameState();

	if (!mouse || !raycaster || !chessPiecesGroup) return;

	raycaster.setFromCamera(mouse, camera);
	const intersects = raycaster.intersectObjects([chessPiecesGroup], true);

	if (gameState.hoveredPlayer && gameState.hoveredPlayer !== gameState.selectedHoveredPlayer) {
		gameState.hoveredPlayer = null;
		if (!_pieceInfoPopup) _pieceInfoPopup = document.getElementById('piece-info-popup');
		if (_pieceInfoPopup) _pieceInfoPopup.style.opacity = '0';
	}

	if (intersects.length > 0) {
		const intersectedObject = intersects[0].object;
		let parentPiece = intersectedObject;
		while (parentPiece.parent &&
			parentPiece.parent !== chessPiecesGroup &&
			parentPiece.parent !== boardGroup &&
			parentPiece.parent !== scene) {
			parentPiece = parentPiece.parent;
		}

		if (parentPiece.userData &&
			(parentPiece.userData.type === 'chess' || parentPiece.userData.pieceType ||
				parentPiece.userData.type === 'chessPiece')) {
			const piecePlayer = parentPiece.userData.player;
			if (String(piecePlayer) !== String(gameState.selectedHoveredPlayer)) {
				gameState.hoveredPlayer = piecePlayer;
				if (String(piecePlayer) !== String(gameState.localPlayerId)) {
					showPieceInfoPopup(parentPiece);
				}
			}
		}
	}
}

// ── Selection ───────────────────────────────────────────────────────────────

export function selectChessPiece(piece) {
	const gameState = getGameState();
	if (!gameState || gameState.turnPhase !== 'chess') return;

	clearChessSelection();
	gameState.selectedChessPiece = piece;
	gameState.selectedHoveredPlayer = piece.userData.player;
	highlightSinglePiece(piece, { mode: 'selected' });
	showValidMoves(piece);
	updateUnifiedPlayerBar(gameState);

	const pieceType = String(piece.userData.pieceType || piece.userData.type || '').toUpperCase();
	const isOwn = String(piece.userData.player) === String(gameState.currentPlayer);
	const isLastPieceKing = (
		pieceType === 'KING' &&
		isOwn &&
		isOnlyRemainingPiece(piece.userData.id, piece.userData.player)
	);
	if ((pieceType === 'PAWN' && isOwn) || isLastPieceKing) {
		showDetonateButton(piece);
	}
}

export function showValidMoves(piece) {
	if (!piece || !piece.userData) return;
	const gameState = getGameState();

	const pieceData = {
		id: piece.userData.id || `piece_${Date.now()}`,
		type: piece.userData.pieceType || piece.userData.type,
		player: piece.userData.player,
		position: {
			x: piece.userData.position?.x ?? 0,
			z: piece.userData.position?.z ?? 0
		},
		hasMoved: !!piece.userData.hasMoved,
		orientation: Number.isFinite(piece.userData.orientation) ? piece.userData.orientation : 0
	};

	const validMoves = boardFunctions.getChessPieceMoveSets(gameState, pieceData);
	gameState.validMoves = validMoves;
	highlightValidMoves(validMoves);
}

export function highlightValidMoves(validMoves) {
	const boardGroup = getBoardGroup();
	const scene = getScene();
	const gameState = getGameState();
	const THREE = getTHREE();

	if (!validMoves || !Array.isArray(validMoves) || !boardGroup || !THREE) return;

	const getChessPieceAt = (x, z) => {
		const pieces = gameState?.chessPieces;
		if (!Array.isArray(pieces)) return null;
		for (const p of pieces) {
			if (!p) continue;
			const pos = p.position || p;
			if (Number(pos.x) === Number(x) && Number(pos.z) === Number(z)) return p;
		}
		return null;
	};

	clearMoveHighlights();

	if (!window.moveHighlightsGroup) {
		window.moveHighlightsGroup = new THREE.Group();
		window.moveHighlightsGroup.name = 'moveHighlights';
		scene.add(window.moveHighlightsGroup);
	}

	if (!window._moveHighlightCache) {
		window._moveHighlightCache = {
			geo: new THREE.RingGeometry(0.18, 0.42, 32),
			matMove: new THREE.MeshBasicMaterial({
				color: 0x33FF66, transparent: true, opacity: 0.7,
				side: THREE.DoubleSide, depthTest: false, depthWrite: false,
			}),
			matCapture: new THREE.MeshBasicMaterial({
				color: 0xFF3355, transparent: true, opacity: 0.85,
				side: THREE.DoubleSide, depthTest: false, depthWrite: false,
			}),
		};
	}
	const hlCache = window._moveHighlightCache;

	validMoves.forEach(move => {
		const absPos = translatePosition({ x: move.x, z: move.z }, gameState, true);
		const selectedPlayer = gameState.selectedChessPiece?.userData?.player;
		const occupant = getChessPieceAt(move.x, move.z);
		const isCapture = !!(occupant && selectedPlayer !== undefined && String(occupant.player) !== String(selectedPlayer));

		const geometry = hlCache.geo;
		const material = isCapture ? hlCache.matCapture : hlCache.matMove;

		const highlight = new THREE.Mesh(geometry, material);
		highlight.name = 'moveHighlight';
		highlight.renderOrder = 999;
		highlight.rotation.x = -Math.PI / 2;
		highlight.position.set(absPos.x, 0.46, absPos.z);

		highlight.userData = { moveTarget: true, x: move.x, z: move.z, isCapture };

		if (window.TWEEN) {
			const scaleData = { value: 1.0 };
			const tween = new TWEEN.Tween(scaleData)
				.to({ value: 1.12 }, 650)
				.easing(TWEEN.Easing.Quadratic.InOut)
				.yoyo(true)
				.repeat(Infinity)
				.onUpdate(() => { highlight.scale.set(scaleData.value, scaleData.value, 1); })
				.start();
			highlight.userData.tween = tween;
		}

		window.moveHighlightsGroup.add(highlight);
	});
}

export function clearMoveHighlights() {
	if (!window.moveHighlightsGroup) return;

	while (window.moveHighlightsGroup.children.length > 0) {
		const highlight = window.moveHighlightsGroup.children[0];
		if (highlight?.userData?.tween && typeof highlight.userData.tween.stop === 'function') {
			try { highlight.userData.tween.stop(); } catch (_) {}
		}
		window.moveHighlightsGroup.remove(highlight);
	}
}

export function clearChessSelection() {
	const gameState = getGameState();

	if (gameState.selectedChessPiece) {
		try { clearSinglePieceHighlight(gameState.selectedChessPiece); } catch (_) {}
	}

	gameState.selectedChessPiece = null;
	gameState.selectedHoveredPlayer = null;
	gameState.validMoves = [];
	clearMoveHighlights();
	hideDetonateButton();
}

// ── Movement ────────────────────────────────────────────────────────────────

export function moveChessPieceToCell(x, z) {
	const gameState = getGameState();
	if (!gameState.selectedChessPiece || !gameState.validMoves) return;

	const isValidMove = gameState.validMoves.some(move => move.x === x && move.z === z);
	if (!isValidMove) return;

	const piece = gameState.selectedChessPiece;
	const pieceId = piece.userData.id || `piece_${Date.now()}`;
	const pieceData = {
		id: pieceId,
		type: piece.userData.pieceType || piece.userData.type,
		player: piece.userData.player,
		x: piece.userData.position?.x || 0,
		z: piece.userData.position?.z || 0
	};

	const originalX = pieceData.x;
	const originalZ = pieceData.z;
	gameState.processingMove = true;

	// Track the in-flight optimistic move so `updateChessPieces` doesn't
	// rip the moving mesh out from underneath us if a `game_update`
	// arrives while the tween is running. This was the root cause of
	// the user's "knight just disappeared" report — an enemy capture
	// landed mid-animation and the mesh was removed before the user
	// even saw it move.
	setInFlightMove(gameState, {
		pieceId,
		fromX: originalX,
		fromZ: originalZ,
		toX: x,
		toZ: z,
		startedAt: Date.now(),
	});

	clearMoveHighlights();

	animateChessPieceMove(piece, originalX, originalZ, x, z, () => {
		sendChessMoveToServer(pieceData, x, z, (success, responseData) => {
			gameState.processingMove = false;
			clearChessSelection();

			if (success) {
				updateGameStateAfterChessMove(pieceData, x, z);
				gameState.turnPhase = 'tetris';
				cancelSkipChessTimer();
				updateGameStatusDisplay();
				updateNextPieceHint(gameState);

				if (!gameState.currentTetromino) {
					const spawned = tetrominoModule.initializeNextTetromino(gameState);
					if (spawned) {
						gameState.currentTetromino = spawned;
						gameState.currentTetromino.heightAboveBoard = gameState.TETROMINO_START_HEIGHT;
						tetrominoModule.renderTetromino(gameState);
					}
				}

				clearInFlightMove(gameState);
				showTemporaryMessage('Move successful.', 'success');
				return;
			}

			handleChessMoveRejection({
				gameState,
				piece,
				pieceId,
				originalX,
				originalZ,
				attemptedX: x,
				attemptedZ: z,
				responseData,
			});
		});
	});
}

/**
 * Robust rejection handler — called when the server ack returns
 * `success: false`. Cleans up the optimistic state, surfaces a clear
 * message, and either reverts the visual or surrenders to the server
 * snapshot (when the piece is already gone). Centralised so the rules
 * are visible in one place instead of being scattered across the
 * promise chain.
 */
function handleChessMoveRejection({
	gameState, piece, pieceId, originalX, originalZ,
	attemptedX, attemptedZ, responseData,
}) {
	const reason = responseData?.reason || (responseData?.error === 'rate_limited' ? 'rate_limited' : null);
	const retryAfterMs = Number(responseData?.retryAfterMs || 0);

	if (reason === 'rate_limited') {
		// Rate-limited rejections still hold the piece at the destination
		// briefly while the user reads the warning; we revert *and* clear
		// the in-flight pin so the next legitimate move starts clean.
		animateChessPieceMove(piece, attemptedX, attemptedZ, originalX, originalZ, () => {
			clearInFlightMove(gameState);
		});
		const seconds = retryAfterMs > 0 ? Math.max(0.1, Math.ceil(retryAfterMs / 100) / 10) : null;
		showTemporaryMessage(
			seconds ? `Too fast. Try again in ${seconds}s.` : 'Too fast. Please wait a moment.',
			'error',
		);
		return;
	}

	const pieceIsStillKnown = Array.isArray(gameState?.chessPieces)
		&& gameState.chessPieces.some(p => p && String(p.id) === String(pieceId));

	if (reason === 'piece_gone' || !pieceIsStillKnown) {
		// The piece has been removed from world.chessPieces server-side
		// (captured or decayed) — there's nothing to revert to. Drop the
		// optimistic mesh by clearing the in-flight pin and letting
		// updateChessPieces sync to the canonical server state.
		clearInFlightMove(gameState);
		gameState._forceUpdate = true;
		try { showToastMessage(
			'That piece was already gone — the board has been refreshed.',
			{ variant: 'alert', duration: 4500 },
		); } catch (_) { /* toast best-effort */ }
		return;
	}

	if (reason === 'desync_repaired' || reason === 'destination_missing') {
		// Server has restored the source cell or removed the target
		// from under us; revert visually and force a fresh board so
		// the user's next click isn't against the stale highlight.
		animateChessPieceMove(piece, attemptedX, attemptedZ, originalX, originalZ, () => {
			clearInFlightMove(gameState);
			gameState._forceUpdate = true;
		});
		const message = reason === 'destination_missing'
			? 'That square is gone — board refreshed. Please pick a different target.'
			: (responseData?.error || 'Move could not be applied — please try again.');
		try { showToastMessage(message, { duration: 4500 }); } catch (_) { /* toast best-effort */ }
		return;
	}

	// Generic validation failure — revert in place.
	animateChessPieceMove(piece, attemptedX, attemptedZ, originalX, originalZ, () => {
		clearInFlightMove(gameState);
	});
	// Translate stable reason codes into friendly toasts so the user
	// has some idea WHY a move was refused beyond the catch-all
	// "Invalid chess move". The same reasons are also recorded in the
	// Recent Activity panel server-side.
	const reasonToText = {
		bad_geometry: 'That square isn\'t reachable for this piece.',
		path_blocked: 'Path is blocked by another piece.',
		path_off_board: 'Path passes through empty space.',
		friendly_blocker: 'That square has one of your own pieces.',
		same_square: 'Cannot move to the same square.',
		not_your_piece: 'That piece belongs to someone else.',
	};
	const friendly = reason && reasonToText[reason];
	const errorMessage = friendly
		|| (responseData?.error ? `Move failed: ${responseData.error}` : 'Move failed. Please try again.');
	showTemporaryMessage(errorMessage, 'error');
}

export function animateChessPieceMove(piece, _fromX, _fromZ, toX, toZ, onComplete) {
	const gameState = getGameState();

	if (!piece || !window.TWEEN) {
		updatePiecePosition(piece, toX, toZ);
		if (onComplete) onComplete();
		return;
	}

	const endAbs = translatePosition({ x: toX, z: toZ }, gameState, true);
	const startPos = { x: piece.position.x, y: piece.position.y, z: piece.position.z };
	const endPos = { x: endAbs.x, y: piece.position.y + 0.6, z: endAbs.z };
	const finalPos = { x: endAbs.x, y: piece.position.y, z: endAbs.z };

	const duration = 500;

	const upTween = new TWEEN.Tween(startPos)
		.to(endPos, duration / 2)
		.easing(TWEEN.Easing.Quadratic.Out)
		.onUpdate(() => { piece.position.set(startPos.x, startPos.y, startPos.z); });

	const downTween = new TWEEN.Tween(endPos)
		.to(finalPos, duration / 2)
		.easing(TWEEN.Easing.Bounce.Out)
		.onUpdate(() => { piece.position.set(endPos.x, endPos.y, endPos.z); })
		.onComplete(() => {
			if (piece.userData) piece.userData.position = { x: toX, z: toZ };
			if (onComplete) onComplete();
		});

	upTween.chain(downTween);
	upTween.start();
}

export function updatePiecePosition(piece, x, z) {
	if (!piece) return;
	const gameState = getGameState();
	const abs = translatePosition({ x, z }, gameState, true);
	piece.position.set(abs.x, piece.position.y, abs.z);
	if (piece.userData) piece.userData.position = { x, z };
}

function sendChessMoveToServer(piece, toX, toZ, callback) {
	if (!NetworkManager || typeof NetworkManager.submitChessMove !== 'function') {
		callback(false, { error: 'Network manager not available' });
		return;
	}

	const moveData = { pieceId: piece.id, targetPosition: { x: toX, z: toZ } };

	NetworkManager.submitChessMove(moveData)
		.then(data => callback(true, data))
		.catch(error => {
			console.error('Error sending chess move:', error);
			const retryAfterMs = error?.retryAfterMs || error?.details?.retryAfterMs;
			callback(false, {
				error: error?.message || String(error),
				reason: error?.reason,
				retryAfterMs
			});
		});
}

function updateGameStateAfterChessMove(piece, toX, toZ) {
	const gameState = getGameState();

	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		const idx = gameState.chessPieces.findIndex(p => p && p.id === piece.id);
		if (idx >= 0 && gameState.chessPieces[idx]?.position) {
			gameState.chessPieces[idx].position.x = toX;
			gameState.chessPieces[idx].position.z = toZ;
		}
	}

	gameState.moveCount = (typeof gameState.moveCount === 'number') ? gameState.moveCount + 1 : 1;
}

// ── Pawn detonation ─────────────────────────────────────────────────────────

let activeDetonationCountdown = null;

function isOnlyRemainingPiece(pieceId, playerId) {
	const gameState = getGameState();
	const pieces = Array.isArray(gameState?.chessPieces) ? gameState.chessPieces : [];
	const ownPieces = pieces.filter(
		p => p && String(p.player) === String(playerId)
	);
	return ownPieces.length === 1 && String(ownPieces[0]?.id) === String(pieceId);
}

function showDetonateButton(piece) {
	hideDetonateButton();
	const btn = document.createElement('button');
	btn.id = 'pawn-detonate-btn';

	Object.assign(btn.style, {
		padding: '8px 12px',
		background: 'rgba(220,50,50,0.9)', color: '#fff',
		border: '2px solid #ff6666', borderRadius: '6px',
		fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
		boxShadow: '0 0 12px rgba(255,50,50,0.6)',
		fontFamily: 'serif', letterSpacing: '1px',
		textTransform: 'uppercase',
		pointerEvents: 'auto',
	});
	const pieceType = String(piece?.userData?.pieceType || piece?.userData?.type || '').toUpperCase();
	btn.textContent = pieceType === 'KING' ? 'Detonate King' : 'Detonate Pawn';
	btn.addEventListener('click', () => {
		const id = piece.userData.id;
		if (!id) return;
		hideDetonateButton();
		clearChessSelection();
		requestPawnDetonation(id);
	});
	const stack = ensureActionStack();
	positionUnderNextPiece(stack);
	stack.appendChild(btn);
}

function hideDetonateButton() {
	const existing = document.getElementById('pawn-detonate-btn');
	if (existing) existing.remove();
}

function requestPawnDetonation(pieceId) {
	if (!NetworkManager || typeof NetworkManager.detonatePawn !== 'function') {
		showTemporaryMessage('Detonation unavailable.', 'error');
		return;
	}
	if (activeDetonationCountdown) return;

	const pieceMesh = findChessPieceMeshAt(
		...(function () {
			const gameState = getGameState();
			const cp = (gameState.chessPieces || []).find(p => p && p.id === pieceId);
			return cp ? [cp.position.x, cp.position.z] : [null, null];
		})()
	);

	activeDetonationCountdown = runDetonationCountdown(pieceMesh, {
		onComplete: () => {
			activeDetonationCountdown = null;
			NetworkManager.detonatePawn(pieceId)
				.then(result => {
					if (result && result.success) {
						runDetonationExplosion(pieceMesh);
						const gameState = getGameState();
						const piecePos = pieceMesh?.userData?.position
							? { ...pieceMesh.userData.position }
							: null;
						if (Array.isArray(gameState?.chessPieces)) {
							gameState.chessPieces = gameState.chessPieces.filter(
								p => p && String(p.id) !== String(pieceId)
							);
						}
						if (piecePos && gameState?.board?.cells) {
							delete gameState.board.cells[`${piecePos.x},${piecePos.z}`];
						}
						if (pieceMesh?.parent) {
							pieceMesh.parent.remove(pieceMesh);
						}
						if (typeof window.updateBoardVisuals === 'function') {
							window.updateBoardVisuals();
						}
						clearChessSelection();
						
						if (result.endedGame || String(result.pieceType || '').toUpperCase() === 'KING') {
							showTemporaryMessage('King detonated - your territory has collapsed.', 'info');
							updateGameStatusDisplay();
							return;
						}
						
						gameState.turnPhase = 'tetris';
						updateGameStatusDisplay();
						if (!gameState.currentTetromino) {
							const spawned = tetrominoModule.initializeNextTetromino(gameState);
							if (spawned) {
								gameState.currentTetromino = spawned;
								gameState.currentTetromino.heightAboveBoard = gameState.TETROMINO_START_HEIGHT;
								tetrominoModule.renderTetromino(gameState);
							}
						}
					} else {
						showTemporaryMessage(result?.error || 'Detonation failed.', 'error');
					}
				})
				.catch(err => {
					console.error('Piece detonation error:', err);
					showTemporaryMessage('Detonation failed.', 'error');
				});
		},
		onCancel: () => {
			activeDetonationCountdown = null;
			showTemporaryMessage('Detonation cancelled.', 'info');
			if (pieceMesh?.userData?.player !== undefined) {
				selectChessPiece(pieceMesh);
			}
		}
	});
}

/**
 * Lemmings-style pawn detonation countdown.
 * Turns the pawn top green, shows a 5..1 countdown, then "Oh no!"
 */
function runDetonationCountdown(pieceMesh, onComplete) {
	const THREE = getTHREE();
	const gameState = getGameState();
	const callbacks = (typeof onComplete === 'object' && onComplete !== null) ? onComplete : { onComplete };
	if (!THREE || !pieceMesh) {
		if (typeof callbacks.onComplete === 'function') callbacks.onComplete();
		return null;
	}

	let timeoutId = null;
	let finished = false;

	const greenMat = new THREE.MeshBasicMaterial({ color: 0x44FF44 });
	const topParts = [];
	pieceMesh.traverse(child => {
		if (child.isMesh && child.position && child.position.y > 0.3 &&
			child.name !== 'raycast-hitbox' && child.name !== 'hover-highlight' &&
			child.name !== 'selected-highlight' && child.name !== 'selected-indicator') {
			topParts.push({ mesh: child, origMat: child.material });
			child.material = greenMat;
		}
	});

	const labelCanvas = document.createElement('canvas');
	labelCanvas.width = 256;
	labelCanvas.height = 128;
	const ctx = labelCanvas.getContext('2d');
	const texture = new THREE.CanvasTexture(labelCanvas);
	const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
	const sprite = new THREE.Sprite(spriteMat);
	sprite.scale.set(1.9, 0.95, 1);
	sprite.position.y = 1.85;
	sprite.name = 'detonation-label';
	pieceMesh.add(sprite);

	const cancelBtn = document.createElement('button');
	cancelBtn.id = 'pawn-detonate-cancel-btn';
	Object.assign(cancelBtn.style, {
		position: 'fixed',
		bottom: '34px',
		left: '50%',
		transform: 'translateX(-50%)',
		padding: '8px 18px',
		background: 'rgba(20,20,20,0.92)',
		color: '#fff',
		border: '2px solid #55ff55',
		borderRadius: '6px',
		fontSize: '14px',
		fontWeight: 'bold',
		cursor: 'pointer',
		zIndex: '1002',
		letterSpacing: '1px',
		textTransform: 'uppercase'
	});
	cancelBtn.textContent = 'Cancel Detonation';
	document.body.appendChild(cancelBtn);

	function cleanupVisuals() {
		if (finished) return;
		finished = true;
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		try {
			pieceMesh.remove(sprite);
		} catch (_) { /* ignore */ }
		try {
			spriteMat.dispose();
			texture.dispose();
		} catch (_) { /* ignore */ }
		for (const p of topParts) p.mesh.material = p.origMat;
		greenMat.dispose();
		const existingCancel = document.getElementById('pawn-detonate-cancel-btn');
		if (existingCancel) existingCancel.remove();
	}

	function drawLabel(text) {
		ctx.clearRect(0, 0, 256, 128);
		const isRetro = gameState.retroMode || gameState.renderProfile === 'retro';
		const isCute = gameState.lowQuality || gameState.renderProfile === 'cute';
		const isOhNo = text.toLowerCase().includes('oh');
		const fontSize = isOhNo ? 54 : 84;
		ctx.font = (isRetro || isCute)
			? `bold ${fontSize}px monospace`
			: `bold ${fontSize}px Arial`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.strokeStyle = '#000000';
		ctx.lineWidth = 8;
		ctx.strokeText(text, 128, 64);
		ctx.fillStyle = '#FFFFFF';
		ctx.fillText(text, 128, 64);
		texture.needsUpdate = true;
	}

	const steps = ['5', '4', '3', '2', '1', 'Oh no!'];
	let step = 0;

	const cancel = () => {
		cleanupVisuals();
		if (typeof callbacks.onCancel === 'function') callbacks.onCancel();
	};
	cancelBtn.addEventListener('click', cancel);

	function tick() {
		if (finished) return;
		if (step >= steps.length) {
			cleanupVisuals();
			if (typeof callbacks.onComplete === 'function') callbacks.onComplete();
			return;
		}
		drawLabel(steps[step]);
		step++;
		timeoutId = setTimeout(tick, step <= 5 ? 650 : 900);
	}
	tick();
	return { cancel };
}

/**
 * Explosion particle effect after pawn detonation.
 */
function runDetonationExplosion(pieceMesh) {
	const THREE = getTHREE();
	const gameState = getGameState();
	if (!THREE || !pieceMesh) return;

	let targetScene;
	if (gameState && gameState.scene) targetScene = gameState.scene;
	else return;

	const worldPos = new THREE.Vector3();
	pieceMesh.getWorldPosition(worldPos);

	const isRetro = gameState.retroMode || gameState.renderProfile === 'retro';
	const isCute = gameState.lowQuality || gameState.renderProfile === 'cute';

	const particleCount = isRetro ? 8 : (isCute ? 12 : 24);
	const particleGroup = new THREE.Group();
	targetScene.add(particleGroup);

	const colours = [0xFF4400, 0xFFAA00, 0xFFFF00, 0xFF0000];

	for (let i = 0; i < particleCount; i++) {
		const size = isRetro ? 0.2 : (Math.random() * 0.15 + 0.05);
		const geometry = isCute
			? new THREE.BoxGeometry(size, size, size)
			: new THREE.SphereGeometry(size, 6, 6);
		const material = new THREE.MeshBasicMaterial({
			color: colours[Math.floor(Math.random() * colours.length)],
			transparent: true, opacity: 0.9
		});
		const p = new THREE.Mesh(geometry, material);
		const angle = Math.random() * Math.PI * 2;
		const speed = Math.random() * 0.2 + 0.08;
		p.position.copy(worldPos);
		p.position.y += 0.5;
		p.userData.velocity = {
			x: Math.cos(angle) * speed,
			y: Math.random() * 0.35 + 0.15,
			z: Math.sin(angle) * speed
		};
		particleGroup.add(p);
	}

	let frame = 0;
	const animate = () => {
		frame++;
		for (const p of particleGroup.children) {
			p.position.x += p.userData.velocity.x;
			p.position.y += p.userData.velocity.y;
			p.position.z += p.userData.velocity.z;
			p.userData.velocity.y -= 0.015;
			if (p.material) p.material.opacity = Math.max(0, 0.9 - frame / 25);
		}
		if (frame < 25) {
			requestAnimationFrame(animate);
		} else {
			targetScene.remove(particleGroup);
			for (const p of particleGroup.children) {
				if (p.geometry) p.geometry.dispose();
				if (p.material) p.material.dispose();
			}
		}
	};
	animate();
}

// ── Info popups ─────────────────────────────────────────────────────────────

export function showPieceInfo(piece) {
	if (!piece || !piece.userData) return;
	const gameState = getGameState();
	highlightSinglePiece(piece);
	gameState.selectedHoveredPlayer = piece.userData.player;
	updateUnifiedPlayerBar(gameState);
	showPieceInfoPopup(piece);
}

export function showPieceInfoPopup(piece) {
	const pieceType = piece.userData.pieceType || piece.userData.type;
	const piecePlayer = piece.userData.player;
	const gameState = getGameState();

	if (!_pieceInfoPopup) _pieceInfoPopup = document.getElementById('piece-info-popup');
	let popup = _pieceInfoPopup;
	if (!popup) {
		popup = document.createElement('div');
		popup.id = 'piece-info-popup';
		_pieceInfoPopup = popup;
		Object.assign(popup.style, {
			position: 'absolute', padding: '10px',
			background: 'rgba(0,0,0,0.8)', color: 'white',
			borderRadius: '5px', zIndex: '1000',
			pointerEvents: 'none', boxShadow: '0 0 10px rgba(0,0,0,0.5)',
			transition: 'opacity 0.3s', fontFamily: 'Arial, sans-serif'
		});
		document.body.appendChild(popup);
	}

	const position = piece.userData.position || { x: '?', z: '?' };
	popup.innerHTML = `
		<div style="font-weight:bold;margin-bottom:5px;">${pieceType ? pieceType.toUpperCase() : 'UNKNOWN'}</div>
		<div>Player: ${piecePlayer}</div>
		<div>Position: [${position.x}, ${position.z}]</div>
	`;

	popup.style.transform = '';
	const mouse = getMouse();
	if (mouse && mouse.clientX != null && mouse.clientY != null) {
		popup.style.left = `${mouse.clientX + 15}px`;
		popup.style.top = `${mouse.clientY + 15}px`;
	} else {
		popup.style.left = '50%';
		popup.style.top = '50%';
		popup.style.transform = 'translate(-50%, -50%)';
	}

	popup.style.opacity = '1';

	if (window.popupTimeout) clearTimeout(window.popupTimeout);
	window.popupTimeout = setTimeout(() => {
		popup.style.opacity = '0';
		if (!gameState.selectedChessPiece ||
			(gameState.selectedChessPiece.userData.player !== piecePlayer)) {
			setTimeout(() => {
				gameState.selectedHoveredPlayer = null;
				updateUnifiedPlayerBar(gameState);
			}, 300);
		}
	}, 3000);
}

// ── Temporary messages ──────────────────────────────────────────────────────

export function showTemporaryMessage(message, type = 'info') {
	let messageElement = document.getElementById('game-message');
	if (!messageElement) {
		messageElement = document.createElement('div');
		messageElement.id = 'game-message';
		Object.assign(messageElement.style, {
			position: 'absolute', bottom: '20px', left: '50%',
			transform: 'translateX(-50%)', padding: '10px 20px',
			borderRadius: '5px', fontSize: '16px', fontWeight: 'bold',
			textAlign: 'center', zIndex: '1000',
			transition: 'opacity 0.3s ease', pointerEvents: 'none', opacity: '0'
		});
		document.body.appendChild(messageElement);
	}

	const colours = {
		error: 'rgba(220, 50, 50, 0.9)',
		success: 'rgba(50, 180, 50, 0.9)',
		info: 'rgba(50, 50, 220, 0.9)'
	};

	messageElement.style.backgroundColor = colours[type] || colours.info;
	messageElement.style.color = '#ffffff';
	messageElement.textContent = message;
	messageElement.style.opacity = '1';

	if (window.messageTimeout) clearTimeout(window.messageTimeout);
	window.messageTimeout = setTimeout(() => { messageElement.style.opacity = '0'; }, 3000);
}
