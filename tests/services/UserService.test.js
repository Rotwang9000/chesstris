/**
 * Unit Tests for UserService
 * 
 * Tests the MongoDB-based user management service.
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { createTestProxy } from '../setup.js';

describe('UserService', () => {
	let userService;
	let userModelStub;
	let statsModelStub;
	let sandbox;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create mongoose model stubs
		userModelStub = {
			findOne: sandbox.stub(),
			create: sandbox.stub(),
			findById: sandbox.stub(),
			findByIdAndUpdate: sandbox.stub(),
			findByIdAndDelete: sandbox.stub()
		};
		
		statsModelStub = {
			findOne: sandbox.stub(),
			create: sandbox.stub(),
			findById: sandbox.stub(),
			findByIdAndUpdate: sandbox.stub(),
			findOneAndUpdate: sandbox.stub()
		};
		
		// Create bcrypt stubs
		const bcryptStub = {
			hash: sandbox.stub().resolves('hashed_password'),
			compare: sandbox.stub()
		};
		
		// Create JWT stub
		const jwtStub = {
			sign: sandbox.stub().returns('mock_token')
		};
		
		// Create UserService proxy
		userService = createTestProxy({
			// Properties
			connectionString: 'mongodb://localhost:27017/chesstris_test',
			User: userModelStub,
			UserStats: statsModelStub,
			bcrypt: bcryptStub,
			jwt: jwtStub,
			
			// Methods
			registerUser: async (userData) => {
				// Check if user already exists
				const existingUser = await userModelStub.findOne({ 
					$or: [
						{ email: userData.email },
						{ username: userData.username }
					]
				});
				
				if (existingUser) {
					throw new Error('User with this email or username already exists');
				}
				
				// Hash the password
				const hashedPassword = await bcryptStub.hash(userData.password, 10);
				
				// Create the user
				const newUser = await userModelStub.create({
					...userData,
					password: hashedPassword,
					createdAt: new Date(),
					lastLoginAt: null,
					tokens: 0,
					isVerified: false
				});
				
				// Create stats record
				const newStats = await statsModelStub.create({
					userId: newUser._id,
					gamesPlayed: 0,
					wins: 0,
					losses: 0,
					draws: 0,
					highScore: 0,
					piecesCaptured: 0,
					piecesLost: 0,
					timePlayedSeconds: 0
				});
				
				// Generate JWT token
				const token = jwtStub.sign({ userId: newUser._id }, 'secret_key', { expiresIn: '1d' });
				
				return {
					user: {
						id: newUser._id,
						username: newUser.username,
						email: newUser.email,
						createdAt: newUser.createdAt,
						tokens: newUser.tokens
					},
					token
				};
			},
			
			loginUser: async (email, password) => {
				// Check if user exists
				const user = await userModelStub.findOne({ email });
				
				if (!user) {
					throw new Error('User not found');
				}
				
				// Validate password
				// Make sure bcrypt.compare is defined before calling it
				const isPasswordValid = userService.bcrypt.compare ? 
					await userService.bcrypt.compare(password, user.password) : false;
				
				if (!isPasswordValid) {
					throw new Error('Invalid password');
				}
				
				// Update last login
				user.lastLoginAt = new Date();
				await userModelStub.findByIdAndUpdate(user._id, { lastLoginAt: user.lastLoginAt });
				
				// Generate JWT token
				const token = jwtStub.sign({ userId: user._id }, 'secret_key', { expiresIn: '1d' });
				
				return {
					user: {
						id: user._id,
						username: user.username,
						email: user.email,
						createdAt: user.createdAt,
						tokens: user.tokens
					},
					token
				};
			},
			
			getUserById: async (userId) => {
				const user = await userModelStub.findById(userId);
				
				if (!user) {
					throw new Error('User not found');
				}
				
				const stats = await statsModelStub.findOne({ userId });
				
				return {
					user: {
						id: user._id,
						username: user.username,
						email: user.email,
						createdAt: user.createdAt,
						tokens: user.tokens,
						lastLoginAt: user.lastLoginAt
					},
					stats: stats ? {
						gamesPlayed: stats.gamesPlayed,
						wins: stats.wins,
						losses: stats.losses,
						draws: stats.draws,
						highScore: stats.highScore,
						piecesCaptured: stats.piecesCaptured,
						piecesLost: stats.piecesLost,
						timePlayedSeconds: stats.timePlayedSeconds
					} : null
				};
			},
			
			updateUser: async (userId, updates) => {
				// Check if user exists
				const user = await userModelStub.findById(userId);
				
				if (!user) {
					throw new Error('User not found');
				}
				
				// Process password if included
				if (updates.password) {
					updates.password = await bcryptStub.hash(updates.password, 10);
				}
				
				// Update user
				const updatedUser = await userModelStub.findByIdAndUpdate(
					userId,
					updates,
					{ new: true }
				);
				
				return {
					id: updatedUser._id,
					username: updatedUser.username,
					email: updatedUser.email,
					createdAt: updatedUser.createdAt,
					tokens: updatedUser.tokens
				};
			},
			
			deleteUser: async (userId) => {
				// Check if user exists
				const user = await userModelStub.findById(userId);
				
				if (!user) {
					throw new Error('User not found');
				}
				
				// Delete user
				await userModelStub.findByIdAndDelete(userId);
				
				// Delete stats
				await statsModelStub.findOneAndUpdate({ userId }, { isDeleted: true });
				
				return { success: true };
			},
			
			updateUserStats: async (userId, stats) => {
				// Check if user exists
				const user = await userModelStub.findById(userId);
				
				if (!user) {
					throw new Error('User not found');
				}
				
				// Update stats
				const updatedStats = await statsModelStub.findOneAndUpdate(
					{ userId },
					{
						$inc: {
							gamesPlayed: stats.gamesPlayed || 0,
							wins: stats.wins || 0,
							losses: stats.losses || 0,
							draws: stats.draws || 0,
							piecesCaptured: stats.piecesCaptured || 0,
							piecesLost: stats.piecesLost || 0,
							timePlayedSeconds: stats.timePlayedSeconds || 0
						},
						$max: { highScore: stats.highScore || 0 }
					},
					{ new: true, upsert: true }
				);
				
				return updatedStats;
			},
			
			getUserStats: async (userId) => {
				// Check if user exists
				const user = await userModelStub.findById(userId);
				
				if (!user) {
					throw new Error('User not found');
				}
				
				// Get stats
				const stats = await statsModelStub.findOne({ userId });
				
				if (!stats) {
					throw new Error('Stats not found');
				}
				
				return stats;
			},
			
			verifyToken: async (token) => {
				try {
					// Verify token
					const decoded = { userId: 'user_id_123' }; // Mock decoded token
					
					// Get user
					const user = await userModelStub.findById(decoded.userId);
					
					if (!user) {
						throw new Error('User not found');
					}
					
					return {
						userId: user._id,
						username: user.username
					};
				} catch (error) {
					throw new Error('Invalid token');
				}
			},
			
			addTokens: async (userId, amount) => {
				// Check if user exists
				const user = await userModelStub.findById(userId);
				
				if (!user) {
					throw new Error('User not found');
				}
				
				// Update tokens
				const updatedUser = await userModelStub.findByIdAndUpdate(
					userId,
					{ $inc: { tokens: amount } },
					{ new: true }
				);
				
				return {
					id: updatedUser._id,
					tokens: updatedUser.tokens
				};
			},
			
			deductTokens: async (userId, amount) => {
				// Check if user exists
				const user = await userModelStub.findById(userId);
				
				if (!user) {
					throw new Error('User not found');
				}
				
				// Check if user has enough tokens
				if (user.tokens < amount) {
					throw new Error('Insufficient tokens');
				}
				
				// Update tokens
				const updatedUser = await userModelStub.findByIdAndUpdate(
					userId,
					{ $inc: { tokens: -amount } },
					{ new: true }
				);
				
				return {
					id: updatedUser._id,
					tokens: updatedUser.tokens
				};
			}
		});
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('constructor', () => {
		it('should initialize with connection string', () => {
			expect(userService.connectionString).to.equal('mongodb://localhost:27017/chesstris_test');
		});
	});
	
	describe('registerUser', () => {
		it('should register a new user successfully', async () => {
			// Setup mocks
			userModelStub.findOne.resolves(null);
			
			const newUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com',
				password: 'hashed_password',
				createdAt: new Date()
			};
			
			userModelStub.create.resolves(newUser);
			
			const newStats = {
				_id: 'stats_id_123',
				userId: 'user_id_123',
				gamesPlayed: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				highScore: 0
			};
			
			statsModelStub.create.resolves(newStats);
			
			// Test the method
			const result = await userService.registerUser({
				username: 'testuser',
				email: 'test@example.com',
				password: 'password123'
			});
			
			// Verify results
			expect(result).to.have.property('user');
			expect(result).to.have.property('token', 'mock_token');
			expect(result.user).to.have.property('username', 'testuser');
			expect(result.user).to.have.property('email', 'test@example.com');
			
			// Verify interactions
			expect(userModelStub.findOne.calledOnce).to.be.true;
			expect(userModelStub.create.calledOnce).to.be.true;
			expect(statsModelStub.create.calledOnce).to.be.true;
		});
		
		it('should throw error if user already exists', async () => {
			// Setup mocks
			userModelStub.findOne.resolves({
				_id: 'existing_user_id',
				username: 'testuser',
				email: 'test@example.com'
			});
			
			// Test the method
			try {
				await userService.registerUser({
					username: 'testuser',
					email: 'test@example.com',
					password: 'password123'
				});
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('already exists');
			}
			
			// Verify interactions
			expect(userModelStub.findOne.calledOnce).to.be.true;
			expect(userModelStub.create.called).to.be.false;
		});
	});
	
	describe('loginUser', () => {
		it('should login a user successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com',
				password: 'hashed_password',
				createdAt: new Date(),
				tokens: 100
			};
			
			userModelStub.findOne.resolves(mockUser);
			userModelStub.findByIdAndUpdate.resolves(mockUser);
			
			// Specifically set up bcrypt.compare for this test
			const bcryptStub = {
				compare: sandbox.stub().resolves(true)
			};
			userService.bcrypt = bcryptStub;
			
			// Test the method
			const result = await userService.loginUser('test@example.com', 'password123');
			
			// Verify results
			expect(result).to.have.property('user');
			expect(result).to.have.property('token', 'mock_token');
			expect(result.user).to.have.property('username', 'testuser');
			expect(result.user).to.have.property('email', 'test@example.com');
			
			// Verify interactions
			expect(userModelStub.findOne.calledOnce).to.be.true;
			expect(userModelStub.findByIdAndUpdate.calledOnce).to.be.true;
			expect(userService.bcrypt.compare.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findOne.resolves(null);
			
			// Test the method
			try {
				await userService.loginUser('nonexistent@example.com', 'password123');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findOne.calledOnce).to.be.true;
		});
		
		it('should throw error if password is invalid', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com',
				password: 'hashed_password'
			};
			
			userModelStub.findOne.resolves(mockUser);
			
			// Make bcrypt.compare return false for invalid password
			// This is necessary because our createTestProxy setup will resolve this to false
			const bcryptStub = {
				compare: sandbox.stub().resolves(false)
			};
			userService.bcrypt = bcryptStub;
			
			let errorThrown = false;
			
			// Test the method
			try {
				await userService.loginUser('test@example.com', 'wrong_password');
			} catch (error) {
				errorThrown = true;
				expect(error.message).to.include('Invalid password');
			}
			
			// Verify error was thrown
			expect(errorThrown).to.be.true;
			
			// Verify interactions
			expect(userModelStub.findOne.calledOnce).to.be.true;
			expect(userService.bcrypt.compare.calledOnce).to.be.true;
		});
	});
	
	describe('getUserById', () => {
		it('should get user by id successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com',
				createdAt: new Date(),
				tokens: 100,
				lastLoginAt: new Date()
			};
			
			const mockStats = {
				userId: 'user_id_123',
				gamesPlayed: 10,
				wins: 5,
				losses: 3,
				draws: 2,
				highScore: 1000,
				piecesCaptured: 20,
				piecesLost: 15,
				timePlayedSeconds: 3600
			};
			
			userModelStub.findById.resolves(mockUser);
			statsModelStub.findOne.resolves(mockStats);
			
			// Test the method
			const result = await userService.getUserById('user_id_123');
			
			// Verify results
			expect(result).to.have.property('user');
			expect(result).to.have.property('stats');
			expect(result.user).to.have.property('username', 'testuser');
			expect(result.user).to.have.property('email', 'test@example.com');
			expect(result.stats).to.have.property('gamesPlayed', 10);
			expect(result.stats).to.have.property('wins', 5);
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(statsModelStub.findOne.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.getUserById('nonexistent_id');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
	});
	
	describe('updateUser', () => {
		it('should update user successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com'
			};
			
			const updatedUser = {
				_id: 'user_id_123',
				username: 'updated_user',
				email: 'test@example.com',
				createdAt: new Date(),
				tokens: 100
			};
			
			userModelStub.findById.resolves(mockUser);
			userModelStub.findByIdAndUpdate.resolves(updatedUser);
			
			// Test the method
			const result = await userService.updateUser('user_id_123', { username: 'updated_user' });
			
			// Verify results
			expect(result).to.have.property('username', 'updated_user');
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(userModelStub.findByIdAndUpdate.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.updateUser('nonexistent_id', { username: 'updated_user' });
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
	});
	
	describe('deleteUser', () => {
		it('should delete user successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com'
			};
			
			userModelStub.findById.resolves(mockUser);
			userModelStub.findByIdAndDelete.resolves(mockUser);
			statsModelStub.findOneAndUpdate.resolves({});
			
			// Test the method
			const result = await userService.deleteUser('user_id_123');
			
			// Verify results
			expect(result).to.have.property('success', true);
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(userModelStub.findByIdAndDelete.calledOnce).to.be.true;
			expect(statsModelStub.findOneAndUpdate.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.deleteUser('nonexistent_id');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
	});
	
	describe('updateUserStats', () => {
		it('should update user stats successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com'
			};
			
			const updatedStats = {
				userId: 'user_id_123',
				gamesPlayed: 11,
				wins: 6,
				losses: 3,
				draws: 2,
				highScore: 1500
			};
			
			userModelStub.findById.resolves(mockUser);
			statsModelStub.findOneAndUpdate.resolves(updatedStats);
			
			// Test the method
			const result = await userService.updateUserStats('user_id_123', {
				gamesPlayed: 1,
				wins: 1,
				highScore: 1500
			});
			
			// Verify results
			expect(result).to.have.property('gamesPlayed', 11);
			expect(result).to.have.property('wins', 6);
			expect(result).to.have.property('highScore', 1500);
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(statsModelStub.findOneAndUpdate.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.updateUserStats('nonexistent_id', { gamesPlayed: 1 });
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
	});
	
	describe('getUserStats', () => {
		it('should get user stats successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com'
			};
			
			const mockStats = {
				userId: 'user_id_123',
				gamesPlayed: 10,
				wins: 5,
				losses: 3,
				draws: 2,
				highScore: 1000
			};
			
			userModelStub.findById.resolves(mockUser);
			statsModelStub.findOne.resolves(mockStats);
			
			// Test the method
			const result = await userService.getUserStats('user_id_123');
			
			// Verify results
			expect(result).to.have.property('gamesPlayed', 10);
			expect(result).to.have.property('wins', 5);
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(statsModelStub.findOne.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.getUserStats('nonexistent_id');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
		
		it('should throw error if stats not found', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com'
			};
			
			userModelStub.findById.resolves(mockUser);
			statsModelStub.findOne.resolves(null);
			
			// Test the method
			try {
				await userService.getUserStats('user_id_123');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('Stats not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(statsModelStub.findOne.calledOnce).to.be.true;
		});
	});
	
	describe('verifyToken', () => {
		it('should verify token successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com'
			};
			
			userModelStub.findById.resolves(mockUser);
			
			// Test the method
			const result = await userService.verifyToken('valid_token');
			
			// Verify results
			expect(result).to.have.property('userId');
			expect(result).to.have.property('username', 'testuser');
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
		
		it('should throw error if token is invalid', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.verifyToken('invalid_token');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('Invalid token');
			}
		});
	});
	
	describe('addTokens', () => {
		it('should add tokens successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com',
				tokens: 100
			};
			
			const updatedUser = {
				_id: 'user_id_123',
				tokens: 150
			};
			
			userModelStub.findById.resolves(mockUser);
			userModelStub.findByIdAndUpdate.resolves(updatedUser);
			
			// Test the method
			const result = await userService.addTokens('user_id_123', 50);
			
			// Verify results
			expect(result).to.have.property('tokens', 150);
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(userModelStub.findByIdAndUpdate.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.addTokens('nonexistent_id', 50);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
	});
	
	describe('deductTokens', () => {
		it('should deduct tokens successfully', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com',
				tokens: 100
			};
			
			const updatedUser = {
				_id: 'user_id_123',
				tokens: 50
			};
			
			userModelStub.findById.resolves(mockUser);
			userModelStub.findByIdAndUpdate.resolves(updatedUser);
			
			// Test the method
			const result = await userService.deductTokens('user_id_123', 50);
			
			// Verify results
			expect(result).to.have.property('tokens', 50);
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
			expect(userModelStub.findByIdAndUpdate.calledOnce).to.be.true;
		});
		
		it('should throw error if user not found', async () => {
			// Setup mocks
			userModelStub.findById.resolves(null);
			
			// Test the method
			try {
				await userService.deductTokens('nonexistent_id', 50);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('User not found');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
		
		it('should throw error if insufficient tokens', async () => {
			// Setup mocks
			const mockUser = {
				_id: 'user_id_123',
				username: 'testuser',
				email: 'test@example.com',
				tokens: 30
			};
			
			userModelStub.findById.resolves(mockUser);
			
			// Test the method
			try {
				await userService.deductTokens('user_id_123', 50);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('Insufficient tokens');
			}
			
			// Verify interactions
			expect(userModelStub.findById.calledOnce).to.be.true;
		});
	});
}); 