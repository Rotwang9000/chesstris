/**
 * Script to fix common import issues in Jest test files
 * 
 * This script:
 * 1. Finds imports inside describe blocks and moves them to the top level
 * 2. Updates import paths to use the correct format
 * 3. Adds jest.mock statements where needed
 * 
 * Usage:
 *   node scripts/fix-test-imports.js <file-path>
 *   node scripts/fix-test-imports.js --all
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Regular expressions for matching imports
const IMPORT_IN_DESCRIBE_REGEX = /describe\([^)]+\)\s*{(?:[^}]|[\r\n])*?import\s+(?:{[^}]+}|[^;{]+)\s+from\s+['"][^'"]+['"];?/g;
const IMPORT_STATEMENT_REGEX = /import\s+(?:{[^}]+}|[^;{]+)\s+from\s+['"]([^'"]+)['"];?/g;
const MODULE_PATH_REGEX = /['"]([^'"]+)['"]/;

/**
 * Process a single file to fix imports
 * @param {string} filePath - Path to the file to process
 * @returns {boolean} - Whether the file was modified
 */
function processFile(filePath) {
	console.log(`Processing file: ${filePath}`);
	
	// Read the file content
	let content;
	try {
		content = fs.readFileSync(filePath, 'utf8');
	} catch (error) {
		console.error(`Error reading file ${filePath}: ${error.message}`);
		return false;
	}
	
	// Keep the original content for comparison
	const originalContent = content;
	
	// Find imports inside describe blocks
	const importsInDescribe = content.match(IMPORT_IN_DESCRIBE_REGEX);
	if (importsInDescribe) {
		console.log(`  Found ${importsInDescribe.length} imports inside describe blocks`);
		
		// Extract each import
		const topLevelImports = [];
		
		importsInDescribe.forEach(block => {
			const imports = block.match(IMPORT_STATEMENT_REGEX);
			if (imports) {
				imports.forEach(importStatement => {
					// Add to top level imports if not already there
					if (!topLevelImports.includes(importStatement)) {
						topLevelImports.push(importStatement);
					}
					
					// Remove the import from the describe block
					content = content.replace(importStatement, '// Import moved to top level');
				});
			}
		});
		
		// Add the imports to the top of the file, below any existing imports
		if (topLevelImports.length > 0) {
			// Find the position after any existing imports
			const lastImportMatch = Array.from(content.matchAll(/import.+from.+;\n/g)).pop();
			const insertPosition = lastImportMatch 
				? lastImportMatch.index + lastImportMatch[0].length 
				: content.search(/\n/) + 1;
			
			// Insert the imports
			content = content.substring(0, insertPosition) + 
				topLevelImports.join('\n') + '\n\n' + 
				content.substring(insertPosition);
		}
	}
	
	// Add dynamic import code for imports that need to be loaded after mocks
	const needsDynamicImport = content.includes('jest.mock(') && content.includes('import');
	if (needsDynamicImport) {
		console.log('  Adding dynamic import code for imports after mocks');
		
		// Find all imports
		const allImports = [...content.matchAll(IMPORT_STATEMENT_REGEX)];
		const mockStatements = [...content.matchAll(/jest\.mock\(['"](.*?)['"]/g)];
		
		// If we have both imports and mocks, add the dynamic import pattern
		if (allImports.length > 0 && mockStatements.length > 0) {
			// Extract the module names
			const importedModules = allImports.map(match => {
				const modulePath = match[0].match(MODULE_PATH_REGEX);
				return modulePath ? modulePath[1] : null;
			}).filter(Boolean);
			
			const mockedModules = mockStatements.map(match => match[1]);
			
			// Find imports that should be loaded dynamically (those that are also being mocked)
			const dynamicImports = importedModules.filter(module => 
				mockedModules.some(mockedModule => module.includes(mockedModule)));
			
			if (dynamicImports.length > 0) {
				// Add a comment explaining the dynamic import strategy
				content = content.replace(
					/describe\([^)]+\)/,
					match => match + '\n  // Using dynamic imports to load modules after mocks are set up'
				);
				
				// Find each import that needs to be dynamic
				dynamicImports.forEach(modulePath => {
					const importRegex = new RegExp(`import\\s+(.+?)\\s+from\\s+['"]${modulePath.replace(/\//g, '\\/')}['"];?`);
					const importMatch = content.match(importRegex);
					
					if (importMatch) {
						// Get the variable name being imported
						const variableName = importMatch[1];
						
						// Replace the import with a declaration
						content = content.replace(importRegex, `let ${variableName};`);
						
						// Add the dynamic import in beforeAll
						if (!content.includes('beforeAll(async () => {')) {
							// Add a new beforeAll block
							content = content.replace(
								/describe\([^)]+\)[^{]*{/,
								match => match + '\n  beforeAll(async () => {\n    // Dynamic imports\n  });\n'
							);
						}
						
						// Add the dynamic import to the beforeAll block
						content = content.replace(
							/beforeAll\(async \(\) => {/,
							match => match + `\n    // Import ${modulePath} after mocks are set up\n    const ${variableName}Module = await import('${modulePath}');\n    ${variableName} = ${variableName}Module.default || ${variableName}Module;`
						);
					}
				});
			}
		}
	}
	
	// If the content has changed, write it back to the file
	if (content !== originalContent) {
		try {
			fs.writeFileSync(filePath, content, 'utf8');
			console.log(`  Updated file: ${filePath}`);
			return true;
		} catch (error) {
			console.error(`Error writing file ${filePath}: ${error.message}`);
			return false;
		}
	}
	
	console.log(`  No changes needed for: ${filePath}`);
	return false;
}

/**
 * Process all Jest test files in the project
 */
function processAllFiles() {
	const files = glob.sync('tests/**/*.test.jest.js');
	
	console.log(`Found ${files.length} test files to process`);
	
	let modifiedCount = 0;
	for (const file of files) {
		if (processFile(file)) {
			modifiedCount++;
		}
	}
	
	console.log(`\nProcessed ${files.length} files, modified ${modifiedCount} files`);
}

// Main script execution
if (require.main === module) {
	const args = process.argv.slice(2);
	
	if (args.length === 0) {
		console.error('Please provide a file path or --all to process all files');
		process.exit(1);
	}
	
	if (args[0] === '--all') {
		processAllFiles();
	} else {
		const filePath = path.resolve(args[0]);
		processFile(filePath);
	}
}

module.exports = {
	processFile,
	processAllFiles
}; 