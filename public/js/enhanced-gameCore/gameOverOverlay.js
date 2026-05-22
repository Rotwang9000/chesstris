/**
 * Pulsing "GAME OVER" overlay shown when the local player's king is
 * captured (or after a duel loss). The animation keyframes are
 * installed lazily the first time the overlay is shown.
 */

function ensureGameOverPulseStyles() {
	if (document.getElementById('game-over-pulse-style')) return;
	const style = document.createElement('style');
	style.id = 'game-over-pulse-style';
	style.textContent = `
		@keyframes tetchesGameOverPulse {
			0% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
			50% { transform: translate(-50%, -50%) scale(1.12); opacity: 1; }
			100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
		}
	`;
	document.head.appendChild(style);
}

export function showGameOverPulseOverlay(message = 'GAME OVER') {
	ensureGameOverPulseStyles();
	let overlay = document.getElementById('game-over-pulse-overlay');
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = 'game-over-pulse-overlay';
		Object.assign(overlay.style, {
			position: 'fixed',
			left: '50%',
			top: '50%',
			transform: 'translate(-50%, -50%)',
			zIndex: '2500',
			fontFamily: 'Arial, sans-serif',
			fontWeight: '900',
			fontSize: 'clamp(56px, 12vw, 170px)',
			letterSpacing: '0.12em',
			color: '#ff3b3b',
			textShadow: '0 0 22px rgba(255,0,0,0.85), 0 0 56px rgba(255,0,0,0.45)',
			pointerEvents: 'none',
			userSelect: 'none',
			textTransform: 'uppercase',
			animation: 'tetchesGameOverPulse 1s ease-in-out infinite',
		});
		document.body.appendChild(overlay);
	}
	overlay.textContent = message;
	overlay.style.display = 'block';
}
