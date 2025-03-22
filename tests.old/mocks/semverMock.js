/**
 * Mock for semver module
 */

module.exports = {
	// Simple version comparison functions
	valid: function(version) {
		return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version);
	},
	
	gt: function(a, b) {
		if (!a || !b) return false;
		
		const aParts = a.split('.').map(Number);
		const bParts = b.split('.').map(Number);
		
		for (let i = 0; i < 3; i++) {
			if (aParts[i] > bParts[i]) return true;
			if (aParts[i] < bParts[i]) return false;
		}
		
		return false;
	},
	
	gte: function(a, b) {
		if (!a || !b) return false;
		
		const aParts = a.split('.').map(Number);
		const bParts = b.split('.').map(Number);
		
		for (let i = 0; i < 3; i++) {
			if (aParts[i] > bParts[i]) return true;
			if (aParts[i] < bParts[i]) return false;
		}
		
		return true;
	},
	
	lt: function(a, b) {
		return !this.gte(a, b);
	},
	
	lte: function(a, b) {
		return !this.gt(a, b);
	},
	
	eq: function(a, b) {
		if (!a || !b) return false;
		return a === b;
	},
	
	// Version parsing
	parse: function(version) {
		if (!version) return null;
		const parts = version.split('.').map(Number);
		return {
			major: parts[0] || 0,
			minor: parts[1] || 0,
			patch: parts[2] || 0,
			version: version
		};
	}
}; 