/**
 * Advertiser Registration Module
 * 
 * Handles the advertiser registration form, Solana wallet connection,
 * and payment processing.
 */

// Configuration
const CONFIG = {
	receivingWallet: 'GsbwXfJraMohNnrpGCwvGqNGNQxD1w3w6EQ5AdHxXsv9', // Platform wallet
	solPriceUsd: 150, // Approximate SOL price - would be fetched from API in production
	minBid: 0.01,
	minCells: 1
};

// State
const state = {
	walletConnected: false,
	walletAddress: null,
	provider: null,
	advertiserId: null,
	currentStep: 1
};

// DOM Elements
const elements = {
	form: document.getElementById('advertiser-form'),
	connectWalletBtn: document.getElementById('connect-wallet-btn'),
	walletStatus: document.getElementById('wallet-status'),
	walletAddressContainer: document.getElementById('wallet-address-container'),
	walletAddressDisplay: document.getElementById('wallet-address'),
	walletAddressInput: document.getElementById('walletAddress'),
	submitBtn: document.getElementById('submit-btn'),
	message: document.getElementById('message'),
	adText: document.getElementById('adText'),
	charCount: document.getElementById('char-count'),
	adImage: document.getElementById('adImage'),
	previewImage: document.getElementById('preview-image'),
	fileUploadArea: document.getElementById('file-upload-area'),
	bidAmount: document.getElementById('bidAmount'),
	cellCount: document.getElementById('cellCount'),
	totalBid: document.getElementById('total-bid'),
	costPerCell: document.getElementById('cost-per-cell'),
	estUsd: document.getElementById('est-usd'),
	bidPriority: document.getElementById('bid-priority'),
	paymentStatusCard: document.getElementById('payment-status-card'),
	paymentStatus: document.getElementById('payment-status')
};

// Step elements
const steps = [
	document.getElementById('step-1'),
	document.getElementById('step-2'),
	document.getElementById('step-3')
];

/**
 * Update the current step indicator
 */
function updateStepIndicator(step) {
	state.currentStep = step;
	steps.forEach((stepEl, index) => {
		stepEl.classList.remove('active', 'completed');
		if (index + 1 < step) {
			stepEl.classList.add('completed');
		} else if (index + 1 === step) {
			stepEl.classList.add('active');
		}
	});
}

/**
 * Show message to user
 */
function showMessage(text, type = 'error') {
	elements.message.textContent = text;
	elements.message.className = `message ${type}`;
	elements.message.style.display = 'block';
	
	// Scroll to message
	elements.message.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Hide message
 */
function hideMessage() {
	elements.message.style.display = 'none';
}

/**
 * Character count for ad text
 */
function updateCharCount() {
	const count = elements.adText.value.length;
	elements.charCount.textContent = count;
}

/**
 * Handle image preview
 */
function handleImagePreview(event) {
	const file = event.target.files[0];
	if (file) {
		const reader = new FileReader();
		reader.onload = function(e) {
			elements.previewImage.src = e.target.result;
			elements.previewImage.style.display = 'block';
		};
		reader.readAsDataURL(file);
	}
}

/**
 * Update bid calculator
 */
function updateBidCalculator() {
	const bidAmount = parseFloat(elements.bidAmount.value) || 0;
	const cellCount = parseInt(elements.cellCount.value) || 1;
	
	const costPerCell = cellCount > 0 ? bidAmount / cellCount : 0;
	const estUsd = bidAmount * CONFIG.solPriceUsd;
	
	elements.totalBid.textContent = `${bidAmount.toFixed(4)} SOL`;
	elements.costPerCell.textContent = `${costPerCell.toFixed(6)} SOL`;
	elements.estUsd.textContent = `~$${estUsd.toFixed(2)}`;
	
	// Estimate priority based on cost per cell
	if (costPerCell >= 0.01) {
		elements.bidPriority.textContent = '⭐⭐⭐ High';
		elements.bidPriority.style.color = '#4ade80';
	} else if (costPerCell >= 0.005) {
		elements.bidPriority.textContent = '⭐⭐ Medium';
		elements.bidPriority.style.color = '#fbbf24';
	} else if (costPerCell > 0) {
		elements.bidPriority.textContent = '⭐ Low';
		elements.bidPriority.style.color = '#f87171';
	} else {
		elements.bidPriority.textContent = '-';
		elements.bidPriority.style.color = '#888';
	}
}

/**
 * Check if Phantom wallet is installed
 */
function isPhantomInstalled() {
	return window.solana && window.solana.isPhantom;
}

/**
 * Connect to Phantom wallet
 */
async function connectWallet() {
	try {
		if (!isPhantomInstalled()) {
			showMessage('Phantom wallet is not installed. Please install it from phantom.app', 'error');
			window.open('https://phantom.app/', '_blank');
			return;
		}
		
		elements.connectWalletBtn.disabled = true;
		elements.connectWalletBtn.textContent = 'Connecting...';
		
		const provider = window.solana;
		const response = await provider.connect();
		const publicKey = response.publicKey.toString();
		
		state.walletConnected = true;
		state.walletAddress = publicKey;
		state.provider = provider;
		
		// Update UI
		elements.walletStatus.textContent = 'Connected';
		elements.walletStatus.classList.add('connected');
		elements.walletAddressDisplay.textContent = publicKey;
		elements.walletAddressContainer.style.display = 'block';
		elements.walletAddressInput.value = publicKey;
		elements.connectWalletBtn.textContent = 'Wallet Connected ✓';
		
		// Enable submit button
		updateSubmitButtonState();
		
		// Update step indicator
		updateStepIndicator(2);
		
		showMessage('Wallet connected successfully!', 'success');
		
		// Listen for disconnect
		provider.on('disconnect', () => {
			handleWalletDisconnect();
		});
		
	} catch (error) {
		console.error('Wallet connection error:', error);
		elements.connectWalletBtn.disabled = false;
		elements.connectWalletBtn.textContent = 'Connect Phantom';
		
		if (error.code === 4001) {
			showMessage('Connection request was rejected', 'error');
		} else {
			showMessage(`Failed to connect wallet: ${error.message}`, 'error');
		}
	}
}

/**
 * Handle wallet disconnect
 */
function handleWalletDisconnect() {
	state.walletConnected = false;
	state.walletAddress = null;
	state.provider = null;
	
	elements.walletStatus.textContent = 'Not connected';
	elements.walletStatus.classList.remove('connected');
	elements.walletAddressContainer.style.display = 'none';
	elements.walletAddressInput.value = '';
	elements.connectWalletBtn.disabled = false;
	elements.connectWalletBtn.textContent = 'Connect Phantom';
	elements.submitBtn.disabled = true;
	
	updateStepIndicator(1);
}

/**
 * Check if form is valid
 */
function isFormValid() {
	const name = document.getElementById('name').value.trim();
	const email = document.getElementById('email').value.trim();
	const adLink = document.getElementById('adLink').value.trim();
	const adText = elements.adText.value.trim();
	const bidAmount = parseFloat(elements.bidAmount.value);
	const cellCount = parseInt(elements.cellCount.value);
	const hasImage = elements.adImage.files.length > 0;
	
	return name && email && adLink && adText && 
		   bidAmount >= CONFIG.minBid && 
		   cellCount >= CONFIG.minCells && 
		   hasImage;
}

/**
 * Update submit button state
 */
function updateSubmitButtonState() {
	elements.submitBtn.disabled = !state.walletConnected || !isFormValid();
}

/**
 * Submit the advertiser registration
 */
async function submitAdvertiser() {
	try {
		hideMessage();
		elements.submitBtn.disabled = true;
		elements.submitBtn.textContent = 'Submitting...';
		
		// Create form data
		const formData = new FormData();
		formData.append('name', document.getElementById('name').value.trim());
		formData.append('email', document.getElementById('email').value.trim());
		formData.append('walletAddress', state.walletAddress);
		formData.append('adLink', document.getElementById('adLink').value.trim());
		formData.append('adText', elements.adText.value.trim());
		formData.append('bidAmount', elements.bidAmount.value);
		formData.append('cellCount', elements.cellCount.value);
		formData.append('adImage', elements.adImage.files[0]);
		
		// Submit to server
		const response = await fetch('/api/advertisers', {
			method: 'POST',
			body: formData
		});
		
		const result = await response.json();
		
		if (!response.ok || !result.success) {
			throw new Error(result.message || 'Failed to register advertiser');
		}
		
		state.advertiserId = result.advertiser.id;
		
		// Update step indicator
		updateStepIndicator(3);
		
		// Show payment status
		elements.paymentStatusCard.style.display = 'block';
		elements.paymentStatus.innerHTML = `
			<p>✓ Advertisement registered successfully!</p>
			<p style="margin-top: 12px;"><strong>Advertiser ID:</strong> ${state.advertiserId}</p>
			<p style="margin-top: 8px;"><strong>Amount to pay:</strong> ${elements.bidAmount.value} SOL</p>
			<p style="margin-top: 20px;">Now send the payment to activate your advertisement...</p>
		`;
		
		elements.submitBtn.textContent = 'Sending Payment...';
		
		// Initiate payment
		await sendPayment();
		
	} catch (error) {
		console.error('Submission error:', error);
		showMessage(error.message, 'error');
		elements.submitBtn.disabled = false;
		elements.submitBtn.textContent = 'Submit & Pay with SOL';
	}
}

/**
 * Send SOL payment using Phantom
 */
async function sendPayment() {
	try {
		if (!state.provider || !state.walletConnected) {
			throw new Error('Wallet not connected');
		}
		
		const bidAmount = parseFloat(elements.bidAmount.value);
		const lamports = Math.floor(bidAmount * 1e9); // Convert SOL to lamports
		
		// Create transaction
		const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};
		
		// If Solana Web3 is not available, show manual payment instructions
		if (!Connection) {
			elements.paymentStatus.innerHTML = `
				<p>✓ Advertisement registered!</p>
				<p style="margin-top: 12px;"><strong>Advertiser ID:</strong> ${state.advertiserId}</p>
				<hr style="margin: 20px 0; border-color: #333;">
				<p><strong>Manual Payment Instructions:</strong></p>
				<p style="margin-top: 12px;">Send <strong>${bidAmount} SOL</strong> to:</p>
				<div style="background: #000; padding: 12px; border-radius: 8px; margin: 12px 0; word-break: break-all; font-family: monospace;">
					${CONFIG.receivingWallet}
				</div>
				<p style="margin-top: 12px;">After sending, enter your transaction signature below to activate:</p>
				<input type="text" id="manual-tx-sig" placeholder="Transaction signature" style="width: 100%; margin-top: 12px; padding: 12px; background: #000; border: 1px solid #333; border-radius: 6px; color: #fff;">
				<button id="verify-tx-btn" style="width: 100%; margin-top: 12px; padding: 12px; background: linear-gradient(135deg, #ffcc00 0%, #e6b800 100%); color: #000; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
					Verify & Activate
				</button>
			`;
			
			elements.submitBtn.textContent = 'Waiting for Payment...';
			elements.submitBtn.disabled = true;
			
			// Add event listener for manual verification
			document.getElementById('verify-tx-btn').addEventListener('click', async () => {
				const signature = document.getElementById('manual-tx-sig').value.trim();
				if (signature) {
					await activateAdvertiser(signature);
				} else {
					showMessage('Please enter the transaction signature', 'error');
				}
			});
			
			return;
		}
		
		// If Solana Web3 is available, proceed with automatic payment
		const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
		const fromPubkey = new PublicKey(state.walletAddress);
		const toPubkey = new PublicKey(CONFIG.receivingWallet);
		
		const transaction = new Transaction().add(
			SystemProgram.transfer({
				fromPubkey,
				toPubkey,
				lamports
			})
		);
		
		// Get recent blockhash
		const { blockhash } = await connection.getRecentBlockhash();
		transaction.recentBlockhash = blockhash;
		transaction.feePayer = fromPubkey;
		
		// Sign and send transaction
		const signed = await state.provider.signTransaction(transaction);
		const signature = await connection.sendRawTransaction(signed.serialize());
		
		// Wait for confirmation
		await connection.confirmTransaction(signature);
		
		// Activate advertiser with transaction signature
		await activateAdvertiser(signature);
		
	} catch (error) {
		console.error('Payment error:', error);
		
		if (error.code === 4001) {
			showMessage('Payment was cancelled', 'error');
		} else {
			showMessage(`Payment failed: ${error.message}`, 'error');
		}
		
		elements.submitBtn.disabled = false;
		elements.submitBtn.textContent = 'Retry Payment';
	}
}

/**
 * Activate advertiser after payment verification
 */
async function activateAdvertiser(transactionSignature) {
	try {
		const response = await fetch(`/api/advertisers/${state.advertiserId}/activate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				transactionSignature
			})
		});
		
		const result = await response.json();
		
		if (!response.ok || !result.success) {
			throw new Error(result.message || 'Failed to activate advertiser');
		}
		
		const advertiserId = state.advertiserId;
		elements.paymentStatus.innerHTML = `
			<div style="text-align: center; padding: 20px;">
				<div style="font-size: 60px; margin-bottom: 20px;">⌛</div>
				<h3 style="color: #ffcc00; margin-bottom: 12px;">Payment received — awaiting review</h3>
				<p>Your ad is in the moderator queue. We hand-review every ad to keep the game family-friendly. This usually takes less than 24 hours.</p>
				<p style="margin-top: 16px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; font-family: monospace; word-break: break-all;">
					<strong>Advertiser ID:</strong> ${advertiserId}<br>
					<strong>Transaction:</strong>
					<a href="https://explorer.solana.com/tx/${transactionSignature}" target="_blank" style="color: #ffcc00;">${transactionSignature.substring(0, 20)}…</a>
				</p>
				<p style="margin-top: 12px; font-size: 14px; color: #888;">
					Keep your Advertiser ID. Sign in with your wallet on
					<a href="/advertise-manage.html" style="color: #ffcc00;">the manage page</a>
					at any time to check status or re-upload if rejected.
				</p>
				<div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
					<a href="/advertise-manage.html" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #ffcc00 0%, #e6b800 100%); color: #000; text-decoration: none; border-radius: 6px; font-weight: bold;">
						Manage my ads
					</a>
					<a href="/" style="display: inline-block; padding: 12px 24px; background: #333; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
						Back to game
					</a>
				</div>
			</div>
		`;

		elements.submitBtn.textContent = 'Submitted for review';
		elements.submitBtn.style.background = 'linear-gradient(135deg, #ffcc00 0%, #e6b800 100%)';
		
		// Mark all steps as completed
		steps.forEach(step => {
			step.classList.remove('active');
			step.classList.add('completed');
		});
		
	} catch (error) {
		console.error('Activation error:', error);
		showMessage(`Activation failed: ${error.message}`, 'error');
		elements.submitBtn.disabled = false;
		elements.submitBtn.textContent = 'Retry Activation';
	}
}

// Event Listeners
function initEventListeners() {
	// Wallet connection
	elements.connectWalletBtn.addEventListener('click', connectWallet);
	
	// Submit button
	elements.submitBtn.addEventListener('click', submitAdvertiser);
	
	// Character count
	elements.adText.addEventListener('input', updateCharCount);
	
	// Image preview
	elements.adImage.addEventListener('change', handleImagePreview);
	
	// Bid calculator updates
	elements.bidAmount.addEventListener('input', () => {
		updateBidCalculator();
		updateSubmitButtonState();
	});
	elements.cellCount.addEventListener('input', () => {
		updateBidCalculator();
		updateSubmitButtonState();
	});
	
	// Form validation on any input change
	const formInputs = elements.form.querySelectorAll('input, textarea');
	formInputs.forEach(input => {
		input.addEventListener('input', updateSubmitButtonState);
		input.addEventListener('change', updateSubmitButtonState);
	});
	
	// Drag and drop for image upload
	elements.fileUploadArea.addEventListener('dragover', (e) => {
		e.preventDefault();
		elements.fileUploadArea.style.borderColor = '#ffcc00';
		elements.fileUploadArea.style.background = 'rgba(255, 204, 0, 0.1)';
	});
	
	elements.fileUploadArea.addEventListener('dragleave', () => {
		elements.fileUploadArea.style.borderColor = '';
		elements.fileUploadArea.style.background = '';
	});
	
	elements.fileUploadArea.addEventListener('drop', (e) => {
		e.preventDefault();
		elements.fileUploadArea.style.borderColor = '';
		elements.fileUploadArea.style.background = '';
		
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			elements.adImage.files = files;
			handleImagePreview({ target: elements.adImage });
			updateSubmitButtonState();
		}
	});
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
	initEventListeners();
	updateBidCalculator();
	updateCharCount();
});



