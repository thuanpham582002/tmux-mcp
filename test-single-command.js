#!/usr/bin/env node

// Test single command via JSON-RPC
const testRequest = {
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "execute-command",
    "arguments": {
      "paneId": "%61",
      "command": "echo 'Single command test - $(date)'",
      "timeout": 5000
    }
  }
};

console.log(JSON.stringify(testRequest));