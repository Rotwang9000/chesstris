/**
 * Test verification and replacement script for Shaktris
 * 
 * This script checks all converted .jest.js test files, and if they pass,
 * replaces the original test files with the converted versions.
 * 
 * Usage: node scripts/verify-and-replace-tests.js [--verbose] [--dry-run] [--force]
 * 
 * Options:
 *   --verbose: Show detailed test output
 *   --dry-run: Don't actually replace files, just report what would happen
 *   --force: Replace files even if tests don't pass
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Process command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

// Root tests directory
const testsDir = path.join(__dirname, '..', 'tests');

// Function to find all converted test files
function findConvertedTestFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);
	
	files.forEach(file => {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		
		if (stat.isDirectory()) {
			findConvertedTestFiles(filePath, fileList);
		} else if (
			file.endsWith('.jest.js') &&
			!file.includes('setup') &&
			!file.includes('helper')
		) {
			fileList.push(filePath);
		}
	});
	
	return fileList;
}

// Get all converted test files
const convertedFiles = findConvertedTestFiles(testsDir);
console.log(`Found ${convertedFiles.length} converted test files to check.`);

// Counters for statistics
let passed = 0;
let failed = 0;
let replaced = 0;
let errors = [];

// Process each file
console.log('Verifying converted tests...');
convertedFiles.forEach(file => {
	const originalFile = file.replace('.jest.js', '.js');
	const relativeFile = path.relative(process.cwd(), file);
	
	// Skip if original file doesn't exist
	if (!fs.existsSync(originalFile)) {
		console.log(`⚠️ Original file not found for: ${relativeFile}`);
		return;
	}
	
	try {
		// Run the test
		console.log(`Testing: ${relativeFile}...`);
		try {
			execSync(`npx jest "${file}"`, { 
				stdio: verbose ? 'inherit' : 'pipe',
				encoding: 'utf8'
			});
			console.log(`✅ Test passed: ${relativeFile}`);
			passed++;
			
			// Replace the original file with the converted file
			if (!dryRun) {
				fs.copyFileSync(file, originalFile);
				console.log(`📝 Replaced: ${path.relative(process.cwd(), originalFile)}`);
				replaced++;
			} else {
				console.log(`📝 Would replace: ${path.relative(process.cwd(), originalFile)}`);
			}
		} catch (error) {
			console.log(`❌ Test failed: ${relativeFile}`);
			if (verbose) {
				console.error(error.message);
			}
			failed++;
			
			if (force && !dryRun) {
				fs.copyFileSync(file, originalFile);
				console.log(`⚠️ Forced replacement despite failure: ${path.relative(process.cwd(), originalFile)}`);
				replaced++;
			}
			
			errors.push({
				file: relativeFile,
				error: error.message
			});
		}
	} catch (err) {
		console.error(`Error processing ${relativeFile}: ${err.message}`);
		errors.push({
			file: relativeFile,
			error: err.message
		});
	}
});

// Print summary
console.log('\nTest verification complete!');
console.log('============================');
console.log(`Total converted tests: ${convertedFiles.length}`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Files replaced: ${replaced}${dryRun ? ' (dry run)' : ''}`);

if (errors.length > 0 && verbose) {
	console.log('\nErrors:');
	errors.forEach(({ file, error }) => {
		console.log(`\n${file}:`);
		console.log(error);
	});
}

console.log('\nTo replace files manually, use:');
console.log('mv path/to/file.test.jest.js path/to/file.test.js');

// Exit with appropriate code
process.exit(errors.length > 0 ? 1 : 0); 