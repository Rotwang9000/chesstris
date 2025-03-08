const {
	addSponsorToTetromino,
	handleSponsorClick,
	getSponsorStats
} = require('../sponsors');

describe('Sponsor Functions', () => {
	describe('addSponsorToTetromino', () => {
		const mockSponsors = [
			{ id: 'sponsor1', name: 'TechCorp', image: 'tech.png', adUrl: 'https://example.com/1' },
			{ id: 'sponsor2', name: 'GameCo', image: 'game.png', adUrl: 'https://example.com/2' }
		];

		test('should add sponsor to tetromino with 20% chance', () => {
			// Mock Math.random to always return 0.1 (less than 0.2)
			const originalRandom = Math.random;
			Math.random = jest.fn(() => 0.1);

			const piece = { type: 'I', blocks: [], color: 0x000000 };
			const result = addSponsorToTetromino(piece, mockSponsors);
			expect(result.sponsor).toBeDefined();
			expect(mockSponsors).toContainEqual(result.sponsor);

			Math.random = originalRandom;
		});

		test('should not add sponsor with 80% chance', () => {
			// Mock Math.random to always return 0.9 (greater than 0.2)
			const originalRandom = Math.random;
			Math.random = jest.fn(() => 0.9);

			const piece = { type: 'I', blocks: [], color: 0x000000 };
			const result = addSponsorToTetromino(piece, mockSponsors);
			expect(result.sponsor).toBeUndefined();

			Math.random = originalRandom;
		});
	});

	describe('handleSponsorClick', () => {
		let mockSponsors;
		let mockStats;

		beforeEach(() => {
			mockSponsors = {
				'sponsor1': {
					id: 'sponsor1',
					clicks: 0,
					impressions: 0,
					lastClick: null
				}
			};
			mockStats = {
				totalClicks: 0,
				totalImpressions: 0
			};
		});

		test('should update sponsor click statistics', () => {
			const result = handleSponsorClick('sponsor1', 'player1', mockSponsors, mockStats);
			expect(result.success).toBe(true);
			expect(mockSponsors.sponsor1.clicks).toBe(1);
			expect(mockSponsors.sponsor1.lastClick).toBeDefined();
			expect(mockStats.totalClicks).toBe(1);
		});

		test('should handle invalid sponsor id', () => {
			const result = handleSponsorClick('invalid', 'player1', mockSponsors, mockStats);
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		test('should prevent rapid repeated clicks', () => {
			handleSponsorClick('sponsor1', 'player1', mockSponsors, mockStats);
			const result = handleSponsorClick('sponsor1', 'player1', mockSponsors, mockStats);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/too soon/i);
		});
	});

	describe('getSponsorStats', () => {
		const mockSponsors = {
			'sponsor1': {
				id: 'sponsor1',
				clicks: 10,
				impressions: 100
			},
			'sponsor2': {
				id: 'sponsor2',
				clicks: 5,
				impressions: 50
			}
		};

		test('should calculate correct statistics', () => {
			const stats = getSponsorStats(mockSponsors);
			expect(stats.totalClicks).toBe(15);
			expect(stats.totalImpressions).toBe(150);
			expect(stats.clickThroughRate).toBe(0.1); // (15/150)
		});

		test('should handle empty sponsor list', () => {
			const stats = getSponsorStats({});
			expect(stats.totalClicks).toBe(0);
			expect(stats.totalImpressions).toBe(0);
			expect(stats.clickThroughRate).toBe(0);
		});

		test('should rank sponsors by engagement', () => {
			const stats = getSponsorStats(mockSponsors);
			expect(stats.topSponsors[0].id).toBe('sponsor1');
			expect(stats.topSponsors[1].id).toBe('sponsor2');
		});
	});
}); 