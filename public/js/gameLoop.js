/**
 * Game Loop Module
 *
 * Manages the requestAnimationFrame loop, performance monitoring,
 * scene validation, and periodic update scheduling.
 */

import {
	getGameState, getScene, getCamera, getRenderer, getControls,
	getClouds, getAnimationQueue, getAnimationFrameId, setAnimationFrameId,
	getChessPiecesGroup, getBoardGroup
} from './gameContext.js';
import * as sceneModule from './scene.js';
import * as tetrominoModule from './tetromino.js';
import { animateClouds } from './textures.js';
import { updateUnifiedPlayerBar } from './unifiedPlayerBar.js';
import { updateChessPieces } from './updateChessPieces.js';
import { handleMouseHover } from './chessInteraction.js';

// ── Timing state ────────────────────────────────────────────────────────────

let tetrisLastFallTime = Date.now();
const perfNow = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

let lastTime = perfNow();
let lastLODUpdate = 0;
let lastGameLogicUpdate = 0;
let lastUiUpdate = 0;
let lastControlsUpdate = 0;

let frameCount = 0;
let lastFpsUpdate = perfNow();
let frameSkip = 0;

let lastSceneValidation = null;
let lastGroupCheck = null;

let LOD_UPDATE_INTERVAL = 2000;
let GAME_LOGIC_INTERVAL = 500;
const HEAVY_OPERATION_FRAME_MOD = 3;

const PERFORMANCE_FPS_LOW = 24;
const PERFORMANCE_FPS_HIGH = 45;
const TETROMINO_FALL_INTERVAL_MS = 1000;
const SCENE_VALIDATION_INTERVAL = 5000;
const UI_UPDATE_INTERVAL = 2000;

export function resetTetrisLastFallTime() {
	tetrisLastFallTime = Date.now();
}

// ── Game loop entry point ───────────────────────────────────────────────────

export function startGameLoop() {
	const gameState = getGameState();
	const controls = getControls();

	console.log('Starting enhanced game loop...');

	tetrisLastFallTime = Date.now();
	lastTime = perfNow();
	lastLODUpdate = 0;
	lastGameLogicUpdate = 0;
	lastUiUpdate = 0;
	lastControlsUpdate = 0;
	frameCount = 0;
	lastFpsUpdate = perfNow();
	frameSkip = 0;

	const performanceMode = !!gameState.performanceMode;
	LOD_UPDATE_INTERVAL = performanceMode ? 3000 : 2000;
	GAME_LOGIC_INTERVAL = performanceMode ? 1000 : 500;

	if (controls) {
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		try { controls.update(); } catch (_) { /* best-effort */ }
	}

	setAnimationFrameId(requestAnimationFrame(animate));
}

// ── Animation queue ─────────────────────────────────────────────────────────

function processAnimationQueue() {
	const animationQueue = getAnimationQueue();
	if (!animationQueue || animationQueue.length === 0) return;

	const next = animationQueue[0];
	if (!next) { animationQueue.shift(); return; }

	if (typeof next === 'function') {
		try { next(); } catch (error) { console.warn('Error running queued animation callback:', error); }
		animationQueue.shift();
		return;
	}

	if (typeof next.update === 'function') {
		let done = false;
		try { done = next.update(); } catch (error) {
			console.warn('Error updating queued animation object:', error);
			done = true;
		}
		if (done) animationQueue.shift();
		return;
	}

	animationQueue.shift();
}

// ── Camera debug display ────────────────────────────────────────────────────

function updateCameraInfoDisplay() {
	try {
		if (!window.cameraInfoDisplay) return;
		const camera = getCamera();
		const controls = getControls();
		const gameState = getGameState();

		const element = window.cameraInfoDisplay.element || window.cameraInfoDisplay.domElement || window.cameraInfoDisplay;
		if (!element || !element.style) return;

		const fmt = (v) => {
			if (!v) return "(0, 0, 0)";
			return `(${Number(v.x || 0).toFixed(2)}, ${Number(v.y || 0).toFixed(2)}, ${Number(v.z || 0).toFixed(2)})`;
		};

		let displayText = `Position: ${fmt(camera?.position)}<br>Looking at: ${fmt(controls?.target)}`;
		if (gameState.debugMode && window.cameraInfoDisplay.fps) {
			displayText += `<br>FPS: ${window.cameraInfoDisplay.fps}`;
		}
		element.innerHTML = displayText;
	} catch (_) { /* silent in production */ }
}

// ── Performance governor ────────────────────────────────────────────────────

function monitorPerformance(fps) {
	if (typeof fps !== 'number' || Number.isNaN(fps)) return;
	const gameState = getGameState();

	const wasPerfMode = !!gameState.performanceMode;
	let perfMode = wasPerfMode;

	if (!wasPerfMode && fps < PERFORMANCE_FPS_LOW) perfMode = true;
	else if (wasPerfMode && fps > PERFORMANCE_FPS_HIGH) perfMode = false;

	if (perfMode !== wasPerfMode) {
		gameState.performanceMode = perfMode;
		LOD_UPDATE_INTERVAL = perfMode ? 3000 : 2000;
		GAME_LOGIC_INTERVAL = perfMode ? 1000 : 500;
		console.log(`Performance mode ${perfMode ? 'enabled' : 'disabled'} (fps=${fps})`);
	}
}

// ── Tetromino auto-fall ─────────────────────────────────────────────────────

function updateGameLogic(_deltaTime) {
	try {
		const gameState = getGameState();
		if (gameState.turnPhase === 'tetris' && gameState.currentTetromino) {
			const now = Date.now();
			if ((now - tetrisLastFallTime) > TETROMINO_FALL_INTERVAL_MS) {
				tetrominoModule.moveTetrominoY(-1, true);
				tetrisLastFallTime = now;
			}
		}
	} catch (error) {
		console.error('Error in updateGameLogic:', error);
	}
}

// ── Scene validation ────────────────────────────────────────────────────────

function validateSceneGraph(object) {
	if (!object) return;
	try {
		if (object.visible === undefined || object.visible === null) {
			object.visible = true;
		}
		if (object.matrixAutoUpdate && object.matrix?.elements?.some(e => Number.isNaN(e))) {
			object.updateMatrix();
		}
		if (object.children) {
			const hasNullChildren = object.children.some(c => c === null || c === undefined);
			if (hasNullChildren) {
				object.children = object.children.filter(c => c !== null && c !== undefined);
			}
			for (const child of [...object.children]) {
				if (child) validateSceneGraph(child);
			}
		}
	} catch (err) {
		console.error('Error validating object in scene graph:', err);
	}
}

// ── Board visual refresh (delegated) ────────────────────────────────────────

let _updateBoardVisuals = null;
export function setUpdateBoardVisuals(fn) { _updateBoardVisuals = fn; }

// ── Main animation loop ────────────────────────────────────────────────────

function animate(time) {
	setAnimationFrameId(requestAnimationFrame(animate));

	try {
		const scene = getScene();
		const camera = getCamera();
		const renderer = getRenderer();
		const controls = getControls();
		const gameState = getGameState();
		const clouds = getClouds();
		const animationQueue = getAnimationQueue();
		const chessPiecesGroup = getChessPiecesGroup();

		const delta = (time - lastTime) / 1000;
		lastTime = time;

		frameSkip = (frameSkip + 1) % HEAVY_OPERATION_FRAME_MOD;
		const isHeavyFrame = frameSkip === 0;

		if (delta > 1) return;

		if (!gameState.paused) {
			if (controls) controls.update();

			if (time - lastControlsUpdate > 16) {
				lastControlsUpdate = time;
			}

			handleMouseHover();

			if (window.cameraInfoDisplay && time - window.cameraInfoDisplay.lastUpdate > window.cameraInfoDisplay.updateInterval) {
				try { updateCameraInfoDisplay(); window.cameraInfoDisplay.lastUpdate = time; } catch (_) {}
			}

			if (isHeavyFrame && clouds && Array.isArray(clouds)) {
				for (let i = 0; i < clouds.length; i++) {
					if (clouds[i]) clouds[i].rotation.y += 0.001 * delta * 3;
				}
				if (typeof sceneModule.animateFloatingIslands === 'function') {
					sceneModule.animateFloatingIslands(scene);
				}
			}

			if (gameState.renderProfile === 'cute') {
				if (typeof sceneModule.animateCuteElements === 'function') sceneModule.animateCuteElements(scene, delta);
			} else if (gameState.renderProfile !== 'retro') {
				if (typeof sceneModule.animateAmbientParticles === 'function') sceneModule.animateAmbientParticles(scene, delta);
			}

			if (animationQueue && animationQueue.length > 0) processAnimationQueue();

			if (time - lastUiUpdate > UI_UPDATE_INTERVAL) {
				if (typeof updateUnifiedPlayerBar === 'function') {
					try { updateUnifiedPlayerBar(gameState); } catch (e) { console.error('Error updating player bar:', e); }
				}
				if (typeof updateChessPieces === 'function' && chessPiecesGroup) {
					try { if (_updateBoardVisuals) _updateBoardVisuals(); } catch (e) { console.error('Error updating chess pieces:', e); }
				}
				lastUiUpdate = time;
			}
		}

		if (window.TWEEN) window.TWEEN.update();

		if (window.animationsModule && typeof window.animationsModule.updateAnimations === 'function') {
			window.animationsModule.updateAnimations();
		}

		if (window._animationCallbacks && Array.isArray(window._animationCallbacks)) {
			for (let i = 0; i < window._animationCallbacks.length; i++) {
				if (typeof window._animationCallbacks[i] === 'function') {
					try { window._animationCallbacks[i](); } catch (_) {}
				}
			}
		}

		frameCount++;
		if (time - lastFpsUpdate > 1000) {
			const fps = Math.round((frameCount * 1000) / (time - lastFpsUpdate));
			frameCount = 0;
			lastFpsUpdate = time;
			if (window.cameraInfoDisplay) window.cameraInfoDisplay.fps = fps;
			if (time > 10000) monitorPerformance(fps);
		}

		if (isHeavyFrame) {
			if (time - lastLODUpdate > LOD_UPDATE_INTERVAL) {
				lastLODUpdate = time;
				if (typeof animateClouds === 'function') animateClouds(scene);
				if (typeof sceneModule.animateFloatingIslands === 'function') sceneModule.animateFloatingIslands(scene);
			}
			if (time - lastGameLogicUpdate > GAME_LOGIC_INTERVAL) {
				lastGameLogicUpdate = time;
				updateGameLogic(delta);
			}
		}

		if (renderer && scene && camera) {
			const now = Date.now();
			if (!lastSceneValidation || now - lastSceneValidation > SCENE_VALIDATION_INTERVAL) {
				if (scene) validateSceneGraph(scene);
				lastSceneValidation = now;
			}

			if (!lastGroupCheck || now - lastGroupCheck > SCENE_VALIDATION_INTERVAL) {
				lastGroupCheck = now;
			}

			try { renderer.render(scene, camera); } catch (renderError) {
				console.error('Error during render:', renderError);
			}
		}
	} catch (error) {
		console.error('Error in animation loop:', error);
	}
}
