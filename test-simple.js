#!/usr/bin/env node

/**
 * Simple test for single-line vs multiple-line commands
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

// Execute command via MCP
async function executeCommand(command, description) {
  return new Promise((resolve, reject) => {
    log(`\n🧪 Testing: ${description}`, 'cyan');
    log(`Command: ${command}`, 'blue');
    
    const proc = spawn('node', ['build/index.js', 'execute-command'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Send command as JSON
    const input = JSON.stringify({
      paneId: '%0', // Use default pane
      command: command,
      timeout: 5000
    });
    
    proc.stdin.write(input);
    proc.stdin.end();

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      try {
        // Parse the JSON result
        const lines = stdout.trim().split('\n');
        const resultLine = lines.find(line => line.startsWith('{') || line.startsWith('['));
        const result = resultLine ? JSON.parse(resultLine) : { output: stdout };
        
        if (result.status === 'completed') {
          log(`✅ SUCCESS`, 'green');
          log(`Output: ${result.result || 'No output'}`, 'green');
        } else if (result.status === 'timeout') {
          log(`⏰ TIMEOUT`, 'yellow');
          log(`Partial output: ${result.result || 'No output'}`, 'yellow');
        } else {
          log(`❌ FAILED: ${result.status}`, 'red');
          log(`Error: ${result.result || stderr}`, 'red');
        }
        
        resolve(result);
      } catch (error) {
        log(`❌ PARSE ERROR: ${error.message}`, 'red');
        log(`Raw output: ${stdout}`, 'red');
        resolve({ status: 'error', result: stdout });
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      proc.kill();
      reject(new Error('Test timeout'));
    }, 10000);
  });
}

async function testSingleLineCommands() {
  log('\n📝 SINGLE-LINE COMMANDS', 'cyan');
  log('=' .repeat(40), 'blue');

  const singleLineTests = [
    { cmd: 'echo "Hello World"', desc: 'Simple echo' },
    { cmd: 'pwd', desc: 'Print working directory' },
    { cmd: 'date', desc: 'Current date' },
    { cmd: 'whoami', desc: 'Current user' },
    { cmd: 'ls -la', desc: 'List files' },
    { cmd: 'echo $SHELL', desc: 'Show shell' }
  ];

  for (const test of singleLineTests) {
    await executeCommand(test.cmd, test.desc);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
  }
}

async function testMultiLineCommands() {
  log('\n📄 MULTI-LINE COMMANDS', 'cyan');
  log('=' .repeat(40), 'blue');

  const multiLineTests = [
    {
      cmd: `for i in 1 2 3; do
  echo "Number: $i"
done`,
      desc: 'Simple for loop'
    },
    {
      cmd: `if [ -d "/tmp" ]; then
  echo "Temp directory exists"
else
  echo "No temp directory"
fi`,
      desc: 'If statement'
    },
    {
      cmd: `cat << EOF
This is a heredoc
with multiple lines
and some content
EOF`,
      desc: 'Heredoc'
    },
    {
      cmd: `function test_func() {
  echo "Inside function"
  return 0
}
test_func`,
      desc: 'Function definition and call'
    },
    {
      cmd: `VAR="test value"
echo "Variable: $VAR"
unset VAR
echo "After unset: $VAR"`,
      desc: 'Variable operations'
    }
  ];

  for (const test of multiLineTests) {
    await executeCommand(test.cmd, test.desc);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay for complex commands
  }
}

async function testEdgeCases() {
  log('\n🔥 EDGE CASES', 'cyan');
  log('=' .repeat(40), 'blue');

  const edgeCaseTests = [
    { cmd: 'sleep 2 && echo "After sleep"', desc: 'Command with delay' },
    { cmd: 'echo "Line 1" && echo "Line 2" && echo "Line 3"', desc: 'Multiple commands' },
    { cmd: 'ls /nonexistent 2>/dev/null || echo "Directory not found"', desc: 'Error handling' },
    { cmd: 'echo "Special chars: !@#$%^&*()"', desc: 'Special characters' },
    { cmd: 'echo \'Single quotes\' && echo "Double quotes"', desc: 'Quote handling' }
  ];

  for (const test of edgeCaseTests) {
    await executeCommand(test.cmd, test.desc);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function main() {
  log('🚀 Simple Command Tests', 'cyan');
  log(`Time: ${new Date().toLocaleTimeString()}`, 'blue');
  
  try {
    await testSingleLineCommands();
    await testMultiLineCommands();
    await testEdgeCases();
    
    log('\n🎉 All tests completed!', 'green');
  } catch (error) {
    log(`\n💥 Test failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();