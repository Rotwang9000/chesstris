/**
 * Bulk test conversion script for Shaktris
 * 
 * Converts all Chai/Sinon tests to Jest format
 * Usage: node scripts/convert-all-tests.js
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Root tests directory
const testsDir = path.join(__dirname,'..' ,'server','test');

// Function to recursively find all test files
function findTestFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);
	
	files.forEach(file => {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		
		if (stat.isDirectory()) {
			findTestFiles(filePath, fileList);
		} else if (
			file.endsWith('.test.js') && 
			!file.endsWith('.jest.test.js') &&
			!file.includes('setup') &&
			!file.includes('helper')
		) {
			fileList.push(filePath);
		}
	});
	
	return fileList;
}

// Get all test files
const testFiles = findTestFiles(testsDir);
console.log(`Found ${testFiles.length} test files to convert.`);

// Process each file
let processed = 0;
let failed = 0;

console.log('Starting conversion...');
testFiles.forEach(file => {
	try {
		// Convert the file using our converter script
		const cmd = `node ${path.join(__dirname, 'convert-tests.js')} "${file}"`;
		exec(cmd, (error, stdout, stderr) => {
			if (error) {
				console.error(`Error converting ${file}: ${error.message}`);
				failed++;
			} else {
				console.log(`✓ Converted: ${path.relative(process.cwd(), file)}`);
				processed++;
			}
			
			// Check if all files have been processed
			if (processed + failed === testFiles.length) {
				console.log('\nConversion complete!');
				console.log(`Successfully converted: ${processed}/${testFiles.length}`);
				if (failed > 0) {
					console.log(`Failed to convert: ${failed}`);
				}
			}
		});
	} catch (err) {
		console.error(`Error processing ${file}: ${err.message}`);
		failed++;
	}
});

console.log('\nConversion is running in the background...');
console.log('Please wait for all files to be processed.'); 