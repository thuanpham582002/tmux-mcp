#!/usr/bin/env node

/**
 * Test script for tmux pane finding functionality
 * Tests: find-session, list-panes, get-hierarchy
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
  log(`\n${step}. ${description}`, 'cyan');
  log('─'.repeat(50), 'blue');
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

// Execute MCP tool and return parsed result
async function executeMCPTool(tool, params = {}) {
  return new Promise((resolve, reject) => {
    const mcpProcess = spawn('node', ['build/index.js', tool], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    // Send parameters if provided
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
        reject(new Error(`Process exited with code ${code}. stderr: ${stderr}`));
        return;
      }

      try {
        // Try to parse JSON response
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const result = JSON.parse(lastLine);
        resolve({ result, fullOutput: stdout });
      } catch (error) {
        // If not JSON, return raw output
        resolve({ result: stdout.trim(), fullOutput: stdout });
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      mcpProcess.kill();
      reject(new Error('Process timed out'));
    }, 10000);
  });
}

// Execute tmux command
async function executeTmuxCommand(command) {
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
        reject(new Error(`tmux command failed: ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });

    setTimeout(() => {
      tmuxProcess.kill();
      reject(new Error('tmux command timed out'));
    }, 5000);
  });
}

async function testFindPane() {
  log('🔍 Testing Tmux Pane Finding Functionality', 'bright');
  log('=' .repeat(60), 'blue');

  try {
    // Step 1: List all tmux sessions
    logStep(1, 'List all tmux sessions');
    try {
      const { result: sessions } = await executeMCPTool('list-sessions');
      if (sessions && sessions.length > 0) {
        logSuccess(`Found ${sessions.length} tmux session(s):`);
        sessions.forEach((session, index) => {
          log(`  ${index + 1}. Session: ${session.name} (ID: ${session.id})`);
          log(`     Windows: ${session.windows}, Created: ${session.created}`);
        });
      } else {
        logWarning('No tmux sessions found');
        log('Creating a test session...');
        await executeTmuxCommand('new-session -d -s test-session');
        logSuccess('Created test session: test-session');
      }
    } catch (error) {
      logError(`Failed to list sessions: ${error.message}`);
    }

    // Step 2: Find specific session
    logStep(2, 'Find specific session by name');
    try {
      const { result: session } = await executeMCPTool('find-session', { name: 'test-session' });
      if (session) {
        logSuccess(`Found session: ${session.name}`);
        log(`  ID: ${session.id}`);
        log(`  Windows: ${session.windows}`);
        log(`  Created: ${session.created}`);
      } else {
        logWarning('Session "test-session" not found');
      }
    } catch (error) {
      logError(`Failed to find session: ${error.message}`);
    }

    // Step 3: List windows in session
    logStep(3, 'List windows in session');
    try {
      // First get session ID
      const { result: sessions } = await executeMCPTool('list-sessions');
      if (sessions && sessions.length > 0) {
        const sessionId = sessions[0].id;
        const { result: windows } = await executeMCPTool('list-windows', { sessionId });
        
        if (windows && windows.length > 0) {
          logSuccess(`Found ${windows.length} window(s) in session ${sessionId}:`);
          windows.forEach((window, index) => {
            log(`  ${index + 1}. Window: ${window.name} (ID: ${window.id})`);
            log(`     Index: ${window.index}, Active: ${window.active}`);
            if (window.panes) {
              log(`     Panes: ${window.panes}`);
            }
          });
        } else {
          logWarning(`No windows found in session ${sessionId}`);
        }
      }
    } catch (error) {
      logError(`Failed to list windows: ${error.message}`);
    }

    // Step 4: List panes in window
    logStep(4, 'List panes in window');
    try {
      // Get first window ID
      const { result: sessions } = await executeMCPTool('list-sessions');
      if (sessions && sessions.length > 0) {
        const sessionId = sessions[0].id;
        const { result: windows } = await executeMCPTool('list-windows', { sessionId });
        
        if (windows && windows.length > 0) {
          const windowId = windows[0].id;
          const { result: panes } = await executeMCPTool('list-panes', { windowId });
          
          if (panes && panes.length > 0) {
            logSuccess(`Found ${panes.length} pane(s) in window ${windowId}:`);
            panes.forEach((pane, index) => {
              log(`  ${index + 1}. Pane ID: ${pane.id}`);
              log(`     Index: ${pane.index}, Active: ${pane.active}`);
              log(`     Size: ${pane.width}x${pane.height}`);
              log(`     Current Path: ${pane.currentPath || 'unknown'}`);
              if (pane.currentCommand) {
                log(`     Command: ${pane.currentCommand}`);
              }
            });
          } else {
            logWarning(`No panes found in window ${windowId}`);
          }
        }
      }
    } catch (error) {
      logError(`Failed to list panes: ${error.message}`);
    }

    // Step 5: Test pane content capture
    logStep(5, 'Test pane content capture');
    try {
      const { result: sessions } = await executeMCPTool('list-sessions');
      if (sessions && sessions.length > 0) {
        const sessionId = sessions[0].id;
        const { result: windows } = await executeMCPTool('list-windows', { sessionId });
        
        if (windows && windows.length > 0) {
          const windowId = windows[0].id;
          const { result: panes } = await executeMCPTool('list-panes', { windowId });
          
          if (panes && panes.length > 0) {
            const paneId = panes[0].id;
            const { result: content } = await executeMCPTool('capture-pane', { 
              paneId, 
              lines: '10' 
            });
            
            if (content) {
              logSuccess(`Captured content from pane ${paneId}:`);
              log('─'.repeat(40));
              log(content);
              log('─'.repeat(40));
            } else {
              logWarning(`No content captured from pane ${paneId}`);
            }
          }
        }
      }
    } catch (error) {
      logError(`Failed to capture pane content: ${error.message}`);
    }

  } catch (error) {
    logError(`Test failed: ${error.message}`);
  }
}

async function testHierarchy() {
  log('\n📊 Testing Tmux Hierarchy Functionality', 'bright');
  log('=' .repeat(60), 'blue');

  try {
    // Step 1: Get complete hierarchy
    logStep(1, 'Get complete tmux hierarchy');
    try {
      const { result: hierarchy } = await executeMCPTool('get-hierarchy');
      
      if (hierarchy && hierarchy.sessions) {
        logSuccess(`Complete tmux hierarchy retrieved:`);
        log(`Total sessions: ${hierarchy.sessions.length}`);
        
        hierarchy.sessions.forEach((session, sessionIndex) => {
          log(`\n📁 Session ${sessionIndex + 1}: ${session.name} (${session.id})`, 'magenta');
          log(`   Created: ${session.created || 'unknown'}`);
          log(`   Attached: ${session.attached ? 'Yes' : 'No'}`);
          
          if (session.windows && session.windows.length > 0) {
            log(`   Windows: ${session.windows.length}`);
            
            session.windows.forEach((window, windowIndex) => {
              log(`   ├─ 🖼️  Window ${windowIndex + 1}: ${window.name} (${window.id})`, 'blue');
              log(`   │   Index: ${window.index}, Active: ${window.active ? 'Yes' : 'No'}`);
              log(`   │   Layout: ${window.layout || 'unknown'}`);
              
              if (window.panes && window.panes.length > 0) {
                log(`   │   Panes: ${window.panes.length}`);
                
                window.panes.forEach((pane, paneIndex) => {
                  const isLast = paneIndex === window.panes.length - 1;
                  const prefix = isLast ? '   └─' : '   ├─';
                  
                  log(`${prefix} 📋 Pane ${paneIndex + 1}: ${pane.id}`, 'green');
                  log(`   ${isLast ? '    ' : '│   '}   Size: ${pane.width}x${pane.height}`);
                  log(`   ${isLast ? '    ' : '│   '}   Active: ${pane.active ? 'Yes' : 'No'}`);
                  
                  if (pane.currentPath) {
                    log(`   ${isLast ? '    ' : '│   '}   Path: ${pane.currentPath}`);
                  }
                  
                  if (pane.currentCommand) {
                    log(`   ${isLast ? '    ' : '│   '}   Command: ${pane.currentCommand}`);
                  }
                  
                  if (pane.processInfo) {
                    log(`   ${isLast ? '    ' : '│   '}   Process: ${pane.processInfo}`);
                  }
                });
              } else {
                log(`   │   No panes found`);
              }
            });
          } else {
            log(`   No windows found`);
          }
        });
        
        // Summary statistics
        const totalWindows = hierarchy.sessions.reduce((sum, session) => 
          sum + (session.windows ? session.windows.length : 0), 0);
        const totalPanes = hierarchy.sessions.reduce((sum, session) => 
          sum + (session.windows ? session.windows.reduce((wSum, window) => 
            wSum + (window.panes ? window.panes.length : 0), 0) : 0), 0);
        
        log('\n📊 Hierarchy Summary:', 'cyan');
        log(`   Sessions: ${hierarchy.sessions.length}`);
        log(`   Windows:  ${totalWindows}`);
        log(`   Panes:    ${totalPanes}`);
        
      } else {
        logWarning('No hierarchy data returned or malformed response');
      }
    } catch (error) {
      logError(`Failed to get hierarchy: ${error.message}`);
    }

    // Step 2: Test hierarchy filtering and search
    logStep(2, 'Test hierarchy data structure');
    try {
      const { result: hierarchy } = await executeMCPTool('get-hierarchy');
      
      if (hierarchy && hierarchy.sessions) {
        // Find active session
        const activeSession = hierarchy.sessions.find(s => s.attached);
        if (activeSession) {
          logSuccess(`Active session found: ${activeSession.name}`);
        }
        
        // Find active window
        const activeWindows = hierarchy.sessions.flatMap(s => 
          s.windows ? s.windows.filter(w => w.active) : []
        );
        if (activeWindows.length > 0) {
          logSuccess(`Active window(s) found: ${activeWindows.map(w => w.name).join(', ')}`);
        }
        
        // Find active pane
        const activePanes = hierarchy.sessions.flatMap(s => 
          s.windows ? s.windows.flatMap(w => 
            w.panes ? w.panes.filter(p => p.active) : []
          ) : []
        );
        if (activePanes.length > 0) {
          logSuccess(`Active pane(s) found: ${activePanes.map(p => p.id).join(', ')}`);
        }
        
        // Check for processes
        const panesWithProcesses = hierarchy.sessions.flatMap(s => 
          s.windows ? s.windows.flatMap(w => 
            w.panes ? w.panes.filter(p => p.currentCommand && p.currentCommand !== 'bash') : []
          ) : []
        );
        if (panesWithProcesses.length > 0) {
          logSuccess(`Panes with running processes: ${panesWithProcesses.length}`);
          panesWithProcesses.forEach(pane => {
            log(`  • ${pane.id}: ${pane.currentCommand}`);
          });
        }
        
      }
    } catch (error) {
      logError(`Failed to analyze hierarchy: ${error.message}`);
    }

  } catch (error) {
    logError(`Hierarchy test failed: ${error.message}`);
  }
}

// Main test execution
async function runTests() {
  log('🚀 Starting Tmux MCP Tests', 'bright');
  log(`Time: ${new Date().toLocaleString()}`, 'blue');
  
  try {
    await testFindPane();
    await testHierarchy();
    
    log('\n🎉 All tests completed!', 'green');
    
  } catch (error) {
    logError(`Test execution failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  log('Tmux MCP Test Script', 'bright');
  log('Usage: node test-find-pane.js [options]');
  log('\nOptions:');
  log('  --help, -h    Show this help message');
  log('  --pane-only   Run only pane finding tests');
  log('  --hierarchy-only   Run only hierarchy tests');
  process.exit(0);
}

if (args.includes('--pane-only')) {
  testFindPane().catch(error => {
    logError(`Test failed: ${error.message}`);
    process.exit(1);
  });
} else if (args.includes('--hierarchy-only')) {
  testHierarchy().catch(error => {
    logError(`Test failed: ${error.message}`);
    process.exit(1);
  });
} else {
  runTests();
}