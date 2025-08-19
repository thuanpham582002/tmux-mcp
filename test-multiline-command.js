#!/usr/bin/env node

// Test multi-line command via JSON-RPC
const testRequest = {
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "execute-command",
    "arguments": {
      "paneId": "%61",
      "command": "for i in {1..3}; do\n  echo \"Line $i - multi-line test\"\n  sleep 0.3\ndone\necho \"Multi-line completed - $(date)\"",
      "timeout": 8000
    }
  }
};

console.log(JSON.stringify(testRequest));