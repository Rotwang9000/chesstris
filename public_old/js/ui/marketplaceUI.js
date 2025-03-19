/**
 * Marketplace UI Module
 * 
 * Handles the marketplace interface and related payment functionality.
 */

/**
 * Sets up the marketplace UI elements
 */
export function setupMarketplaceUI() {
	// Create a marketplace button in the UI
	const marketplaceBtn = document.createElement('button');
	marketplaceBtn.className = 'btn';
	marketplaceBtn.id = 'marketplace-btn';
	marketplaceBtn.innerHTML = '<i class="fas fa-store"></i> Marketplace <span class="coming-soon">Coming Soon!</span>';
	marketplaceBtn.style.position = 'absolute';
	marketplaceBtn.style.right = '15px';
	marketplaceBtn.style.bottom = '70px';
	
	// Add special styling for the coming soon tag
	const style = document.createElement('style');
	style.textContent = `
		.coming-soon {
			font-size: 10px;
			background: var(--theme-accent, gold);
			color: black;
			padding: 2px 6px;
			border-radius: 10px;
			margin-left: 5px;
			vertical-align: middle;
		}
		
		#marketplace-dialog {
			display: none;
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: var(--theme-bg-panel, rgba(30, 30, 30, 0.9));
			padding: 20px;
			border-radius: 8px;
			max-width: 600px;
			width: 80%;
			z-index: 1000;
			box-shadow: 0 5px 25px rgba(0, 0, 0, 0.5);
			border: 1px solid var(--theme-accent, gold);
		}
		
		.marketplace-category {
			margin-bottom: 15px;
		}
		
		.marketplace-category h3 {
			color: var(--theme-primary, #D52B1E);
			border-bottom: 1px solid var(--theme-accent, gold);
			padding-bottom: 5px;
		}
		
		.marketplace-items {
			display: flex;
			gap: 10px;
			overflow-x: auto;
			padding: 10px 0;
		}
		
		.marketplace-item {
			background: rgba(0, 0, 0, 0.3);
			padding: 10px;
			border-radius: 5px;
			min-width: 150px;
			text-align: center;
			cursor: pointer;
			transition: transform 0.2s, box-shadow 0.2s;
		}
		
		.marketplace-item:hover {
			transform: translateY(-5px);
			box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
		}
		
		.marketplace-item img {
			width: 100%;
			height: 100px;
			object-fit: contain;
			margin-bottom: 10px;
		}
		
		.marketplace-item-price {
			display: inline-block;
			background: var(--theme-accent, gold);
			color: black;
			padding: 3px 8px;
			border-radius: 10px;
			font-weight: bold;
			margin-top: 8px;
		}
		
		.marketplace-close {
			position: absolute;
			top: 15px;
			right: 15px;
			background: none;
			border: none;
			color: var(--theme-text, white);
			font-size: 18px;
			cursor: pointer;
		}
	`;
	document.head.appendChild(style);
	
	marketplaceBtn.addEventListener('click', () => {
		// If a marketplace dialog already exists, show it
		let dialog = document.getElementById('marketplace-dialog');
		if (dialog) {
			dialog.style.display = 'block';
			return;
		}
		
		// Create a marketplace dialog
		dialog = document.createElement('div');
		dialog.id = 'marketplace-dialog';
		
		// Close button
		const closeBtn = document.createElement('button');
		closeBtn.className = 'marketplace-close';
		closeBtn.innerHTML = '<i class="fas fa-times"></i>';
		closeBtn.addEventListener('click', () => {
			dialog.style.display = 'none';
		});
		
		// Title
		const title = document.createElement('h2');
		title.textContent = 'Shaktris Marketplace';
		
		// Description
		const description = document.createElement('p');
		description.innerHTML = 'Browse and purchase unique chess pieces, themes, and power-ups.<br>Coming soon in a future update!';
		
		// Create some placeholder categories
		const categories = [
			{
				name: 'Chess Pieces',
				items: [
					{ name: 'Russian Set', price: 500, image: './assets/marketplace/russian_set.png' },
					{ name: 'Medieval Set', price: 450, image: './assets/marketplace/medieval_set.png' },
					{ name: 'Sci-Fi Set', price: 600, image: './assets/marketplace/scifi_set.png' }
				]
			},
			{
				name: 'Themes',
				items: [
					{ name: 'Dark Forest', price: 300, image: './assets/marketplace/dark_forest.png' },
					{ name: 'Ocean Deep', price: 350, image: './assets/marketplace/ocean.png' },
					{ name: 'Space', price: 400, image: './assets/marketplace/space.png' }
				]
			},
			{
				name: 'Power-ups',
				items: [
					{ name: 'Extra Life', price: 100, image: './assets/marketplace/extra_life.png' },
					{ name: 'Time Freeze', price: 150, image: './assets/marketplace/time_freeze.png' },
					{ name: 'Clear Lines', price: 200, image: './assets/marketplace/clear_lines.png' }
				]
			}
		];
		
		// Add categories to dialog
		categories.forEach(category => {
			const categoryDiv = document.createElement('div');
			categoryDiv.className = 'marketplace-category';
			
			const categoryTitle = document.createElement('h3');
			categoryTitle.textContent = category.name;
			categoryDiv.appendChild(categoryTitle);
			
			const itemsContainer = document.createElement('div');
			itemsContainer.className = 'marketplace-items';
			
			category.items.forEach(item => {
				const itemDiv = document.createElement('div');
				itemDiv.className = 'marketplace-item';
				
				const img = document.createElement('img');
				img.src = item.image;
				img.alt = item.name;
				img.onerror = () => { img.src = './assets/placeholder.png'; };
				
				const itemName = document.createElement('div');
				itemName.textContent = item.name;
				
				const itemPrice = document.createElement('div');
				itemPrice.className = 'marketplace-item-price';
				itemPrice.textContent = `${item.price} TT`;
				
				itemDiv.appendChild(img);
				itemDiv.appendChild(itemName);
				itemDiv.appendChild(itemPrice);
				
				itemDiv.addEventListener('click', () => {
					showNotification('Marketplace will be available in a future update!');
				});
				
				itemsContainer.appendChild(itemDiv);
			});
			
			categoryDiv.appendChild(itemsContainer);
			dialog.appendChild(categoryDiv);
		});
		
		// Append all elements to the dialog
		dialog.appendChild(closeBtn);
		dialog.appendChild(title);
		dialog.appendChild(description);
		
		// Add a close button at the bottom
		const bottomCloseBtn = document.createElement('button');
		bottomCloseBtn.className = 'btn';
		bottomCloseBtn.textContent = 'Close';
		bottomCloseBtn.addEventListener('click', () => {
			dialog.style.display = 'none';
		});
		dialog.appendChild(bottomCloseBtn);
		
		// Add dialog to document
		document.body.appendChild(dialog);
		document.body.appendChild(marketplaceBtn);
		
		console.log('Marketplace UI placeholder added');
	});
}

/**
 * Sets up the payment UI elements
 */
export function setupPaymentUI() {
	// Override the original marketplace UI to include payment options
	const originalMarketplaceUI = setupMarketplaceUI;
	setupMarketplaceUI = async function() {
		// Call the original marketplace UI setup
		originalMarketplaceUI();
		
		// Add payment options to marketplace dialog
		const marketplaceDialog = document.getElementById('marketplace-dialog');
		if (!marketplaceDialog) return;
		
		// Create payment section
		const paymentSection = document.createElement('div');
		paymentSection.className = 'payment-section';
		paymentSection.style.marginTop = '20px';
		paymentSection.style.padding = '15px';
		paymentSection.style.backgroundColor = 'rgba(0,0,0,0.2)';
		paymentSection.style.borderRadius = '8px';
		
		// Payment section title
		const paymentTitle = document.createElement('h3');
		paymentTitle.textContent = 'Payment Methods';
		paymentTitle.style.marginBottom = '10px';
		paymentSection.appendChild(paymentTitle);
		
		// Payment options
		const paymentOptions = document.createElement('div');
		paymentOptions.style.display = 'flex';
		paymentOptions.style.flexWrap = 'wrap';
		paymentOptions.style.gap = '15px';
		paymentSection.appendChild(paymentOptions);
		
		// Create payment method buttons
		const paymentMethods = [
			{ name: 'Credit Card', icon: 'fa-credit-card', color: '#2a7dd1', processor: 'stripe' },
			{ name: 'PayPal', icon: 'fa-paypal', color: '#003087', processor: 'paypal' },
			{ name: 'Apple Pay', icon: 'fa-apple', color: '#000', processor: 'apple' },
			{ name: 'Google Pay', icon: 'fa-google', color: '#4285F4', processor: 'google' },
			{ name: 'Crypto', icon: 'fa-bitcoin', color: '#f7931a', processor: 'crypto' },
			{ name: 'Solana', icon: 'fa-ethereum', color: '#9945FF', processor: 'solana' }
		];
		
		paymentMethods.forEach(method => {
			const button = document.createElement('button');
			button.className = 'payment-option';
			button.style.display = 'flex';
			button.style.flexDirection = 'column';
			button.style.alignItems = 'center';
			button.style.justifyContent = 'center';
			button.style.padding = '15px';
			button.style.borderRadius = '8px';
			button.style.backgroundColor = method.color;
			button.style.border = 'none';
			button.style.cursor = 'pointer';
			button.style.width = '100px';
			button.style.height = '80px';
			button.style.color = 'white';
			button.style.transition = 'transform 0.2s';
			
			const icon = document.createElement('i');
			icon.className = `fas ${method.icon}`;
			icon.style.fontSize = '24px';
			icon.style.marginBottom = '8px';
			
			const name = document.createElement('span');
			name.textContent = method.name;
			name.style.fontSize = '12px';
			
			button.appendChild(icon);
			button.appendChild(name);
			
			button.addEventListener('mouseover', () => {
				button.style.transform = 'scale(1.05)';
			});
			
			button.addEventListener('mouseout', () => {
				button.style.transform = 'scale(1)';
			});
			
			button.addEventListener('click', () => {
				// Update payment summary with the selected provider
				updatePaymentSummary(method.processor);
				
				// Special handling for Solana payments
				if (method.processor === 'solana') {
					enhanceSolanaPaymentUI();
				}
			});
			
			paymentOptions.appendChild(button);
		});
		
		// Payment summary section (hidden initially)
		const paymentSummary = document.createElement('div');
		paymentSummary.id = 'payment-summary';
		paymentSummary.style.marginTop = '20px';
		paymentSummary.style.padding = '10px';
		paymentSummary.style.backgroundColor = 'rgba(0,0,0,0.3)';
		paymentSummary.style.borderRadius = '8px';
		paymentSummary.style.display = 'none';
		paymentSection.appendChild(paymentSummary);
		
		// Add the payment section to the marketplace dialog
		marketplaceDialog.insertBefore(paymentSection, marketplaceDialog.querySelector('button:last-child'));
		
		/**
		 * Updates the payment summary based on the selected provider
		 * @param {string} provider - The payment provider
		 */
		function updatePaymentSummary(provider) {
			const summary = document.getElementById('payment-summary');
			if (!summary) return;
			
			// Show the summary
			summary.style.display = 'block';
			
			// Update the content
			summary.innerHTML = `
				<h4>Payment Summary</h4>
				<p>Selected method: <strong>${provider.charAt(0).toUpperCase() + provider.slice(1)}</strong></p>
				<p>This is a placeholder for the payment process.</p>
				<p>In the full implementation, this would connect to the ${provider} API.</p>
				<button class="btn" style="margin-top: 10px; background-color: #4caf50;">Proceed to Payment</button>
				<button class="btn" style="margin-top: 10px; margin-left: 10px; background-color: #f44336;">Cancel</button>
			`;
			
			// Add event listener to the cancel button
			const cancelBtn = summary.querySelector('button:nth-child(2)');
			cancelBtn.addEventListener('click', () => {
				summary.style.display = 'none';
			});
			
			// Add event listener to the proceed button
			const proceedBtn = summary.querySelector('button:first-child');
			proceedBtn.addEventListener('click', () => {
				alert(`Proceeding to ${provider} payment gateway...`);
				summary.style.display = 'none';
			});
		}
	};
}

/**
 * Enhances the UI with Solana-specific wallet functionality
 */
export function enhanceSolanaPaymentUI() {
	const createWalletStatus = () => {
		// Check if the wallet status already exists
		if (document.getElementById('solana-wallet-status')) {
			return document.getElementById('solana-wallet-status');
		}
		
		// Get the payment summary element
		const paymentSummary = document.getElementById('payment-summary');
		if (!paymentSummary) return null;
		
		// Create wallet status section
		const walletSection = document.createElement('div');
		walletSection.id = 'solana-wallet-status';
		walletSection.style.marginTop = '15px';
		walletSection.style.padding = '10px';
		walletSection.style.backgroundColor = 'rgba(153, 69, 255, 0.2)';
		walletSection.style.borderRadius = '8px';
		walletSection.style.border = '1px solid #9945FF';
		
		// Create status indicator
		const statusIndicator = document.createElement('div');
		statusIndicator.id = 'wallet-indicator';
		statusIndicator.style.display = 'flex';
		statusIndicator.style.alignItems = 'center';
		statusIndicator.style.marginBottom = '10px';
		
		const statusDot = document.createElement('div');
		statusDot.id = 'status-dot';
		statusDot.style.width = '12px';
		statusDot.style.height = '12px';
		statusDot.style.borderRadius = '50%';
		statusDot.style.backgroundColor = '#f44336';
		statusDot.style.marginRight = '8px';
		
		const statusText = document.createElement('span');
		statusText.id = 'status-text';
		statusText.textContent = 'Not connected';
		
		statusIndicator.appendChild(statusDot);
		statusIndicator.appendChild(statusText);
		walletSection.appendChild(statusIndicator);
		
		// Add wallet address section
		const addressContainer = document.createElement('div');
		addressContainer.id = 'wallet-address-container';
		addressContainer.style.display = 'none';
		addressContainer.style.marginBottom = '10px';
		
		const addressLabel = document.createElement('div');
		addressLabel.textContent = 'Wallet Address:';
		addressLabel.style.fontSize = '12px';
		addressLabel.style.opacity = '0.8';
		
		const addressDisplay = document.createElement('div');
		addressDisplay.id = 'wallet-address';
		addressDisplay.style.fontFamily = 'monospace';
		addressDisplay.style.wordBreak = 'break-all';
		addressDisplay.style.padding = '6px';
		addressDisplay.style.backgroundColor = 'rgba(0,0,0,0.3)';
		addressDisplay.style.borderRadius = '4px';
		addressDisplay.style.marginTop = '4px';
		addressDisplay.style.fontSize = '12px';
		
		addressContainer.appendChild(addressLabel);
		addressContainer.appendChild(addressDisplay);
		walletSection.appendChild(addressContainer);
		
		// Add balance section
		const balanceContainer = document.createElement('div');
		balanceContainer.id = 'wallet-balance-container';
		balanceContainer.style.display = 'none';
		balanceContainer.style.marginBottom = '10px';
		
		const balanceLabel = document.createElement('div');
		balanceLabel.textContent = 'Balance:';
		balanceLabel.style.fontSize = '12px';
		balanceLabel.style.opacity = '0.8';
		
		const balanceDisplay = document.createElement('div');
		balanceDisplay.id = 'wallet-balance';
		balanceDisplay.style.fontFamily = 'monospace';
		balanceDisplay.style.padding = '6px';
		balanceDisplay.style.backgroundColor = 'rgba(0,0,0,0.3)';
		balanceDisplay.style.borderRadius = '4px';
		balanceDisplay.style.marginTop = '4px';
		balanceDisplay.style.display = 'flex';
		balanceDisplay.style.alignItems = 'center';
		balanceDisplay.style.justifyContent = 'space-between';
		
		const refreshButton = document.createElement('button');
		refreshButton.id = 'refresh-balance';
		refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
		refreshButton.style.backgroundColor = 'transparent';
		refreshButton.style.border = 'none';
		refreshButton.style.color = 'white';
		refreshButton.style.cursor = 'pointer';
		refreshButton.addEventListener('click', () => {
			refreshButton.style.animation = 'spin 1s linear';
			setTimeout(() => {
				refreshButton.style.animation = '';
				updateTokenBalance();
			}, 1000);
		});
		
		balanceDisplay.appendChild(document.createElement('span'));
		balanceDisplay.appendChild(refreshButton);
		
		balanceContainer.appendChild(balanceLabel);
		balanceContainer.appendChild(balanceDisplay);
		walletSection.appendChild(balanceContainer);
		
		// Connect wallet button
		const connectBtn = document.createElement('button');
		connectBtn.id = 'connect-wallet-btn';
		connectBtn.className = 'btn';
		connectBtn.style.backgroundColor = '#9945FF';
		connectBtn.style.width = '100%';
		connectBtn.style.padding = '8px';
		connectBtn.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
		
		connectBtn.addEventListener('click', async () => {
			connectBtn.disabled = true;
			connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
			
			// Simulate connection process
			setTimeout(() => {
				const random = Math.random();
				
				if (random > 0.3) { // 70% chance of success
					// Generate a random Solana address
					const address = 'solana' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
					const balance = (Math.random() * 10).toFixed(4);
					
					updateWalletStatus('connected', 'Connected', address, balance);
					connectBtn.style.display = 'none';
					
					// Create disconnect button
					if (!document.getElementById('disconnect-wallet-btn')) {
						const disconnectBtn = document.createElement('button');
						disconnectBtn.id = 'disconnect-wallet-btn';
						disconnectBtn.className = 'btn';
						disconnectBtn.style.backgroundColor = '#f44336';
						disconnectBtn.style.width = '100%';
						disconnectBtn.style.padding = '8px';
						disconnectBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Disconnect Wallet';
						
						disconnectBtn.addEventListener('click', () => {
							updateWalletStatus('disconnected', 'Not connected');
							disconnectBtn.remove();
							connectBtn.style.display = 'block';
							connectBtn.disabled = false;
							connectBtn.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
						});
						
						walletSection.appendChild(disconnectBtn);
					}
				} else { // 30% chance of failure
					updateWalletStatus('error', 'Connection failed');
					connectBtn.disabled = false;
					connectBtn.innerHTML = '<i class="fas fa-wallet"></i> Try Again';
				}
			}, 2000);
		});
		
		walletSection.appendChild(connectBtn);
		
		// Add the wallet section to the payment summary
		paymentSummary.appendChild(walletSection);
		
		// Add styles
		const style = document.createElement('style');
		style.textContent = `
			@keyframes spin {
				0% { transform: rotate(0deg); }
				100% { transform: rotate(360deg); }
			}
		`;
		document.head.appendChild(style);
		
		return walletSection;
	};
	
	/**
	 * Updates the wallet status display
	 * @param {string} status - The status (connected, disconnected, error)
	 * @param {string} text - The status text to display
	 * @param {string} address - The wallet address (optional)
	 * @param {string} balance - The wallet balance (optional)
	 */
	const updateWalletStatus = (status, text, address, balance) => {
		const statusDot = document.getElementById('status-dot');
		const statusText = document.getElementById('status-text');
		const addressContainer = document.getElementById('wallet-address-container');
		const addressDisplay = document.getElementById('wallet-address');
		const balanceContainer = document.getElementById('wallet-balance-container');
		const balanceDisplay = document.getElementById('wallet-balance').querySelector('span');
		
		if (statusDot && statusText) {
			// Update status indicator
			switch(status) {
				case 'connected':
					statusDot.style.backgroundColor = '#4caf50';
					break;
				case 'connecting':
					statusDot.style.backgroundColor = '#ff9800';
					break;
				case 'error':
					statusDot.style.backgroundColor = '#f44336';
					break;
				case 'disconnected':
				default:
					statusDot.style.backgroundColor = '#f44336';
					break;
			}
			
			statusText.textContent = text;
		}
		
		// Update address if provided
		if (address && addressContainer && addressDisplay) {
			addressContainer.style.display = 'block';
			addressDisplay.textContent = address;
		} else if (addressContainer) {
			addressContainer.style.display = 'none';
		}
		
		// Update balance if provided
		if (balance && balanceContainer && balanceDisplay) {
			balanceContainer.style.display = 'block';
			balanceDisplay.textContent = `${balance} SOL`;
		} else if (balanceContainer) {
			balanceContainer.style.display = 'none';
		}
	};
	
	// Create the wallet status UI
	createWalletStatus();
}

/**
 * Updates the token balance for the connected wallet
 * @returns {Promise<void>}
 */
export async function updateTokenBalance() {
	const balanceDisplay = document.getElementById('wallet-balance')?.querySelector('span');
	if (!balanceDisplay) return;
	
	// Simulate balance update
	balanceDisplay.textContent = 'Updating...';
	
	// Simulate network delay
	await new Promise(resolve => setTimeout(resolve, 1500));
	
	// Generate a random balance
	const newBalance = (Math.random() * 10).toFixed(4);
	balanceDisplay.textContent = `${newBalance} SOL`;
}

/**
 * Shows a notification message
 * @param {string} message - The message to display
 * @param {number} duration - The duration in milliseconds to show the notification
 */
function showNotification(message, duration = 3000) {
	// Create notification element
	const notification = document.createElement('div');
	notification.className = 'notification';
	notification.textContent = message;
	notification.style.position = 'fixed';
	notification.style.bottom = '20px';
	notification.style.left = '50%';
	notification.style.transform = 'translateX(-50%)';
	notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
	notification.style.color = 'white';
	notification.style.padding = '10px 20px';
	notification.style.borderRadius = '5px';
	notification.style.zIndex = '1000';
	
	// Add to DOM
	document.body.appendChild(notification);
	
	// Remove after duration
	setTimeout(() => {
		notification.style.opacity = '0';
		notification.style.transition = 'opacity 0.5s';
		
		setTimeout(() => {
			document.body.removeChild(notification);
		}, 500);
	}, duration);
} 