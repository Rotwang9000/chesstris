/**
 * Jest configuration for Shaktris project
 */

module.exports = {
	// Indicates whether each individual test should be reported during the run
	verbose: true,

	// Automatically clear mock calls, instances, contexts and results before every test
	clearMocks: true,

	// The directory where Jest should output its coverage files
	coverageDirectory: "coverage",

	// A list of reporter names that Jest uses when writing coverage reports
	coverageReporters: [
		"json",
		"text",
		"lcov",
		"clover"
	],

	// The test environment that will be used for testing
	testEnvironment: "jsdom",

	// A map from regular expressions to paths to transformers
	transform: {
		"\\.js$": "babel-jest"
	},

	// The glob patterns Jest uses to detect test files
	testMatch: [
		"**/__tests__/**/*.[jt]s?(x)",
		"**/tests/**/?(*.)+(spec|test).[jt]s?(x)"
	],

	// An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
	testPathIgnorePatterns: [
		"/node_modules/",
		"/tests\\.old/"
	],

	// An array of file extensions your modules use
	moduleFileExtensions: [
		"js",
		"json",
		"jsx",
		"node"
	],

	// A map from regular expressions to module names that allow to stub out resources with a single module
	moduleNameMapper: {
		// Mock any path modules as necessary
		"^../internal/.*$": "<rootDir>/tests/mocks/internalMock.js",
		"^../classes/semver$": "<rootDir>/tests/mocks/semverMock.js",
		"^../functions/cmp$": "<rootDir>/tests/mocks/cmpMock.js",
		"^../functions/(.*)$": "<rootDir>/tests/mocks/functionsMock.js",
		"^../(.*)$": "<rootDir>/$1"
	},

	// Setup files to run before each test
	setupFiles: [
		"<rootDir>/tests/setup.js"
	],

	// Setup files that run after the test framework is installed
	setupFilesAfterEnv: [
		"<rootDir>/tests/setup-extensions.js"
	],

	// Automatically restore mock state and implementation between every test
	restoreMocks: true,

	// The maximum amount of workers used to run your tests
	maxWorkers: "50%"
}; 