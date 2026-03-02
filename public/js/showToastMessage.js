const DEDUP_WINDOW_MS = 2000;
const MAX_VISIBLE_TOASTS = 2;
let _recentMessages = [];

/**
 * Show toast message with deduplication.
 * Identical messages within DEDUP_WINDOW_MS are suppressed.
 * At most MAX_VISIBLE_TOASTS are shown simultaneously.
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds
 */
export function showToastMessage(message, duration = 3000) {
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

	while (toastContainer.children.length >= MAX_VISIBLE_TOASTS) {
		toastContainer.removeChild(toastContainer.firstChild);
	}

	const toast = document.createElement('div');
	toast.classList.add('toast-message');

	Object.assign(toast.style, {
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
		color: '#ffcc00',
		padding: '10px 20px',
		borderRadius: '5px',
		marginBottom: '10px',
		fontSize: '16px',
		fontFamily: 'Times New Roman, serif',
		boxShadow: '0 2px 10px rgba(255, 204, 0, 0.3)',
		opacity: '0',
		transition: 'opacity 0.3s, transform 0.3s',
		transform: 'translateY(20px)',
		textAlign: 'center',
		maxWidth: '100%',
		border: '1px solid #ffcc00'
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
