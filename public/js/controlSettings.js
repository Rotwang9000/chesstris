/**
 * Player control preferences (client-side, persisted in localStorage).
 *
 * Camera-relative controls: when ON, the tetromino movement keys follow
 * the current camera view — pressing Left always nudges the piece left
 * on screen, whichever way you've orbited the board — instead of the
 * player's fixed home orientation. Default OFF so existing muscle memory
 * (and the orientation-based scheme) is preserved unless a player opts in.
 *
 * Kept as plain functions over localStorage (no exported mutable state)
 * so any module can read the live value without import-time coupling.
 */

const CAMERA_RELATIVE_KEY = 'tetches_camera_relative_controls';

/** @returns {boolean} Whether camera-relative controls are enabled. */
export function isCameraRelativeControls() {
	try {
		return localStorage.getItem(CAMERA_RELATIVE_KEY) === '1';
	} catch (_e) {
		return false;
	}
}

/** Persist the camera-relative-controls preference. */
export function setCameraRelativeControls(enabled) {
	try {
		localStorage.setItem(CAMERA_RELATIVE_KEY, enabled ? '1' : '0');
	} catch (_e) { /* private browsing — fall back to the default (off) */ }
}
