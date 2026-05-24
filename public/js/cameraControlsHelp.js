/**
 * Camera controls help overlay + keyboard zoom shortcuts.
 *
 * Touchpad users often don't have a pinch-zoom gesture wired into the
 * page (the user explicitly hit this on their device: "I don't have
 * zoom on this touchpad, so I can't do it!"). This module:
 *
 *   1. Adds keyboard zoom shortcuts (`+`/`-`/`=`/`_`) and pan keys
 *      (`W`/`A`/`S`/`D`) that work in every game phase, so a player
 *      can always move the camera even without a wheel or pinch.
 *   2. Renders a "Camera & keyboard controls" cheatsheet overlay when
 *      the user clicks the new `#show-flight-controls-btn` button.
 *
 * Both pieces are deliberately separate from `inputManager.js` because
 * that file gates most keys behind `turnPhase === 'tetris'`; camera
 * controls must work during the chess phase too.
 */

const ZOOM_STEP = 0.18;
const PAN_STEP = 0.6;
// Rotation step in radians per keypress. ~8° feels responsive
// without being so coarse that holding the key whips the camera
// around uncontrollably.
const ROTATE_YAW_STEP = Math.PI / 22;
const ROTATE_PITCH_STEP = Math.PI / 36;
const MIN_PITCH = 0.18;          // never go fully overhead
const MAX_PITCH = Math.PI / 2 - 0.05; // never go below the horizon
const ESC_KEY = 'Escape';

let getControlsFn = null;
let getCameraFn = null;
let resetCameraFn = null;
let helpOverlay = null;
let keyHandlerInstalled = false;

/**
 * Bind the module to the live camera/controls references. Called from
 * `enhanced-gameCore.js` after the renderer is up.
 *
 * @param {() => Object|null} getControls
 * @param {() => Object|null} getCamera
 */
export function initCameraControlsHelp(getControls, getCamera, resetCamera) {
	getControlsFn = getControls;
	getCameraFn = getCamera;
	resetCameraFn = typeof resetCamera === 'function' ? resetCamera : null;

	installKeyboardCameraShortcuts();
	wireButton();
}

function getActiveControls() {
	try { return typeof getControlsFn === 'function' ? getControlsFn() : null; }
	catch (_) { return null; }
}

function getActiveCamera() {
	try { return typeof getCameraFn === 'function' ? getCameraFn() : null; }
	catch (_) { return null; }
}

function isTextInputFocused() {
	const el = document.activeElement;
	if (!el) return false;
	const tag = String(el.tagName || '').toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
	if (el.isContentEditable) return true;
	return false;
}

/**
 * Move the camera closer to or further from the orbit target.
 *
 * Using `dollyIn`/`dollyOut` directly would be ideal but those methods
 * are not part of the public OrbitControls API in every Three.js
 * build, so we fall back to manually scaling the offset from the
 * target. Respects the controls' `minDistance` / `maxDistance` cap.
 *
 * @param {number} sign  -1 to zoom out, +1 to zoom in
 */
function zoomCamera(sign) {
	const controls = getActiveControls();
	const camera = getActiveCamera();
	if (!controls || !camera || !controls.target) return;
	const offset = {
		x: camera.position.x - controls.target.x,
		y: camera.position.y - controls.target.y,
		z: camera.position.z - controls.target.z,
	};
	const dist = Math.sqrt(offset.x ** 2 + offset.y ** 2 + offset.z ** 2);
	if (dist <= 0) return;

	const factor = sign > 0 ? (1 - ZOOM_STEP) : (1 + ZOOM_STEP);
	let nextDist = dist * factor;
	const minDist = Number.isFinite(controls.minDistance) ? controls.minDistance : 1;
	const maxDist = Number.isFinite(controls.maxDistance) ? controls.maxDistance : 1000;
	if (nextDist < minDist) nextDist = minDist;
	if (nextDist > maxDist) nextDist = maxDist;
	const scale = nextDist / dist;
	camera.position.set(
		controls.target.x + offset.x * scale,
		controls.target.y + offset.y * scale,
		controls.target.z + offset.z * scale,
	);
	if (typeof controls.update === 'function') controls.update();
}

/**
 * Pan the camera along the floor plane.  `dx` / `dz` are in world units.
 * Used by the WASD keyboard shortcuts.
 */
function panCamera(dx, dz) {
	const controls = getActiveControls();
	const camera = getActiveCamera();
	if (!controls || !camera || !controls.target) return;
	camera.position.x += dx;
	camera.position.z += dz;
	controls.target.x += dx;
	controls.target.z += dz;
	if (typeof controls.update === 'function') controls.update();
}

/**
 * Rotate the camera around the controls.target.
 *
 * `yaw` rotates around the world Y axis (looking left/right);
 * `pitch` rotates around the camera's right vector (looking
 * up/down). Both are radians.
 *
 * OrbitControls exposes private `rotateLeft`/`rotateUp` but they
 * stage state for the next `update()` call and aren't stable across
 * Three.js builds — manipulating the offset vector directly is
 * tedious but completely portable.
 */
function rotateCamera(yaw, pitch) {
	const controls = getActiveControls();
	const camera = getActiveCamera();
	if (!controls || !camera || !controls.target) return;

	const ox = camera.position.x - controls.target.x;
	const oy = camera.position.y - controls.target.y;
	const oz = camera.position.z - controls.target.z;
	const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
	if (dist <= 0) return;

	// Convert to spherical (theta = yaw, phi = pitch from +Y axis).
	let theta = Math.atan2(ox, oz);
	let phi = Math.acos(oy / dist);

	theta -= yaw;          // yaw left = positive ⇒ orbit anticlockwise
	phi = Math.max(MIN_PITCH, Math.min(MAX_PITCH, phi - pitch));

	camera.position.set(
		controls.target.x + dist * Math.sin(phi) * Math.sin(theta),
		controls.target.y + dist * Math.cos(phi),
		controls.target.z + dist * Math.sin(phi) * Math.cos(theta),
	);
	camera.lookAt(controls.target.x, controls.target.y, controls.target.z);
	if (typeof controls.update === 'function') controls.update();
}

// Q/E/R/F double-duty as tetromino rotation in the tetris phase.
// Cheap getter so we don't take them away from the placer mid-fall.
function isTetrisPhaseActive() {
	const gs = (typeof window !== 'undefined') ? window.gameState : null;
	if (!gs) return false;
	if (gs.turnPhase !== 'tetris') return false;
	return !!gs.currentTetromino;
}

function installKeyboardCameraShortcuts() {
	if (keyHandlerInstalled) return;
	keyHandlerInstalled = true;

	document.addEventListener('keydown', (event) => {
		if (isTextInputFocused()) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === ESC_KEY && helpOverlay && helpOverlay.style.display !== 'none') {
			hideHelpOverlay();
			event.preventDefault();
			return;
		}

		// Zoom — also covers numpad +/- which fire as the same `key`.
		if (event.key === '+' || event.key === '=') {
			zoomCamera(+1);
			event.preventDefault();
			return;
		}
		if (event.key === '-' || event.key === '_') {
			zoomCamera(-1);
			event.preventDefault();
			return;
		}

		// "0" — reset camera in any phase.
		if (event.key === '0') {
			if (resetCameraFn) {
				resetCameraFn(true);
				event.preventDefault();
				return;
			}
		}

		// WASD panning (arrows are taken by the tetromino mover).
		switch (event.key) {
			case 'w': case 'W': panCamera(0, -PAN_STEP); event.preventDefault(); return;
			case 's': case 'S': panCamera(0, PAN_STEP);  event.preventDefault(); return;
			case 'a': case 'A': panCamera(-PAN_STEP, 0); event.preventDefault(); return;
			case 'd': case 'D':
				// Ctrl+D is a debug toggle elsewhere — we already
				// bailed out at the top of the handler when ctrl is
				// held, but be defensive.
				if (event.ctrlKey) return;
				panCamera(PAN_STEP, 0);
				event.preventDefault();
				return;
			// Rotate view. Q/E orbit left/right, R/F tilt up/down.
			// Z/X are intentionally avoided — they're commonly used
			// for tetromino rotation. Q/E/R also double as tetromino
			// rotation in the tetris phase, so we yield to the
			// placer while a piece is falling.
			case 'q': case 'Q':
				if (isTetrisPhaseActive()) return;
				rotateCamera(+ROTATE_YAW_STEP, 0);
				event.preventDefault();
				return;
			case 'e': case 'E':
				if (isTetrisPhaseActive()) return;
				rotateCamera(-ROTATE_YAW_STEP, 0);
				event.preventDefault();
				return;
			case 'r': case 'R':
				if (isTetrisPhaseActive()) return;
				rotateCamera(0, -ROTATE_PITCH_STEP);
				event.preventDefault();
				return;
			case 'f': case 'F':
				rotateCamera(0, +ROTATE_PITCH_STEP);
				event.preventDefault();
				return;
			// Comma / Period — always-on alternates for orbit yaw so
			// the camera can be steered even while a tetromino is
			// falling (Q/E/R are yielded to the placer above).
			case ',': case '<':
				rotateCamera(+ROTATE_YAW_STEP, 0);
				event.preventDefault();
				return;
			case '.': case '>':
				rotateCamera(-ROTATE_YAW_STEP, 0);
				event.preventDefault();
				return;
		}
	}, true);
}

function wireButton() {
	const btn = document.getElementById('show-flight-controls-btn');
	if (!btn) return;
	if (btn.dataset.wired === '1') return;
	btn.dataset.wired = '1';
	btn.addEventListener('click', showHelpOverlay);
}

function buildHelpOverlay() {
	const root = document.createElement('div');
	root.id = 'camera-controls-help';
	Object.assign(root.style, {
		position: 'fixed', inset: '0',
		display: 'none', alignItems: 'center', justifyContent: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		zIndex: '12500',
		fontFamily: 'Playfair Display, Times New Roman, serif',
	});
	root.addEventListener('click', (e) => {
		if (e.target === root) hideHelpOverlay();
	});

	const card = document.createElement('div');
	Object.assign(card.style, {
		maxWidth: '420px',
		width: 'min(90vw, 420px)',
		background: '#111',
		border: '2px solid #ffcc00',
		borderRadius: '8px',
		boxShadow: '0 0 30px rgba(255, 204, 0, 0.4)',
		padding: '18px 22px 16px',
		color: '#eee',
	});
	card.addEventListener('click', (e) => e.stopPropagation());

	const title = document.createElement('div');
	title.textContent = 'Camera & keyboard controls';
	Object.assign(title.style, {
		color: '#ffcc00', fontSize: '18px', fontWeight: 'bold',
		marginBottom: '12px',
	});

	const list = document.createElement('div');
	Object.assign(list.style, { fontSize: '13px', lineHeight: '1.6' });
	const items = [
		['Rotate view', 'Mouse drag (left button) — or , / . to orbit'],
		['Orbit (chess phase)', 'Q / E (yields to tetromino during a fall)'],
		['Tilt view', 'F to tilt down, R to tilt up (R only outside tetris)'],
		['Pan view', 'Mouse drag (right button) or W A S D'],
		['Zoom', 'Mouse wheel — or + / − keys (great for touchpads)'],
		['Reset camera', 'Click "Reset Camera" or press 0 in any phase'],
		['Touch', 'One finger to rotate, two fingers to pan/zoom'],
		['—', ''],
		['Move tetromino', 'Arrow keys'],
		['Rotate tetromino', 'Z or X (Q / E / R also work in tetris phase)'],
		['Hard drop tetromino', 'Spacebar'],
		['Skip chess move', 'Spacebar (when no chess move available)'],
		['Clear chess selection', 'Escape'],
		['Toggle debug mode', 'Ctrl + D'],
	];
	for (const [k, v] of items) {
		const row = document.createElement('div');
		Object.assign(row.style, {
			display: 'flex', justifyContent: 'space-between', gap: '12px',
			padding: '3px 0',
			borderTop: k === '—' ? '1px solid rgba(255, 204, 0, 0.25)' : 'none',
		});
		if (k === '—') {
			row.style.padding = '6px 0 0 0';
			list.appendChild(row);
			continue;
		}
		const keyEl = document.createElement('div');
		keyEl.textContent = k;
		Object.assign(keyEl.style, { color: '#ffcc00', minWidth: '120px' });
		const valEl = document.createElement('div');
		valEl.textContent = v;
		Object.assign(valEl.style, { color: '#ddd', textAlign: 'right', flex: '1 1 auto' });
		row.appendChild(keyEl);
		row.appendChild(valEl);
		list.appendChild(row);
	}

	const note = document.createElement('div');
	Object.assign(note.style, { fontSize: '11px', color: '#888', marginTop: '12px' });
	note.textContent = 'No pinch / wheel on your device? Use + and − to zoom.';

	const closeBtn = document.createElement('button');
	closeBtn.textContent = 'Close';
	Object.assign(closeBtn.style, {
		marginTop: '14px',
		padding: '6px 14px',
		background: '#333', color: '#ffcc00',
		border: '1px solid #ffcc00', borderRadius: '4px',
		cursor: 'pointer', float: 'right',
		fontFamily: 'inherit',
	});
	closeBtn.addEventListener('click', hideHelpOverlay);

	card.appendChild(title);
	card.appendChild(list);
	card.appendChild(note);
	card.appendChild(closeBtn);
	root.appendChild(card);
	document.body.appendChild(root);
	return root;
}

export function showHelpOverlay() {
	if (!helpOverlay) helpOverlay = buildHelpOverlay();
	helpOverlay.style.display = 'flex';
}

export function hideHelpOverlay() {
	if (helpOverlay) helpOverlay.style.display = 'none';
}
