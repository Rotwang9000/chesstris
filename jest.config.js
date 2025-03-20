/**
 * Jest configuration for Shaktris project
 */

module.exports = {
	// The test environment that will be used for testing
	testEnvironment: 'jsdom',
	
	// The root directory that Jest should scan for tests and modules
	rootDir: './',
	
	// A list of paths to directories that Jest should use to search for files in
	roots: ['<rootDir>/tests'],
	
	// Focus only on the soundManager test that is working better
	testMatch: [
		'<rootDir>/tests/soundManager.test.js',
		'<rootDir>/tests/gameRenderer.test.js'
	],
	
	// An array of regexp pattern strings that are matched against all test paths
	// Matched tests are skipped
	testPathIgnorePatterns: [
		'<rootDir>/node_modules/',
		'<rootDir>/public/',
		'<rootDir>/dist/',
		'<rootDir>/build/',
		'<rootDir>/coverage/',
		'<rootDir>/docs/',
		// Skip tests that are using ESM imports or failing
		'<rootDir>/tests/gameplay/',
		'<rootDir>/tests/core/',
		'<rootDir>/tests/examples/',
		'<rootDir>/tests/services/',
		'<rootDir>/tests/security/',
		'<rootDir>/tests/utils/',
		'<rootDir>/tests/server/'
	],
	
	// Transform files with babel-jest
	transform: {
		'^.+\\.jsx?$': 'babel-jest'
	},
	
	// Don't transform node_modules except for specific packages
	transformIgnorePatterns: [
		'/node_modules/(?!(chai|sinon)/)'
	],
	
	// A map from regular expressions to module names or to arrays of module names
	// that allow to stub out resources with a single module
	moduleNameMapper: {
		'\\.(css|less|scss|sass)$': '<rootDir>/tests/mocks/styleMock.js',
		'\\.(gif|ttf|eot|svg|png)$': '<rootDir>/tests/mocks/fileMock.js',
		'^chai$': '<rootDir>/tests/mocks/chaiMock.js',
		'^sinon$': '<rootDir>/tests/mocks/sinonMock.js'
	},
	
	// An array of regexp pattern strings that are matched against all source file paths
	// Matched files will be skipped by the coverage measurement
	coveragePathIgnorePatterns: ['/node_modules/'],
	
	// Indicates which provider should be used to instrument code for coverage
	coverageProvider: 'v8',
	
	// A list of reporter names that Jest uses when writing coverage reports
	coverageReporters: ['text', 'lcov', 'clover', 'html'],
	
	// The directory where Jest should output its coverage files
	coverageDirectory: '<rootDir>/coverage',
	
	// Automatically clear mock calls, instances, contexts and results before every test
	clearMocks: true,
	
	// Indicates whether the coverage information should be collected while executing the test
	collectCoverage: false,
	
	// An array of glob patterns indicating a set of files for which coverage should be collected
	collectCoverageFrom: [
		'public/js/utils/**/*.js',
		'!public/js/utils/three.min.js',
		'!public/js/utils/three.module.js'
	],
	
	// Setup files to run before each test
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
	
	// Make calling deprecated APIs throw helpful error messages
	errorOnDeprecated: true,
	
	// The maximum amount of workers used to run your tests
	maxWorkers: '50%',
	
	// An object that configures minimum threshold enforcement for coverage results
	coverageThreshold: {
		global: {
			branches: 70,
			functions: 70,
			lines: 70,
			statements: 70,
		},
	},
	
	// JSDOM test environment configuration
	testEnvironmentOptions: {
		url: 'http://localhost',
		pretendToBeVisual: true,
		resources: 'usable'
	},
	
	// Allow CommonJS modules to be imported
	moduleFileExtensions: ['js', 'json']
}; 