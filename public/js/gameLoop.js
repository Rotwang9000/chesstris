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
import { syncPowerUps, animatePowerUps } from './powerUpRenderer.js';
import { syncNameplates, animateNameplates } from './nameplateRenderer.js';
import { updateAwaitingPromotionHalos } from './updateChessPieces.js';

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

// Per-frame budget governor.
//
// `LATE_FRAME_BUDGET_MS` is the wall-clock spend (since the previous
// frame started) we treat as "we're falling behind". When the last
// frame went over budget we skip non-essential per-frame work this
// frame so we don't compound the deficit — that's the "miss frames if
// things are taking too long" behaviour the user asked for. After
// `RECOVERY_FRAMES` consecutive on-budget frames we drop back into
// normal mode and resume everything.
const LATE_FRAME_BUDGET_MS = 33; // 30 FPS threshold
const RECOVERY_FRAMES = 6;
let consecutiveOnBudgetFrames = RECOVERY_FRAMES;
let skipNonEssentialThisFrame = false;

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
	const gs = getGameState();
	if (!gs?.debugMode) return;
	try {
		if (object.children) {
			for (let i = object.children.length - 1; i >= 0; i--) {
				if (!object.children[i]) {
					object.children.splice(i, 1);
				}
			}
		}
	} catch (err) {
		console.error('Error validating scene graph:', err);
	}
}

// ── Board visual refresh (delegated) ────────────────────────────────────────

let _updateBoardVisuals = null;
export function setUpdateBoardVisuals(fn) { _updateBoardVisuals = fn; }

// ── Main animation loop ────────────────────────────────────────────────────

function animate(time) {
	setAnimationFrameId(requestAnimationFrame(animate));
	const frameStart = perfNow();

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
		const sinceLastFrameMs = time - lastTime;
		lastTime = time;

		frameSkip = (frameSkip + 1) % HEAVY_OPERATION_FRAME_MOD;
		const isHeavyFrame = frameSkip === 0;

		// Per-frame budget governor — if the prior frame took longer
		// than LATE_FRAME_BUDGET_MS we're falling behind, so we drop
		// the "look pretty" updates this frame to give the next one
		// a chance to catch up. We *never* skip controls.update or
		// the renderer call — interaction must stay responsive.
		if (sinceLastFrameMs > LATE_FRAME_BUDGET_MS) {
			skipNonEssentialThisFrame = true;
			consecutiveOnBudgetFrames = 0;
		} else if (consecutiveOnBudgetFrames < RECOVERY_FRAMES) {
			consecutiveOnBudgetFrames++;
			if (consecutiveOnBudgetFrames >= RECOVERY_FRAMES) {
				skipNonEssentialThisFrame = false;
			}
		}

		if (delta > 1) return;

		if (!gameState.paused) {
			if (controls) controls.update();

			if (time - lastControlsUpdate > 16) {
				lastControlsUpdate = time;
			}

			if (!skipNonEssentialThisFrame) handleMouseHover();

			if (window.cameraInfoDisplay && time - window.cameraInfoDisplay.lastUpdate > window.cameraInfoDisplay.updateInterval) {
				try { updateCameraInfoDisplay(); window.cameraInfoDisplay.lastUpdate = time; } catch (_) {}
			}

			// Heavy decorative updates only when the budget says it's safe.
			if (!skipNonEssentialThisFrame && isHeavyFrame && clouds && Array.isArray(clouds)) {
				for (let i = 0; i < clouds.length; i++) {
					if (clouds[i]) clouds[i].rotation.y += 0.001 * delta * 3;
				}
				if (typeof sceneModule.animateFloatingIslands === 'function') {
					sceneModule.animateFloatingIslands(scene);
				}
			}

			if (!skipNonEssentialThisFrame) {
				if (gameState.renderProfile === 'cute') {
					if (typeof sceneModule.animateCuteElements === 'function') sceneModule.animateCuteElements(scene, delta);
				} else if (gameState.renderProfile !== 'retro') {
					if (typeof sceneModule.animateAmbientParticles === 'function') sceneModule.animateAmbientParticles(scene, delta);
					if (typeof sceneModule.animateSkyDecorations === 'function') sceneModule.animateSkyDecorations(scene);
					if (typeof sceneModule.updateWaterPlane === 'function') sceneModule.updateWaterPlane(scene);
				}
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

			// Power-ups: reconcile each frame (cheap O(n) of active
			// orbs which is at most a handful) so newly-spawned /
			// expired orbs appear without waiting for the heavier
			// `updateChessPieces` pulse.
			try {
				syncPowerUps(Array.isArray(gameState.powerUps) ? gameState.powerUps : []);
			} catch (e) {
				console.error('Error syncing power-ups:', e);
			}
			try {
				animatePowerUps(time * 0.001);
			} catch (e) {
				console.error('Error animating power-ups:', e);
			}

			// Player nameplates above each king. Captures-strip
			// shows only when the local player is observing — the
			// HUD already displays it for active players.
			try {
				const pieces = Array.isArray(gameState.chessPieces) ? gameState.chessPieces : [];
				const players = gameState.players || {};
				const isSpectator = !!(gameState.isObserver || gameState.spectator || gameState.spectatingPlayer);
				syncNameplates(pieces, players, {
					showCaptures: isSpectator,
					gameState,
				});
				animateNameplates(time * 0.001);
			} catch (e) {
				console.error('Error syncing nameplates:', e);
			}

			// Glow halo on any frozen pawn awaiting promotion. Skips the
			// loop entirely when nobody has one queued.
			try {
				const piecesGroup = gameState.chessPiecesGroup
					|| (typeof window !== 'undefined' && window.chessPiecesGroup);
				if (piecesGroup) updateAwaitingPromotionHalos(piecesGroup);
			} catch (e) {
				console.error('Error animating awaiting-promotion halos:', e);
			}
		}

		// TWEENs MUST run every frame — they drive piece moves and
		// camera glides. Skipping them would make controls feel
		// frozen which is worse than a slow frame.
		if (window.TWEEN) window.TWEEN.update();

		if (!skipNonEssentialThisFrame
			&& window.animationsModule && typeof window.animationsModule.updateAnimations === 'function') {
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

		if (!skipNonEssentialThisFrame && isHeavyFrame) {
			if (time - lastLODUpdate > LOD_UPDATE_INTERVAL) {
				lastLODUpdate = time;
				if (typeof animateClouds === 'function') animateClouds(scene);
				if (typeof sceneModule.animateFloatingIslands === 'function') sceneModule.animateFloatingIslands(scene);
				if (typeof sceneModule.updateWaterPlane === 'function') sceneModule.updateWaterPlane(scene);
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

		// If THIS frame ran long, propagate the signal so the next
		// frame also throttles itself. Without this, a single heavy
		// frame would only skip non-essentials once.
		const frameElapsed = perfNow() - frameStart;
		if (frameElapsed > LATE_FRAME_BUDGET_MS) {
			skipNonEssentialThisFrame = true;
			consecutiveOnBudgetFrames = 0;
		}
	} catch (error) {
		console.error('Error in animation loop:', error);
	}
}
