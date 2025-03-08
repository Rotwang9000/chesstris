/**
 * Chess-tris Payment System Module
 * 
 * This module provides a unified API for handling payments through various methods:
 * - Cryptocurrency (BASE, Solana)
 * - Traditional payment processors (Stripe, PayPal)
 */

// Configuration for payment providers
const paymentConfig = {
	enabled: true, // Enable the payment system for testing with Solana
	preferredCurrency: 'USD',
	cryptoEnabled: true,
	fiatEnabled: false, // Disable fiat payments for now
	preferredProvider: 'SOL', // Set Solana as preferred provider
	
	// Exchange rates (to be updated from an API in production)
	exchangeRates: {
		USD: 1.0,
		EUR: 0.85,
		GBP: 0.73,
		SOL: 0.01, // 1 SOL = 100 USD equivalent tokens
		ETH: 0.0004 // 1 ETH = 2500 USD equivalent tokens
	},
	
	// Fees configuration
	fees: {
		platform: 0.03, // 3% platform fee
		crypto: {
			BASE: 0.01, // 1% fee for BASE transactions
			SOL: 0.005 // 0.5% fee for Solana transactions - lower to encourage use
		},
		fiat: {
			STRIPE: 0.029, // 2.9% + $0.30 for Stripe
			PAYPAL: 0.039 // 3.9% + $0.30 for PayPal
		}
	},
	
	// Minimum withdrawal amounts
	minimumWithdrawal: {
		USD: 10,
		SOL: 0.1,
		BASE: 5
	},
	
	// Crypto network configurations
	networks: {
		BASE: {
			chainId: '0x2105', // BASE mainnet
			rpcUrl: 'https://mainnet.base.org',
			explorerUrl: 'https://basescan.org',
			tokenDecimals: 18
		},
		SOL: {
			cluster: 'mainnet-beta',
			rpcUrl: 'https://api.mainnet-beta.solana.com',
			explorerUrl: 'https://explorer.solana.com',
			// Solana-specific configuration
			programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token program ID
			splTokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
			associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
			walletProviderNames: ['Phantom', 'Solflare', 'Sollet', 'Slope']
		}
	}
};

// Import Solana Web3.js library
const { 
	Connection, 
	PublicKey, 
	Transaction, 
	SystemProgram, 
	LAMPORTS_PER_SOL,
	sendAndConfirmTransaction 
} = require('@solana/web3.js');

// ----- Payment Provider Interfaces -----

/**
 * Base Payment Provider Interface
 */
class PaymentProvider {
	constructor(config) {
		this.config = config;
	}
	
	async initialize() {
		throw new Error('Method not implemented');
	}
	
	async processPayment(amount, currency, metadata) {
		throw new Error('Method not implemented');
	}
	
	async getBalance() {
		throw new Error('Method not implemented');
	}
	
	async withdraw(amount, destination) {
		throw new Error('Method not implemented');
	}
}

/**
 * Solana Payment Provider
 */
class SolanaProvider extends PaymentProvider {
	constructor(config) {
		super(config);
		this.connection = null;
		this.wallet = null;
		this.publicKey = null;
		this.receivingAddress = 'GsbwXfJraMohNnrpGCwvGqNGNQxD1w3w6EQ5AdHxXsv9'; // Your wallet address to receive payments
	}
	
	async initialize() {
		try {
			// Check if Phantom or other Solana wallet is installed
			if (!window.solana && !window.solflare) {
				// Create QR code for mobile wallet connection or display install instructions
				return {
					success: false,
					needsWallet: true,
					error: 'Solana wallet not found',
					walletOptions: this.config.walletProviderNames
				};
			}
			
			// Try to connect to the wallet (prioritize Phantom)
			const wallet = window.solana || window.solflare;
			
			try {
				// Request wallet connection (this triggers the wallet popup)
				await wallet.connect();
				
				if (!wallet.isConnected) {
					throw new Error('Wallet connection failed or was rejected by user');
				}
				
				// Get the public key
				const publicKey = wallet.publicKey.toString();
				
				// Create connection to Solana network
				this.connection = new Connection(this.config.rpcUrl, 'confirmed');
				this.wallet = wallet;
				this.publicKey = publicKey;
				
				// Get the wallet balance
				const balanceResponse = await this.getBalance();
				
				// Return success with wallet address
				return {
					success: true,
					message: 'Solana wallet connected',
					walletAddress: publicKey,
					provider: wallet.isPhantom ? 'Phantom' : (wallet.isSolflare ? 'Solflare' : 'Solana Wallet'),
					balance: balanceResponse.formattedBalance
				};
			} catch (err) {
				console.error('Failed to connect to Solana wallet:', err);
				return {
					success: false,
					error: 'User rejected wallet connection or connection failed',
					recoverable: true
				};
			}
		} catch (error) {
			console.error('Failed to initialize Solana provider:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	async processPayment(amount, tokenAmount, metadata) {
		if (!paymentConfig.enabled) {
			return { success: false, error: 'Payment system is not enabled' };
		}
		
		if (!this.wallet || !this.connection) {
			return { success: false, error: 'Wallet not connected' };
		}
		
		try {
			// Step 1: Create a payment intent on the server
			const paymentIntent = await this.createPaymentIntent(amount, tokenAmount, metadata);
			
			if (!paymentIntent.success) {
				throw new Error(paymentIntent.error || 'Failed to create payment intent');
			}
			
			const { id: referenceId, solAmount, receivingAddress } = paymentIntent.paymentIntent;
			
			// Step 2: Convert the amount to lamports (SOL's smallest unit)
			const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
			
			// Step 3: Create a transaction
			const transaction = new Transaction().add(
				SystemProgram.transfer({
					fromPubkey: new PublicKey(this.publicKey),
					toPubkey: new PublicKey(receivingAddress),
					lamports: lamports
				})
			);
			
			// Set recent blockhash and fee payer
			transaction.recentBlockhash = (await this.connection.getRecentBlockhash()).blockhash;
			transaction.feePayer = new PublicKey(this.publicKey);
			
			// Show a notification (outside of try/catch to ensure it always shows)
			console.log(`Requesting approval for ${solAmount} SOL payment...`);
			
			// Step 4: Send the transaction to the wallet for signing
			const signature = await this.wallet.signAndSendTransaction(transaction);
			
			// For testing only - if we can't use wallet's signAndSendTransaction
			// const signature = `DEMO${Math.random().toString(36).substring(2, 15)}`;
			
			console.log(`Transaction sent with signature: ${signature}`);
			
			// Step 5: Verify transaction with our server
			const verificationResult = await this.verifyTransaction(signature, referenceId);
			
			if (!verificationResult.success) {
				throw new Error(verificationResult.error || 'Transaction verification failed');
			}
			
			// Return success with transaction details
			return {
				success: true,
				transactionId: signature,
				referenceId: referenceId,
				amount: solAmount,
				tokens: tokenAmount,
				timestamp: new Date().toISOString(),
				blockExplorer: `${paymentConfig.networks.SOL.explorerUrl}/tx/${signature}`,
				provider: 'SOL'
			};
		} catch (error) {
			console.error('Failed to process Solana payment:', error);
			return {
				success: false,
				error: error.message || 'Transaction failed'
			};
		}
	}
	
	async getBalance() {
		try {
			if (!this.connection || !this.publicKey) {
				throw new Error('Wallet not connected');
			}
			
			// Get the balance in lamports
			const balance = await this.connection.getBalance(new PublicKey(this.publicKey));
			
			// Convert lamports to SOL
			const solBalance = balance / LAMPORTS_PER_SOL;
			
			return { 
				balance: solBalance,
				formattedBalance: `${solBalance.toFixed(4)} SOL` 
			};
		} catch (error) {
			console.error('Failed to get Solana balance:', error);
			return { 
				success: false,
				error: error.message
			};
		}
	}
	
	async getTransactionCost(amount) {
		try {
			if (!this.connection) {
				throw new Error('Connection not established');
			}
			
			// Estimated fee based on recent block cost
			const recentBlockhash = await this.connection.getRecentBlockhash();
			const feeCalculator = recentBlockhash.feeCalculator;
			const fee = feeCalculator.lamportsPerSignature / LAMPORTS_PER_SOL;
			
			return {
				estimatedFee: fee,
				total: amount + fee
			};
		} catch (error) {
			console.error('Failed to get transaction cost:', error);
			return {
				estimatedFee: 0.000005, // Fallback to fixed estimate
				total: amount + 0.000005
			};
		}
	}
	
	// Get signature for a transaction (for verification)
	async signMessage(message) {
		try {
			if (!this.wallet) {
				throw new Error('Wallet not connected');
			}
			
			const encodedMessage = new TextEncoder().encode(message);
			
			// In a real app: const signature = await this.wallet.signMessage(encodedMessage, 'utf8');
			// For demo, simulate signature
			const simulatedSignature = Array.from({ length: 64 }, () => 
				Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
			).join('');
			
			return {
				success: true,
				signature: simulatedSignature,
				publicKey: this.publicKey
			};
		} catch (error) {
			console.error('Failed to sign message:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Create a payment intent on the server
	 */
	async createPaymentIntent(amount, tokenAmount, metadata) {
		try {
			const response = await fetch('/api/payments/intent', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Id': localStorage.getItem('userId') || this.publicKey // Use stored userId or wallet address
				},
				body: JSON.stringify({
					amount: amount,
					packageType: metadata.package || 'Custom',
					currency: 'USD'
				})
			});
			
			return await response.json();
		} catch (error) {
			console.error('Error creating payment intent:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Verify a transaction with the server
	 */
	async verifyTransaction(transactionId, referenceId) {
		try {
			const response = await fetch('/api/payments/verify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Id': localStorage.getItem('userId') || this.publicKey
				},
				body: JSON.stringify({
					transactionId,
					referenceId
				})
			});
			
			return await response.json();
		} catch (error) {
			console.error('Error verifying transaction:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Get user's token balance from server
	 */
	async getTokenBalance() {
		try {
			const response = await fetch('/api/payments/balance', {
				headers: {
					'User-Id': localStorage.getItem('userId') || this.publicKey
				}
			});
			
			const result = await response.json();
			return result.success ? result.balance : 0;
		} catch (error) {
			console.error('Error getting token balance:', error);
			return 0;
		}
	}
}

/**
 * BASE (Optimistic Ethereum L2) Payment Provider
 */
class BaseProvider extends PaymentProvider {
	constructor(config) {
		super(config);
		this.provider = null;
		this.signer = null;
	}
	
	async initialize() {
		try {
			// In a real implementation, we would:
			// 1. Check if MetaMask or other Ethereum wallet is installed
			// 2. Request connection to the BASE network
			// 3. Get the signer
			
			if (!window.ethereum) {
				throw new Error('Ethereum wallet not found');
			}
			
			// Return a placeholder for now
			return {
				success: true,
				message: 'BASE provider initialized',
				walletAddress: 'Demo_BASE_Wallet_Address'
			};
		} catch (error) {
			console.error('Failed to initialize BASE provider:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	async processPayment(amount, tokenAmount, metadata) {
		if (!paymentConfig.enabled) {
			return { success: false, error: 'Payment system is not enabled' };
		}
		
		try {
			// In a real implementation, this would:
			// 1. Create a transaction to send ETH on BASE
			// 2. Prompt the user to approve the transaction
			// 3. Submit the transaction to the network
			// 4. Wait for confirmation
			
			console.log(`Processing BASE payment: ${amount} ETH for ${tokenAmount} tokens`);
			
			// Return a placeholder for now
			return {
				success: true,
				transactionId: `demo_base_tx_${Date.now()}`,
				amount: amount,
				tokens: tokenAmount,
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			console.error('Failed to process BASE payment:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	async getBalance() {
		// Placeholder implementation
		return { balance: 0 };
	}
}

/**
 * Stripe Payment Provider - now marked as coming soon
 */
class StripeProvider extends PaymentProvider {
	constructor(config) {
		super(config);
		this.stripe = null;
		this.comingSoon = true; // Mark as coming soon
	}
	
	async initialize() {
		// Since this is coming soon, we'll just return a pending status
		return {
			success: false,
			comingSoon: true,
			message: 'Stripe payments coming soon!'
		};
	}
	
	async processPayment(amount, tokenAmount, metadata) {
		return {
			success: false,
			comingSoon: true,
			message: 'Stripe payments are not yet available'
		};
	}
}

// ----- Payment Manager -----

/**
 * Handles all payment processing regardless of the payment method
 */
class PaymentManager {
	constructor() {
		this.providers = {};
		this.activeProvider = null;
		this.initialized = false;
		this.walletConnected = false;
		this.walletAddress = null;
	}
	
	/**
	 * Initialize the payment system
	 */
	async initialize() {
		if (this.initialized) return { success: true };
		
		try {
			// Register payment providers
			this.providers = {
				SOL: new SolanaProvider(paymentConfig.networks.SOL),
				BASE: new BaseProvider(paymentConfig.networks.BASE),
				STRIPE: new StripeProvider({})
			};
			
			this.initialized = true;
			
			// If preferred provider is set, try to connect to it automatically
			if (paymentConfig.preferredProvider && this.providers[paymentConfig.preferredProvider]) {
				try {
					await this.connectProvider(paymentConfig.preferredProvider);
				} catch (error) {
					console.log('Could not auto-connect to preferred provider:', error);
				}
			}
			
			return {
				success: true,
				availableProviders: Object.keys(this.providers),
				preferredProvider: paymentConfig.preferredProvider
			};
		} catch (error) {
			console.error('Failed to initialize payment system:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Connect to a specific payment provider
	 * @param {string} providerName - Name of the provider (SOL, BASE, STRIPE, etc.)
	 */
	async connectProvider(providerName) {
		if (!this.initialized) {
			await this.initialize();
		}
		
		const provider = this.providers[providerName];
		
		if (!provider) {
			return {
				success: false,
				error: `Provider ${providerName} not found`
			};
		}
		
		try {
			const result = await provider.initialize();
			
			if (result.success) {
				this.activeProvider = providerName;
				this.walletConnected = true;
				this.walletAddress = result.walletAddress;
			}
			
			return result;
		} catch (error) {
			console.error(`Failed to connect to ${providerName}:`, error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Process a payment using the active provider
	 * @param {number} amount - Amount in the provider's native currency
	 * @param {number} tokenAmount - Amount of tokens to purchase
	 * @param {Object} metadata - Additional payment metadata
	 */
	async processPayment(amount, tokenAmount, metadata = {}) {
		if (!this.initialized || !this.activeProvider) {
			return {
				success: false,
				error: 'Payment system not initialized or no active provider'
			};
		}
		
		const provider = this.providers[this.activeProvider];
		
		try {
			// Add payment fee
			const fee = this.calculateFee(amount, this.activeProvider);
			const totalAmount = amount + fee;
			
			// Process the payment
			const result = await provider.processPayment(totalAmount, tokenAmount, {
				...metadata,
				fee: fee
			});
			
			if (result.success) {
				// Record the transaction in our system
				this.recordTransaction({
					type: 'purchase',
					provider: this.activeProvider,
					amount: totalAmount,
					tokens: tokenAmount,
					fee: fee,
					timestamp: new Date().toISOString(),
					transactionId: result.transactionId,
					metadata: metadata
				});
			}
			
			return result;
		} catch (error) {
			console.error('Payment processing failed:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Calculate the fee for a payment
	 * @param {number} amount - The payment amount
	 * @param {string} provider - The payment provider
	 * @returns {number} The fee amount
	 */
	calculateFee(amount, provider) {
		const platformFee = amount * paymentConfig.fees.platform;
		
		let providerFee = 0;
		
		if (provider === 'SOL') {
			providerFee = amount * paymentConfig.fees.crypto.SOL;
		} else if (provider === 'BASE') {
			providerFee = amount * paymentConfig.fees.crypto.BASE;
		} else if (provider === 'STRIPE') {
			providerFee = amount * paymentConfig.fees.fiat.STRIPE + 0.3; // $0.30 fixed fee
		} else if (provider === 'PAYPAL') {
			providerFee = amount * paymentConfig.fees.fiat.PAYPAL + 0.3; // $0.30 fixed fee
		}
		
		return platformFee + providerFee;
	}
	
	/**
	 * Convert between currencies
	 * @param {number} amount - The amount to convert
	 * @param {string} fromCurrency - The source currency
	 * @param {string} toCurrency - The target currency
	 * @returns {number} The converted amount
	 */
	convertCurrency(amount, fromCurrency, toCurrency) {
		const fromRate = paymentConfig.exchangeRates[fromCurrency] || 1;
		const toRate = paymentConfig.exchangeRates[toCurrency] || 1;
		
		return (amount * fromRate) / toRate;
	}
	
	/**
	 * Get the token amount for a given fiat or crypto amount
	 * @param {number} amount - The payment amount
	 * @param {string} currency - The currency of the payment
	 * @returns {number} The token amount
	 */
	getTokenAmount(amount, currency) {
		// Convert to USD equivalent first
		const usdAmount = this.convertCurrency(amount, currency, 'USD');
		
		// Apply token conversion rate (e.g., 1 USD = 100 tokens)
		return usdAmount * 100;
	}
	
	/**
	 * Record a transaction in our system
	 * @param {Object} transaction - The transaction details
	 * @private
	 */
	recordTransaction(transaction) {
		// In a real implementation, this would store the transaction
		// in a database or send it to a server
		console.log('Recording transaction:', transaction);
		
		// Get existing transactions from localStorage
		const transactions = JSON.parse(localStorage.getItem('transactions') || '[]');
		
		// Add new transaction
		transactions.push(transaction);
		
		// Save back to localStorage
		localStorage.setItem('transactions', JSON.stringify(transactions));
	}
	
	/**
	 * Get all recorded transactions
	 * @returns {Array} The list of transactions
	 */
	getTransactions() {
		return JSON.parse(localStorage.getItem('transactions') || '[]');
	}
}

// Create a singleton instance
const paymentManager = new PaymentManager();

// ----- API Functions -----

/**
 * Initialize the payment system
 * @returns {Promise<Object>} Initialization result
 */
async function initializePayments() {
	return await paymentManager.initialize();
}

/**
 * Connect to a payment provider
 * @param {string} provider - The provider to connect to
 * @returns {Promise<Object>} Connection result
 */
async function connectPaymentProvider(provider) {
	return await paymentManager.connectProvider(provider);
}

/**
 * Process a payment
 * @param {number} amount - The payment amount
 * @param {string} currency - The currency of the payment
 * @param {Object} metadata - Additional payment metadata
 * @returns {Promise<Object>} Payment result
 */
async function processPayment(amount, currency, metadata = {}) {
	// Calculate token amount based on currency and amount
	const tokenAmount = paymentManager.getTokenAmount(amount, currency);
	
	// Convert amount to the native currency of the provider if needed
	let nativeAmount = amount;
	if (paymentManager.activeProvider === 'SOL' && currency !== 'SOL') {
		nativeAmount = paymentManager.convertCurrency(amount, currency, 'SOL');
	} else if (paymentManager.activeProvider === 'BASE' && currency !== 'ETH') {
		nativeAmount = paymentManager.convertCurrency(amount, currency, 'ETH');
	}
	
	return await paymentManager.processPayment(nativeAmount, tokenAmount, metadata);
}

/**
 * Get token price for a specific amount and currency
 * @param {number} amount - The payment amount
 * @param {string} currency - The currency of the payment
 * @returns {Object} The token price information
 */
function getTokenPrice(amount, currency) {
	const tokenAmount = paymentManager.getTokenAmount(amount, currency);
	
	// Calculate fees
	const feeUSD = paymentManager.calculateFee(
		paymentManager.convertCurrency(amount, currency, 'USD'),
		paymentManager.activeProvider || 'STRIPE'
	);
	
	const feeInCurrency = paymentManager.convertCurrency(feeUSD, 'USD', currency);
	
	return {
		amount: amount,
		currency: currency,
		tokens: tokenAmount,
		fee: feeInCurrency,
		total: amount + feeInCurrency,
		rate: tokenAmount / amount
	};
}

/**
 * Get transaction history
 * @returns {Array} List of transactions
 */
function getTransactionHistory() {
	return paymentManager.getTransactions();
}

module.exports = {
	paymentConfig,
	initializePayments,
	connectPaymentProvider,
	processPayment,
	getTokenPrice,
	getTransactionHistory
}; 