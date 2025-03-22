/**
 * Tests for sponsors module
 * 
 * Tests the sponsor-related functionality.
 */

import { expect } from 'chai';
import sinon from 'sinon';

// Import the module to test
import { 
	addSponsorToTetromino, 
	handleSponsorClick, 
	getSponsorStats, 
	displaySponsorInfo 
} from '../../public/utils/sponsors.js';

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
		sinon.restore();
		
		// Create stub for fetch
		fetchStub = sinon.stub(global, 'fetch').callsFake(mockFetchSuccess);
		
		// Mock DOM elements
		global.document = {
			getElementById: sinon.stub().returns({
				style: {},
				onclick: null
			})
		};
		
		// Mock window.open
		global.window = {
			open: sinon.stub()
		};
	});
	
	afterEach(() => {
		sinon.restore();
	});
	
	describe('addSponsorToTetromino', () => {
		it('should add sponsor to tetromino when fetch succeeds', async () => {
			// Arrange
			const tetromino = { type: 'I' };
			
			// Act
			const result = await addSponsorToTetromino(tetromino);
			
			// Assert
			expect(result.sponsor).to.exist;
			expect(result.sponsor.id).to.equal('sponsor1');
			expect(result.sponsor.name).to.equal('Test Sponsor');
			expect(result.sponsor.image).to.equal('test.png');
			expect(result.sponsor.adUrl).to.equal('https://example.com');
			expect(result.sponsor.adText).to.equal('Test ad text');
		});
		
		it('should return original tetromino when fetch fails', async () => {
			// Arrange
			fetchStub.callsFake(mockFetchFailure);
			const tetromino = { type: 'I' };
			
			// Act
			const result = await addSponsorToTetromino(tetromino);
			
			// Assert
			expect(result).to.deep.equal(tetromino);
			expect(result.sponsor).to.be.undefined;
		});
	});
	
	describe('handleSponsorClick', () => {
		it('should make POST request to record click', async () => {
			// Arrange
			const sponsorId = 'sponsor1';
			
			// Act
			await handleSponsorClick(sponsorId);
			
			// Assert
			expect(fetchStub.calledOnce).to.be.true;
			expect(fetchStub.firstCall.args[0]).to.equal(`/api/advertisers/${sponsorId}/click`);
			expect(fetchStub.firstCall.args[1].method).to.equal('POST');
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
			expect(result).to.deep.equal(mockStats);
		});
		
		it('should throw error when fetch fails', async () => {
			// Arrange
			const sponsorId = 'sponsor1';
			fetchStub.callsFake(mockFetchFailure);
			
			// Act & Assert
			try {
				await getSponsorStats(sponsorId);
				expect.fail('Should have thrown an error');
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
			expect(mockElements.nameElement.textContent).to.equal(sponsor.name);
			expect(mockElements.imageElement.src).to.equal(sponsor.image);
			expect(mockElements.messageElement.textContent).to.equal(sponsor.adText);
			expect(mockElements.adContainer.style.display).to.equal('block');
			expect(mockElements.linkElement.onclick).to.be.a('function');
		});
	});
}); 