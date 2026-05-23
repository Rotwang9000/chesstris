const DEDUP_WINDOW_MS = 2000;
const MAX_VISIBLE_TOASTS = 2;
let _recentMessages = [];

const TOAST_VARIANTS = {
	info: { color: '#ffcc00', border: '#ffcc00', shadow: 'rgba(255, 204, 0, 0.3)' },
	alert: { color: '#ff5252', border: '#ff5252', shadow: 'rgba(255, 82, 82, 0.45)' },
	success: { color: '#7CFC8A', border: '#7CFC8A', shadow: 'rgba(124, 252, 138, 0.35)' },
};

/**
 * Show a toast message with deduplication.
 *
 * @param {string} message - Message to display
 * @param {number|Object} [optionsOrDuration] - either a duration in ms (legacy
 *   signature) or an options object: `{ duration?, variant? }`.
 *   `variant` defaults to `'info'` ('alert' is louder/red for things like
 *   "Your knight was captured" so the player can't miss them).
 */
export function showToastMessage(message, optionsOrDuration) {
	const { duration, variant } = normaliseOptions(optionsOrDuration);

	const now = Date.now();
	_recentMessages = _recentMessages.filter(r => now - r.ts < DEDUP_WINDOW_MS);
	if (_recentMessages.some(r => r.msg === message)) return;
	_recentMessages.push({ msg: message, ts: now });

	let toastContainer = document.getElementById('toast-container');
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.id = 'toast-container';

		Object.assign(toastContainer.style, {
			position: 'fixed',
			bottom: '20px',
			left: '50%',
			transform: 'translateX(-50%)',
			zIndex: '1000',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			width: 'auto',
			maxWidth: '80%',
			pointerEvents: 'none'
		});

		document.body.appendChild(toastContainer);
	}

	// If the touch control pad is currently on screen, push toasts
	// above it. The pad owns the bottom-centre during the tetris
	// phase on mobile; without this, every "Line cleared!" toast
	// lands directly behind the move buttons.
	const pad = document.getElementById('touch-control-pad');
	if (pad && pad.style.visibility === 'visible') {
		const padHeight = pad.offsetHeight || 130;
		toastContainer.style.bottom = `${padHeight + 30}px`;
	} else {
		toastContainer.style.bottom = '20px';
	}

	while (toastContainer.children.length >= MAX_VISIBLE_TOASTS) {
		toastContainer.removeChild(toastContainer.firstChild);
	}

	const palette = TOAST_VARIANTS[variant] || TOAST_VARIANTS.info;
	const isLoud = variant === 'alert';

	const toast = document.createElement('div');
	toast.classList.add('toast-message');
	if (variant) toast.classList.add(`toast-${variant}`);

	Object.assign(toast.style, {
		backgroundColor: 'rgba(0, 0, 0, 0.85)',
		color: palette.color,
		padding: isLoud ? '14px 28px' : '10px 20px',
		borderRadius: '5px',
		marginBottom: '10px',
		fontSize: isLoud ? '20px' : '16px',
		fontWeight: isLoud ? '700' : '400',
		letterSpacing: isLoud ? '0.5px' : 'normal',
		fontFamily: 'Times New Roman, serif',
		boxShadow: `0 2px ${isLoud ? '18px' : '10px'} ${palette.shadow}`,
		opacity: '0',
		transition: 'opacity 0.3s, transform 0.3s',
		transform: 'translateY(20px)',
		textAlign: 'center',
		maxWidth: '100%',
		border: `${isLoud ? 2 : 1}px solid ${palette.border}`
	});

	toast.textContent = message;
	toastContainer.appendChild(toast);

	setTimeout(() => {
		toast.style.opacity = '1';
		toast.style.transform = 'translateY(0)';
	}, 10);

	setTimeout(() => {
		toast.style.opacity = '0';
		toast.style.transform = 'translateY(-20px)';

		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		}, 300);
	}, duration);
}

function normaliseOptions(input) {
	if (input == null) return { duration: 3000, variant: 'info' };
	if (typeof input === 'number') return { duration: input, variant: 'info' };
	if (typeof input === 'object') {
		const duration = Number.isFinite(input.duration) ? input.duration : 3000;
		const variant = TOAST_VARIANTS[input.variant] ? input.variant : 'info';
		return { duration, variant };
	}
	return { duration: 3000, variant: 'info' };
}
