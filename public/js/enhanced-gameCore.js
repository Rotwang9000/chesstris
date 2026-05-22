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
	setRaycaster, setMouse,
	getPlayerColors,
} from './gameContext.js';

// ── Extracted modules ───────────────────────────────────────────────────────

import { createRendererWithFallback } from './rendererManager.js';
import { setupInputHandlers, setTetrisPhaseClickHandler, setAxisHelpersVisibilityHandler } from './inputManager.js';
import { startGameLoop, resetTetrisLastFallTime, setUpdateBoardVisuals } from './gameLoop.js';
import { setupNetworkEvents as installNetworkEvents } from './enhanced-gameCore/networkEvents.js';
import { showWebglUnavailableOverlay } from './enhanced-gameCore/webglOverlay.js';
import { createLabeledAxisHelpers } from './enhanced-gameCore/axisHelpers.js';
import { showGameOverPulseOverlay } from './enhanced-gameCore/gameOverOverlay.js';
import { initializeOrbitControls } from './enhanced-gameCore/orbitControls.js';

// ── Existing dependencies ───────────────────────────────────────────────────

import * as sceneModule from './scene.js';
import * as tetrominoModule from './tetromino.js';
import { boardFunctions } from './boardFunctions.js';
import { createUnifiedPlayerBar } from './unifiedPlayerBar.js';
import * as NetworkManager from './utils/networkManager.js';
import { showToastMessage } from './showToastMessage.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';
import {
	createLoadingIndicator, hideAllLoadingElements,
	showErrorMessage, hideError,
	updateGameStatusDisplay,
	showTutorialMessage
} from './createLoadingIndicator.js';
import { resetCameraForGameplay, moveToPlayerZone, setCameraToOverview as setCameraToOverviewExtracted, flyToPosition } from './setupCamera.js';
import { initCameraControlsHelp } from './cameraControlsHelp.js';
import { setChessPiecesGroup as setWingsChessGroup } from './wingAnimations.js';
import { preserveCentreMarker, translatePosition } from './centreBoardMarker.js';
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

// ── Local state ─────────────────────────────────────────────────────────────

let uiButtons = {};

let _axisHelpersCtrl = null;

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
	console.log("Initialising Tetches game...");

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
			renderer.domElement.setAttribute('aria-label', 'Tetches game board');
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
			window.startTetchesGame = startPlayingGame;
			setCameraToOverview();
			showTutorialMessage(window.startTetchesGame);
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
		
		if (webglInitFailure) {
			showWebglUnavailableOverlay(errorMessage);
		} else if (typeof showErrorMessage === 'function') {
			showErrorMessage(`Game initialisation failed: ${errorMessage}`);
		}
		return false;
	}
}

export { showWebglUnavailableOverlay };

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
	setWingsChessGroup(chessPiecesGroup);

	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	setRaycaster(raycaster);
	setMouse(mouse);

	if (gameState.debugMode) _axisHelpersCtrl = createLabeledAxisHelpers();

	setupInputHandlers();

	const renderer = getRenderer();
	const camera = getCamera();
	if (renderer && scene && camera) renderer.render(scene, camera);
}

function updateAxisHelpersVisibility() {
	if (!_axisHelpersCtrl && gameState.debugMode) {
		_axisHelpersCtrl = createLabeledAxisHelpers();
	}
	if (_axisHelpersCtrl) _axisHelpersCtrl.setVisible(!!gameState.debugMode);
}

// ── Camera helpers ──────────────────────────────────────────────────────────

function setCameraToOverview() {
	setCameraToOverviewExtracted(getCamera(), getControls(), gameState);
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

export function setupNetworkEvents() {
	installNetworkEvents({
		showGameOverPulseOverlay,
		renderCurrentTetromino,
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
				const existing = gameState.board.cells[key];
				const cellArray = Array.isArray(existing) ? existing.slice() : [];
				if (!cellArray.some(item => item && (
					item.type === 'boardCentre'
						|| (item.type === 'specialMarker' && item.isCentreMarker)
				))) {
					cellArray.push({
						type: 'boardCentre',
						isCentreMarker: true,
						centreX: centreMarker.x,
						centreZ: centreMarker.z,
					});
				}
				gameState.board.cells[key] = cellArray;
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

export function startPlayingGame(gameKey = null) {
	if (gameState.inProgress && gameState.gameStarted) return;
	console.log('Entering world...', gameKey ? `with key: ${gameKey}` : 'default shared world');

	if (gameKey) {
		localStorage.setItem('tetches_game_key', gameKey);
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

export function flyToCell(boardX, boardZ) {
	const camera = getCamera();
	const controls = getControls();
	const renderer = getRenderer();
	const scene = getScene();
	if (!camera || !controls || !Number.isFinite(boardX) || !Number.isFinite(boardZ)) return false;

	const pos = translatePosition({ x: boardX, z: boardZ }, gameState, true);
	if (!pos) return false;
	const dist = 30;
	const height = dist * Math.sin(Math.PI / 4);
	const targetPosition = { x: pos.x, y: height, z: pos.z - dist };
	const targetLookAt = { x: pos.x, y: 0, z: pos.z };
	flyToPosition(camera, controls, targetPosition, targetLookAt, renderer, scene);
	return true;
}

export function flyToPlayerKing(playerId) {
	const camera = getCamera();
	const controls = getControls();
	const renderer = getRenderer();
	const scene = getScene();
	if (!camera || !controls) {
		console.warn('[flyToPlayerKing] camera/controls not ready');
		return false;
	}
	console.log('[flyToPlayerKing] target playerId:', playerId, {
		hasChessPieces: Array.isArray(gameState.chessPieces),
		piecesForPlayer: Array.isArray(gameState.chessPieces)
			? gameState.chessPieces.filter(p => String(p?.player) === String(playerId)).length
			: 0,
		hasHomeZone: !!(gameState.homeZones && gameState.homeZones[playerId]),
	});
	const moved = moveToPlayerZone(camera, controls, gameState, renderer, scene, true, false, null, playerId);
	console.log('[flyToPlayerKing] moveToPlayerZone returned:', moved);
	return moved;
}

export function exposeHighlightFunctionsGlobally() {
	window.gameCore = window.gameCore || {};
	window.gameCore.highlightPlayerPieces = highlightPlayerPieces;
	window.gameCore.removePlayerPiecesHighlight = removePlayerPiecesHighlight;
	window.gameCore.highlightCurrentPlayerPieces = highlightCurrentPlayerPieces;
	window.gameCore.resetCamera = resetCamera;
	window.gameCore.flyToPlayerKing = flyToPlayerKing;
	window.gameCore.flyToCell = flyToCell;
	window.gameState = gameState;

	const resetBtn = document.getElementById('reset-camera-btn');
	if (resetBtn) resetBtn.addEventListener('click', () => resetCamera(true));

	// Keyboard camera shortcuts + the "Controls" help overlay. Without
	// these touchpad users have no way to zoom (the user explicitly hit
	// this; see public/js/cameraControlsHelp.js for details).
	initCameraControlsHelp(getControls, getCamera, resetCamera);

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

// ── Animations ──────────────────────────────────────────────────────────────

export function initializeAnimations() {
	window.animationsModule = animationsModule;
	if (!window.TWEEN && typeof animationsModule.updateAnimations === 'function') {
		if (!window._animationCallbacks) window._animationCallbacks = [];
		window._animationCallbacks.push(animationsModule.updateAnimations);
	}
	return Promise.resolve(animationsModule);
}
