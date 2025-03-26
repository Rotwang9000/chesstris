/**
 * Security Test Runner for Shaktris
 * 
 * This script runs all security tests to verify that the game is protected against
 * cheating, unauthorized access, and malicious inputs.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.NODE_ENV = 'test';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Print header
console.log(`${colors.bright}${colors.blue}=======================================`);
console.log(`    SHAKTRIS SECURITY TEST RUNNER`);
console.log(`=======================================${colors.reset}\n`);

// Check if security test directory exists
const securityTestDir = path.join(__dirname, '..', 'tests', 'security');
if (!fs.existsSync(securityTestDir)) {
  console.error(`${colors.red}Error: Security test directory not found at ${securityTestDir}${colors.reset}`);
  process.exit(1);
}

// Get all security test files
const securityTestFiles = fs.readdirSync(securityTestDir)
  .filter(file => file.endsWith('.test.js'))
  .map(file => path.join('tests', 'security', file));

if (securityTestFiles.length === 0) {
  console.error(`${colors.yellow}Warning: No security test files found in ${securityTestDir}${colors.reset}`);
  process.exit(0);
}

console.log(`${colors.cyan}Found ${securityTestFiles.length} security test files:${colors.reset}`);
securityTestFiles.forEach(file => {
  console.log(`- ${file}`);
});
console.log();

// Track results
let passed = 0;
let failed = 0;
const failedTests = [];

// Run each test file
securityTestFiles.forEach(testFile => {
  const testName = path.basename(testFile);
  console.log(`${colors.bright}Running test: ${testName}${colors.reset}`);
  
  try {
    // Run Jest for this specific test file with the correct configuration
    // Use the testMatch option to ensure it finds the tests
    execSync(`npx jest --testMatch="**/${testFile}" --verbose --forceExit`, { 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    console.log(`${colors.green}✓ ${testName} passed${colors.reset}\n`);
    passed++;
  } catch (error) {
    console.error(`${colors.red}✗ ${testName} failed${colors.reset}\n`);
    failedTests.push(testName);
    failed++;
  }
});

// Print summary
console.log(`${colors.bright}${colors.blue}=======================================`);
console.log(`    SECURITY TEST SUMMARY`);
console.log(`=======================================${colors.reset}\n`);

console.log(`${colors.cyan}Total tests: ${securityTestFiles.length}${colors.reset}`);
console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
console.log(`${colors.red}Failed: ${failed}${colors.reset}`);

if (failed > 0) {
  console.log(`\n${colors.red}Failed tests:${colors.reset}`);
  failedTests.forEach(test => {
    console.log(`- ${test}`);
  });
  
  process.exit(1);
} else {
  console.log(`\n${colors.green}${colors.bright}All security tests passed!${colors.reset}`);
  
  // Check coverage if all tests passed
  console.log(`\n${colors.cyan}Generating coverage report for security tests...${colors.reset}`);
  try {
    execSync(`npx jest --collectCoverage --coverageDirectory=./coverage/security --testMatch="**/tests/security/**/*.test.js" --forceExit`, { 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    console.log(`\n${colors.green}Coverage report generated in ./coverage/security${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.yellow}Warning: Could not generate coverage report${colors.reset}`);
  }
  
  process.exit(0);
} 