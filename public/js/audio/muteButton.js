/**
 * Floating mute button. Sits in the bottom-right, just above the
 * activity-log toggle, and matches its styling. Click to mute/unmute
 * the sound effects; the choice persists across reloads via the
 * soundManager's localStorage hook.
 *
 * Idempotent — calling `mountMuteButton` twice is a no-op.
 */

import { isMuted, toggleMuted, initSoundManager } from './soundManager.js';
import { startPhoneHudLayout } from '../phoneHudLayout.js';

const BUTTON_ID = 'audio-mute-toggle';

function glyph() {
	return isMuted() ? '\uD83D\uDD07' : '\uD83D\uDD0A'; // 🔇 / 🔊
}

/** The glyph, plus the state the UI theme draws its icon from. */
function paint(btn) {
	btn.textContent = glyph();
	btn.dataset.muted = isMuted() ? '1' : '0';
	btn.setAttribute('aria-pressed', isMuted() ? 'true' : 'false');
}

export function mountMuteButton() {
	if (document.getElementById(BUTTON_ID)) return;
	const btn = document.createElement('button');
	btn.id = BUTTON_ID;
	btn.title = 'Mute / unmute sound effects (M)';
	paint(btn);
	Object.assign(btn.style, {
		position: 'fixed',
		right: '16px',
		bottom: '64px',
		zIndex: '11600',
	});
	// Size and look: `.tx-round-btn` in the UI theme (index.html).
	btn.className = 'tx-round-btn';
	btn.type = 'button';
	btn.setAttribute('aria-label', 'Mute or unmute sound effects');
	btn.addEventListener('click', () => {
		// Initialising on click also satisfies the browser's
		// "AudioContext needs a user gesture" requirement.
		initSoundManager();
		toggleMuted();
		paint(btn);
	});

	// Global "M" toggles too.
	document.addEventListener('keydown', (e) => {
		if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
			const target = e.target;
			if (target && (
				target.tagName === 'INPUT'
				|| target.tagName === 'TEXTAREA'
				|| target.isContentEditable
			)) return;
			toggleMuted();
			paint(btn);
		}
	});
	document.body.appendChild(btn);
	// (a phone upright: it and the activity button join the top HUD)
	startPhoneHudLayout();
}
