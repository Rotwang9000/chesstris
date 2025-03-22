/**
 * Tests for sponsors module
 * 
 * Tests the sponsor-related functionality.
 */

const { expect } = require('@jest/globals');
// Sinon replaced with Jest

// Import the module to test
const { 
	addSponsorToTetromino, 
	handleSponsorClick, 
	getSponsorStats, 
	displaySponsorInfo 
} = require('../../public/utils/sponsors.js');

describe('Sponsors Module', () => {
	// Mock fetch implementation
	const mockFetchSuccess = async () => ({
		ok: true,
		json: async () => ({ _id: 'sponsor1', name: 'Test Sponsor', adImage: 'test.png', adLink: 'https://example.com', adText: 'Test ad text' })
	});
	
	const mockFetchFailure = async () => ({
		ok: false,
		statusText: 'Not found'
	});
	
	let fetchStub;
	let documentStub;
	
	beforeEach(() => {
		// Restore any previously created stubs
		jest.clearAllMocks();
		
		// Create stub for fetch
		fetchStub = jest.spyOn(global, 'fetch').callsFake(mockFetchSuccess);
		
		// Mock DOM elements
		global.document = {
			getElementById: jest.fn().mockReturnValue({
				style: {},
				onclick: null
			})
		};
		
		// Mock window.open
		global.window = {
			open: jest.fn()
		};
	});
	
	afterEach(() => {
		jest.clearAllMocks();
	});
	
	describe('addSponsorToTetromino', () => {
		it('should add sponsor to tetromino when fetch succeeds', async () => {
			// Arrange
			const tetromino = { type: 'I' };
			
			// Act
			const result = await addSponsorToTetromino(tetromino);
			
			// Assert
			expect(result.sponsor).toBeDefined();
			expect(result.sponsor.id).toBe('sponsor1');
			expect(result.sponsor.name).toBe('Test Sponsor');
			expect(result.sponsor.image).toBe('test.png');
			expect(result.sponsor.adUrl).toBe('https://example.com');
			expect(result.sponsor.adText).toBe('Test ad text');
		});
		
		it('should return original tetromino when fetch fails', async () => {
			// Arrange
			fetchStub.callsFake(mockFetchFailure);
			const tetromino = { type: 'I' };
			
			// Act
			const result = await addSponsorToTetromino(tetromino);
			
			// Assert
			expect(result).toEqual(tetromino);
			expect(result.sponsor).toBeUndefined();
		});
	});
	
	describe('handleSponsorClick', () => {
		it('should make POST request to record click', async () => {
			// Arrange
			const sponsorId = 'sponsor1';
			
			// Act
			await handleSponsorClick(sponsorId);
			
			// Assert
			expect(fetchStub).toHaveBeenCalledTimes(1);
			expect(fetchStub.mock.calls[0][0]).toBe(`/api/advertisers/${sponsorId}/click`);
			expect(fetchStub.mock.calls[0][1].method).toBe('POST');
		});
	});
	
	describe('getSponsorStats', () => {
		it('should fetch and return sponsor stats', async () => {
			// Arrange
			const sponsorId = 'sponsor1';
			const mockStats = {
				impressions: 100,
				clicks: 10,
				clickThroughRate: 10
			};
			
			fetchStub.callsFake(async () => ({
				ok: true,
				json: async () => mockStats
			}));
			
			// Act
			const result = await getSponsorStats(sponsorId);
			
			// Assert
			expect(result).toEqual(mockStats);
		});
		
		it('should throw error when fetch fails', async () => {
			// Arrange
			const sponsorId = 'sponsor1';
			fetchStub.callsFake(mockFetchFailure);
			
			// Act & Assert
			try {
				await getSponsorStats(sponsorId);
				expect(false).toBe(true, "Should have thrown an error");
			} catch (error) {
				expect(error).to.be.an.instanceOf(Error);
			}
		});
	});
	
	describe('displaySponsorInfo', () => {
		it('should update DOM elements with sponsor info', () => {
			// Arrange
			const sponsor = {
				id: 'sponsor1',
				name: 'Test Sponsor',
				image: 'test.png',
				adUrl: 'https://example.com',
				adText: 'Test ad text'
			};
			
			const mockElements = {
				adContainer: { style: {} },
				nameElement: { textContent: '' },
				imageElement: { src: '' },
				messageElement: { textContent: '' },
				linkElement: { onclick: null }
			};
			
			global.document.getElementById = (id) => {
				switch (id) {
					case 'sponsor-ad': return mockElements.adContainer;
					case 'sponsor-name': return mockElements.nameElement;
					case 'sponsor-image': return mockElements.imageElement;
					case 'sponsor-message': return mockElements.messageElement;
					case 'sponsor-link': return mockElements.linkElement;
					default: return null;
				}
			};
			
			// Act
			displaySponsorInfo(sponsor);
			
			// Assert
			expect(mockElements.nameElement.textContent).toBe(sponsor.name);
			expect(mockElements.imageElement.src).toBe(sponsor.image);
			expect(mockElements.messageElement.textContent).toBe(sponsor.adText);
			expect(mockElements.adContainer.style.display).toBe('block');
			expect(mockElements.linkElement.onclick).toBeInstanceOf(Function);
		});
	});
});