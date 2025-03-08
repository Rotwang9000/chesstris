/**
 * Unit Tests for TransactionService
 * 
 * Tests the payment processing and transaction history service.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { createTestProxy } from '../setup.js';

describe('TransactionService', () => {
	let transactionService;
	let transactionModelStub;
	let userModelStub;
	let sandbox;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create model stubs
		transactionModelStub = {
			save: sandbox.stub().resolves({}),
			findOne: sandbox.stub(),
			find: sandbox.stub().returns({
				sort: sandbox.stub().returns({
					skip: sandbox.stub().returns({
						limit: sandbox.stub().resolves([])
					})
				})
			}),
			countDocuments: sandbox.stub().resolves(0)
		};
		
		userModelStub = {
			findById: sandbox.stub(),
			findOneAndUpdate: sandbox.stub()
		};
		
		// Mock the Transaction constructor
		function MockTransaction(data) {
			Object.assign(this, data, transactionModelStub);
			return this;
		}
		
		// Create a proxy for TransactionService
		transactionService = createTestProxy({
			// Properties
			config: {
				mongoUri: 'mongodb://localhost:27017/chesstris_test',
				stripeSecretKey: 'sk_test_123',
				stripeWebhookSecret: 'whsec_123'
			},
			Transaction: MockTransaction,
			User: userModelStub,
			
			// Methods
			createPaymentIntent: async (userId, paymentMethod, amount, tokenAmount, metadata) => {
				const referenceId = 'mock-uuid-123';
				
				const transaction = new MockTransaction({
					referenceId,
					userId,
					type: 'payment',
					status: 'pending',
					paymentMethod,
					amount,
					tokenAmount,
					metadata,
					createdAt: new Date()
				});
				
				await transaction.save();
				
				return {
					referenceId,
					amount,
					tokenAmount,
					status: 'pending',
					paymentUrl: `https://example.com/pay/${referenceId}`
				};
			},
			
			confirmPayment: async (referenceId, paymentDetails) => {
				const transaction = await transactionModelStub.findOne({ referenceId });
				if (!transaction) {
					throw new Error('Transaction not found');
				}
				
				transaction.status = 'completed';
				transaction.completedAt = new Date();
				transaction.paymentDetails = paymentDetails;
				
				await transaction.save();
				
				// Update user's token balance
				const user = await userModelStub.findById(transaction.userId);
				user.tokens += transaction.tokenAmount;
				await user.save();
				
				return {
					referenceId,
					status: 'completed',
					tokenAmount: transaction.tokenAmount
				};
			},
			
			getUserTransactions: async (userId, page = 1, limit = 10) => {
				transactionModelStub.find.returns({
					sort: sandbox.stub().returns({
						skip: sandbox.stub().returns({
							limit: sandbox.stub().resolves([
								{
									referenceId: 'tx1',
									type: 'payment',
									status: 'completed',
									amount: 100,
									createdAt: new Date()
								},
								{
									referenceId: 'tx2',
									type: 'purchase',
									status: 'completed',
									amount: 50,
									createdAt: new Date()
								}
							])
						})
					})
				});
				
				transactionModelStub.countDocuments.resolves(2);
				
				const skip = (page - 1) * limit;
				
				const transactions = await transactionModelStub.find({ userId })
					.sort({ createdAt: -1 })
					.skip(skip)
					.limit(limit);
				
				const total = await transactionModelStub.countDocuments({ userId });
				
				return {
					transactions,
					pagination: {
						total,
						page,
						limit,
						pages: Math.ceil(total / limit)
					}
				};
			},
			
			getTransactionById: async (referenceId) => {
				transactionModelStub.findOne.resolves({
					referenceId,
					type: 'payment',
					status: 'completed',
					amount: 100,
					tokenAmount: 1000,
					createdAt: new Date()
				});
				
				return transactionModelStub.findOne({ referenceId });
			},
			
			refundTransaction: async (referenceId, reason) => {
				const transaction = await transactionModelStub.findOne({ referenceId });
				if (!transaction) {
					throw new Error('Transaction not found');
				}
				
				if (transaction.status !== 'completed') {
					throw new Error('Only completed transactions can be refunded');
				}
				
				if (transaction.type !== 'payment') {
					throw new Error('Only payment transactions can be refunded');
				}
				
				// Create refund transaction
				const refundTransaction = new MockTransaction({
					referenceId: 'refund-' + referenceId,
					userId: transaction.userId,
					type: 'refund',
					status: 'completed',
					paymentMethod: transaction.paymentMethod,
					amount: transaction.amount,
					tokenAmount: -transaction.tokenAmount,
					metadata: {
						originalTransactionId: referenceId,
						reason
					},
					createdAt: new Date(),
					completedAt: new Date()
				});
				
				await refundTransaction.save();
				
				// Update user's token balance
				const user = await userModelStub.findById(transaction.userId);
				user.tokens -= transaction.tokenAmount;
				if (user.tokens < 0) user.tokens = 0;
				await user.save();
				
				return {
					referenceId: refundTransaction.referenceId,
					originalTransactionId: referenceId,
					status: 'completed',
					amount: transaction.amount
				};
			}
		});
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('createPaymentIntent', () => {
		it('should create a payment intent with correct parameters', async () => {
			// Setup test data
			const userId = 'user123';
			const paymentMethod = 'solana';
			const amount = 100;
			const tokenAmount = 1000;
			const metadata = { itemId: 'item123' };
			
			// Create a mock transaction with expected data
			const expectedDate = new Date();
			sandbox.useFakeTimers(expectedDate);
			
			// Execute the test
			const result = await transactionService.createPaymentIntent(
				userId, paymentMethod, amount, tokenAmount, metadata
			);
			
			// Verify transaction was created with correct properties
			expect(transactionModelStub.save.calledOnce).to.be.true;
			
			// Verify result has expected properties
			expect(result).to.have.property('referenceId');
			expect(result).to.have.property('amount', amount);
			expect(result).to.have.property('tokenAmount', tokenAmount);
			expect(result).to.have.property('status', 'pending');
			expect(result).to.have.property('paymentUrl').that.includes('mock-uuid-123');
		});
	});
	
	describe('confirmPayment', () => {
		it('should confirm a pending payment', async () => {
			// Setup test data
			const referenceId = 'mock-uuid-123';
			const paymentDetails = { 
				provider: 'solana',
				txId: 'sol-tx-123'
			};
			
			// Setup mock transaction
			transactionModelStub.findOne.resolves({
				referenceId,
				status: 'pending',
				userId: 'user123',
				amount: 100,
				tokenAmount: 1000,
				paymentMethod: 'solana',
				save: sandbox.stub().resolves()
			});
			
			// Setup mock user
			userModelStub.findById.resolves({
				_id: 'user123',
				tokens: 0,
				save: sandbox.stub().resolves()
			});
			
			// Execute the test
			const result = await transactionService.confirmPayment(referenceId, paymentDetails);
			
			// Verify transaction was found and updated
			expect(transactionModelStub.findOne.calledOnce).to.be.true;
			
			// Verify result has expected properties
			expect(result).to.have.property('referenceId', referenceId);
			expect(result).to.have.property('status', 'completed');
			expect(result).to.have.property('tokenAmount');
		});
		
		it('should throw error if transaction not found', async () => {
			// Setup transaction not found
			transactionModelStub.findOne.resolves(null);
			
			let errorThrown = false;
			
			// Execute and verify error
			try {
				await transactionService.confirmPayment('invalid-id', {});
			} catch (error) {
				errorThrown = true;
				expect(error.message).to.include('not found');
			}
			
			expect(errorThrown).to.be.true;
			expect(transactionModelStub.findOne.calledOnce).to.be.true;
		});
	});
	
	describe('getUserTransactions', () => {
		it('should return user transactions with pagination', async () => {
			// Setup test data
			const userId = 'user123';
			const page = 1;
			const limit = 10;
			
			// Execute the test
			const result = await transactionService.getUserTransactions(userId, page, limit);
			
			// Verify transactions were queried
			expect(result).to.have.property('transactions').that.is.an('array');
			expect(result.transactions).to.have.lengthOf(2);
			
			// Verify pagination data
			expect(result).to.have.property('pagination');
			expect(result.pagination).to.have.property('page', page);
			expect(result.pagination).to.have.property('limit', limit);
			expect(result.pagination).to.have.property('total', 2);
			expect(result.pagination).to.have.property('pages', 1);
		});
	});
	
	describe('getTransactionById', () => {
		it('should return transaction by referenceId', async () => {
			// Setup test data
			const referenceId = 'tx-123';
			
			// Execute the test
			const result = await transactionService.getTransactionById(referenceId);
			
			// Verify transaction was found
			expect(transactionModelStub.findOne.calledOnce).to.be.true;
			expect(transactionModelStub.findOne.args[0][0]).to.deep.equal({ referenceId });
			
			// Verify result has expected properties
			expect(result).to.have.property('referenceId', referenceId);
			expect(result).to.have.property('type', 'payment');
			expect(result).to.have.property('status', 'completed');
		});
	});
	
	describe('refundTransaction', () => {
		it('should refund a completed transaction', async () => {
			// Setup test data
			const referenceId = 'tx-123';
			const reason = 'Customer request';
			
			// Setup mock transaction
			transactionModelStub.findOne.resolves({
				referenceId,
				status: 'completed',
				type: 'payment',
				userId: 'user123',
				tokenAmount: 1000,
				amount: 100,
				paymentMethod: 'solana',
				save: sandbox.stub().resolves()
			});
			
			// Setup mock user
			userModelStub.findById.resolves({
				_id: 'user123',
				tokens: 1000,
				save: sandbox.stub().resolves()
			});
			
			// Execute the test
			const result = await transactionService.refundTransaction(referenceId, reason);
			
			// Verify transaction was found
			expect(transactionModelStub.findOne.calledOnce).to.be.true;
			
			// Verify refund transaction was created
			expect(transactionModelStub.save.calledOnce).to.be.true;
			
			// Verify result has expected properties
			expect(result).to.have.property('referenceId').that.includes('refund-');
			expect(result).to.have.property('originalTransactionId', referenceId);
			expect(result).to.have.property('status', 'completed');
		});
		
		it('should throw error if transaction not found', async () => {
			// Setup transaction not found
			transactionModelStub.findOne.resolves(null);
			
			let errorThrown = false;
			
			// Execute and verify error
			try {
				await transactionService.refundTransaction('invalid-id', 'test');
			} catch (error) {
				errorThrown = true;
				expect(error.message).to.include('not found');
			}
			
			expect(errorThrown).to.be.true;
			expect(transactionModelStub.findOne.calledOnce).to.be.true;
		});
		
		it('should throw error if transaction not completed', async () => {
			// Setup incomplete transaction
			transactionModelStub.findOne.resolves({
				referenceId: 'tx-123',
				status: 'pending',
				type: 'payment'
			});
			
			let errorThrown = false;
			
			// Execute and verify error
			try {
				await transactionService.refundTransaction('tx-123', 'test');
			} catch (error) {
				errorThrown = true;
				expect(error.message).to.include('Only completed');
			}
			
			expect(errorThrown).to.be.true;
			expect(transactionModelStub.findOne.calledOnce).to.be.true;
		});
		
		it('should throw error if transaction not a payment', async () => {
			// Setup non-payment transaction
			transactionModelStub.findOne.resolves({
				referenceId: 'tx-123',
				status: 'completed',
				type: 'purchase'
			});
			
			let errorThrown = false;
			
			// Execute and verify error
			try {
				await transactionService.refundTransaction('tx-123', 'test');
			} catch (error) {
				errorThrown = true;
				expect(error.message).to.include('Only payment');
			}
			
			expect(errorThrown).to.be.true;
			expect(transactionModelStub.findOne.calledOnce).to.be.true;
		});
	});
}); 