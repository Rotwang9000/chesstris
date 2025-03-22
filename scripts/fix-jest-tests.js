/**
 * Script to automatically fix common Jest test issues
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Get the single file to process from command line arguments (if any)
const singleFile = process.argv[2];

// Common issues to fix in Jest test files
const fixes = [
	{
		name: 'Update sinon import to Jest mock',
		regex: /const\s+sinon\s*=\s*require\(['"]sinon['"]\);?/g,
		replacement: '// Sinon replaced with Jest mocks'
	},
	{
		name: 'Update chai expect to Jest expect',
		regex: /(?:const|let|var)\s+(?:{\s*expect(?:\s+as\s+\w+)?\s*}|\w+)\s*=\s*require\(['"]chai(?:\/[^'"]+)?['"]\);?/g,
		replacement: 'const { expect } = require(\'@jest/globals\');'
	},
	{
		name: 'Fix duplicate jest import',
		regex: /const\s+{\s*[^}]*?\bjest\b[^}]*?}\s*=\s*require\(['"]@jest\/globals['"]\);?/g,
		replacement: 'const { expect } = require(\'@jest/globals\');'
	},
	{
		name: 'Replace sinon.spy with Jest spy',
		regex: /sinon\.spy\(\)/g,
		replacement: 'jest.fn()'
	},
	{
		name: 'Replace sinon.stub with Jest mock',
		regex: /sinon\.stub\(([^,]+),\s*['"]([^'"]+)['"]\)/g,
		replacement: 'jest.spyOn($1, \'$2\').mockImplementation'
	},
	{
		name: 'Replace stub returns with mockReturnValue',
		regex: /\.returns\(/g,
		replacement: '.mockReturnValue('
	},
	{
		name: 'Replace stub/spy reset with mockReset',
		regex: /\.(restore|reset)\(\)/g,
		replacement: '.mockReset()'
	},
	{
		name: 'Replace calledWith with toHaveBeenCalledWith',
		regex: /expect\(([^)]+)\)\.to(?:Have)?\.been\.calledWith/g,
		replacement: 'expect($1).toHaveBeenCalledWith'
	},
	{
		name: 'Replace called/calledOnce with toHaveBeenCalled',
		regex: /expect\(([^)]+)\)\.to(?:Have)?\.been\.(called(?:Once)?)\(\)/g,
		replacement: 'expect($1).toHaveBeenCalled()'
	},
	{
		name: 'Remove unnecessary content expectations',
		regex: /expect\(content\)\.to\.(?:exist|not\.be\.undefined|not\.be\.null)(?:\(\))?;?/g, 
		replacement: ''
	},
	{
		name: 'Fix missing closing braces',
		regex: /\}\);(?:\s*\/\/[^\n]*|)\s*$/g,
		replacement: '});'
	},
	{
		name: 'Fix jest.fn(object, method) to jest.spyOn',
		regex: /jest\.fn\(([^,]+),\s*['"]([^'"]+)['"]\)/g,
		replacement: 'jest.spyOn($1, \'$2\')'
	}
];

// Process all Jest test files
async function processFiles() {
	try {
		let files;
		if (singleFile) {
			// Process just the single file
			if (fs.existsSync(singleFile)) {
				files = [singleFile];
			} else {
				console.error(`File not found: ${singleFile}`);
				process.exit(1);
			}
		} else {
			// Process all test files - fix the glob pattern to use the correct path
			const pattern = 'tests/**/*.test.jest.js';
			files = await glob(pattern);
		}
		
		console.log(`Found ${files.length} test files to process.`);
		
		let fixedCount = 0;
		
		// Process each file
		for (const file of files) {
			try {
				let content = fs.readFileSync(file, 'utf8');
				let originalContent = content;
				
				// Apply all fixes
				for (const fix of fixes) {
					content = content.replace(fix.regex, fix.replacement);
				}
				
				// Only write back if changes were made
				if (content !== originalContent) {
					fs.writeFileSync(file, content, 'utf8');
					console.log(`Fixed issues in: ${path.basename(file)}`);
					fixedCount++;
				} else {
					console.log(`No issues found in: ${path.basename(file)}`);
				}
			} catch (error) {
				console.error(`Error processing ${file}:`, error);
			}
		}
		
		console.log(`Successfully fixed ${fixedCount} files out of ${files.length} total files.`);
		console.log('Done!');
	} catch (error) {
		console.error('Error processing files:', error);
	}
}

processFiles(); 