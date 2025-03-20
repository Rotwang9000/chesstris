/**
 * Shaktris Debug Helper
 * 
 * Provides debugging tools and utilities for the Shaktris game.
 */

// URL parameter handling
const urlParams = new URLSearchParams(window.location.search);

// Debug settings
const debugSettings = {
    useMinimalCore: urlParams.get('minimal') === 'true' || false,
    showDiagnostics: urlParams.get('diagnostics') === 'true' || false,
    logLevel: urlParams.get('log') || 'info', // 'debug', 'info', 'warn', 'error'
    testRender: urlParams.get('test') === 'true' || false
};

// Original console methods
const originalConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
};

/**
 * Initialize debug tools
 */
export function initDebugTools() {
    // Set up console logging based on log level
    setupConsoleLevels();
    
    // Add debug UI if needed
    if (debugSettings.showDiagnostics) {
        addDebugUI();
    }
    
    // Log debug settings
    console.info('Debug settings:', debugSettings);
    
    return debugSettings;
}

/**
 * Set up console logging based on selected level
 */
function setupConsoleLevels() {
    const levels = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };
    
    const currentLevel = levels[debugSettings.logLevel] || 1;
    
    // Override console methods to respect log level
    if (currentLevel > 0) {
        console.debug = function() {};
    }
    
    if (currentLevel > 1) {
        console.info = function() {};
    }
    
    if (currentLevel > 2) {
        console.warn = function() {};
    }
    
    // Always keep error logs
    console.error = function(...args) {
        originalConsole.error(...args);
        logToDebugUI('error', args);
    };
    
    // Restore needed console methods
    if (currentLevel <= 0) {
        console.debug = function(...args) {
            originalConsole.debug(...args);
            logToDebugUI('debug', args);
        };
    }
    
    if (currentLevel <= 1) {
        console.info = function(...args) {
            originalConsole.info(...args);
            logToDebugUI('info', args);
        };
    }
    
    if (currentLevel <= 2) {
        console.warn = function(...args) {
            originalConsole.warn(...args);
            logToDebugUI('warn', args);
        };
    }
}

/**
 * Add debug UI to the page
 */
function addDebugUI() {
    // Create debug panel
    const debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.style.position = 'fixed';
    debugPanel.style.top = '10px';
    debugPanel.style.right = '10px';
    debugPanel.style.width = '300px';
    debugPanel.style.maxHeight = '80vh';
    debugPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    debugPanel.style.color = '#00ff00';
    debugPanel.style.fontFamily = 'monospace';
    debugPanel.style.fontSize = '12px';
    debugPanel.style.padding = '10px';
    debugPanel.style.borderRadius = '5px';
    debugPanel.style.zIndex = '1000';
    debugPanel.style.overflow = 'auto';
    
    // Add heading
    const heading = document.createElement('h3');
    heading.textContent = 'Shaktris Debug';
    debugPanel.appendChild(heading);
    
    // Add version toggle
    const versionToggle = document.createElement('div');
    versionToggle.innerHTML = `
        <label>
            <input type="checkbox" id="use-minimal" ${debugSettings.useMinimalCore ? 'checked' : ''}>
            Use Minimal Core
        </label>
        <button id="apply-version">Apply</button>
    `;
    debugPanel.appendChild(versionToggle);
    
    // Add log level selector
    const logLevelSelector = document.createElement('div');
    logLevelSelector.innerHTML = `
        <label>
            Log Level:
            <select id="log-level">
                <option value="debug" ${debugSettings.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                <option value="info" ${debugSettings.logLevel === 'info' ? 'selected' : ''}>Info</option>
                <option value="warn" ${debugSettings.logLevel === 'warn' ? 'selected' : ''}>Warn</option>
                <option value="error" ${debugSettings.logLevel === 'error' ? 'selected' : ''}>Error</option>
            </select>
        </label>
        <button id="apply-log-level">Apply</button>
    `;
    debugPanel.appendChild(logLevelSelector);
    
    // Add log output area
    const logOutput = document.createElement('div');
    logOutput.id = 'debug-log';
    logOutput.style.marginTop = '10px';
    logOutput.style.height = '200px';
    logOutput.style.overflow = 'auto';
    logOutput.style.border = '1px solid #333';
    logOutput.style.padding = '5px';
    logOutput.style.fontSize = '11px';
    debugPanel.appendChild(logOutput);
    
    // Add controls
    const controls = document.createElement('div');
    controls.style.marginTop = '10px';
    controls.innerHTML = `
        <button id="clear-log">Clear Log</button>
        <button id="test-render">Test Render</button>
        <button id="toggle-debug">Hide</button>
    `;
    debugPanel.appendChild(controls);
    
    // Add to body
    document.body.appendChild(debugPanel);
    
    // Set up event listeners
    document.getElementById('apply-version').addEventListener('click', () => {
        const useMinimal = document.getElementById('use-minimal').checked;
        window.location.href = `?minimal=${useMinimal}&diagnostics=true&log=${debugSettings.logLevel}`;
    });
    
    document.getElementById('apply-log-level').addEventListener('click', () => {
        const logLevel = document.getElementById('log-level').value;
        window.location.href = `?minimal=${debugSettings.useMinimalCore}&diagnostics=true&log=${logLevel}`;
    });
    
    document.getElementById('clear-log').addEventListener('click', () => {
        document.getElementById('debug-log').innerHTML = '';
    });
    
    document.getElementById('test-render').addEventListener('click', () => {
        window.location.href = `?minimal=${debugSettings.useMinimalCore}&diagnostics=true&log=${debugSettings.logLevel}&test=true`;
    });
    
    document.getElementById('toggle-debug').addEventListener('click', () => {
        const panel = document.getElementById('debug-panel');
        const button = document.getElementById('toggle-debug');
        
        if (panel.style.width === '300px') {
            panel.style.width = '100px';
            panel.style.height = '30px';
            panel.style.overflow = 'hidden';
            button.textContent = 'Show';
        } else {
            panel.style.width = '300px';
            panel.style.height = 'auto';
            panel.style.overflow = 'auto';
            button.textContent = 'Hide';
        }
    });
}

/**
 * Log message to debug UI
 * @param {string} level - Log level
 * @param {Array} args - Log arguments
 */
function logToDebugUI(level, args) {
    const debugLog = document.getElementById('debug-log');
    if (!debugLog) return;
    
    // Format the message
    let message = '';
    
    for (const arg of args) {
        if (typeof arg === 'object') {
            try {
                message += JSON.stringify(arg) + ' ';
            } catch (e) {
                message += arg + ' ';
            }
        } else {
            message += arg + ' ';
        }
    }
    
    // Create log entry
    const entry = document.createElement('div');
    
    // Style based on level
    switch (level) {
        case 'debug':
            entry.style.color = '#aaaaaa';
            break;
        case 'info':
            entry.style.color = '#ffffff';
            break;
        case 'warn':
            entry.style.color = '#ffaa00';
            break;
        case 'error':
            entry.style.color = '#ff5555';
            break;
    }
    
    // Add timestamp
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}][${level}] ${message}`;
    
    // Add to log
    debugLog.appendChild(entry);
    
    // Scroll to bottom
    debugLog.scrollTop = debugLog.scrollHeight;
}

/**
 * Enhance default error page with debug options
 * @param {HTMLElement} errorElement - Error element
 * @param {string} message - Error message
 */
export function enhanceErrorPage(errorElement, message) {
    if (!errorElement) return;
    
    // Add debug options to error page
    let content = `
        <h3>Error</h3>
        <p>${message}</p>
        <div style="margin-top: 20px;">
            <a href="?minimal=true&diagnostics=true">Try with Minimal Core</a>
            <a href="?minimal=true&diagnostics=true&test=true">Run Render Test</a>
            <a href="minimal.html">Go to Minimal Page</a>
        </div>
        <button onclick="window.location.reload()">Reload</button>
    `;
    
    errorElement.innerHTML = content;
}

/**
 * Get module path based on debug settings
 * @returns {string} Module path
 */
export function getModulePath() {
    if (debugSettings.useMinimalCore) {
        return './js/minimal-gameCore.js';
    } else {
        return './js/main.js';
    }
}
