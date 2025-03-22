/**
 * Fix Jest imports in converted test files
 * 
 * This script scans all converted test files and fixes the problematic Jest imports
 * Usage: node scripts/fix-jest-imports.js
 */

const fs = require('fs');
const path = require('path');

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

// Define the import patterns to fix
const importPatterns = [
	{
		pattern: /const\s*{\s*jest\s*(?:,\s*expect\s*)?\s*}\s*=\s*require\(['"]@jest\/globals['"]\)/g,
		replacement: `const { expect } = require('@jest/globals')`
	},
	{
		pattern: /const\s*{\s*expect\s*,\s*jest\s*\s*}\s*=\s*require\(['"]@jest\/globals['"]\)/g,
		replacement: `const { expect } = require('@jest/globals')`
	},
	{
		pattern: /import\s*{\s*jest\s*(?:,\s*expect\s*)?\s*}\s*from\s*['"]@jest\/globals['"]/g,
		replacement: `const { expect } = require('@jest/globals')`
	},
	{
		pattern: /import\s*{\s*expect\s*,\s*jest\s*\s*}\s*from\s*['"]@jest\/globals['"]/g,
		replacement: `const { expect } = require('@jest/globals')`
	}
];

// Get all converted test files
const convertedFiles = findConvertedTestFiles(testsDir);
console.log(`Found ${convertedFiles.length} converted test files to fix.`);

// Process each file
let fixed = 0;
let unchanged = 0;

convertedFiles.forEach(file => {
	try {
		// Read the file content
		const content = fs.readFileSync(file, 'utf8');
		let modifiedContent = content;
		let wasModified = false;
		
		// Apply each pattern
		importPatterns.forEach(({ pattern, replacement }) => {
			if (pattern.test(modifiedContent)) {
				modifiedContent = modifiedContent.replace(pattern, replacement);
				wasModified = true;
			}
		});
		
		// Write back if changes were made
		if (wasModified) {
			fs.writeFileSync(file, modifiedContent);
			console.log(`✅ Fixed imports in: ${path.relative(process.cwd(), file)}`);
			fixed++;
		} else {
			unchanged++;
		}
	} catch (err) {
		console.error(`Error processing ${file}: ${err.message}`);
	}
});

// Print summary
console.log('\nFix imports complete!');
console.log('=====================');
console.log(`Total files processed: ${convertedFiles.length}`);
console.log(`Files fixed: ${fixed}`);
console.log(`Files unchanged: ${unchanged}`);

process.exit(0); 