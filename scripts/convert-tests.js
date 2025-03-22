/**
 * Test conversion script for Shaktris
 * 
 * Converts Chai/Sinon tests to Jest format
 * Usage: node scripts/convert-tests.js <file-path>
 */

const fs = require('fs');
const path = require('path');

// Check for input file
const inputFile = process.argv[2];
if (!inputFile) {
	console.error('Please provide a file path to convert.');
	console.error('Usage: node scripts/convert-tests.js <file-path>');
	process.exit(1);
}

// Read the input file
let content;
try {
	content = fs.readFileSync(inputFile, 'utf8');
} catch (err) {
	console.error(`Error reading file: ${err.message}`);
	process.exit(1);
}

// Conversion patterns
const conversions = [
	// Import replacements
	{ 
		from: /import\s+{\s*expect\s*}\s+from\s+['"]chai['"]/g, 
		to: "const { expect } = require('@jest/globals');" 
	},
	{ 
		from: /const\s+{\s*expect\s*}\s+=\s+require\(['"]chai['"]\)/g, 
		to: "const { expect } = require('@jest/globals')" 
	},
	{ 
		from: /import\s+{\s*jest\s*,\s*expect\s*}\s+from\s+['"]@jest\/globals['"]/g, 
		to: "const { expect } = require('@jest/globals')" 
	},
	{ 
		from: /const\s+{\s*jest\s*,\s*expect\s*}\s+=\s+require\(['"]@jest\/globals['"]\)/g, 
		to: "const { expect } = require('@jest/globals')" 
	},
	{ 
		from: /import\s+sinon\s+from\s+['"]sinon['"]/g, 
		to: "// sinon replaced with jest" 
	},
	{ 
		from: /const\s+sinon\s+=\s+require\(['"]sinon['"]\)/g, 
		to: "// sinon replaced with jest" 
	},
	
	// Import ES modules as CommonJS
	{
		from: /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g,
		to: (match, imports, path) => `const {${imports}} = require('${path}')`
	},
	
	// Chai assertions to Jest
	{ from: /\.to\.be\.true/g, to: ".toBe(true)" },
	{ from: /\.to\.be\.false/g, to: ".toBe(false)" },
	{ from: /\.to\.equal\(/g, to: ".toBe(" },
	{ from: /\.to\.deep\.equal\(/g, to: ".toEqual(" },
	{ from: /\.to\.have\.property\(/g, to: ".toHaveProperty(" },
	{ from: /\.to\.be\.null/g, to: ".toBeNull()" },
	{ from: /\.to\.be\.undefined/g, to: ".toBeUndefined()" },
	{ from: /\.to\.exist/g, to: ".toBeDefined()" },
	{ from: /\.to\.be\.a\('(\w+)'\)/g, to: ".toBeInstanceOf($1)" },
	{ from: /\.to\.be\.closeTo\(([^,]+),\s*([^)]+)\)/g, to: ".toBeCloseTo($1, -Math.ceil(Math.log10($2)))" },
	{ from: /\.to\.throw\(/g, to: ".toThrow(" },
	{ from: /\.to\.be\.rejected/g, to: ".rejects" },
	{ from: /\.to\.be\.fulfilled/g, to: ".resolves" },
	{ from: /\.to\.include\(/g, to: ".toContain(" },
	
	// Sinon to Jest
	{ from: /sinon\.stub\(\)\.returns\(([^)]+)\)/g, to: "jest.fn().mockReturnValue($1)" },
	{ from: /sinon\.stub\(\)\.resolves\(([^)]+)\)/g, to: "jest.fn().mockResolvedValue($1)" },
	{ from: /sinon\.stub\(\)\.rejects\(([^)]+)\)/g, to: "jest.fn().mockRejectedValue($1)" },
	{ from: /sinon\.spy\(\)/g, to: "jest.fn()" },
	{ from: /sinon\.useFakeTimers\(/g, to: "jest.useFakeTimers(" },
	{ from: /sinon\.restore\(\)/g, to: "jest.clearAllMocks()" },
	{ from: /\.calledWith\(/g, to: ".toHaveBeenCalledWith(" },
	{ from: /\.called/g, to: ".toHaveBeenCalled()" },
	{ from: /\.calledOnce/g, to: ".toHaveBeenCalledTimes(1)" },
	{ from: /\.notCalled/g, to: ".not.toHaveBeenCalled()" },
	{ from: /clock\.tick\((\d+)\)/g, to: "jest.advanceTimersByTime($1)" },
	{ from: /clock\.restore\(\)/g, to: "jest.useRealTimers()" },
	
	// Add custom matcher for include if needed
	{
		from: /describe\([^{]*{/,
		to: (match) => {
			return `${match}
// Add custom matcher if .toInclude is used
if (content.includes('.toInclude(')) {
	beforeAll(() => {
		expect.extend({
			toInclude(received, expected) {
				const pass = received.includes(expected);
				return {
					pass,
					message: () => 
						\`expected \${received} \${pass ? 'not to' : 'to'} include \${expected}\`,
				};
			}
		});
	});
}`
		},
		once: true,
		condition: (content) => content.includes('.to.include(')
	}
];

// Apply conversions
let convertedContent = content;
for (const conversion of conversions) {
	if (conversion.once && conversion.condition && !conversion.condition(content)) {
		continue;
	}
	
	if (typeof conversion.from === 'string') {
		convertedContent = convertedContent.replace(
			new RegExp(conversion.from, 'g'), 
			conversion.to
		);
	} else if (conversion.once) {
		// Apply once with function
		convertedContent = convertedContent.replace(
			conversion.from,
			conversion.to
		);
	} else {
		// Apply with function for all matches
		convertedContent = convertedContent.replace(
			conversion.from,
			conversion.to
		);
	}
}

// Write the converted content
const outputFile = inputFile.replace('.js', '.jest.js');
try {
	fs.writeFileSync(outputFile, convertedContent);
	console.log(`Converted file written to: ${outputFile}`);
} catch (err) {
	console.error(`Error writing file: ${err.message}`);
	process.exit(1);
}

// Create helper file for custom matchers if it doesn't exist
const helperFile = path.join(path.dirname(inputFile), '..', 'tests/jest-helpers.js');
if (!fs.existsSync(helperFile) && content.includes('.to.include(')) {
	const helperContent = `/**
 * Jest custom helpers for Shaktris tests
 */

// Custom Chai-like assertions
expect.extend({
	toInclude(received, expected) {
		const pass = received.includes(expected);
		return {
			pass,
			message: () => 
				\`expected \${received} \${pass ? 'not to' : 'to'} include \${expected}\`,
		};
	}
});

module.exports = {
	// Add additional helpers as needed
};`;

	try {
		fs.writeFileSync(helperFile, helperContent);
		console.log(`Helper file created at: ${helperFile}`);
	} catch (err) {
		console.error(`Error creating helper file: ${err.message}`);
	}
} 