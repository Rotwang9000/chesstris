/**
 * Tests for the payment service
 */

const {
	createSolanaPaymentIntent,
	verifySolanaTransaction,
	getUserTokenBalance,
	getUserTransactionHistory,
	calculateTokenAmount
} = require('../payments');

// Mock Solana connection
jest.mock('@solana/web3.js', () => {
	const originalModule = jest.requireActual('@solana/web3.js');
	
	// Mock Connection class
	class MockConnection {
		constructor() {
			this.mockTransactions = new Map();
		}
		
		async getTransaction(signature) {
			return this.mockTransactions.get(signature) || null;
		}
		
		async getRecentBlockhash() {
			return { blockhash: 'mock-blockhash' };
		}
		
		async getBalance() {
			return 5000000000; // 5 SOL
		}
		
		// Method to add mock transaction for testing
		_addMockTransaction(signature, transaction) {
			this.mockTransactions.set(signature, transaction);
		}
	}
	
	return {
		...originalModule,
		Connection: MockConnection,
		LAMPORTS_PER_SOL: 1000000000
	};
});

// Create fresh mock data before each test
beforeEach(() => {
	// Reset any mock implementation
	jest.clearAllMocks();
});

describe('Payment Service', () => {
	describe('createSolanaPaymentIntent', () => {
		test('should create a valid payment intent', async () => {
			const result = await createSolanaPaymentIntent('user123', 10, 'Starter');
			
			expect(result.success).toBe(true);
			expect(result.paymentIntent).toBeDefined();
			expect(result.paymentIntent.userId).toBe('user123');
			expect(result.paymentIntent.amount).toBe(10);
			expect(result.paymentIntent.tokens).toBe(1000); // 10 * 100
			expect(result.paymentIntent.status).toBe('pending');
			expect(result.paymentIntent.packageType).toBe('Starter');
		});
		
		test('should reject invalid amount', async () => {
			const result = await createSolanaPaymentIntent('user123', 999, 'Invalid');
			
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
	
	describe('getUserTokenBalance', () => {
		test('should return 0 for user with no balance', () => {
			const balance = getUserTokenBalance('nonexistent-user');
			expect(balance).toBe(0);
		});
		
		test('should return correct balance after adding tokens', () => {
			const userId = 'test-user-balance';
			
			// Add tokens to user
			require('../payments').addUserTokens(userId, 1000);
			
			// Check balance
			const balance = getUserTokenBalance(userId);
			expect(balance).toBe(1000);
		});
	});
	
	describe('getUserTransactionHistory', () => {
		test('should return empty array for user with no transactions', () => {
			const history = getUserTransactionHistory('new-user');
			expect(history).toEqual([]);
		});
		
		test('should return transactions for user with transaction history', async () => {
			const userId = 'user-with-transactions';
			
			// Create some transactions for this user
			await createSolanaPaymentIntent(userId, 10, 'Starter');
			await createSolanaPaymentIntent(userId, 25, 'Popular');
			
			// Get history
			const history = getUserTransactionHistory(userId);
			expect(history.length).toBe(2);
			expect(history[0].userId).toBe(userId);
			expect(history[1].userId).toBe(userId);
		});
		
		test('should filter by status', async () => {
			const userId = 'user-filter-test';
			
			// Create a transaction
			const result = await createSolanaPaymentIntent(userId, 10, 'Starter');
			
			// Get pending transactions
			const pending = getUserTransactionHistory(userId, 'pending');
			expect(pending.length).toBe(1);
			
			// Get completed transactions (should be empty)
			const completed = getUserTransactionHistory(userId, 'completed');
			expect(completed.length).toBe(0);
		});
	});
	
	describe('calculateTokenAmount', () => {
		test('should calculate correct token amount for standard packages', () => {
			expect(calculateTokenAmount(10)).toBe(1000); // 10 * 100
			expect(calculateTokenAmount(25)).toBe(2750); // 25 * 110
			expect(calculateTokenAmount(50)).toBe(6000); // 50 * 120
		});
		
		test('should handle non-standard amounts using nearest package rate', () => {
			// Should use the 10 USD rate (100 tokens per dollar)
			expect(calculateTokenAmount(5)).toBe(500);
			
			// Should use the 25 USD rate (110 tokens per dollar)
			expect(calculateTokenAmount(20)).toBe(2200);
			
			// Should use the 50 USD rate (120 tokens per dollar)
			expect(calculateTokenAmount(100)).toBe(12000);
		});
	});
});

// Note: verifySolanaTransaction is harder to test because it requires mocking
// blockchain transactions. In a real implementation, you'd use a more
// comprehensive mock of the Solana connection. 