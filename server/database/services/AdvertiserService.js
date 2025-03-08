/**
 * Advertiser Service
 * 
 * Manages advertiser data and bidding system:
 * - Advertiser registration
 * - Bid management
 * - Ad rotation based on bid ranking
 * - Impression and click tracking
 */

import Advertiser from '../models/Advertiser.js';
import { v4 as uuidv4 } from 'uuid';
import sanitizeHtml from 'sanitize-html';

export class AdvertiserService {
	constructor(redisClient) {
		this.redis = redisClient;
		this.keyPrefix = 'chesstris:advertisers:';
		this.bidRankingKey = `${this.keyPrefix}bid_ranking`;
		this.bidRotationKey = `${this.keyPrefix}bid_rotation`;
	}
	
	/**
	 * Register a new advertiser
	 * @param {Object} advertiserData - Advertiser data
	 * @returns {Promise<Object>} Created advertiser
	 */
	async registerAdvertiser(advertiserData) {
		// Sanitize ad text and link to prevent injections
		advertiserData.adText = sanitizeHtml(advertiserData.adText, {
			allowedTags: [],
			allowedAttributes: {}
		});
		
		advertiserData.adLink = sanitizeHtml(advertiserData.adLink, {
			allowedTags: [],
			allowedAttributes: {}
		});
		
		// Create advertiser
		const advertiser = new Advertiser(advertiserData);
		await advertiser.save();
		
		// Update bid rankings in Redis
		await this.updateBidRankings();
		
		return advertiser;
	}
	
	/**
	 * Update an existing advertiser
	 * @param {string} advertiserId - Advertiser ID
	 * @param {Object} updateData - Data to update
	 * @returns {Promise<Object>} Updated advertiser
	 */
	async updateAdvertiser(advertiserId, updateData) {
		// Sanitize ad text and link if provided
		if (updateData.adText) {
			updateData.adText = sanitizeHtml(updateData.adText, {
				allowedTags: [],
				allowedAttributes: {}
			});
		}
		
		if (updateData.adLink) {
			updateData.adLink = sanitizeHtml(updateData.adLink, {
				allowedTags: [],
				allowedAttributes: {}
			});
		}
		
		// Update advertiser
		const advertiser = await Advertiser.findByIdAndUpdate(
			advertiserId,
			updateData,
			{ new: true }
		);
		
		if (!advertiser) {
			throw new Error('Advertiser not found');
		}
		
		// Update bid rankings in Redis
		await this.updateBidRankings();
		
		return advertiser;
	}
	
	/**
	 * Get all active advertisers
	 * @returns {Promise<Array>} List of active advertisers
	 */
	async getActiveAdvertisers() {
		return Advertiser.find({ bidStatus: 'active' });
	}
	
	/**
	 * Get advertiser by ID
	 * @param {string} advertiserId - Advertiser ID
	 * @returns {Promise<Object>} Advertiser
	 */
	async getAdvertiser(advertiserId) {
		const advertiser = await Advertiser.findById(advertiserId);
		
		if (!advertiser) {
			throw new Error('Advertiser not found');
		}
		
		return advertiser;
	}
	
	/**
	 * Update bid rankings in Redis
	 * @returns {Promise<void>}
	 */
	async updateBidRankings() {
		// Get all active advertisers
		const advertisers = await this.getActiveAdvertisers();
		
		// Sort by cost per cell (bid amount / cell count) in descending order
		advertisers.sort((a, b) => {
			const aCostPerCell = a.bidAmount / a.cellCount;
			const bCostPerCell = b.bidAmount / b.cellCount;
			return bCostPerCell - aCostPerCell;
		});
		
		// Store ranking in Redis
		const ranking = advertisers.map(advertiser => ({
			id: advertiser._id.toString(),
			name: advertiser.name,
			costPerCell: advertiser.bidAmount / advertiser.cellCount,
			remainingCells: advertiser.cellCount - advertiser.cellsSponsored
		}));
		
		await this.redis.set(this.bidRankingKey, JSON.stringify(ranking));
		
		// Reset rotation index if needed
		const rotationIndex = await this.redis.get(this.bidRotationKey);
		if (!rotationIndex || parseInt(rotationIndex) >= ranking.length) {
			await this.redis.set(this.bidRotationKey, '0');
		}
	}
	
	/**
	 * Get the next advertiser in rotation
	 * @returns {Promise<Object|null>} Next advertiser or null if none available
	 */
	async getNextAdvertiser() {
		// Get current rankings
		const rankingJson = await this.redis.get(this.bidRankingKey);
		if (!rankingJson) {
			await this.updateBidRankings();
			return null;
		}
		
		const ranking = JSON.parse(rankingJson);
		if (ranking.length === 0) {
			return null;
		}
		
		// Get current rotation index
		let rotationIndex = parseInt(await this.redis.get(this.bidRotationKey) || '0');
		
		// Find next advertiser with remaining cells
		let advertiserFound = false;
		let startIndex = rotationIndex;
		
		do {
			// Check if current advertiser has remaining cells
			if (ranking[rotationIndex].remainingCells > 0) {
				advertiserFound = true;
				break;
			}
			
			// Move to next advertiser
			rotationIndex = (rotationIndex + 1) % ranking.length;
		} while (rotationIndex !== startIndex);
		
		if (!advertiserFound) {
			return null;
		}
		
		// Update rotation index for next time
		await this.redis.set(this.bidRotationKey, ((rotationIndex + 1) % ranking.length).toString());
		
		// Get full advertiser data
		const advertiserId = ranking[rotationIndex].id;
		const advertiser = await this.getAdvertiser(advertiserId);
		
		return advertiser;
	}
	
	/**
	 * Record an impression for an advertiser
	 * @param {string} advertiserId - Advertiser ID
	 * @returns {Promise<void>}
	 */
	async recordImpression(advertiserId) {
		await Advertiser.findByIdAndUpdate(
			advertiserId,
			{
				$inc: { 
					impressions: 1,
					cellsSponsored: 1
				}
			}
		);
		
		// Update rankings if needed
		const advertiser = await this.getAdvertiser(advertiserId);
		if (advertiser.cellsSponsored >= advertiser.cellCount) {
			// All cells have been sponsored, update status
			await this.updateAdvertiser(advertiserId, { bidStatus: 'expired' });
		}
		
		await this.updateBidRankings();
	}
	
	/**
	 * Record a click for an advertiser
	 * @param {string} advertiserId - Advertiser ID
	 * @returns {Promise<void>}
	 */
	async recordClick(advertiserId) {
		await Advertiser.findByIdAndUpdate(
			advertiserId,
			{ $inc: { clicks: 1 } }
		);
	}
	
	/**
	 * Get advertiser statistics
	 * @param {string} advertiserId - Advertiser ID
	 * @returns {Promise<Object>} Statistics
	 */
	async getAdvertiserStats(advertiserId) {
		const advertiser = await this.getAdvertiser(advertiserId);
		
		return {
			impressions: advertiser.impressions,
			clicks: advertiser.clicks,
			cellsSponsored: advertiser.cellsSponsored,
			clickThroughRate: advertiser.impressions > 0 
				? (advertiser.clicks / advertiser.impressions) * 100 
				: 0,
			remainingCells: advertiser.cellCount - advertiser.cellsSponsored
		};
	}
} 