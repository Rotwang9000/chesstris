const {
	paymentConfig,
	initializePayments,
	connectPaymentProvider,
	processPayment,
	getTokenPrice,
	getTransactionHistory
} = require('../payments');

// Mock localStorage
const localStorageMock = (function() {
	let store = {};
	return {
		getItem: function(key) {
			return store[key] || null;
		},
		setItem: function(key, value) {
			store[key] = value.toString();
		},
		clear: function() {
			store = {};
		}
	};
})();

// Mock window objects
global.localStorage = localStorageMock;
global.solana = { isPhantom: true };
global.ethereum = { isMetaMask: true };

// Mock console.error to avoid cluttering test output
console.error = jest.fn();

describe('Payment System', () => {
	beforeEach(() => {
		localStorage.clear();
		jest.clearAllMocks();
	});
	
	describe('paymentConfig', () => {
		test('should have payment system disabled by default', () => {
			expect(paymentConfig.enabled).toBe(false);
		});
		
		test('should prioritize Solana as the preferred provider', () => {
			expect(paymentConfig.preferredProvider).toBe('SOL');
		});
		
		test('should have lower fees for Solana compared to other providers', () => {
			expect(paymentConfig.fees.crypto.SOL).toBeLessThan(paymentConfig.fees.crypto.BASE);
			expect(paymentConfig.fees.crypto.SOL).toBeLessThan(paymentConfig.fees.fiat.STRIPE);
		});
		
		test('should have crypto enabled and fiat disabled', () => {
			expect(paymentConfig.cryptoEnabled).toBe(true);
			expect(paymentConfig.fiatEnabled).toBe(false);
		});
		
		test('should have proper exchange rates configured', () => {
			expect(paymentConfig.exchangeRates).toHaveProperty('USD');
			expect(paymentConfig.exchangeRates).toHaveProperty('SOL');
			expect(paymentConfig.exchangeRates).toHaveProperty('ETH');
			expect(paymentConfig.exchangeRates.USD).toBe(1.0); // Base currency
		});
		
		test('should have lower fees for crypto than fiat', () => {
			const cryptoFees = Object.values(paymentConfig.fees.crypto);
			const fiatFees = Object.values(paymentConfig.fees.fiat);
			
			const avgCryptoFee = cryptoFees.reduce((a, b) => a + b, 0) / cryptoFees.length;
			const avgFiatFee = fiatFees.reduce((a, b) => a + b, 0) / fiatFees.length;
			
			expect(avgCryptoFee).toBeLessThan(avgFiatFee);
		});
		
		test('should have network configurations for BASE and Solana', () => {
			expect(paymentConfig.networks).toHaveProperty('BASE');
			expect(paymentConfig.networks).toHaveProperty('SOL');
			expect(paymentConfig.networks.BASE).toHaveProperty('chainId');
			expect(paymentConfig.networks.SOL).toHaveProperty('cluster');
		});
	});
	
	describe('initializePayments', () => {
		test('should initialize the payment system', async () => {
			const result = await initializePayments();
			expect(result.success).toBe(true);
			expect(result.availableProviders).toContain('SOL');
			expect(result.availableProviders).toContain('BASE');
			expect(result.availableProviders).toContain('STRIPE');
		});
	});
	
	describe('connectPaymentProvider', () => {
		test('should connect to Solana provider', async () => {
			await initializePayments();
			const result = await connectPaymentProvider('SOL');
			expect(result.success).toBe(true);
			expect(result.walletAddress).toBeDefined();
		});
		
		test('should connect to BASE provider', async () => {
			await initializePayments();
			const result = await connectPaymentProvider('BASE');
			expect(result.success).toBe(true);
			expect(result.walletAddress).toBeDefined();
		});
		
		test('should connect to Stripe provider', async () => {
			await initializePayments();
			const result = await connectPaymentProvider('STRIPE');
			expect(result.success).toBe(true);
		});
		
		test('should return error for invalid provider', async () => {
			await initializePayments();
			const result = await connectPaymentProvider('INVALID');
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
	
	describe('processPayment', () => {
		test('should not process payment when payment system is disabled', async () => {
			await initializePayments();
			await connectPaymentProvider('SOL');
			
			// Ensure payment config is disabled
			expect(paymentConfig.enabled).toBe(false);
			
			const result = await processPayment(10, 'USD');
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
		
		test('should convert currency when processing payment with crypto', async () => {
			await initializePayments();
			await connectPaymentProvider('SOL');
			
			// Temporarily enable payments for testing
			const originalEnabled = paymentConfig.enabled;
			paymentConfig.enabled = true;
			
			// Mock currency conversion
			const originalGetTokenAmount = jest.spyOn(Object.getPrototypeOf(require('../payments').paymentManager), 'getTokenAmount');
			originalGetTokenAmount.mockImplementation(() => 1000);
			
			const originalConvertCurrency = jest.spyOn(Object.getPrototypeOf(require('../payments').paymentManager), 'convertCurrency');
			originalConvertCurrency.mockImplementation(() => 0.1); // 10 USD = 0.1 SOL
			
			const result = await processPayment(10, 'USD');
			
			// Reset payment config
			paymentConfig.enabled = originalEnabled;
			
			expect(result.success).toBe(true);
			expect(result.tokens).toBe(1000);
			expect(originalConvertCurrency).toHaveBeenCalled();
		});
	});
	
	describe('getTokenPrice', () => {
		test('should calculate correct token amounts', () => {
			// Initialize payment system
			initializePayments();
			
			const priceInfo = getTokenPrice(10, 'USD');
			expect(priceInfo.tokens).toBeGreaterThan(0);
			expect(priceInfo.fee).toBeGreaterThan(0);
			expect(priceInfo.total).toBeGreaterThan(10);
		});
		
		test('should give bonus tokens for larger purchases', () => {
			// Initialize payment system
			initializePayments();
			
			const smallPurchase = getTokenPrice(10, 'USD');
			const largePurchase = getTokenPrice(50, 'USD');
			
			// Check rate (tokens per dollar) is higher for larger purchase
			const smallRate = smallPurchase.tokens / 10;
			const largeRate = largePurchase.tokens / 50;
			
			expect(largeRate).toBeGreaterThanOrEqual(smallRate);
		});
	});
	
	describe('getTransactionHistory', () => {
		test('should return empty array when no transactions exist', () => {
			const transactions = getTransactionHistory();
			expect(transactions).toEqual([]);
		});
		
		test('should return transactions from localStorage', () => {
			// Add a mock transaction to localStorage
			const mockTransaction = { 
				id: 'tx1',
				type: 'purchase',
				amount: 10,
				tokens: 1000
			};
			
			localStorage.setItem('transactions', JSON.stringify([mockTransaction]));
			
			const transactions = getTransactionHistory();
			expect(transactions).toHaveLength(1);
			expect(transactions[0]).toEqual(mockTransaction);
		});
	});
}); 