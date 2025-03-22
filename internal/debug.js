/**
 * Mock debug module for testing
 */

module.exports = {
	debug: function() {
		return console.log;
	},
	isDebugMode: false,
	enableDebug: function() {
		this.isDebugMode = true;
	},
	disableDebug: function() {
		this.isDebugMode = false;
	}
}; 