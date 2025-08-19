#!/bin/bash

echo "🔨 Building project..."
npm run build

echo ""
echo "🧪 Testing single command..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"execute-command","arguments":{"paneId":"%61","command":"echo \"Single command test - $(date)\"","timeout":5000}}}' | node build/index.js