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
 *
 * This overlay is ALSO the home of the "Rotate controls with view"
 * toggle. It first shipped only in the player-bar footer, which on a
 * short window scrolls below the fold — players reported "I'm not
 * seeing the option". The "Controls" button opens this modal, so it's
 * the natural, always-reachable place for a controls preference.
 */

import { isCameraRelativeControls, setCameraRelativeControls } from './controlSettings.js';
import { getGameState } from './gameContext.js';
import { vikingActive } from './edition.js';
import { VIKING_RULES, vikingControls } from './battle/vikingRules.js';
import { isTouchPrimary } from './utils/inputMode.js';

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
	// Look from the shared `.tx-*` UI theme (index.html); layout here.
	root.className = 'tx-scrim';
	Object.assign(root.style, {
		position: 'fixed', inset: '0',
		display: 'none', alignItems: 'center', justifyContent: 'center',
		zIndex: '12500',
	});
	root.addEventListener('click', (e) => {
		if (e.target === root) hideHelpOverlay();
	});

	const card = document.createElement('div');
	card.className = 'tx-panel tx-dialog';
	card.setAttribute('role', 'dialog');
	card.setAttribute('aria-label', 'Camera & keyboard controls');
	card.addEventListener('click', (e) => e.stopPropagation());

	// Phones and tablets: the touch controls (they have no keyboard or
	// mouse, and the list was all keys and buttons).
	const touch = isTouchPrimary();
	const title = document.createElement('div');
	title.textContent = touch ? 'Touch controls' : 'Camera & keyboard controls';
	title.className = 'tx-title';

	// Interactive preference (not just a cheatsheet row). Lives here so
	// it's always reachable from the "Controls" button, and stays in
	// sync with the duplicate toggle in the player-bar footer.
	const camRelToggle = buildCameraRelativeToggle();

	const list = document.createElement('div');
	list.className = 'tx-keys';
	const touchItems = [
		['Turn the camera', 'Drag with one finger'],
		['Pan and zoom', 'Two fingers: drag to pan, pinch to zoom'],
		['Reset camera', 'Tap "Reset Camera"'],
		['—', ''],
		['Move tetromino', 'The arrow pad (bottom of the screen)'],
		['Rotate tetromino', 'The ⟳ button'],
		['Drop it', 'The ⬇ button'],
		['—', ''],
		['Chess move', 'Tap a piece, then a green square'],
		['Skip chess move', 'The Skip button under Next piece'],
	];
	const keyItems = [
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
	];
	for (const [k, v] of (touch ? touchItems : keyItems)) {
		const row = document.createElement('div');
		if (k === '—') {
			row.className = 'tx-key-gap';
			list.appendChild(row);
			continue;
		}
		row.className = 'tx-key-row';
		const keyEl = document.createElement('div');
		keyEl.className = 'tx-key-name';
		keyEl.textContent = k;
		const valEl = document.createElement('div');
		valEl.className = 'tx-key-what';
		valEl.textContent = v;
		row.appendChild(keyEl);
		row.appendChild(valEl);
		list.appendChild(row);
	}

	const note = document.createElement('div');
	note.className = 'tx-note';
	note.style.marginTop = '12px';
	note.textContent = 'No pinch / wheel on your device? Use + and − to zoom.';

	const closeRow = document.createElement('div');
	closeRow.className = 'tx-actions';
	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'tx-btn tx-btn--primary';
	closeBtn.textContent = 'Close';
	closeBtn.addEventListener('click', hideHelpOverlay);
	// "More below": the list runs on under the pinned footer on a short
	// screen (the longship rows were cut at the footer with no cue).
	const more = document.createElement('button');
	more.type = 'button';
	more.className = 'tx-scroll-cue';
	more.textContent = 'More below ▾';
	more.addEventListener('click', () => card.scrollBy({ top: Math.round(card.clientHeight * 0.7), behavior: 'smooth' }));
	closeRow.appendChild(more);
	closeRow.appendChild(closeBtn);
	card.addEventListener('scroll', () => markMore(card), { passive: true });

	card.appendChild(title);
	// (the toggle and the zoom note are about keys: not on a touch screen)
	if (!touch) card.appendChild(camRelToggle);
	card.appendChild(list);
	if (!touch) card.appendChild(note);
	// Viking edition / Viking battles: longship controls and rules,
	// filled on each open (see renderVikingHelp).
	const viking = document.createElement('div');
	viking.id = 'help-viking-section';
	viking.style.display = 'none';
	card.appendChild(viking);
	card.appendChild(closeRow);
	root.appendChild(card);
	document.body.appendChild(root);
	return root;
}

/**
 * Build the interactive "Rotate controls with view" toggle row.
 *
 * Reads/writes the shared preference via `controlSettings`, so it stays
 * in lock-step with the player-bar footer toggle (`#camera-controls-toggle`).
 * When either changes we mirror the checked state onto the other element
 * if it's present, so the two never disagree on screen.
 */
function buildCameraRelativeToggle() {
	const row = document.createElement('label');
	row.htmlFor = 'cam-rel-controls-overlay-toggle';
	row.className = 'tx-toggle-row';

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.id = 'cam-rel-controls-overlay-toggle';
	input.checked = isCameraRelativeControls();

	const text = document.createElement('div');
	const heading = document.createElement('div');
	heading.textContent = 'Rotate controls with view';
	heading.className = 'tx-toggle-title';
	const sub = document.createElement('div');
	sub.textContent = "Arrow keys follow the camera — Left always nudges the piece left on screen, whichever way you've spun the board. Off by default.";
	sub.className = 'tx-toggle-sub';
	text.appendChild(heading);
	text.appendChild(sub);

	input.addEventListener('change', () => {
		setCameraRelativeControls(input.checked);
		// Mirror onto the player-bar toggle so the two never disagree.
		const sidebar = document.getElementById('camera-controls-toggle');
		if (sidebar) sidebar.checked = input.checked;
		try {
			if (typeof window !== 'undefined' && typeof window.showToastMessage === 'function') {
				window.showToastMessage(input.checked
					? 'Controls now rotate with the camera view.'
					: 'Controls fixed to the home orientation.');
			}
		} catch (_) { /* toast is best-effort */ }
	});

	row.appendChild(input);
	row.appendChild(text);
	return row;
}

/** The longship section of the help card, shown only when Viking is live. */
function renderVikingHelp() {
	const section = document.getElementById('help-viking-section');
	if (!section) return;
	let live = false;
	try { live = vikingActive(getGameState()); } catch (_e) { live = false; }
	section.style.display = live ? 'block' : 'none';
	// (the card scrolls itself: max-height in the theme)
	if (!live || section.childElementCount > 0) return;
	section.className = 'tx-section';
	const title = document.createElement('div');
	// (the drawn longship of the Longship card, not the ⛵ emoji)
	const icon = document.createElement('span');
	icon.className = 'tx-longship-icon';
	icon.setAttribute('aria-hidden', 'true');
	title.appendChild(icon);
	title.appendChild(document.createTextNode('Longships (Viking battles)'));
	title.className = 'tx-section-title';
	section.appendChild(title);
	const keys = document.createElement('div');
	keys.className = 'tx-keys';
	for (const [k, v] of vikingControls(isTouchPrimary())) {
		const row = document.createElement('div');
		row.className = 'tx-key-row';
		const keyEl = document.createElement('div');
		keyEl.className = 'tx-key-name';
		keyEl.textContent = k;
		const valEl = document.createElement('div');
		valEl.className = 'tx-key-what';
		valEl.textContent = v;
		row.appendChild(keyEl);
		row.appendChild(valEl);
		keys.appendChild(row);
	}
	section.appendChild(keys);
	const list = document.createElement('ol');
	for (const line of VIKING_RULES) {
		const li = document.createElement('li');
		li.textContent = line;
		list.appendChild(li);
	}
	section.appendChild(list);
}

export function showHelpOverlay() {
	if (!helpOverlay) helpOverlay = buildHelpOverlay();
	renderVikingHelp();
	// Re-sync the toggle from the stored preference each open, in case it
	// was changed via the player-bar footer toggle since we last built it.
	const t = document.getElementById('cam-rel-controls-overlay-toggle');
	if (t) t.checked = isCameraRelativeControls();
	helpOverlay.style.display = 'flex';
	const card = helpOverlay.querySelector('.tx-dialog');
	if (card) markMore(card);
}

/** Is there more of the card below the fold? (`data-more` shows the cue) */
function markMore(card) {
	const more = card.scrollHeight - card.clientHeight - card.scrollTop > 24;
	card.dataset.more = more ? '1' : '0';
}

export function hideHelpOverlay() {
	if (helpOverlay) helpOverlay.style.display = 'none';
}
