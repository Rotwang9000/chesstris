/**
 * Test verification script for a single test
 * 
 * This script runs a single test file and provides detailed output
 * Usage: node scripts/verify-single-test.js <test-file>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the test file from command line argument
const testFile = process.argv[2];
if (!testFile) {
	console.error('Please provide a test file path');
	console.error('Usage: node scripts/verify-single-test.js <test-file>');
	process.exit(1);
}

// Check if file exists
if (!fs.existsSync(testFile)) {
	console.error(`File not found: ${testFile}`);
	process.exit(1);
}

// Run the test
console.log(`Running test: ${testFile}`);
try {
	const result = execSync(`npx jest "${testFile}" --verbose`, { 
		stdio: 'pipe',
		encoding: 'utf8'
	});
	console.log('Test passed!');
	console.log('\nOutput:');
	console.log(result);
} catch (error) {
	console.error('Test failed!');
	console.error('\nError:');
	console.error(error.message);
	console.error('\nStdout:');
	console.error(error.stdout);
	console.error('\nStderr:');
	console.error(error.stderr);
} 