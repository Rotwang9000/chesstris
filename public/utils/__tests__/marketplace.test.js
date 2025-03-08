const {
	marketplaceConfig,
	getMarketplaceProducts,
	purchaseProduct,
	applyDesign,
	submitDesign,
	checkMarketplaceReadiness
} = require('../marketplace');

describe('Marketplace Module', () => {
	describe('marketplaceConfig', () => {
		test('should have marketplace disabled by default', () => {
			expect(marketplaceConfig.enabled).toBe(false);
		});
		
		test('should have valid currency and price ranges', () => {
			expect(marketplaceConfig.currency).toBe('Tetris Tokens');
			expect(marketplaceConfig.minPrice).toBeLessThan(marketplaceConfig.maxPrice);
		});
		
		test('should contain Russian theme category', () => {
			expect(marketplaceConfig.categories).toContain('Russian');
		});
	});
	
	describe('getMarketplaceProducts', () => {
		test('should return empty array when marketplace is disabled', async () => {
			const products = await getMarketplaceProducts();
			expect(products).toEqual([]);
		});
	});
	
	describe('purchaseProduct', () => {
		test('should return error when marketplace is disabled', async () => {
			const result = await purchaseProduct('user123', 'product456');
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
	
	describe('applyDesign', () => {
		test('should return error when marketplace is disabled', async () => {
			const result = await applyDesign('user123', 'product456');
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
	
	describe('submitDesign', () => {
		test('should return error when marketplace is disabled', async () => {
			const result = await submitDesign('user123', {});
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
	
	describe('checkMarketplaceReadiness', () => {
		test('should return readiness assessment', () => {
			const assessment = checkMarketplaceReadiness();
			expect(assessment.readyPercentage).toBeDefined();
			expect(assessment.assessment).toHaveProperty('themeSystem');
			expect(assessment.assessment).toHaveProperty('userAccounts');
			expect(assessment.assessment).toHaveProperty('pieceRendering');
			expect(assessment.missingComponents).toBeInstanceOf(Array);
		});
		
		test('should indicate which components are missing', () => {
			const assessment = checkMarketplaceReadiness();
			// These components should be missing in the current implementation
			expect(assessment.missingComponents).toContain('paymentSystem');
			expect(assessment.missingComponents).toContain('designUploader');
			expect(assessment.missingComponents).toContain('moderationTools');
		});
	});
}); 