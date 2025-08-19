#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Start the MCP server
const serverPath = path.join(__dirname, 'build', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Test JSON-RPC request
const testRequest = {
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "execute-command",
    "arguments": {
      "paneId": "%61",
      "command": "echo 'Test without stty - $(date)'",
      "timeout": 3000
    }
  }
};

console.log('Sending test request:', JSON.stringify(testRequest, null, 2));

// Send the request
server.stdin.write(JSON.stringify(testRequest) + '\n');

// Listen for response
server.stdout.on('data', (data) => {
  console.log('Server response:', data.toString());
});

server.stderr.on('data', (data) => {
  console.log('Server error:', data.toString());
});

// Close after 5 seconds
setTimeout(() => {
  server.kill();
  console.log('Test completed');
}, 5000);