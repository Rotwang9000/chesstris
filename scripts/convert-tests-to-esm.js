#!/usr/bin/env node

/**
 * Convert Test Files from CommonJS to ES6 Modules
 * 
 * This script replaces require() statements with imports and makes other changes
 * necessary for converting test files to use ES6 module syntax.
 * 
 * Usage: node scripts/convert-tests-to-esm.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root directory of the project
const rootDir = path.join(__dirname, '..');
const testsDir = path.join(rootDir, 'tests');

// Function to recursively get all files in a directory
function getAllFiles(dir) {
	const files = [];
	
	const items = fs.readdirSync(dir);
	
	for (const item of items) {
		const itemPath = path.join(dir, item);
		const stats = fs.statSync(itemPath);
		
		if (stats.isDirectory()) {
			files.push(...getAllFiles(itemPath));
		} else if (stats.isFile() && itemPath.endsWith('.js')) {
			files.push(itemPath);
		}
	}
	
	return files;
}

// Function to convert a file from CommonJS to ES6 modules
function convertFileToESM(filePath) {
	console.log(`Converting ${filePath}...`);
	
	let content = fs.readFileSync(filePath, 'utf8');
	
	// Replace CommonJS requires with ES imports
	// Match const { x, y } = require('module');
	content = content.replace(
		/const\s+\{\s*([^}]+)\s*\}\s*=\s*require\(['"](.*)['"]\);/g,
		'import { $1 } from \'$2\';'
	);
	
	// Match const module = require('module');
	content = content.replace(
		/const\s+(\w+)\s*=\s*require\(['"](.*)['"]\);/g,
		'import * as $1 from \'$2\';'
	);
	
	// Change initGameState to resetGameState
	content = content.replace(
		/GameState\.initGameState\(\)/g,
		'GameState.resetGameState()'
	);
	
	// Add .js to relative imports if missing
	content = content.replace(
		/from\s+['"](\.\.[^'"]+)['"];/g,
		(match, importPath) => {
			if (!importPath.endsWith('.js')) {
				return `from '${importPath}.js';`;
			}
			return match;
		}
	);
	
	// Save the updated content
	fs.writeFileSync(filePath, content, 'utf8');
	
	console.log(`Converted ${filePath}`);
}

// Main function
function main() {
	// Get all test files
	const allFiles = getAllFiles(testsDir);
	
	console.log(`Found ${allFiles.length} test files.`);
	
	// Convert each file
	for (const file of allFiles) {
		convertFileToESM(file);
	}
	
	console.log('Done!');
}

main(); 