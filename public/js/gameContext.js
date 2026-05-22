/**
 * Game Context Module
 *
 * Centralised store for core THREE.js objects and shared game references.
 * Modules import getters/setters from here instead of relying on circular
 * imports through enhanced-gameCore.js.
 */

import gameState from './utils/gameState.js';

const _ctx = Object.create(null);

// ── THREE.js reference ──────────────────────────────────────────────────────

_ctx.THREE = window.THREE;

export function getTHREE() {
	if (!_ctx.THREE && window.THREE) _ctx.THREE = window.THREE;
	return _ctx.THREE;
}

export function setTHREE(val) {
	_ctx.THREE = val;
}

// ── Game state singleton ────────────────────────────────────────────────────

export function getGameState() {
	return gameState;
}

// ── Scene graph objects ─────────────────────────────────────────────────────

export function getScene() { return _ctx.scene; }
export function setScene(val) {
	_ctx.scene = val;
	gameState.scene = val;
}

export function getCamera() { return _ctx.camera; }
export function setCamera(val) {
	_ctx.camera = val;
	gameState.camera = val;
}

export function getRenderer() { return _ctx.renderer; }
export function setRenderer(val) {
	_ctx.renderer = val;
	gameState.renderer = val;
}

export function getControls() { return _ctx.controls; }
export function setControls(val) { _ctx.controls = val; }

// ── DOM elements ────────────────────────────────────────────────────────────

export function getContainerElement() { return _ctx.containerElement; }
export function setContainerElement(val) { _ctx.containerElement = val; }

export function getGameContainer() { return _ctx.gameContainer; }
export function setGameContainer(val) { _ctx.gameContainer = val; }

// ── Scene groups ────────────────────────────────────────────────────────────

export function getBoardGroup() { return _ctx.boardGroup; }
export function setBoardGroup(val) {
	_ctx.boardGroup = val;
	gameState.boardGroup = val;
}

export function getTetrominoGroup() { return _ctx.tetrominoGroup; }
export function setTetrominoGroup(val) {
	_ctx.tetrominoGroup = val;
	gameState.tetrominoGroup = val;
}

export function getChessPiecesGroup() { return _ctx.chessPiecesGroup; }
export function setChessPiecesGroup(val) { _ctx.chessPiecesGroup = val; }

export function getPowerUpGroup() { return _ctx.powerUpGroup; }
export function setPowerUpGroup(val) {
	_ctx.powerUpGroup = val;
	gameState.powerUpGroup = val;
}

// ── Interaction helpers ─────────────────────────────────────────────────────

export function getRaycaster() { return _ctx.raycaster; }
export function setRaycaster(val) { _ctx.raycaster = val; }

export function getMouse() { return _ctx.mouse; }
export function setMouse(val) { _ctx.mouse = val; }

// ── Animation state ─────────────────────────────────────────────────────────

export function getClouds() { return _ctx.clouds; }
export function setClouds(val) { _ctx.clouds = val; }

export function getAnimationQueue() {
	if (!_ctx.animationQueue) _ctx.animationQueue = [];
	return _ctx.animationQueue;
}

export function getAnimationFrameId() { return _ctx.animationFrameId; }
export function setAnimationFrameId(val) { _ctx.animationFrameId = val; }

// ── Constants ───────────────────────────────────────────────────────────────

const PLAYER_COLORS = Object.freeze({
	self: 0xDD0000,
	other: 0x0088AA
});

export function getPlayerColors() { return PLAYER_COLORS; }

// Axis helper constants
export const AXIS_LENGTH = 20;
export const AXIS_LABEL_SIZE = 1.0;
export const AXIS_LABEL_OFFSET = 1.2;
