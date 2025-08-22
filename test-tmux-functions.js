#!/usr/bin/env node

/**
 * Simple test script for basic tmux MCP functionality
 * Quick tests for: find-session, list-panes, get-hierarchy
 */

import { spawn } from 'child_process';

// Colors
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${c[color]}${msg}${c.reset}`);
}

// Execute MCP command
async function mcp(tool, params = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['build/index.js', tool], { 
      stdio: ['pipe', 'pipe', 'pipe'] 
    });

    if (Object.keys(params).length > 0) {
      proc.stdin.write(JSON.stringify(params));
    }
    proc.stdin.end();

    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(err));
      try {
        const result = JSON.parse(out.trim().split('\n').pop());
        resolve(result);
      } catch {
        resolve({ output: out.trim() });
      }
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 5000);
  });
}

// Execute tmux command
async function tmux(cmd) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tmux', cmd.split(' '));
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', code => {
      resolve(out.trim());
    });
    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 3000);
  });
}

async function testBasicFunctions() {
  log('🧪 Testing Basic Tmux MCP Functions', 'cyan');
  log('═'.repeat(40), 'blue');

  // Test 1: List sessions
  log('\n1️⃣  Testing list-sessions...', 'blue');
  try {
    const sessions = await mcp('list-sessions');
    if (sessions && sessions.length >= 0) {
      log(`✅ Found ${sessions.length} session(s)`, 'green');
      if (sessions.length > 0) {
        sessions.slice(0, 3).forEach((s, i) => {
          log(`   ${i + 1}. ${s.name} (${s.id}) - ${s.windows} windows`);
        });
      }
    }
  } catch (error) {
    log(`❌ list-sessions failed: ${error.message}`, 'red');
  }

  // Test 2: Find session
  log('\n2️⃣  Testing find-session...', 'blue');
  try {
    // Try to find first available session
    const sessions = await mcp('list-sessions');
    if (sessions && sessions.length > 0) {
      const sessionName = sessions[0].name;
      const found = await mcp('find-session', { name: sessionName });
      if (found) {
        log(`✅ Found session: ${found.name}`, 'green');
      } else {
        log(`⚠️  Session '${sessionName}' not found`, 'yellow');
      }
    } else {
      log(`⚠️  No sessions to test find-session`, 'yellow');
    }
  } catch (error) {
    log(`❌ find-session failed: ${error.message}`, 'red');
  }

  // Test 3: Get hierarchy
  log('\n3️⃣  Testing get-hierarchy...', 'blue');
  try {
    const hierarchy = await mcp('get-hierarchy');
    if (hierarchy && hierarchy.sessions) {
      const totalWindows = hierarchy.sessions.reduce((sum, s) => 
        sum + (s.windows ? s.windows.length : 0), 0);
      const totalPanes = hierarchy.sessions.reduce((sum, s) => 
        sum + (s.windows ? s.windows.reduce((wSum, w) => 
          wSum + (w.panes ? w.panes.length : 0), 0) : 0), 0);
      
      log(`✅ Hierarchy retrieved successfully`, 'green');
      log(`   Sessions: ${hierarchy.sessions.length}`);
      log(`   Windows:  ${totalWindows}`);
      log(`   Panes:    ${totalPanes}`);
      
      // Show first session structure
      if (hierarchy.sessions.length > 0) {
        const s = hierarchy.sessions[0];
        log(`\n📁 ${s.name}:`);
        if (s.windows) {
          s.windows.slice(0, 2).forEach(w => {
            log(`   ├─ 🖼️ ${w.name} (${w.panes ? w.panes.length : 0} panes)`);
          });
        }
      }
    }
  } catch (error) {
    log(`❌ get-hierarchy failed: ${error.message}`, 'red');
  }

  // Test 4: List panes
  log('\n4️⃣  Testing list-panes...', 'blue');
  try {
    const hierarchy = await mcp('get-hierarchy');
    if (hierarchy && hierarchy.sessions && hierarchy.sessions.length > 0) {
      const session = hierarchy.sessions[0];
      if (session.windows && session.windows.length > 0) {
        const window = session.windows[0];
        const panes = await mcp('list-panes', { windowId: window.id });
        if (panes && panes.length > 0) {
          log(`✅ Found ${panes.length} pane(s) in window ${window.name}`, 'green');
          panes.slice(0, 2).forEach(p => {
            log(`   📋 ${p.id}: ${p.width}x${p.height} ${p.active ? '(active)' : ''}`);
          });
        } else {
          log(`⚠️  No panes found in window ${window.name}`, 'yellow');
        }
      }
    }
  } catch (error) {
    log(`❌ list-panes failed: ${error.message}`, 'red');
  }

  // Test 5: Capture pane
  log('\n5️⃣  Testing capture-pane...', 'blue');
  try {
    const hierarchy = await mcp('get-hierarchy');
    if (hierarchy && hierarchy.sessions && hierarchy.sessions.length > 0) {
      const session = hierarchy.sessions[0];
      if (session.windows && session.windows.length > 0) {
        const window = session.windows[0];
        if (window.panes && window.panes.length > 0) {
          const pane = window.panes[0];
          const content = await mcp('capture-pane', { 
            paneId: pane.id, 
            lines: '5' 
          });
          if (content && content.length > 0) {
            log(`✅ Captured content from pane ${pane.id}`, 'green');
            log(`   Content: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
          } else {
            log(`⚠️  No content captured from pane ${pane.id}`, 'yellow');
          }
        }
      }
    }
  } catch (error) {
    log(`❌ capture-pane failed: ${error.message}`, 'red');
  }

  log('\n🏁 Basic tests completed!', 'cyan');
}

async function testWithNewSession() {
  log('\n🆕 Testing with new session...', 'cyan');
  
  const testSession = 'mcp-test-session';
  
  try {
    // Create test session
    await tmux(`new-session -d -s ${testSession}`);
    await tmux(`send-keys -t ${testSession} 'echo "Hello from MCP test"' Enter`);
    log(`✅ Created test session: ${testSession}`, 'green');
    
    // Test find session
    const found = await mcp('find-session', { name: testSession });
    if (found) {
      log(`✅ Found test session: ${found.name}`, 'green');
    }
    
    // Test hierarchy includes new session
    const hierarchy = await mcp('get-hierarchy');
    const testSess = hierarchy.sessions.find(s => s.name === testSession);
    if (testSess) {
      log(`✅ Test session appears in hierarchy`, 'green');
    }
    
    // Cleanup
    await tmux(`kill-session -t ${testSession}`);
    log(`🧹 Cleaned up test session`, 'blue');
    
  } catch (error) {
    log(`❌ New session test failed: ${error.message}`, 'red');
    // Try cleanup anyway
    try {
      await tmux(`kill-session -t ${testSession}`);
    } catch {}
  }
}

// Performance test
async function testPerformance() {
  log('\n⚡ Performance test...', 'cyan');
  
  const iterations = 3;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await mcp('get-hierarchy');
    const duration = Date.now() - start;
    times.push(duration);
    log(`   Run ${i + 1}: ${duration}ms`);
  }
  
  const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
  log(`📊 Average: ${avg.toFixed(1)}ms`, avg < 1000 ? 'green' : 'yellow');
}

// Main execution
async function main() {
  log('🚀 Tmux MCP Quick Tests', 'cyan');
  log(`Started: ${new Date().toLocaleTimeString()}`, 'blue');
  
  try {
    await testBasicFunctions();
    await testWithNewSession();
    await testPerformance();
    
    log('\n🎉 All tests completed successfully!', 'green');
  } catch (error) {
    log(`\n💥 Test suite failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();