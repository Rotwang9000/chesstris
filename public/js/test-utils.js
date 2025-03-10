/**
 * Automated Test Utilities
 * This file contains tools for automated testing of the renderer
 */

// Store test results
const testResults = {
	passed: [],
	failed: [],
	warnings: [],
	log: []
};

// Test logging function
function logTest(message, type = 'info') {
	const timestamp = new Date().toISOString();
	const logEntry = { timestamp, message, type };
	testResults.log.push(logEntry);
	
	// Also log to console with color
	switch (type) {
		case 'pass':
			console.log(`%c✓ PASS: ${message}`, 'color: green; font-weight: bold;');
			testResults.passed.push(logEntry);
			break;
		case 'fail':
			console.error(`%c✗ FAIL: ${message}`, 'color: red; font-weight: bold;');
			testResults.failed.push(logEntry);
			break;
		case 'warn':
			console.warn(`%c⚠ WARNING: ${message}`, 'color: orange; font-weight: bold;');
			testResults.warnings.push(logEntry);
			break;
		default:
			console.log(`%c→ INFO: ${message}`, 'color: blue;');
	}
	
	// Update UI if test report element exists
	updateTestReportUI();
	
	return logEntry;
}

// Update the test report UI
function updateTestReportUI() {
	const testReportElement = document.getElementById('test-report');
	if (!testReportElement) {
		console.warn('Test report element not found in the DOM. Results will only be shown in console.');
		return;
	}
	
	// Clear previous content
	testReportElement.innerHTML = '';
	
	// Create summary section
	const summary = document.createElement('div');
	summary.innerHTML = `
		<h3>Test Summary</h3>
		<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
			<div style="background-color: #4caf50; color: white; padding: 5px 10px; border-radius: 3px;">
				Passed: ${testResults.passed.length}
			</div>
			<div style="background-color: #f44336; color: white; padding: 5px 10px; border-radius: 3px;">
				Failed: ${testResults.failed.length}
			</div>
			<div style="background-color: #ff9800; color: white; padding: 5px 10px; border-radius: 3px;">
				Warnings: ${testResults.warnings.length}
			</div>
		</div>
	`;
	testReportElement.appendChild(summary);
	
	// Create log section
	const logSection = document.createElement('div');
	logSection.innerHTML = '<h3>Test Log</h3>';
	
	// Create log entries
	const logList = document.createElement('div');
	logList.style.maxHeight = '300px';
	logList.style.overflowY = 'auto';
	logList.style.border = '1px solid #ccc';
	logList.style.padding = '10px';
	logList.style.backgroundColor = '#1e1e1e';
	logList.style.fontFamily = 'monospace';
	logList.style.fontSize = '12px';
	
	// Add log entries in reverse order (newest first)
	testResults.log.slice().reverse().forEach(entry => {
		const logEntry = document.createElement('div');
		logEntry.style.marginBottom = '5px';
		logEntry.style.borderLeft = '3px solid';
		logEntry.style.paddingLeft = '10px';
		
		switch (entry.type) {
			case 'pass':
				logEntry.style.borderColor = '#4caf50';
				break;
			case 'fail':
				logEntry.style.borderColor = '#f44336';
				break;
			case 'warn':
				logEntry.style.borderColor = '#ff9800';
				break;
			default:
				logEntry.style.borderColor = '#2196f3';
		}
		
		// Format timestamp
		const time = new Date(entry.timestamp).toLocaleTimeString();
		
		logEntry.innerHTML = `<span style="color: #888;">[${time}]</span> ${entry.message}`;
		logList.appendChild(logEntry);
	});
	
	logSection.appendChild(logList);
	testReportElement.appendChild(logSection);
}

// Test a specific feature
function testFeature(name, testFn) {
	try {
		logTest(`Testing feature: ${name}`, 'info');
		const result = testFn();
		logTest(`Feature "${name}" passed`, 'pass');
		return true;
	} catch (error) {
		logTest(`Feature "${name}" failed: ${error.message}`, 'fail');
		console.error(error);
		return false;
	}
}

// Test all THREE.js dependencies
function testThreeDependencies() {
	const tests = [
		{
			name: 'THREE global object',
			test: () => {
				if (typeof THREE === 'undefined') throw new Error('THREE is not defined globally');
				logTest('THREE global object is available', 'pass');
				return true;
			}
		},
		{
			name: 'THREE.Vector3',
			test: () => {
				if (typeof THREE.Vector3 !== 'function') throw new Error('THREE.Vector3 is not available');
				const vec = new THREE.Vector3(1, 2, 3);
				if (vec.x !== 1 || vec.y !== 2 || vec.z !== 3) throw new Error('THREE.Vector3 does not work correctly');
				logTest('THREE.Vector3 works correctly', 'pass');
				return true;
			}
		},
		{
			name: 'THREE.BufferAttribute',
			test: () => {
				// Test both ways to create buffer attributes
				try {
					if (typeof THREE.Float32BufferAttribute === 'function') {
						const attr = new THREE.Float32BufferAttribute([1, 2, 3], 1);
						logTest('THREE.Float32BufferAttribute is available', 'pass');
					} else if (typeof THREE.BufferAttribute === 'function') {
						const attr = new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 1);
						logTest('THREE.BufferAttribute is available (using Float32Array)', 'pass');
					} else {
						throw new Error('Neither BufferAttribute nor Float32BufferAttribute available');
					}
					return true;
				} catch (e) {
					throw new Error(`Buffer attribute test failed: ${e.message}`);
				}
			}
		},
		{
			name: 'OrbitControls',
			test: () => {
				if (typeof THREE.OrbitControls === 'function') {
					logTest('THREE.OrbitControls is available as direct property', 'pass');
					return true;
				} else if (typeof OrbitControls === 'function') {
					logTest('OrbitControls is available globally', 'pass');
					return true;
				} else {
					throw new Error('OrbitControls is not available');
				}
			}
		}
	];
	
	// Run all tests
	let passedCount = 0;
	tests.forEach(test => {
		try {
			if (test.test()) passedCount++;
		} catch (e) {
			logTest(`Test "${test.name}" failed: ${e.message}`, 'fail');
		}
	});
	
	return passedCount === tests.length;
}

// Test module imports
function testModuleImports() {
	const moduleTests = [
		{ 
			name: 'Import test module',
			test: async () => {
				try {
					const testModule = await import('./rendering/test.js');
					if (!testModule) throw new Error('Module import returned null/undefined');
					if (typeof testModule.init !== 'function') throw new Error('Module does not export init function');
					logTest('Test module imported successfully', 'pass');
					return true;
				} catch (e) {
					throw new Error(`Module import error: ${e.message}`);
				}
			}
		},
		{
			name: 'Import core renderer',
			test: async () => {
				try {
					const coreModule = await import('./rendering/modules/core.js');
					if (!coreModule) throw new Error('Core module import returned null/undefined');
					if (typeof coreModule.init !== 'function') throw new Error('Core module does not export init function');
					logTest('Core renderer module imported successfully', 'pass');
					return true;
				} catch (e) {
					throw new Error(`Core module import error: ${e.message}`);
				}
			}
		},
		{
			name: 'Import effects module',
			test: async () => {
				try {
					const effectsModule = await import('./rendering/modules/effects.js');
					if (!effectsModule) throw new Error('Effects module import returned null/undefined');
					if (typeof effectsModule.createSkybox !== 'function') {
						throw new Error('Effects module does not export createSkybox function');
					}
					logTest('Effects module imported successfully', 'pass');
					return true;
				} catch (e) {
					throw new Error(`Effects module import error: ${e.message}`);
				}
			}
		}
	];
	
	// Run all module tests
	return Promise.all(moduleTests.map(async test => {
		try {
			return await test.test();
		} catch (e) {
			logTest(`Test "${test.name}" failed: ${e.message}`, 'fail');
			return false;
		}
	}));
}

// Run a comprehensive renderer test
async function runAutomatedTests() {
	try {
		logTest('Starting automated renderer tests', 'info');
		
		// Test THREE.js dependencies
		logTest('Testing THREE.js dependencies', 'info');
		const threeDepsOk = testThreeDependencies();
		if (!threeDepsOk) {
			logTest('THREE.js dependency tests failed, some features may not work', 'warn');
		}
		
		// Test module imports
		logTest('Testing module imports', 'info');
		await testModuleImports();
		
		// Try to initialize the renderer directly
		try {
			logTest('Testing direct initialization of renderer', 'info');
			
			// Get game container
			const container = document.getElementById('game-container');
			if (!container) throw new Error('Game container element not found');
			
			// Import renderer
			const { init } = await import('./rendering/index.js');
			if (typeof init !== 'function') throw new Error('Renderer index does not export init function');
			
			// Initialize with test options
			const initResult = init(container, {
				debug: true,
				enableSkybox: true,
				enableClouds: true,
				enableEffects: true,
				useTestMode: true
			});
			
			if (initResult) {
				logTest('Renderer initialized successfully', 'pass');
			} else {
				throw new Error('Renderer initialization returned false');
			}
		} catch (error) {
			logTest(`Direct renderer initialization failed: ${error.message}`, 'fail');
			
			// Fall back to the test module
			try {
				const { init } = await import('./rendering/test.js');
				if (typeof init === 'function') {
					logTest('Falling back to test module', 'warn');
					init();
				}
			} catch (testError) {
				logTest(`Test module fallback also failed: ${testError.message}`, 'fail');
			}
		}
		
		// Summarize test results
		const total = testResults.passed.length + testResults.failed.length;
		const passRate = Math.round((testResults.passed.length / total) * 100);
		
		logTest(`Test summary: ${testResults.passed.length}/${total} tests passed (${passRate}%)`, 'info');
		
		return testResults;
	} catch (error) {
		logTest(`Fatal test error: ${error.message}`, 'fail');
		console.error('Test error:', error);
		return testResults;
	}
}

// Get formatted test results for clipboard
function getFormattedTestResults() {
	// Create a summary section
	const summary = `Test Results
Test Summary
Passed: ${testResults.passed.length}
Failed: ${testResults.failed.length}
Warnings: ${testResults.warnings.length}`;

	// Create the log section in reverse chronological order (newest first)
	const logEntries = testResults.log.slice().reverse().map(entry => {
		const time = new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false });
		return `[${time}] ${entry.message}`;
	}).join('\n');

	// Combine summary and log
	return `${summary}
Test Log
${logEntries}`;
}

// Copy test results to clipboard
function copyTestResultsToClipboard() {
	const formattedResults = getFormattedTestResults();
	
	try {
		navigator.clipboard.writeText(formattedResults).then(
			() => {
				console.log('Test results copied to clipboard');
				// Update UI to show success
				const testReport = document.getElementById('test-report');
				if (testReport) {
					const copyMessage = document.createElement('div');
					copyMessage.style.color = 'green';
					copyMessage.style.padding = '10px';
					copyMessage.style.marginTop = '10px';
					copyMessage.textContent = 'Test results copied to clipboard!';
					
					// Remove any existing copy message
					const existingMessage = testReport.querySelector('.copy-message');
					if (existingMessage) {
						testReport.removeChild(existingMessage);
					}
					
					copyMessage.className = 'copy-message';
					testReport.appendChild(copyMessage);
					
					// Remove message after 3 seconds
					setTimeout(() => {
						if (copyMessage.parentNode === testReport) {
							testReport.removeChild(copyMessage);
						}
					}, 3000);
				}
			},
			(err) => {
				console.error('Could not copy results: ', err);
				alert('Failed to copy test results. Please check console for error details.');
			}
		);
	} catch (error) {
		console.error('Error copying to clipboard:', error);
		// Fallback for browsers that don't support clipboard API
		const textarea = document.createElement('textarea');
		textarea.value = formattedResults;
		document.body.appendChild(textarea);
		textarea.select();
		
		try {
			document.execCommand('copy');
			console.log('Test results copied to clipboard (fallback method)');
			alert('Test results copied to clipboard!');
		} catch (e) {
			console.error('Fallback clipboard copy failed:', e);
			alert('Failed to copy results. Please select and copy manually:\n\n' + formattedResults);
		}
		
		document.body.removeChild(textarea);
	}
}

// Capture console output
function setupConsoleCapture() {
	// Store original console methods
	const originalMethods = {
		log: console.log,
		error: console.error,
		warn: console.warn,
		info: console.info
	};
	
	// Flag to prevent recursion
	let isCapturing = false;
	
	// Override console methods to capture output
	console.log = function(...args) {
		// Prevent recursion
		if (isCapturing) {
			return originalMethods.log.apply(console, args);
		}
		
		isCapturing = true;
		// Log to the original console
		originalMethods.log.apply(console, args);
		
		// Also log to test results
		try {
			const formattedArgs = args.map(arg => formatArg(arg)).join(' ');
			logTest(`Console.log: ${formattedArgs}`, 'info');
		} catch (e) {
			// If anything goes wrong, don't break the console
			originalMethods.error.apply(console, ['Error in console capture:', e]);
		}
		isCapturing = false;
	};
	
	console.error = function(...args) {
		if (isCapturing) {
			return originalMethods.error.apply(console, args);
		}
		
		isCapturing = true;
		// Log to the original console
		originalMethods.error.apply(console, args);
		
		// Also log to test results
		try {
			const formattedArgs = args.map(arg => formatArg(arg)).join(' ');
			logTest(`Console.error: ${formattedArgs}`, 'fail');
		} catch (e) {
			// If anything goes wrong, don't break the console
			originalMethods.error.apply(console, ['Error in console capture:', e]);
		}
		isCapturing = false;
	};
	
	console.warn = function(...args) {
		if (isCapturing) {
			return originalMethods.warn.apply(console, args);
		}
		
		isCapturing = true;
		// Log to the original console
		originalMethods.warn.apply(console, args);
		
		// Also log to test results
		try {
			const formattedArgs = args.map(arg => formatArg(arg)).join(' ');
			logTest(`Console.warn: ${formattedArgs}`, 'warn');
		} catch (e) {
			// If anything goes wrong, don't break the console
			originalMethods.error.apply(console, ['Error in console capture:', e]);
		}
		isCapturing = false;
	};
	
	console.info = function(...args) {
		if (isCapturing) {
			return originalMethods.info.apply(console, args);
		}
		
		isCapturing = true;
		// Log to the original console
		originalMethods.info.apply(console, args);
		
		// Also log to test results
		try {
			const formattedArgs = args.map(arg => formatArg(arg)).join(' ');
			logTest(`Console.info: ${formattedArgs}`, 'info');
		} catch (e) {
			// If anything goes wrong, don't break the console
			originalMethods.error.apply(console, ['Error in console capture:', e]);
		}
		isCapturing = false;
	};
	
	// Format complex arguments
	function formatArg(arg) {
		if (arg === null) return 'null';
		if (arg === undefined) return 'undefined';
		if (typeof arg === 'object') {
			try {
				return JSON.stringify(arg);
			} catch (e) {
				return '[Object]';
			}
		}
		return String(arg);
	}
	
	// Return function to restore original console
	return function restoreConsole() {
		console.log = originalMethods.log;
		console.error = originalMethods.error;
		console.warn = originalMethods.warn;
		console.info = originalMethods.info;
	};
}

// Export test utilities
export { 
	runAutomatedTests,
	testThreeDependencies,
	testModuleImports,
	testFeature,
	logTest,
	testResults,
	copyTestResultsToClipboard,
	setupConsoleCapture
}; 