/**
 * Floating mute button. Sits in the bottom-right, just above the
 * activity-log toggle, and matches its styling. Click to mute/unmute
 * the sound effects; the choice persists across reloads via the
 * soundManager's localStorage hook.
 *
 * Idempotent — calling `mountMuteButton` twice is a no-op.
 */

import { isMuted, toggleMuted, initSoundManager } from './soundManager.js';

const BUTTON_ID = 'audio-mute-toggle';

function glyph() {
	return isMuted() ? '\uD83D\uDD07' : '\uD83D\uDD0A'; // 🔇 / 🔊
}

export function mountMuteButton() {
	if (document.getElementById(BUTTON_ID)) return;
	const btn = document.createElement('button');
	btn.id = BUTTON_ID;
	btn.title = 'Mute / unmute sound effects (M)';
	btn.textContent = glyph();
	Object.assign(btn.style, {
		position: 'fixed',
		right: '16px',
		bottom: '64px',
		width: '40px',
		height: '40px',
		borderRadius: '50%',
		border: '2px solid #ffcc00',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		color: '#ffcc00',
		fontSize: '18px',
		cursor: 'pointer',
		zIndex: '11600',
		boxShadow: '0 0 10px rgba(255, 204, 0, 0.4)',
		lineHeight: '36px',
		padding: '0',
	});
	btn.addEventListener('click', () => {
		// Initialising on click also satisfies the browser's
		// "AudioContext needs a user gesture" requirement.
		initSoundManager();
		toggleMuted();
		btn.textContent = glyph();
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
			btn.textContent = glyph();
		}
	});
	document.body.appendChild(btn);
}
