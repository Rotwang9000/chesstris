/**
 * Mock implementation of semver module for testing
 */

const semverMock = {
	valid: (version) => {
		// Basic validation for semver format
		if (typeof version !== 'string') return null;
		const pattern = /^\d+\.\d+\.\d+$/;
		return pattern.test(version) ? version : null;
	},

	gt: (v1, v2) => {
		if (!semverMock.valid(v1) || !semverMock.valid(v2)) return false;
		
		const v1Parts = v1.split('.').map(Number);
		const v2Parts = v2.split('.').map(Number);
		
		for (let i = 0; i < 3; i++) {
			if (v1Parts[i] > v2Parts[i]) return true;
			if (v1Parts[i] < v2Parts[i]) return false;
		}
		
		return false;
	},

	lt: (v1, v2) => {
		if (!semverMock.valid(v1) || !semverMock.valid(v2)) return false;
		return !semverMock.gt(v1, v2) && v1 !== v2;
	},

	gte: (v1, v2) => {
		if (!semverMock.valid(v1) || !semverMock.valid(v2)) return false;
		return semverMock.gt(v1, v2) || v1 === v2;
	},

	lte: (v1, v2) => {
		if (!semverMock.valid(v1) || !semverMock.valid(v2)) return false;
		return semverMock.lt(v1, v2) || v1 === v2;
	},

	eq: (v1, v2) => {
		if (!semverMock.valid(v1) || !semverMock.valid(v2)) return false;
		return v1 === v2;
	},

	satisfies: (version, range) => {
		// Simplified implementation for common patterns
		if (!semverMock.valid(version)) return false;
		
		// Handle exact version
		if (semverMock.valid(range)) return version === range;
		
		// Handle caret ranges (^x.y.z)
		if (range.startsWith('^')) {
			const rangeVersion = range.substring(1);
			if (!semverMock.valid(rangeVersion)) return false;
			
			const vParts = version.split('.').map(Number);
			const rParts = rangeVersion.split('.').map(Number);
			
			// Major version must match
			if (vParts[0] !== rParts[0]) return false;
			
			// Version must be greater than or equal to the range version
			return semverMock.gte(version, rangeVersion);
		}
		
		// Handle tilde ranges (~x.y.z)
		if (range.startsWith('~')) {
			const rangeVersion = range.substring(1);
			if (!semverMock.valid(rangeVersion)) return false;
			
			const vParts = version.split('.').map(Number);
			const rParts = rangeVersion.split('.').map(Number);
			
			// Major and minor versions must match
			if (vParts[0] !== rParts[0] || vParts[1] !== rParts[1]) return false;
			
			// Version must be greater than or equal to the range version
			return semverMock.gte(version, rangeVersion);
		}
		
		// Handle version ranges (>x.y.z)
		if (range.startsWith('>')) {
			const rangeVersion = range.substring(1);
			return semverMock.gt(version, rangeVersion);
		}
		
		// Handle version ranges (>=x.y.z)
		if (range.startsWith('>=')) {
			const rangeVersion = range.substring(2);
			return semverMock.gte(version, rangeVersion);
		}
		
		// Handle version ranges (<x.y.z)
		if (range.startsWith('<')) {
			const rangeVersion = range.substring(1);
			return semverMock.lt(version, rangeVersion);
		}
		
		// Handle version ranges (<=x.y.z)
		if (range.startsWith('<=')) {
			const rangeVersion = range.substring(2);
			return semverMock.lte(version, rangeVersion);
		}
		
		return false;
	}
};

module.exports = semverMock; 