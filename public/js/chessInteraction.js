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

	raycaster.setFromCamera(mouse, camera);

	const targets = [boardGroup, chessPiecesGroup].filter(Boolean);
	if (targets.length === 0) return;

	const intersects = raycaster.intersectObjects(targets, true);

	if (intersects.length > 0) {
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

		let chessPieceHit = null;
		let cellHit = null;

		for (let i = 0; i < intersects.length; i++) {
			const intersectedObject = intersects[i].object;
			let parentPiece = intersectedObject;
			while (parentPiece.parent &&
				parentPiece.parent !== chessPiecesGroup &&
				parentPiece.parent !== boardGroup &&
				parentPiece.parent !== scene) {
				parentPiece = parentPiece.parent;
			}

			const PIECE_TYPES = ['chess', 'chessPiece', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'PAWN'];
			if (parentPiece.userData &&
				(PIECE_TYPES.includes(parentPiece.userData.type) || parentPiece.userData.pieceType)) {
				if (!chessPieceHit) chessPieceHit = parentPiece;
			} else if (parentPiece.userData && parentPiece.userData.type === 'cell') {
				if (!cellHit) cellHit = parentPiece;
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
				moveChessPieceToCell(cellPosition.x, cellPosition.z);
			} else if (!gameState.processingMove) {
				const pieceAtCell = findChessPieceMeshAt(cellPosition.x, cellPosition.z);
				if (pieceAtCell) {
					const piecePlayer = pieceAtCell.userData.player;
					const isLocalPlayerPiece = String(piecePlayer) === String(gameState.localPlayerId);
					if (isLocalPlayerPiece) {
						selectChessPiece(pieceAtCell);
					} else {
						showPieceInfo(pieceAtCell);
					}
				}
			}
		}
	}
}

// ── Hover ───────────────────────────────────────────────────────────────────

export function handleMouseHover() {
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
		updateUnifiedPlayerBar(gameState);
		const popup = document.getElementById('piece-info-popup');
		if (popup) popup.style.opacity = '0';
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
				updateUnifiedPlayerBar(gameState);
				if (String(piecePlayer) !== String(gameState.localPlayerId)) {
					showPieceInfoPopup(parentPiece);
				}
			}
		}
	}
}

// ── Selection ───────────────────────────────────────────────────────────────

export function selectChessPiece(piece) {
	clearChessSelection();
	const gameState = getGameState();
	gameState.selectedChessPiece = piece;
	gameState.selectedHoveredPlayer = piece.userData.player;
	highlightSinglePiece(piece, { mode: 'selected' });
	showValidMoves(piece);
	updateUnifiedPlayerBar(gameState);
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

	validMoves.forEach(move => {
		const absPos = translatePosition({ x: move.x, z: move.z }, gameState, true);
		const selectedPlayer = gameState.selectedChessPiece?.userData?.player;
		const occupant = getChessPieceAt(move.x, move.z);
		const isCapture = !!(occupant && selectedPlayer !== undefined && String(occupant.player) !== String(selectedPlayer));

		const geometry = new THREE.RingGeometry(0.18, 0.42, 32);
		const material = new THREE.MeshBasicMaterial({
			color: isCapture ? 0xFF3355 : 0x33FF66,
			transparent: true,
			opacity: isCapture ? 0.85 : 0.7,
			side: THREE.DoubleSide,
			depthTest: false,
			depthWrite: false
		});

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
		if (highlight.geometry) highlight.geometry.dispose();
		if (highlight.material) {
			if (Array.isArray(highlight.material)) {
				highlight.material.forEach(m => m.dispose());
			} else {
				highlight.material.dispose();
			}
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
}

// ── Movement ────────────────────────────────────────────────────────────────

export function moveChessPieceToCell(x, z) {
	const gameState = getGameState();
	if (!gameState.selectedChessPiece || !gameState.validMoves) return;

	const isValidMove = gameState.validMoves.some(move => move.x === x && move.z === z);
	if (!isValidMove) return;

	const piece = gameState.selectedChessPiece;
	const pieceData = {
		id: piece.userData.id || `piece_${Date.now()}`,
		type: piece.userData.pieceType || piece.userData.type,
		player: piece.userData.player,
		x: piece.userData.position?.x || 0,
		z: piece.userData.position?.z || 0
	};

	const originalX = pieceData.x;
	const originalZ = pieceData.z;
	gameState.processingMove = true;

	animateChessPieceMove(piece, originalX, originalZ, x, z, () => {
		sendChessMoveToServer(pieceData, x, z, (success, responseData) => {
			gameState.processingMove = false;

			if (success) {
				updateGameStateAfterChessMove(pieceData, x, z);
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

				showTemporaryMessage('Move successful.', 'success');
			} else {
				animateChessPieceMove(piece, x, z, originalX, originalZ, () => {
					const reason = responseData?.reason;
					const retryAfterMs = Number(responseData?.retryAfterMs || 0);

					if (reason === 'rate_limited' || responseData?.error === 'rate_limited') {
						const seconds = retryAfterMs > 0 ? Math.max(0.1, Math.ceil(retryAfterMs / 100) / 10) : null;
						showTemporaryMessage(
							seconds ? `Too fast. Try again in ${seconds}s.` : 'Too fast. Please wait a moment.',
							'error'
						);
						return;
					}

					const errorMessage = responseData?.error
						? `Move failed: ${responseData.error}`
						: 'Move failed. Please try again.';
					showTemporaryMessage(errorMessage, 'error');
				});
			}
		});
	});

	clearChessSelection();
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

	let popup = document.getElementById('piece-info-popup');
	if (!popup) {
		popup = document.createElement('div');
		popup.id = 'piece-info-popup';
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

	const mouse = getMouse();
	if (mouse && mouse.clientX && mouse.clientY) {
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
