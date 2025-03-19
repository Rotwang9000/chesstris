module.exports = {
	transform: {
		'^.+\\.jsx?$': 'babel-jest',
	},
	transformIgnorePatterns: [
		'/node_modules/(?!chai)'
	],
	testEnvironment: 'node',
	moduleFileExtensions: ['js', 'json', 'jsx', 'node'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1'
	},
	testMatch: [
		'**/tests/**/*.test.js'
	],
	testTimeout: 10000,
	maxWorkers: 1,
	forceExit: true,
	detectOpenHandles: true,
	slowTestThreshold: 15,
}; 