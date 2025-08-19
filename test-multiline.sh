#!/bin/bash

echo "🔨 Building project..."
npm run build

echo ""
echo "🧪 Testing multi-line command..."
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute-command","arguments":{"paneId":"%61","command":"for i in {1..3}; do\n  echo \"Line $i - multi-line test\"\n  sleep 0.3\ndone\necho \"Multi-line completed - $(date)\"","timeout":8000}}}' | node build/index.js