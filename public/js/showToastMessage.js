/**
 * Show toast message
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds
 */
export function showToastMessage(message, duration = 3000) {
	// Create or get toast container
	let toastContainer = document.getElementById('toast-container');
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.id = 'toast-container';

		// Style container
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

	// Create toast element with Russian-themed styling
	const toast = document.createElement('div');
	toast.classList.add('toast-message');

	// Style the toast
	Object.assign(toast.style, {
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
		color: '#ffcc00', // Gold text for Russian theme
		padding: '10px 20px',
		borderRadius: '5px',
		marginBottom: '10px',
		fontSize: '16px',
		fontFamily: 'Times New Roman, serif', // Russian-style font
		boxShadow: '0 2px 10px rgba(255, 204, 0, 0.3)', // Gold glow
		opacity: '0',
		transition: 'opacity 0.3s, transform 0.3s',
		transform: 'translateY(20px)',
		textAlign: 'center',
		maxWidth: '100%',
		border: '1px solid #ffcc00' // Gold border
	});

	// Set message content
	toast.textContent = message;

	// Add to container
	toastContainer.appendChild(toast);

	// Animate in
	setTimeout(() => {
		toast.style.opacity = '1';
		toast.style.transform = 'translateY(0)';
	}, 10);

	// Animate out and remove after duration
	setTimeout(() => {
		toast.style.opacity = '0';
		toast.style.transform = 'translateY(-20px)';

		// Remove after animation
		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		}, 300);
	}, duration);
}
