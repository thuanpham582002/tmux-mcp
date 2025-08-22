#!/usr/bin/env node

/**
 * Advanced test script for tmux hierarchy functionality
 * Tests: get-hierarchy, session management, window/pane relationships
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_SESSION_NAME = 'tmux-test-hierarchy';
const TEST_WINDOWS = [
  { name: 'main', command: 'echo "Main window"' },
  { name: 'dev', command: 'echo "Development window"' },
  { name: 'logs', command: 'tail -f /var/log/system.log || echo "No log file"' }
];

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
  log(`\n🔹 Step ${step}: ${description}`, 'cyan');
  log('─'.repeat(60), 'blue');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Execute tmux command
async function executeTmux(command) {
  return new Promise((resolve, reject) => {
    const tmuxProcess = spawn('tmux', command.split(' '), {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    tmuxProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    tmuxProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    tmuxProcess.on('close', (code) => {
      if (code !== 0) {
        // Some tmux commands return non-zero but are not errors
        if (!stderr.includes('session not found') && !stderr.includes('no server running')) {
          reject(new Error(`tmux: ${stderr || 'Unknown error'}`));
          return;
        }
      }
      resolve(stdout.trim());
    });

    setTimeout(() => {
      tmuxProcess.kill();
      reject(new Error('tmux command timed out'));
    }, 5000);
  });
}

// Execute MCP tool
async function executeMCP(tool, params = {}) {
  return new Promise((resolve, reject) => {
    const mcpProcess = spawn('node', ['build/index.js', tool], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    if (Object.keys(params).length > 0) {
      mcpProcess.stdin.write(JSON.stringify(params));
    }
    mcpProcess.stdin.end();

    let stdout = '';
    let stderr = '';

    mcpProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcpProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcpProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`MCP tool failed: ${stderr}`));
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const result = JSON.parse(lastLine);
        resolve(result);
      } catch (error) {
        resolve({ output: stdout.trim() });
      }
    });

    setTimeout(() => {
      mcpProcess.kill();
      reject(new Error('MCP tool timed out'));
    }, 10000);
  });
}

// Setup test environment
async function setupTestEnvironment() {
  logStep(1, 'Setting up test environment');
  
  try {
    // Kill existing test session if it exists
    try {
      await executeTmux(`kill-session -t ${TEST_SESSION_NAME}`);
      logInfo('Cleaned up existing test session');
    } catch (error) {
      // Session doesn't exist, that's fine
    }

    // Create new test session
    await executeTmux(`new-session -d -s ${TEST_SESSION_NAME}`);
    logSuccess(`Created test session: ${TEST_SESSION_NAME}`);

    // Create additional windows
    for (let i = 0; i < TEST_WINDOWS.length; i++) {
      const window = TEST_WINDOWS[i];
      if (i === 0) {
        // Rename first window
        await executeTmux(`rename-window -t ${TEST_SESSION_NAME}:0 ${window.name}`);
      } else {
        // Create new windows
        await executeTmux(`new-window -t ${TEST_SESSION_NAME} -n ${window.name}`);
      }
      
      // Send command to window
      await executeTmux(`send-keys -t ${TEST_SESSION_NAME}:${window.name} '${window.command}' Enter`);
      logInfo(`Created window: ${window.name}`);
    }

    // Create split panes in main window
    await executeTmux(`split-window -t ${TEST_SESSION_NAME}:main -h`);
    await executeTmux(`split-window -t ${TEST_SESSION_NAME}:main -v`);
    await executeTmux(`send-keys -t ${TEST_SESSION_NAME}:main.1 'echo "Right pane"' Enter`);
    await executeTmux(`send-keys -t ${TEST_SESSION_NAME}:main.2 'echo "Bottom pane"' Enter`);
    logInfo('Created split panes in main window');

    // Wait for commands to execute
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logSuccess('Test environment setup complete');
    
  } catch (error) {
    logError(`Failed to setup test environment: ${error.message}`);
    throw error;
  }
}

// Test hierarchy retrieval
async function testHierarchyRetrieval() {
  logStep(2, 'Testing hierarchy retrieval');
  
  try {
    const hierarchy = await executeMCP('get-hierarchy');
    
    if (!hierarchy || !hierarchy.sessions) {
      logError('No hierarchy data received');
      return false;
    }

    logSuccess(`Retrieved hierarchy with ${hierarchy.sessions.length} session(s)`);
    
    // Find our test session
    const testSession = hierarchy.sessions.find(s => s.name === TEST_SESSION_NAME);
    if (!testSession) {
      logError(`Test session '${TEST_SESSION_NAME}' not found in hierarchy`);
      return false;
    }

    logSuccess(`Found test session: ${testSession.name} (${testSession.id})`);
    logInfo(`Session windows: ${testSession.windows ? testSession.windows.length : 0}`);
    
    return testSession;
    
  } catch (error) {
    logError(`Failed to retrieve hierarchy: ${error.message}`);
    return false;
  }
}

// Test hierarchy structure
async function testHierarchyStructure(testSession) {
  logStep(3, 'Testing hierarchy structure');
  
  try {
    // Validate session structure
    if (!testSession.windows || testSession.windows.length === 0) {
      logError('Test session has no windows');
      return false;
    }

    logSuccess(`Session has ${testSession.windows.length} windows`);
    
    // Check each window
    let totalPanes = 0;
    for (const window of testSession.windows) {
      logInfo(`Window: ${window.name} (${window.id}) - Index: ${window.index}`);
      
      if (!window.panes || window.panes.length === 0) {
        logWarning(`Window ${window.name} has no panes`);
        continue;
      }
      
      logInfo(`  Panes: ${window.panes.length}`);
      totalPanes += window.panes.length;
      
      // Check pane structure
      for (const pane of window.panes) {
        logInfo(`    Pane ${pane.id}: ${pane.width}x${pane.height} (Active: ${pane.active})`);
        if (pane.currentPath) {
          logInfo(`      Path: ${pane.currentPath}`);
        }
        if (pane.currentCommand) {
          logInfo(`      Command: ${pane.currentCommand}`);
        }
      }
    }
    
    logSuccess(`Total panes across all windows: ${totalPanes}`);
    
    // Verify expected structure
    const expectedWindows = TEST_WINDOWS.length;
    if (testSession.windows.length === expectedWindows) {
      logSuccess(`✓ Window count matches expected (${expectedWindows})`);
    } else {
      logWarning(`Window count mismatch: expected ${expectedWindows}, got ${testSession.windows.length}`);
    }
    
    // Check for main window with multiple panes
    const mainWindow = testSession.windows.find(w => w.name === 'main');
    if (mainWindow && mainWindow.panes && mainWindow.panes.length >= 3) {
      logSuccess(`✓ Main window has multiple panes (${mainWindow.panes.length})`);
    } else {
      logWarning(`Main window should have 3+ panes, found ${mainWindow ? mainWindow.panes?.length || 0 : 0}`);
    }
    
    return true;
    
  } catch (error) {
    logError(`Failed to test hierarchy structure: ${error.message}`);
    return false;
  }
}

// Test hierarchy data quality
async function testHierarchyDataQuality(testSession) {
  logStep(4, 'Testing hierarchy data quality');
  
  try {
    let issues = 0;
    
    // Check session data completeness
    const sessionFields = ['id', 'name', 'created', 'attached'];
    for (const field of sessionFields) {
      if (testSession[field] === undefined || testSession[field] === null) {
        logWarning(`Session missing field: ${field}`);
        issues++;
      }
    }
    
    // Check windows data completeness
    for (const window of testSession.windows) {
      const windowFields = ['id', 'name', 'index', 'active', 'layout'];
      for (const field of windowFields) {
        if (window[field] === undefined || window[field] === null) {
          logWarning(`Window ${window.name} missing field: ${field}`);
          issues++;
        }
      }
      
      // Check panes data completeness
      if (window.panes) {
        for (const pane of window.panes) {
          const paneFields = ['id', 'index', 'active', 'width', 'height'];
          for (const field of paneFields) {
            if (pane[field] === undefined || pane[field] === null) {
              logWarning(`Pane ${pane.id} missing field: ${field}`);
              issues++;
            }
          }
          
          // Validate pane dimensions
          if (pane.width <= 0 || pane.height <= 0) {
            logWarning(`Pane ${pane.id} has invalid dimensions: ${pane.width}x${pane.height}`);
            issues++;
          }
        }
      }
    }
    
    if (issues === 0) {
      logSuccess('✓ All hierarchy data fields are complete and valid');
    } else {
      logWarning(`Found ${issues} data quality issues`);
    }
    
    // Check active states consistency
    const activeWindows = testSession.windows.filter(w => w.active);
    if (activeWindows.length === 1) {
      logSuccess('✓ Exactly one active window found');
    } else {
      logWarning(`Expected 1 active window, found ${activeWindows.length}`);
      issues++;
    }
    
    // Check active panes
    const activePanes = testSession.windows.flatMap(w => 
      w.panes ? w.panes.filter(p => p.active) : []
    );
    if (activePanes.length === 1) {
      logSuccess('✓ Exactly one active pane found');
    } else {
      logWarning(`Expected 1 active pane, found ${activePanes.length}`);
      issues++;
    }
    
    return issues === 0;
    
  } catch (error) {
    logError(`Failed to test data quality: ${error.message}`);
    return false;
  }
}

// Test hierarchy performance
async function testHierarchyPerformance() {
  logStep(5, 'Testing hierarchy performance');
  
  try {
    const iterations = 5;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await executeMCP('get-hierarchy');
      const endTime = Date.now();
      const duration = endTime - startTime;
      times.push(duration);
      logInfo(`Iteration ${i + 1}: ${duration}ms`);
    }
    
    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    logSuccess(`Performance results:`);
    log(`  Average: ${avgTime.toFixed(1)}ms`);
    log(`  Min:     ${minTime}ms`);
    log(`  Max:     ${maxTime}ms`);
    
    if (avgTime < 1000) {
      logSuccess('✓ Performance is good (< 1 second average)');
    } else if (avgTime < 3000) {
      logWarning('⚠ Performance is acceptable (< 3 seconds average)');
    } else {
      logError('✗ Performance is poor (> 3 seconds average)');
    }
    
    return avgTime < 3000;
    
  } catch (error) {
    logError(`Failed to test performance: ${error.message}`);
    return false;
  }
}

// Test hierarchy comparison with native tmux
async function testHierarchyComparison() {
  logStep(6, 'Comparing hierarchy with native tmux commands');
  
  try {
    // Get MCP hierarchy
    const mcpHierarchy = await executeMCP('get-hierarchy');
    const testSession = mcpHierarchy.sessions.find(s => s.name === TEST_SESSION_NAME);
    
    // Get native tmux data
    const tmuxSessions = await executeTmux('list-sessions -F "#{session_name}:#{session_id}:#{session_windows}"');
    const tmuxWindows = await executeTmux(`list-windows -t ${TEST_SESSION_NAME} -F "#{window_index}:#{window_name}:#{window_id}:#{window_active}"`);
    const tmuxPanes = await executeTmux(`list-panes -t ${TEST_SESSION_NAME} -a -F "#{window_index}:#{pane_index}:#{pane_id}:#{pane_active}:#{pane_width}:#{pane_height}"`);
    
    // Parse native tmux data
    const nativeSessionData = tmuxSessions.split('\n')[0].split(':');
    const nativeWindowData = tmuxWindows.split('\n').map(line => {
      const [index, name, id, active] = line.split(':');
      return { index: parseInt(index), name, id, active: active === '1' };
    });
    const nativePaneData = tmuxPanes.split('\n').map(line => {
      const [windowIndex, paneIndex, id, active, width, height] = line.split(':');
      return { 
        windowIndex: parseInt(windowIndex), 
        paneIndex: parseInt(paneIndex), 
        id, 
        active: active === '1',
        width: parseInt(width),
        height: parseInt(height)
      };
    });
    
    // Compare data
    logInfo('Comparing session data...');
    if (testSession.name === nativeSessionData[0]) {
      logSuccess('✓ Session name matches');
    } else {
      logError(`✗ Session name mismatch: MCP="${testSession.name}", tmux="${nativeSessionData[0]}"`);
    }
    
    logInfo('Comparing window data...');
    if (testSession.windows.length === nativeWindowData.length) {
      logSuccess(`✓ Window count matches (${testSession.windows.length})`);
    } else {
      logError(`✗ Window count mismatch: MCP=${testSession.windows.length}, tmux=${nativeWindowData.length}`);
    }
    
    logInfo('Comparing pane data...');
    const mcpPaneCount = testSession.windows.reduce((sum, w) => sum + (w.panes ? w.panes.length : 0), 0);
    if (mcpPaneCount === nativePaneData.length) {
      logSuccess(`✓ Pane count matches (${mcpPaneCount})`);
    } else {
      logError(`✗ Pane count mismatch: MCP=${mcpPaneCount}, tmux=${nativePaneData.length}`);
    }
    
    return true;
    
  } catch (error) {
    logError(`Failed to compare with native tmux: ${error.message}`);
    return false;
  }
}

// Cleanup test environment
async function cleanupTestEnvironment() {
  logStep(7, 'Cleaning up test environment');
  
  try {
    await executeTmux(`kill-session -t ${TEST_SESSION_NAME}`);
    logSuccess('Test environment cleaned up');
  } catch (error) {
    logWarning(`Cleanup warning: ${error.message}`);
  }
}

// Main test execution
async function runHierarchyTests() {
  log('🏗️  Advanced Tmux Hierarchy Tests', 'bright');
  log('═'.repeat(60), 'blue');
  log(`Time: ${new Date().toLocaleString()}`, 'white');
  
  const results = {
    setup: false,
    retrieval: false,
    structure: false,
    dataQuality: false,
    performance: false,
    comparison: false
  };
  
  try {
    // Run all tests
    await setupTestEnvironment();
    results.setup = true;
    
    const testSession = await testHierarchyRetrieval();
    results.retrieval = !!testSession;
    
    if (testSession) {
      results.structure = await testHierarchyStructure(testSession);
      results.dataQuality = await testHierarchyDataQuality(testSession);
    }
    
    results.performance = await testHierarchyPerformance();
    results.comparison = await testHierarchyComparison();
    
  } catch (error) {
    logError(`Test execution failed: ${error.message}`);
  } finally {
    await cleanupTestEnvironment();
  }
  
  // Display results summary
  log('\n📊 Test Results Summary', 'bright');
  log('═'.repeat(40), 'blue');
  
  const testNames = {
    setup: 'Environment Setup',
    retrieval: 'Hierarchy Retrieval',
    structure: 'Structure Validation',
    dataQuality: 'Data Quality',
    performance: 'Performance',
    comparison: 'Native Comparison'
  };
  
  let passedTests = 0;
  const totalTests = Object.keys(results).length;
  
  for (const [key, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    log(`${status} ${testNames[key]}`, passed ? 'green' : 'red');
    if (passed) passedTests++;
  }
  
  log('─'.repeat(40), 'blue');
  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  log(`Overall: ${passedTests}/${totalTests} tests passed (${successRate}%)`, 
      successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red');
  
  if (successRate >= 80) {
    log('🎉 Hierarchy functionality is working well!', 'green');
  } else if (successRate >= 50) {
    log('⚠️  Hierarchy functionality has some issues', 'yellow');
  } else {
    log('🚨 Hierarchy functionality needs attention', 'red');
  }
  
  return successRate >= 50;
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  log('Advanced Tmux Hierarchy Test Script', 'bright');
  log('Usage: node test-hierarchy.js [options]');
  log('\nOptions:');
  log('  --help, -h    Show this help message');
  log('  --quick       Run quick tests only (skip performance)');
  log('  --cleanup     Just cleanup test environment');
  process.exit(0);
}

if (args.includes('--cleanup')) {
  cleanupTestEnvironment().then(() => {
    log('✅ Cleanup completed', 'green');
  }).catch(error => {
    logError(`Cleanup failed: ${error.message}`);
  });
} else {
  runHierarchyTests().then((success) => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    logError(`Test execution failed: ${error.message}`);
    process.exit(1);
  });
}