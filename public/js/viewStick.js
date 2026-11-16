/**
 * View joystick: an optional on-screen stick that moves the camera, for
 * players who would sooner not drag the board (laptop trackpads, phones).
 *
 *   Move  the view glides across the board the way the stick leans
 *   Turn  left/right swings the camera round, up/down tilts it
 *
 * Off by default; switched on from the Next Piece panel (hudLayout.js).
 * Its look is `#view-stick` in the UI theme (index.html), drawn from the
 * theme's own colours so Normal, Cute and Retro each get their stick.
 * It drives the same OrbitControls the mouse does, so limits (zoom,
 * tilt) and damping are shared.
 */

import { getCamera, getControls } from './gameContext.js';

const STICK_ID = 'view-stick';
const MODE_KEY = 'tetches.hud.viewStickMode';
/** Knob travel as a share of the base radius. */
const TRAVEL = 0.56;
/** Below this deflection the stick is at rest (a resting thumb drifts). */
export const DEAD_ZONE = 0.12;
/** Full lean, Move: board lengths per second, as a share of the camera's distance. */
const PAN_PER_SECOND = 0.85;
/** Full lean, Turn: radians per second round, and tilting. */
const TURN_PER_SECOND = 1.5;
const TILT_PER_SECOND = 0.9;
const MIN_POLAR = 0.12;

/**
 * Pointer offset from the base's centre → stick deflection, each axis
 * -1…1 (length capped at 1), 0 inside the dead zone.
 */
export function stickVector(dx, dy, radius) {
	const reach = Math.max(1, radius * TRAVEL);
	let x = dx / reach;
	let y = dy / reach;
	const length = Math.hypot(x, y);
	if (length < DEAD_ZONE) return { x: 0, y: 0 };
	if (length > 1) { x /= length; y /= length; }
	return { x, y };
}

/**
 * Glide: how far the view moves on the ground this frame.
 * `forward` is the camera's heading on the ground (unit {x, z}).
 * Stick up = away from the camera, stick right = to the camera's right.
 */
export function panDelta(stick, forward, distance, seconds) {
	const step = distance * PAN_PER_SECOND * seconds;
	const ahead = -stick.y * step;
	const aside = stick.x * step;
	return {
		x: forward.x * ahead - forward.z * aside,
		z: forward.z * ahead + forward.x * aside,
	};
}

/** Swing/tilt: the camera's new angles round its target. */
export function turnAngles(stick, theta, phi, maxPolar, seconds) {
	const top = Number.isFinite(maxPolar) ? maxPolar : Math.PI / 2 - 0.1;
	return {
		theta: theta - stick.x * TURN_PER_SECOND * seconds,
		phi: Math.min(top, Math.max(MIN_POLAR, phi + stick.y * TILT_PER_SECOND * seconds)),
	};
}

/** Zoom speed: the distance changes by this fraction per second held. */
const ZOOM_PER_SECOND = 0.9;

/**
 * Zoom: the camera's new distance from its target after `seconds` of
 * holding + (dir 1, closer) or − (dir -1, further), within the
 * controls' limits.
 */
export function zoomDistance(distance, dir, seconds, min = 1, max = 1000) {
	const k = Math.exp(-dir * ZOOM_PER_SECOND * seconds);
	return Math.min(max, Math.max(min, distance * k));
}

let root = null;
let zoomDir = 0;
let zoomFrame = 0;
let zoomLast = 0;
let knob = null;
let modeButton = null;
let mode = 'move';
let stick = { x: 0, y: 0 };
let pointerId = null;
let frame = 0;
let lastTime = 0;

function readMode() {
	try { return window.localStorage?.getItem(MODE_KEY) === 'turn' ? 'turn' : 'move'; } catch (_e) { return 'move'; }
}

function paintMode() {
	if (!root || !modeButton) return;
	root.dataset.mode = mode;
	modeButton.textContent = mode === 'turn' ? 'Turn' : 'Move';
	modeButton.title = mode === 'turn'
		? 'The stick turns and tilts the camera. Click to make it move the view.'
		: 'The stick moves the view across the board. Click to make it turn the camera.';
}

function applyStick(seconds) {
	const camera = getCamera();
	const controls = getControls();
	if (!camera || !controls?.target) return;
	const target = controls.target;
	const ox = camera.position.x - target.x;
	const oy = camera.position.y - target.y;
	const oz = camera.position.z - target.z;
	const distance = Math.hypot(ox, oy, oz) || 1;
	if (mode === 'turn') {
		const next = turnAngles(stick, Math.atan2(ox, oz), Math.acos(Math.max(-1, Math.min(1, oy / distance))),
			controls.maxPolarAngle, seconds);
		const flat = distance * Math.sin(next.phi);
		camera.position.set(
			target.x + flat * Math.sin(next.theta),
			target.y + distance * Math.cos(next.phi),
			target.z + flat * Math.cos(next.theta),
		);
	} else {
		const ground = Math.hypot(ox, oz);
		// Looking straight down there is no heading; fall back to "up the screen".
		const forward = ground > 1e-4 ? { x: -ox / ground, z: -oz / ground } : { x: 0, z: -1 };
		const delta = panDelta(stick, forward, distance, seconds);
		target.x += delta.x; target.z += delta.z;
		camera.position.x += delta.x; camera.position.z += delta.z;
	}
	try { controls.update(); } catch (_e) { /* best-effort */ }
}

function tick(now) {
	frame = 0;
	if (pointerId == null) return;
	// (capped: a tab that was in the background must not leap on return)
	const seconds = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
	lastTime = now;
	if (stick.x || stick.y) applyStick(seconds);
	frame = requestAnimationFrame(tick);
}

function applyZoom(seconds) {
	const camera = getCamera();
	const controls = getControls();
	if (!camera || !controls?.target) return;
	const t = controls.target;
	const ox = camera.position.x - t.x, oy = camera.position.y - t.y, oz = camera.position.z - t.z;
	const d = Math.hypot(ox, oy, oz);
	if (!(d > 0)) return;
	const min = Number.isFinite(controls.minDistance) ? controls.minDistance : 1;
	const max = Number.isFinite(controls.maxDistance) ? controls.maxDistance : 1000;
	const k = zoomDistance(d, zoomDir, seconds, min, max) / d;
	camera.position.set(t.x + ox * k, t.y + oy * k, t.z + oz * k);
	try { controls.update(); } catch (_e) { /* best-effort */ }
}

function zoomTick(now) {
	zoomFrame = 0;
	if (!zoomDir) return;
	const seconds = Math.min(0.05, Math.max(0, (now - zoomLast) / 1000));
	zoomLast = now;
	applyZoom(seconds);
	zoomFrame = requestAnimationFrame(zoomTick);
}

function stopZoom() {
	zoomDir = 0;
	if (zoomFrame) { cancelAnimationFrame(zoomFrame); zoomFrame = 0; }
	if (root) delete root.dataset.zooming;
}

/** A hold-to-zoom button: + closer, − further. */
function zoomButton(dir) {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'view-stick-zoom-btn';
	b.textContent = dir > 0 ? '+' : '\u2212';
	b.setAttribute('aria-label', dir > 0 ? 'Zoom in' : 'Zoom out');
	b.title = dir > 0 ? 'Hold to zoom in' : 'Hold to zoom out';
	b.addEventListener('pointerdown', (event) => {
		event.preventDefault();
		try { b.setPointerCapture(event.pointerId); } catch (_e) { /* older browsers */ }
		zoomDir = dir;
		if (root) root.dataset.zooming = dir > 0 ? 'in' : 'out';
		zoomLast = performance.now();
		// a tap is a step, a hold keeps going
		applyZoom(0.18);
		if (!zoomFrame) zoomFrame = requestAnimationFrame(zoomTick);
	});
	for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
		b.addEventListener(type, stopZoom);
	}
	b.addEventListener('contextmenu', event => event.preventDefault());
	b.addEventListener('click', () => b.blur());
	return b;
}

function release() {
	pointerId = null;
	stick = { x: 0, y: 0 };
	if (knob) knob.style.transform = '';
	if (root) delete root.dataset.held;
	if (frame) { cancelAnimationFrame(frame); frame = 0; }
}

function lean(event) {
	const base = root.querySelector('.view-stick-base');
	const rect = base.getBoundingClientRect();
	const radius = rect.width / 2;
	stick = stickVector(event.clientX - (rect.left + radius), event.clientY - (rect.top + radius), radius);
	const reach = radius * TRAVEL;
	knob.style.transform = `translate(${(stick.x * reach).toFixed(1)}px, ${(stick.y * reach).toFixed(1)}px)`;
}

function build() {
	root = document.createElement('div');
	root.id = STICK_ID;

	modeButton = document.createElement('button');
	modeButton.type = 'button';
	modeButton.className = 'view-stick-mode';
	modeButton.addEventListener('click', () => {
		mode = mode === 'turn' ? 'move' : 'turn';
		try { window.localStorage?.setItem(MODE_KEY, mode); } catch (_e) { /* private mode */ }
		paintMode();
		modeButton.blur(); // Space must stay the game's drop key
	});

	const base = document.createElement('div');
	base.className = 'view-stick-base';
	base.setAttribute('role', 'slider');
	base.setAttribute('aria-label', 'View joystick: drag to move the camera');
	knob = document.createElement('div');
	knob.className = 'view-stick-knob';
	base.appendChild(knob);

	base.addEventListener('pointerdown', (event) => {
		if (pointerId != null) return;
		event.preventDefault();
		pointerId = event.pointerId;
		try { base.setPointerCapture(pointerId); } catch (_e) { /* older browsers */ }
		root.dataset.held = '1';
		lean(event);
		lastTime = performance.now();
		if (!frame) frame = requestAnimationFrame(tick);
	});
	base.addEventListener('pointermove', (event) => {
		if (event.pointerId === pointerId) lean(event);
	});
	for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
		base.addEventListener(type, (event) => { if (event.pointerId === pointerId) release(); });
	}
	base.addEventListener('contextmenu', event => event.preventDefault());

	const zoom = document.createElement('div');
	zoom.className = 'view-stick-zoom';
	zoom.append(zoomButton(1), zoomButton(-1));
	const row = document.createElement('div');
	row.className = 'view-stick-row';
	row.append(zoom, base);

	root.append(modeButton, row);
	document.body.appendChild(root);
	mode = readMode();
	paintMode();
}

/** Show or remove the stick. */
export function setViewStick(on) {
	if (on) {
		if (!root) build();
		return;
	}
	release();
	stopZoom();
	if (root) root.remove();
	root = null; knob = null; modeButton = null;
}

export function isViewStickShown() { return !!root; }
