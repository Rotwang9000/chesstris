/**
 * Enhanced Game Core Module
 *
 * Central coordinator for game initialisation, state management, and
 * network event wiring. Delegates rendering, input, chess interaction,
 * UI overlays, and the animation loop to dedicated modules.
 */

// ── Foundation ──────────────────────────────────────────────────────────────

import gameState, { reset, update } from './utils/gameState.js';
import {
	getTHREE, setTHREE, getGameState,
	getScene, setScene, getCamera, setCamera,
	getRenderer, setRenderer, getControls, setControls,
	getContainerElement, setContainerElement,
	getGameContainer, setGameContainer,
	getBoardGroup, setBoardGroup,
	getTetrominoGroup, setTetrominoGroup,
	getChessPiecesGroup, setChessPiecesGroup,
	getRaycaster, setRaycaster, getMouse, setMouse,
	setClouds, getAnimationQueue,
	getPlayerColors, getModels,
	AXIS_LENGTH, AXIS_LABEL_SIZE, AXIS_LABEL_OFFSET
} from './gameContext.js';

// ── Extracted modules ───────────────────────────────────────────────────────

import { createRendererWithFallback } from './rendererManager.js';
import { setupInputHandlers, setTetrisPhaseClickHandler, setAxisHelpersVisibilityHandler } from './inputManager.js';
import { handleMouseHover, clearChessSelection, showTemporaryMessage } from './chessInteraction.js';
import {
	showPawnPromotionDialog, showKingBattleOverlay,
	showKingDuelOverlay, handleDuelRoundResult,
	handleDuelNewRound, showKingDuelResult
} from './uiOverlays.js';
import { startGameLoop, resetTetrisLastFallTime, setUpdateBoardVisuals } from './gameLoop.js';

// ── Existing dependencies ───────────────────────────────────────────────────

import * as sceneModule from './scene.js';
import * as tetrominoModule from './tetromino.js';
import { boardFunctions } from './boardFunctions.js';
import { highlightSinglePiece, clearSinglePieceHighlight } from './pieceHighlightManager.js';
import { updateUnifiedPlayerBar, createUnifiedPlayerBar } from './unifiedPlayerBar.js';
import * as NetworkManager from './utils/networkManager.js';
import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';
import {
	createLoadingIndicator, hideAllLoadingElements,
	showErrorMessage, hideError,
	updateGameStatusDisplay, updateNetworkStatus,
	showTutorialMessage
} from './createLoadingIndicator.js';
import { resetCameraForGameplay, moveToPlayerZone } from './setupCamera.js';
import {
	preserveCentreMarker, findBoardCentreMarker,
	createCentreMarker, translatePosition
} from './centreBoardMarker.js';
import { updateChessPieces } from './updateChessPieces.js';
import chessPieceCreator from './chessPieceCreator.js';
import {
	setChessPiecesGroup as setPieceHighlightGroup,
	highlightPlayerPieces, removePlayerPiecesHighlight,
	highlightCurrentPlayerPieces
} from './pieceHighlightManager.js';
import * as animationsModule from './animations.js';

// ── Backward-compatible re-exports ──────────────────────────────────────────

export { getTHREE, getGameState } from './gameContext.js';
export const PLAYER_COLORS = getPlayerColors();
export const models = getModels();

// ── Local state ─────────────────────────────────────────────────────────────

let uiButtons = {};
let networkEventsInitialised = false;

// Axis helpers (tracked for visibility toggling)
let _axesHelper = null;
let _axisLabelsGroup = null;

// ── Phase switching (used by createLoadingIndicator & inputManager) ─────────

export function handleTetrisPhaseClick() {
	try {
		gameState.turnPhase = 'tetris';
		if (!gameState.currentTetromino && typeof tetrominoModule.initializeNextTetromino === 'function') {
			gameState.currentTetromino = tetrominoModule.initializeNextTetromino(gameState);
		}
		if (gameState.currentTetromino && typeof tetrominoModule.renderTetromino === 'function') {
			tetrominoModule.renderTetromino(gameState);
		}
		updateGameStatusDisplay(gameState);
		return true;
	} catch (error) {
		console.error('handleTetrisPhaseClick failed:', error);
		return false;
	}
}

export function handleChessPhaseClick() {
	try {
		gameState.turnPhase = 'chess';
		updateGameStatusDisplay(gameState);
		return true;
	} catch (error) {
		console.error('handleChessPhaseClick failed:', error);
		return false;
	}
}

// ── Initialisation ──────────────────────────────────────────────────────────

export function initGame(container, options = {}) {
	console.log("Initialising Shaktris game...");

	try {
		let THREE = getTHREE();
		if (!THREE && window.THREE) {
			setTHREE(window.THREE);
			THREE = window.THREE;
		}

		const loadingIndicator = createLoadingIndicator();
		console.log("Loading indicator created");

		const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
		if (isDevMode) {
			console.log("Development mode detected: enabling debug features");
			gameState.debugMode = true;
		}

		reset();
		if (isDevMode) gameState.debugMode = true;

		const requestedProfile = options && typeof options === 'object' ? options.renderProfile : null;
		gameState.renderProfile = (['cute', 'normal', 'retro'].includes(requestedProfile))
			? requestedProfile
			: (gameState.renderProfile || 'normal');
		gameState.lowQuality = gameState.renderProfile === 'cute';
		gameState.retroMode = gameState.renderProfile === 'retro';

		window.gameState = gameState;
		exposeHighlightFunctionsGlobally();

		if (!container) {
			container = document.getElementById('game-container');
			if (!container) {
				container = document.createElement('div');
				container.id = 'game-container';
				document.body.appendChild(container);
			}
		} else if (!(container instanceof HTMLElement)) {
			container = document.getElementById('game-container');
			if (!container) {
				container = document.createElement('div');
				container.id = 'game-container';
				document.body.appendChild(container);
			}
		}

		setContainerElement(container);
		setGameContainer(container);

		const containerWidth = container.clientWidth || window.innerWidth;
		const containerHeight = container.clientHeight || window.innerHeight;

		if (!THREE) throw new Error("THREE.js is not initialised");

		chessPieceCreator.initMaterials();

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0xAFE9FF);
		scene.fog = new THREE.Fog(0xC5F0FF, 60, 150);
		setScene(scene);

		const camera = new THREE.PerspectiveCamera(50, containerWidth / containerHeight, 0.1, 1000);
		camera.position.set(20, 25, 20);
		camera.lookAt(0, 0, 0);
		setCamera(camera);

		const isCute = gameState.renderProfile === 'cute';
		const rendererResult = createRendererWithFallback(isCute, containerWidth, containerHeight);
		const renderer = rendererResult.renderer;
		setRenderer(renderer);
		if (rendererResult.strategy !== 'primary') {
			console.warn(`Renderer fallback mode active: ${rendererResult.strategy}`);
		}

		const containerElement = getContainerElement();
		while (containerElement.firstChild) containerElement.removeChild(containerElement.firstChild);
		containerElement.appendChild(renderer.domElement);

		try {
			if (!renderer.domElement.id) renderer.domElement.id = 'game-canvas';
			renderer.domElement.__renderer = renderer;
			renderer.domElement.setAttribute('role', 'img');
			renderer.domElement.setAttribute('aria-label', 'Shaktris game board');
			renderer.domElement.tabIndex = 0;
		} catch (_) { /* best-effort accessibility */ }

		try {
			containerElement.classList.toggle('render-cute', isCute);
			renderer.domElement.style.imageRendering = isCute ? 'pixelated' : '';
		} catch (_) { /* styling failures are non-fatal */ }

		sceneModule.setupLights(scene, { lowQuality: isCute, renderProfile: gameState.renderProfile });

		const controls = initializeOrbitControls(camera, renderer.domElement);
		setControls(controls);
		if (controls) {
			setTimeout(() => {
				if (typeof showToastMessage === 'function') {
					showToastMessage("Game controls active. Click and drag to move camera.", 8000);
				}
			}, 1500);
		}
		hideError();

		initializeScene();
		setupEventSystem();
		setupNetworkEvents();

		if (NetworkManager && NetworkManager.ensureConnected) NetworkManager.ensureConnected();
		requestGameState();

		initializeGameUI();

		if (uiButtons && uiButtons.startButton) uiButtons.startButton.style.display = 'none';

		setTimeout(() => {
			if (gameState.inProgress) return;
			window.startShaktrisGame = startPlayingGame;
			setCameraToOverview();
			showTutorialMessage(window.startShaktrisGame);
		}, 500);

		// Register callbacks that avoid circular imports
		setTetrisPhaseClickHandler(handleTetrisPhaseClick);
		setAxisHelpersVisibilityHandler(updateAxisHelpersVisibility);
		setUpdateBoardVisuals(updateBoardVisuals);

		startGameLoop();

		initializeAnimations();

		setTimeout(() => {
			const loadingElement = document.getElementById('loading');
			if (loadingElement && loadingElement.style.display !== 'none') {
				loadingElement.style.display = 'none';
			}
		}, 10000);

		console.log("Game initialisation complete!");
		return true;
	} catch (error) {
		console.error("Error initialising game:", error);
		const errorMessage = (error && error.message)
			? String(error.message)
			: String(error || 'Unknown initialisation error');
		const webglInitFailure = /webgl/i.test(errorMessage) && /context|renderer/i.test(errorMessage);
		
		const loadingIndicator = document.getElementById('loading-indicator');
		if (loadingIndicator) loadingIndicator.style.display = 'none';
		const loadingElement = document.getElementById('loading');
		if (loadingElement) loadingElement.style.display = 'none';
		
		if (
			webglInitFailure &&
			typeof window !== 'undefined' &&
			!window.location.pathname.includes('index-2d.html') &&
			!window.location.pathname.includes('/2D/')
		) {
			try {
				const fallbackUrl = new URL(window.location.href);
				fallbackUrl.pathname = '/index-2d.html';
				fallbackUrl.searchParams.set('fallback', 'webgl');
				console.warn(`WebGL unavailable; redirecting to 2D fallback: ${fallbackUrl.toString()}`);
				window.location.assign(fallbackUrl.toString());
				return false;
			} catch (redirectError) {
				console.warn('Failed to redirect to 2D fallback:', redirectError);
			}
		}
		
		if (typeof showErrorMessage === 'function') {
			showErrorMessage(`Game initialisation failed: ${errorMessage}`);
		}
		return false;
	}
}

function initializeScene() {
	const THREE = getTHREE();
	const scene = getScene();

	let boardGroup = getBoardGroup();
	if (!boardGroup) {
		boardGroup = new THREE.Group();
		boardGroup.name = 'boardGroup';
		scene.add(boardGroup);
		setBoardGroup(boardGroup);
	}

	let tetrominoGroup = getTetrominoGroup();
	if (!tetrominoGroup) {
		tetrominoGroup = new THREE.Group();
		tetrominoGroup.name = 'tetrominos';
		scene.add(tetrominoGroup);
		setTetrominoGroup(tetrominoGroup);
	}

	let chessPiecesGroup = getChessPiecesGroup();
	if (!chessPiecesGroup) {
		chessPiecesGroup = new THREE.Group();
		chessPiecesGroup.name = 'chessPieces';
		scene.add(chessPiecesGroup);
		setChessPiecesGroup(chessPiecesGroup);
		setPieceHighlightGroup(chessPiecesGroup);
	}

	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	setRaycaster(raycaster);
	setMouse(mouse);

	if (gameState.debugMode) createLabeledAxisHelpers();

	setupInputHandlers();

	const renderer = getRenderer();
	const camera = getCamera();
	if (renderer && scene && camera) renderer.render(scene, camera);
}

// ── Axis helpers ────────────────────────────────────────────────────────────

function createLabeledAxisHelpers() {
	const THREE = getTHREE();
	const scene = getScene();

	const axesHelper = new THREE.AxesHelper(AXIS_LENGTH);
	axesHelper.name = 'axesHelper';
	scene.add(axesHelper);
	_axesHelper = axesHelper;

	const labelsGroup = new THREE.Group();
	labelsGroup.name = 'axisLabels';
	scene.add(labelsGroup);
	_axisLabelsGroup = labelsGroup;

	createAxisLabel('X', new THREE.Vector3(AXIS_LENGTH * AXIS_LABEL_OFFSET, 0, 0), 0xff0000, labelsGroup);
	createAxisLabel('-X', new THREE.Vector3(-AXIS_LENGTH * AXIS_LABEL_OFFSET, 0, 0), 0xff0000, labelsGroup);
	createAxisLabel('Y', new THREE.Vector3(0, AXIS_LENGTH * AXIS_LABEL_OFFSET, 0), 0x00ff00, labelsGroup);
	createAxisLabel('-Y', new THREE.Vector3(0, -AXIS_LENGTH * AXIS_LABEL_OFFSET, 0), 0x00ff00, labelsGroup);
	createAxisLabel('Z', new THREE.Vector3(0, 0, AXIS_LENGTH * AXIS_LABEL_OFFSET), 0x0000ff, labelsGroup);
	createAxisLabel('-Z', new THREE.Vector3(0, 0, -AXIS_LENGTH * AXIS_LABEL_OFFSET), 0x0000ff, labelsGroup);
}

function createAxisLabel(text, position, color, group) {
	const THREE = getTHREE();
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	canvas.width = 128;
	canvas.height = 64;

	context.fillStyle = 'rgba(0, 0, 0, 0)';
	context.fillRect(0, 0, canvas.width, canvas.height);

	context.font = 'bold 40px Arial';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	context.fillStyle = `rgb(${r}, ${g}, ${b})`;
	context.fillText(text, canvas.width / 2, canvas.height / 2);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
	const sprite = new THREE.Sprite(material);
	sprite.position.copy(position);
	sprite.scale.set(AXIS_LABEL_SIZE * 2, AXIS_LABEL_SIZE, 1);
	group.add(sprite);
}

function updateAxisHelpersVisibility() {
	const showAxes = gameState.debugMode;
	if (_axesHelper) _axesHelper.visible = showAxes;
	if (_axisLabelsGroup) _axisLabelsGroup.visible = showAxes;
}

// ── Camera helpers ──────────────────────────────────────────────────────────

function setCameraToOverview() {
	const camera = getCamera();
	const controls = getControls();
	if (!camera || !controls) return;

	const board = gameState.board;
	let centerX = 0, centerZ = 0, maxExtent = 50;

	if (board && board.cells) {
		const cellKeys = Object.keys(board.cells);
		if (cellKeys.length > 0) {
			let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
			cellKeys.forEach(key => {
				const [x, z] = key.split(',').map(Number);
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minZ = Math.min(minZ, z);
				maxZ = Math.max(maxZ, z);
			});
			centerX = (minX + maxX) / 2;
			centerZ = (minZ + maxZ) / 2;
			maxExtent = Math.max(maxX - minX, maxZ - minZ, 50);
		}
	}

	const viewDistance = Math.max(60, maxExtent * 0.8);
	camera.position.set(centerX + viewDistance * 0.5, viewDistance * 0.7, centerZ + viewDistance * 0.5);
	if (controls.target) controls.target.set(centerX, 0, centerZ);
	camera.lookAt(centerX, 0, centerZ);
	if (controls.update) controls.update();
}

function initializeOrbitControls(cam, domElement) {
	try {
		const THREE = getTHREE();
		let orbitControls = null;

		if (THREE && typeof THREE.OrbitControls === 'function') {
			orbitControls = new THREE.OrbitControls(cam, domElement);
		} else if (typeof window !== 'undefined' && typeof window.OrbitControls === 'function') {
			orbitControls = new window.OrbitControls(cam, domElement);
		} else if (typeof OrbitControls === 'function') {
			orbitControls = new OrbitControls(cam, domElement);
		} else {
			console.warn("OrbitControls not available — camera will be static");
			return null;
		}

		configureOrbitControls(orbitControls, THREE);
		return orbitControls;
	} catch (error) {
		console.error("Error initialising OrbitControls:", error);
		return null;
	}
}

function configureOrbitControls(ctrl, THREE) {
	if (!ctrl) return;
	ctrl.enableDamping = true;
	ctrl.dampingFactor = 0.15;
	ctrl.screenSpacePanning = true;
	ctrl.minDistance = 10;
	ctrl.maxDistance = 80;
	ctrl.maxPolarAngle = Math.PI / 2 - 0.1;
	ctrl.target.set(8, 0, 8);
	ctrl.enabled = true;
	if (THREE && THREE.TOUCH) {
		ctrl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
	}
	ctrl.rotateSpeed = 0.7;
	ctrl.panSpeed = 0.8;
	ctrl.zoomSpeed = 1.0;
	try { ctrl.update(); } catch (_) { /* best-effort */ }
}

// ── Event system (game update dispatcher) ───────────────────────────────────

function setupEventSystem() {
	const gameContainer = getGameContainer();
	if (!gameContainer || typeof gameContainer !== 'object') return;

	window.addEventListener('gameupdate', function (e) {
		try {
			if (!e.detail) return;
			const tetrominoGroup = getTetrominoGroup();
			updateGameState(e.detail, tetrominoGroup);

			if (e.detail.board && getBoardGroup()) {
				updateBoardState(e.detail.board);
				const li = document.getElementById('loading-indicator');
				if (li) li.style.display = 'none';
			}
			if (e.detail.chessPieces && getBoardGroup()) updateBoardVisuals();

			if (!gameState._cameraFlownToPlayer && gameState.localPlayerId && gameState.chessPieces?.length > 0) {
				const king = boardFunctions.getPlayersKing(gameState, gameState.localPlayerId, false);
				if (king) {
					gameState._cameraFlownToPlayer = true;
					resetCameraForGameplay(getRenderer(), getCamera(), getControls(), gameState, getScene(), true, false);
				}
			}

			if (e.detail.currentTetromino) updateCurrentTetromino(e.detail.currentTetromino);

			if (gameState.inProgress && gameState.turnPhase === 'tetris' && !gameState.currentTetromino) {
				const playerId = gameState.currentPlayer || gameState.localPlayerId;
				const king = playerId ? boardFunctions.getPlayersKing(gameState, playerId, false) : null;
				if (king) {
					const spawned = tetrominoModule.initializeNextTetromino(gameState);
					if (spawned) {
						gameState.currentTetromino = spawned;
						gameState.currentTetromino.heightAboveBoard = gameState.TETROMINO_START_HEIGHT;
						renderCurrentTetromino();
					}
				}
			}

			updateGameStatusDisplay(gameState);
		} catch (err) {
			console.error("Error processing game update:", err);
		}
	});
}

// ── Network events ──────────────────────────────────────────────────────────

function ensureGameOverPulseStyles() {
	if (document.getElementById('game-over-pulse-style')) return;
	const style = document.createElement('style');
	style.id = 'game-over-pulse-style';
	style.textContent = `
		@keyframes shaktrisGameOverPulse {
			0% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
			50% { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
			100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
		}
	`;
	document.head.appendChild(style);
}

function showGameOverPulseOverlay(message = 'GAME OVER') {
	ensureGameOverPulseStyles();
	let overlay = document.getElementById('game-over-pulse-overlay');
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = 'game-over-pulse-overlay';
		Object.assign(overlay.style, {
			position: 'fixed',
			left: '50%',
			top: '50%',
			transform: 'translate(-50%, -50%)',
			zIndex: '2500',
			fontFamily: 'Arial, sans-serif',
			fontWeight: '900',
			fontSize: 'clamp(56px, 12vw, 170px)',
			letterSpacing: '0.12em',
			color: '#ff3b3b',
			textShadow: '0 0 22px rgba(255,0,0,0.85), 0 0 56px rgba(255,0,0,0.45)',
			pointerEvents: 'none',
			userSelect: 'none',
			textTransform: 'uppercase',
			animation: 'shaktrisGameOverPulse 1s ease-in-out infinite',
		});
		document.body.appendChild(overlay);
	}
	overlay.textContent = message;
	overlay.style.display = 'block';
}

export function setupNetworkEvents() {
	if (networkEventsInitialised) return;
	networkEventsInitialised = true;

	if (!NetworkManager || typeof NetworkManager.on !== 'function') {
		console.warn('setupNetworkEvents: NetworkManager not available');
		return;
	}

	const dispatchGameUpdate = (detail) => {
		try {
			if (!detail) return;
			const event = new CustomEvent('gameupdate', { detail });
			window.dispatchEvent(event);
		} catch (error) {
			console.warn('setupNetworkEvents: Failed to dispatch gameupdate event:', error);
		}
	};

	const normalisePlayersArrayToMap = (playersArray) => {
		const map = {};
		if (!Array.isArray(playersArray)) return map;
		for (let i = 0; i < playersArray.length; i++) {
			const p = playersArray[i];
			if (!p || !p.id) continue;
			map[p.id] = { id: p.id, name: p.name || p.id, isComputer: !!p.isComputer };
		}
		return map;
	};

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
			if (!gameState.board) gameState.board = { cells: {}, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
			if (!gameState.board.cells) gameState.board.cells = {};

			state.boardChanges.forEach(change => {
				if (!change) return;
				const x = Number(change.x), z = Number(change.z);
				if (!Number.isFinite(x) || !Number.isFinite(z)) return;
				const key = `${x},${z}`;
				if (change.value === null || change.value === undefined) {
					delete gameState.board.cells[key];
				} else {
					gameState.board.cells[key] = change.value;
				}
			});

			if (Array.isArray(state.removedCells)) {
				state.removedCells.forEach(cell => {
					if (!cell) return;
					const x = Number(cell.x), z = Number(cell.z);
					if (!Number.isFinite(x) || !Number.isFinite(z)) return;
					delete gameState.board.cells[`${x},${z}`];
				});
			}

			if (state.boardBounds) {
				gameState.board.minX = state.boardBounds.minX;
				gameState.board.maxX = state.boardBounds.maxX;
				gameState.board.minZ = state.boardBounds.minZ;
				gameState.board.maxZ = state.boardBounds.maxZ;
				gameState.boardBounds = { ...state.boardBounds };
			}

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
		const id = payload?.playerId;
		if (!id) return;
		dispatchGameUpdate({ localPlayerId: id });
	});

	NetworkManager.on('row_cleared', (payload) => {
		try {
			const rows = payload?.rows;
			const playerId = payload?.playerId;
			if (!Array.isArray(rows) || rows.length === 0) return;
			if (!playerId || String(playerId) !== String(gameState.localPlayerId)) return;
			showToastMessage(`Line cleared! Row${rows.length === 1 ? '' : 's'}: ${rows.join(', ')}`);
		} catch (e) { console.error('Error handling row_cleared:', e); }
	});

	NetworkManager.on('chess_move', (payload) => {
		try {
			const captured = payload?.capturedPiece;
			if (!captured) return;
			const localId = gameState.localPlayerId;
			const localMoved = localId && payload?.playerId && String(payload.playerId) === String(localId);
			const localLost = localId && captured.player && String(captured.player) === String(localId);
			if (!localMoved && !localLost) return;
			const capturedType = captured.type || 'piece';
			showToastMessage(localMoved ? `Captured ${String(capturedType).toLowerCase()}` : `Your ${String(capturedType).toLowerCase()} was captured`);
		} catch (_) { /* ignore toast errors */ }
	});

	NetworkManager.on('pawn_detonation', (payload) => {
		try {
			if (!payload) return;
			const localId = gameState.localPlayerId;
			const isLocal = localId && payload.playerId && String(payload.playerId) === String(localId);
			if (!isLocal) {
				const pieceType = String(payload.pieceType || 'PAWN').toUpperCase();
				showToastMessage(pieceType === 'KING'
					? 'Opponent detonated their king!'
					: 'Opponent detonated a pawn!');
			}
		} catch (_) { /* ignore toast errors */ }
	});
	
	NetworkManager.on('king_detonation', (payload) => {
		try {
			if (!payload || !Array.isArray(payload.explosionSequence)) return;
			const layerIntervalMs = Number(payload.layerIntervalMs) > 0
				? Number(payload.layerIntervalMs)
				: 500;
			const sequence = payload.explosionSequence
				.filter(cell => cell && Number.isFinite(cell.x) && Number.isFinite(cell.z))
				.map(cell => {
					const hasDistance = Number.isFinite(cell.distance);
					const fallbackDistance = (Number.isFinite(payload?.detonatedAt?.x) && Number.isFinite(payload?.detonatedAt?.z))
						? Math.abs(cell.x - payload.detonatedAt.x) + Math.abs(cell.z - payload.detonatedAt.z)
						: 0;
					return {
						x: cell.x,
						z: cell.z,
						distance: hasDistance ? Number(cell.distance) : fallbackDistance,
					};
				});
			
			if (typeof window.showExplosionAnimation !== 'function') return;

			const MAX_KING_ANIMS_PER_LAYER = 12;
			const MAX_KING_LAYERS = 20;
			const MAX_KING_TOTAL_MS = 8000;

			const layerMap = new Map();
			for (const cell of sequence) {
				const d = cell.distance;
				if (!layerMap.has(d)) layerMap.set(d, []);
				layerMap.get(d).push(cell);
			}
			const sortedDistances = [...layerMap.keys()].sort((a, b) => b - a).slice(0, MAX_KING_LAYERS);
			const effectiveInterval = Math.min(
				layerIntervalMs,
				Math.floor(MAX_KING_TOTAL_MS / Math.max(sortedDistances.length, 1))
			);

			sortedDistances.forEach((distance, layerIdx) => {
				let layerCells = layerMap.get(distance);
				if (layerCells.length > MAX_KING_ANIMS_PER_LAYER) {
					const step = Math.ceil(layerCells.length / MAX_KING_ANIMS_PER_LAYER);
					layerCells = layerCells.filter((_, i) => i % step === 0);
				}
				setTimeout(() => {
					for (const cell of layerCells) {
						try { window.showExplosionAnimation(cell.x, cell.z, gameState); } catch (_) { /* ignore */ }
					}
				}, layerIdx * effectiveInterval);
			});

			const localId = gameState.localPlayerId;
			const isLocalDetonation = localId && payload.playerId && String(payload.playerId) === String(localId);
			if (isLocalDetonation) {
				const totalDuration = cappedDistances.length * effectiveInterval;
				setTimeout(() => { showGameOverPulseOverlay('GAME OVER'); }, totalDuration + 180);
			}
		} catch (e) { console.error('Error handling king_detonation:', e); }
	});
	
	NetworkManager.on('island_decay', (payload) => {
		try {
			const cells = payload?.cells;
			if (!Array.isArray(cells) || cells.length === 0) return;

			const MAX_DECAY_ANIMS = 40;
			const STAGGER_MS = 50;
			const MAX_TOTAL_MS = 3000;

			const playSand = (typeof window.showSandDissolveCellAnimation === 'function')
				? window.showSandDissolveCellAnimation
				: null;
			const playExplosion = (typeof window.showExplosionAnimation === 'function')
				? window.showExplosionAnimation
				: null;

			const validCells = cells.filter(
				cell => cell && Number.isFinite(cell.x) && Number.isFinite(cell.z)
			);
			const capped = validCells.length > MAX_DECAY_ANIMS
				? validCells.filter((_, i) => i % Math.ceil(validCells.length / MAX_DECAY_ANIMS) === 0)
				: validCells;

			const stagger = Math.min(STAGGER_MS, Math.floor(MAX_TOTAL_MS / Math.max(capped.length, 1)));

			capped.forEach((cell, idx) => {
				setTimeout(() => {
					try {
						if (playSand) {
							playSand(cell.x, cell.z, gameState);
						} else if (playExplosion) {
							playExplosion(cell.x, cell.z, gameState);
						}
					} catch (_) { /* ignore animation errors */ }
				}, idx * stagger);
			});
		} catch (e) { console.error('Error handling island_decay:', e); }
	});

	NetworkManager.on('no_valid_chess_moves', (payload) => {
		try {
			if (!payload?.playerId || String(payload.playerId) !== String(gameState.localPlayerId)) return;
			clearChessSelection();
			gameState.processingMove = false;
			showToastMessage('No chess moves available — dropping next piece');
			gameState.turnPhase = 'tetris';
			updateGameStatusDisplay(gameState);
		} catch (e) { console.error('Error handling no_valid_chess_moves:', e); }
	});

	NetworkManager.on('new_tetromino', (payload) => {
		try {
			const tetromino = payload?.tetromino;
			if (!tetromino) return;
			clearChessSelection();
			gameState.processingMove = false;
			const tetrominoType = tetromino.type || tetromino.pieceType;
			const newTetromino = tetrominoModule.initializeNewTetromino(gameState, tetrominoType);
			gameState.currentTetromino = newTetromino || tetrominoModule.initializeNextTetromino(gameState);
			gameState.turnPhase = 'tetris';
			renderCurrentTetromino();
			updateGameStatusDisplay(gameState);
		} catch (e) { console.error('Error handling new_tetromino:', e); }
	});

	NetworkManager.on('pawn_promotion_available', (payload) => {
		try {
			const { pieceId, position } = payload || {};
			if (!pieceId) return;
			showPawnPromotionDialog(pieceId, position);
		} catch (e) { console.error('Error handling pawn_promotion_available:', e); }
	});

	NetworkManager.on('king_captured', (payload) => {
		try {
			const { captorId, captorName, defeatedId, defeatedName, defeatedColor, inheritedPawnCount } = payload || {};
			if (!captorId || !defeatedId) return;
			showKingBattleOverlay(captorId, captorName, defeatedId, defeatedName, defeatedColor, inheritedPawnCount);
		} catch (e) { console.error('Error handling king_captured:', e); }
	});

	NetworkManager.on('suicidal_pawn', (payload) => {
		try {
			const { x, z, remaining } = payload || {};
			if (x === undefined || z === undefined) return;
			if (typeof window.showExplosionAnimation === 'function') window.showExplosionAnimation(x, z, gameState);
			if (remaining === 0 && typeof window.showToastNotification === 'function') {
				window.showToastNotification('All inherited pawns have self-destructed!');
			}
		} catch (e) { console.error('Error handling suicidal_pawn:', e); }
	});

	NetworkManager.on('king_duel_start', (payload) => {
		try {
			const { duelId, gridCols, gridRows, opponentName } = payload || {};
			if (!duelId) return;
			showKingDuelOverlay(duelId, gridCols || 4, gridRows || 2, opponentName || 'Opponent');
		} catch (e) { console.error('Error handling king_duel_start:', e); }
	});

	NetworkManager.on('king_duel_round_result', (payload) => {
		try { handleDuelRoundResult(payload); } catch (e) { console.error('Error handling king_duel_round_result:', e); }
	});

	NetworkManager.on('king_duel_new_round', (payload) => {
		try { handleDuelNewRound(payload); } catch (e) { console.error('Error handling king_duel_new_round:', e); }
	});

	NetworkManager.on('king_duel_result', (payload) => {
		try { showKingDuelResult(payload); } catch (e) { console.error('Error handling king_duel_result:', e); }
	});

	NetworkManager.on('king_duel_announced', (payload) => {
		try {
			const { player1Name, player2Name } = payload || {};
			if (typeof window.showToastNotification === 'function') {
				window.showToastNotification(`King's Duel! ${player1Name} vs ${player2Name} — both captured each other's king!`, 5000);
			}
		} catch (e) { console.error('Error handling king_duel_announced:', e); }
	});

	let _hadConnection = false;

	NetworkManager.on('disconnect', () => {
		if (typeof window.showToastNotification === 'function') {
			window.showToastNotification('Connection lost — reconnecting…', 4000);
		}
	});

	NetworkManager.on('connect', () => {
		if (!_hadConnection) {
			_hadConnection = true;
			return;
		}
		if (typeof window.showToastNotification === 'function') {
			window.showToastNotification('Reconnected!', 2000);
		}
		if (gameState.localPlayerId && typeof NetworkManager.joinGame === 'function') {
			NetworkManager.joinGame().catch(() => {});
		}
	});
}

// ── State management ────────────────────────────────────────────────────────

export function resetGameState(_gameStateObj) {
	reset();
}

function updateGameState(data, tetrominoGroup) {
	if (!data) return;
	update(data);
	gameState.tetrominoGroup = tetrominoGroup || getTetrominoGroup();
	gameState.scene = getScene();
}

function updateCurrentTetromino(currentTetromino) {
	if (!currentTetromino || typeof currentTetromino !== 'object') return;
	gameState.currentTetromino = currentTetromino;
	if (!gameState.tetrominoGroup) gameState.tetrominoGroup = getTetrominoGroup();
	if (typeof tetrominoModule?.renderTetromino === 'function') tetrominoModule.renderTetromino(gameState);
}

function updateBoardState(boardData) {
	try {
		if (!boardData || typeof boardData !== 'object') return;
		if (!boardData.cells || typeof boardData.cells !== 'object') return;

		const centreMarker = preserveCentreMarker(gameState, boardData);
		gameState.board = boardData;

		if (Number.isFinite(boardData.minX) && Number.isFinite(boardData.maxX) &&
			Number.isFinite(boardData.minZ) && Number.isFinite(boardData.maxZ)) {
			gameState.boardBounds = { minX: boardData.minX, maxX: boardData.maxX, minZ: boardData.minZ, maxZ: boardData.maxZ };
		}

		if (centreMarker) {
			gameState.board.centreMarker = centreMarker;
			if (gameState.board.cells) {
				const key = `${centreMarker.x},${centreMarker.z}`;
				if (!gameState.board.cells[key]) gameState.board.cells[key] = {};
				gameState.board.cells[key].specialMarker = {
					type: 'boardCentre', isCentreMarker: true,
					centreX: centreMarker.x, centreZ: centreMarker.z
				};
			}
		}

		gameState.gameStarted = true;
		updateBoardVisuals();

		const li = document.getElementById('loading-indicator');
		if (li) li.style.display = 'none';
	} catch (error) {
		console.error('Error in updateBoardState:', error);
	}
}

function updateBoardVisuals() {
	try {
		const THREE = getTHREE();
		if (!THREE) return;

		let boardGroup = getBoardGroup();
		const scene = getScene();
		const camera = getCamera();
		const renderer = getRenderer();

		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'board';
			if (scene) scene.add(boardGroup);
			setBoardGroup(boardGroup);
		}

		gameState.boardGroup = boardGroup;
		gameState.scene = scene;
		gameState.camera = camera;
		gameState.renderer = renderer;

		if (typeof boardFunctions?.renderBoard === 'function') {
			boardFunctions.renderBoard(gameState, boardGroup, sceneModule.createFloatingIsland, THREE);
		}

		let chessPiecesGroup = getChessPiecesGroup();
		if (!chessPiecesGroup) {
			chessPiecesGroup = new THREE.Group();
			chessPiecesGroup.name = 'chessPieces';
			if (scene) scene.add(chessPiecesGroup);
			setChessPiecesGroup(chessPiecesGroup);
		}

		if (typeof updateChessPieces === 'function') {
			updateChessPieces(chessPiecesGroup, camera, gameState);
		}

		if (typeof tetrominoModule?.synchronizeCenterPositions === 'function') {
			tetrominoModule.synchronizeCenterPositions(gameState);
		}

		if (renderer && scene && camera) renderer.render(scene, camera);

		if (gameState.board?.cells && (function() { for (const _ in gameState.board.cells) return true; return false; })()) {
			hideAllLoadingElements();
		}
	} catch (error) {
		console.error('Error in updateBoardVisuals:', error);
	}
}

if (typeof window !== 'undefined') {
	window.updateBoardVisuals = updateBoardVisuals;
	window.updateBoardState = updateBoardState;
	window.updateGameStatusDisplay = updateGameStatusDisplay;
}

function renderCurrentTetromino() {
	if (!gameState.currentTetromino) return;
	if (!gameState.tetrominoGroup) gameState.tetrominoGroup = getTetrominoGroup();
	if (typeof tetrominoModule?.renderTetromino === 'function') tetrominoModule.renderTetromino(gameState);
	updateBoardVisuals();
}

// ── UI initialisation ───────────────────────────────────────────────────────

function initializeGameUI() {
	try { if (typeof createUnifiedPlayerBar === 'function') createUnifiedPlayerBar(gameState); }
	catch (error) { console.error('Error creating player bar:', error); }

	try { if (typeof createNetworkStatusDisplay === 'function') createNetworkStatusDisplay(); }
	catch (error) { console.error('Error creating network status display:', error); }

	try {
		const existing = document.getElementById('controls-hint-overlay');
		if (!existing) {
			const hint = document.createElement('div');
			hint.id = 'controls-hint-overlay';
			hint.textContent = 'Controls: Arrow keys = Tetromino, Click = Chess';
			Object.assign(hint.style, {
				position: 'fixed', bottom: '10px', left: '10px',
				padding: '8px 10px', background: 'rgba(0,0,0,0.65)',
				color: '#fff', border: '1px solid rgba(255,204,0,0.5)',
				borderRadius: '6px', fontSize: '12px',
				zIndex: '10002', pointerEvents: 'none'
			});
			document.body.appendChild(hint);
			setTimeout(() => { hint.style.opacity = '0'; hint.style.transition = 'opacity 1s'; }, 8000);
		}
	} catch (_) { /* non-fatal */ }
}

// ── Window / resize ─────────────────────────────────────────────────────────

export function onWindowResize(cam, rend, containerEl) {
	if (!cam || !rend || !containerEl) return;
	try {
		if (cam.isPerspectiveCamera) {
			cam.aspect = containerEl.clientWidth / containerEl.clientHeight;
			cam.updateProjectionMatrix();
		}
		rend.setSize(containerEl.clientWidth, containerEl.clientHeight);
		tetrominoModule.synchronizeCenterPositions(gameState);
		rend.render(gameState.scene, cam);
	} catch (error) {
		console.error('Error during window resize:', error);
	}
}

export function startPlayingGame(gameKey = null) {
	if (gameState.inProgress && gameState.gameStarted) return;
	console.log('Entering world...', gameKey ? `with key: ${gameKey}` : 'default shared world');

	if (gameKey) {
		localStorage.setItem('shaktris_game_key', gameKey);
		gameState.gameKey = gameKey;
	}

	try {
		gameState.error = null;
		gameState.inProgress = true;
		gameState.gameStarted = true;
		if (gameState.localPlayerId) gameState.currentPlayer = gameState.localPlayerId;
		hideError();

		const chessPiecesGroup = getChessPiecesGroup();
		const camera = getCamera();
		const renderer = getRenderer();
		const controls = getControls();
		const scene = getScene();

		if (chessPiecesGroup) {
			if (!gameState.chessPieces || gameState.chessPieces.length === 0) {
				gameState.chessPieces = boardFunctions.extractChessPiecesFromCells(gameState);
			}
			if (gameState.currentPlayer) highlightCurrentPlayerPieces(gameState.currentPlayer);
			updateChessPieces(chessPiecesGroup, camera, { ...gameState, _forceUpdate: true });
		}
		updateBoardVisuals();
		updateGameStatusDisplay(gameState);

		resetCameraForGameplay(renderer, camera, controls, gameState, scene, true, false, () => {
			gameState.turnPhase = 'tetris';
			resetTetrisLastFallTime();

			if (!gameState.currentTetromino) {
				const initialTetromino = tetrominoModule.initializeNextTetromino(gameState);
				gameState.currentTetromino = initialTetromino || null;
			}
			if (gameState.currentTetromino) {
				gameState.currentTetromino.heightAboveBoard = gameState.TETROMINO_START_HEIGHT;
				renderCurrentTetromino();
			}
		});
	} catch (error) {
		console.error('Error starting game:', error);
		showErrorMessage(`Error starting game: ${error.message}`);
	}
}

function requestGameState() {
	if (typeof dispatchEvent === 'function') {
		dispatchEvent(new CustomEvent('requestgamestate'));
	} else {
		window.dispatchEvent(new CustomEvent('requestgamestate'));
	}
}

export function updateRenderSize() {
	const camera = getCamera();
	const renderer = getRenderer();
	const containerElement = getContainerElement();
	if (!camera || !renderer || !containerElement) return;

	const width = containerElement.clientWidth || window.innerWidth;
	const height = containerElement.clientHeight || window.innerHeight;
	if (height <= 1) {
		containerElement.style.height = '100vh';
		containerElement.style.minHeight = '100vh';
	}
	camera.aspect = width / Math.max(height, 1);
	camera.updateProjectionMatrix();
	renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
}

// ── Lighting / camera exports ───────────────────────────────────────────────

export function setupLightsInPlace(sceneObj, profile) {
	const s = sceneObj || getScene();
	if (!s) return;
	sceneModule.setupLights(s, { lowQuality: profile === 'cute', renderProfile: profile });
	const renderer = getRenderer();
	if (renderer) {
		const isCute = profile === 'cute';
		renderer.setPixelRatio(isCute ? Math.min(1, window.devicePixelRatio * 0.6) : window.devicePixelRatio);
		renderer.domElement.style.imageRendering = isCute ? 'pixelated' : '';
	}
	updateBoardVisuals();
	const chessPiecesGroup = getChessPiecesGroup();
	const camera = getCamera();
	if (chessPiecesGroup && camera) {
		updateChessPieces(chessPiecesGroup, camera, { ...gameState, _forceUpdate: true });
	}
}

export function forceChessPieceRebuild() {
	const chessPiecesGroup = getChessPiecesGroup();
	if (!chessPiecesGroup) return;

	// Clear all existing piece meshes so updateChessPieces recreates them
	// with the current renderProfile (retro letters vs 3D geometry).
	while (chessPiecesGroup.children.length > 0) {
		const child = chessPiecesGroup.children[0];
		chessPiecesGroup.remove(child);
		if (child.traverse) {
			child.traverse(obj => {
				if (obj.geometry) obj.geometry.dispose();
				if (obj.material) {
					if (Array.isArray(obj.material)) {
						obj.material.forEach(m => m.dispose());
					} else {
						obj.material.dispose();
					}
				}
			});
		}
	}

	const camera = getCamera();
	if (camera) {
		updateChessPieces(chessPiecesGroup, camera, { ...gameState, _forceUpdate: true });
	}
}

export function resetCamera(animate = true) {
	resetCameraForGameplay(getRenderer(), getCamera(), getControls(), gameState, getScene(), animate, !animate);
}

export function flyToPlayerKing(playerId) {
	const camera = getCamera();
	const controls = getControls();
	const renderer = getRenderer();
	const scene = getScene();
	if (!camera || !controls) return;
	moveToPlayerZone(camera, controls, gameState, renderer, scene, true, false, null, playerId);
}

export function exposeHighlightFunctionsGlobally() {
	window.gameCore = window.gameCore || {};
	window.gameCore.highlightPlayerPieces = highlightPlayerPieces;
	window.gameCore.removePlayerPiecesHighlight = removePlayerPiecesHighlight;
	window.gameCore.highlightCurrentPlayerPieces = highlightCurrentPlayerPieces;
	window.gameCore.resetCamera = resetCamera;
	window.gameCore.flyToPlayerKing = flyToPlayerKing;
	window.gameState = gameState;

	const resetBtn = document.getElementById('reset-camera-btn');
	if (resetBtn) resetBtn.addEventListener('click', () => resetCamera(true));

	function wireExitButton() {
		const exitBtn = document.getElementById('exit-game-sidebar-btn');
		if (exitBtn && !exitBtn.dataset.wired) {
			exitBtn.dataset.wired = 'true';
			exitBtn.addEventListener('click', () => {
			const gs = getGameState();
			const hasPieces = Array.isArray(gs.chessPieces) && gs.chessPieces.some(
				p => p && String(p.player) === String(gs.localPlayerId)
			);
			const msg = hasPieces
				? 'You still have pieces and territory on the board!\n\n' +
				  'Exiting will destroy all your pieces and start a fresh game on return.\n\n' +
				  'Are you sure?'
				: 'Are you sure you want to exit?';
			const confirmed = window.confirm(msg);
				if (confirmed) NetworkManager.exitGame().then(() => window.location.reload());
			});
		}
	}
	wireExitButton();
	const observer = new MutationObserver(() => wireExitButton());
	observer.observe(document.body, { childList: true, subtree: true });
}

// ── Board centre ────────────────────────────────────────────────────────────

export function updateBoardCenter(newCenter) {
	try {
		if (!gameState) return false;

		if (!newCenter) {
			newCenter = (typeof findBoardCentreMarker === 'function')
				? findBoardCentreMarker(gameState)
				: (gameState.board?.centreMarker || { x: 15, z: 15 });
		}

		if (typeof createCentreMarker === 'function') {
			createCentreMarker(gameState, newCenter.x, newCenter.z);
		} else {
			if (!gameState.board) gameState.board = { cells: {} };
			gameState.board.centreMarker = { x: newCenter.x, z: newCenter.z };
		}

		gameState.boardCenter = { x: newCenter.x, y: 0, z: newCenter.z };

		if (typeof tetrominoModule.synchronizeCenterPositions === 'function') {
			tetrominoModule.synchronizeCenterPositions(gameState);
		}
		if (gameState.currentTetromino && tetrominoModule.renderTetromino) {
			tetrominoModule.renderTetromino(gameState);
		}
		updateBoardVisuals();

		const renderer = getRenderer();
		const camera = getCamera();
		if (gameState.scene && renderer && camera) renderer.render(gameState.scene, camera);

		return true;
	} catch (error) {
		console.error('Error updating board centre:', error);
		return false;
	}
}

// ── Network error recovery ──────────────────────────────────────────────────

export function handleNetworkErrorDuringPlacement(error, gs) {
	console.error('Network error during tetromino placement:', error);
	showToastMessage('Connection lost. Attempting to reconnect...');

	if (typeof updateNetworkStatus === 'function') updateNetworkStatus('disconnected');

	return NetworkManager.ensureConnected(null, 5)
		.then(connected => {
			if (connected) {
				if (typeof updateNetworkStatus === 'function') updateNetworkStatus('connected');
				showToastMessage('Reconnected successfully. You can continue playing.');
				return true;
			}
			showToastMessage('Failed to reconnect. Please refresh the page and try again.');
			cleanupTetrominoOnError(gs, 'Connection lost. Please refresh the page and try again.');
			return false;
		})
		.catch(err => {
			console.error('Error during reconnection process:', err);
			showToastMessage('Error during reconnection. Please refresh the page.');
			cleanupTetrominoOnError(gs, 'Connection error. Please refresh the page.');
			return false;
		});
}

function cleanupTetrominoOnError(gs, message) {
	if (!gs || !gs.currentTetromino) return;
	const { explosionX, explosionZ } = getTetrominoPositionForExplosion(gs);
	if (typeof tetrominoModule.cleanupTetrominoAndTransitionToChess === 'function') {
		tetrominoModule.cleanupTetrominoAndTransitionToChess(gs, message, explosionX, explosionZ);
	} else {
		gs.currentTetromino = null;
		gs.turnPhase = 'chess';
		updateGameStatusDisplay();
	}
}

function getTetrominoPositionForExplosion(gs) {
	if (gs?.currentTetromino) {
		return { explosionX: gs.currentTetromino.position.x, explosionZ: gs.currentTetromino.position.z };
	}
	const centre = gs?.boardCenter || gs?.board?.centreMarker || { x: 15, z: 15 };
	return { explosionX: centre.x, explosionZ: centre.z };
}

// ── Animations ──────────────────────────────────────────────────────────────

export function initializeAnimations() {
	window.animationsModule = animationsModule;
	if (!window.TWEEN && typeof animationsModule.updateAnimations === 'function') {
		if (!window._animationCallbacks) window._animationCallbacks = [];
		window._animationCallbacks.push(animationsModule.updateAnimations);
	}
	return Promise.resolve(animationsModule);
}
