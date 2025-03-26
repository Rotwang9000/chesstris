/**
 * Jest configuration for Shaktris security tests
 */

module.exports = {
	// Indicates whether each individual test should be reported during the run
	verbose: true,

	// Automatically clear mock calls, instances, contexts and results before every test
	clearMocks: true,
	
	// The test environment that will be used for testing (Node for server-side tests)
	testEnvironment: "node",

	// A map from regular expressions to paths to transformers
	transform: {
		"\\.js$": "babel-jest"
	},
	
	// Setup files to run before each test
	setupFiles: [
		"<rootDir>/../setup.js"
	],

	// Setup files that run after the test framework is installed
	setupFilesAfterEnv: [
		"<rootDir>/../setup-extensions.js"
	],
	
	// Root directory where tests are located
	rootDir: __dirname,
	
	// Use custom test runner to better handle security tests
	testMatch: [
		"<rootDir>/**/*.test.js"
	],
	
	// Automatically restore mock state and implementation between every test
	restoreMocks: true,
	
	// Force exit after tests complete
	forceExit: true,
	
	// Set timeout higher for security tests which may take longer
	testTimeout: 10000
}; 