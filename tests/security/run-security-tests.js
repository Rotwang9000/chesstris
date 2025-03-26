/**
 * Direct runner for security tests
 * 
 * This script allows you to run the security tests directly from their directory
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Running Shaktris Security Tests');
console.log('===============================');

// Get all test files from command arguments or run all if none specified
const testFiles = process.argv.slice(2);
const args = [
  '--config',
  path.join(__dirname, 'jest.config.js'),
  '--verbose',
  '--forceExit'
];

if (testFiles.length > 0) {
  args.push('--testMatch');
  args.push(`"**/${testFiles.join('|**/')}.test.js"`);
}

// Run Jest with the security configuration
const jest = spawn('npx', ['jest', ...args], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
});

jest.on('close', (code) => {
  process.exit(code);
}); 