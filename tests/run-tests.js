/**
 * Main test runner for Chesstris game
 * 
 * This script runs all Node.js tests for the Chesstris game using Node's native
 * assert module. It avoids the complexity of Jest and provides a simple way to
 * test core gameplay mechanics without depending on complex testing frameworks.
 * 
 * Usage:
 *   node tests/run-tests.js
 *   npm run test:node
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration - directories where tests are located
const testDirectories = [
	'gameplay',  // Tests for core gameplay mechanics
	'core',      // Tests for core modules and utilities
	'ui',        // Tests for UI components
	'server'     // Tests for server functionality
];

// Test files to run - add new tests here as they are created
const testFiles = [
	// Gameplay tests
	'gameplay/rowClearing.test.js',         // Tests for row clearing mechanics
	'gameplay/homeZoneSpiral.test.js',      // Tests for home zone placement
	'gameplay/kingCapture.test.js',         // Tests for capturing kings and gaining their territory
	'gameplay/islandConnectivity.test.js',  // Tests for connectivity path finding
	'gameplay/tetrominoPlacement.test.js',  // Tests for tetromino placement
	'gameplay/chessMovement.test.js',       // Tests for chess piece movement
	'gameplay/pawnPromotion.test.js',       // Tests for pawn promotion
	'gameplay/homeZoneDegradation.test.js', // Tests for home zone degradation when empty
	'gameplay/orphanedPieces.test.js',      // Tests for handling of pieces disconnected from king
	
	// Backend API tests
	'backend/gameStateManager.test.js',     // Tests for the game state manager and state integrity
	'backend/apiEndpoints.test.js',         // Tests for the API endpoints and game interactions
	'backend/computerPlayer.test.js',       // Tests for computer player functionality and interactions
	
	// Add other test files here as they are created
];

// Colours for console output to enhance readability
const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m'
};

// Track test results for summary reporting
const results = {
	passed: 0,
	failed: 0,
	total: 0,
	failedTests: []
};

/**
 * Run a single test file
 * 
 * @param {string} testFile - Path to the test file relative to tests directory
 */
function runTest(testFile) {
	const fullPath = path.join(__dirname, testFile);
	
	// Skip if file doesn't exist to prevent errors
	if (!fs.existsSync(fullPath)) {
		console.log(`${colors.yellow}SKIPPED${colors.reset} ${testFile} (file not found)`);
		return;
	}
	
	console.log(`\n${colors.cyan}RUNNING${colors.reset} ${testFile}`);
	console.log('-'.repeat(80));
	
	try {
		// Execute the test file as a Node.js script with output directed to the console
		execSync(`node ${fullPath}`, { stdio: 'inherit' });
		
		// If we get here, the test passed (no exception was thrown)
		console.log(`${colors.green}PASSED${colors.reset} ${testFile}`);
		results.passed++;
	} catch (error) {
		// If an exception was thrown, the test failed
		console.log(`${colors.red}FAILED${colors.reset} ${testFile}`);
		results.failed++;
		results.failedTests.push(testFile);
	}
	 
	results.total++;
}

/**
 * Main function - runs all tests and prints a summary
 */
function main() {
	console.log(`${colors.magenta}=== Chesstris Test Runner ===${colors.reset}`);
	console.log(`Running ${testFiles.length} tests...\n`);
	
	// Run each test file sequentially
	for (const testFile of testFiles) {
		runTest(testFile);
	}
	
	// Print summary with colour-coded results
	console.log('\n' + '='.repeat(80));
	console.log(`${colors.blue}SUMMARY:${colors.reset}`);
	console.log(`Total tests: ${results.total}`);
	console.log(`Passed: ${colors.green}${results.passed}${colors.reset}`);
	console.log(`Failed: ${results.failed > 0 ? colors.red : colors.reset}${results.failed}${colors.reset}`);
	
	// List failed tests if any
	if (results.failedTests.length > 0) {
		console.log(`\n${colors.red}Failed tests:${colors.reset}`);
		results.failedTests.forEach((test, index) => {
			console.log(`  ${index + 1}. ${test}`);
		});
	}
	
	// Exit with error code 1 if any tests failed to indicate failure to CI systems
	if (results.failed > 0) {
		process.exit(1);
	}
}

// Run the main function
main(); 