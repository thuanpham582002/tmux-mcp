#!/bin/bash

echo "🔨 Building tmux-mcp project..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else 
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "🧪 Testing single command execution..."
echo "===========================================" 
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"execute-command","arguments":{"paneId":"%61","command":"echo \"Single test - $(date)\"","timeout":5000}}}' | node build/index.js

echo ""
echo ""
echo "🧪 Testing multi-line command execution..."
echo "==========================================="
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute-command","arguments":{"paneId":"%61","command":"for i in {1..3}; do\n  echo \"Line $i - multi-line test\"\n  sleep 0.3\ndone\necho \"Multi-line completed - $(date)\"","timeout":8000}}}' | node build/index.js

echo ""
echo ""
echo "🧪 Testing capture-pane to see current terminal state..."
echo "========================================================"
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"capture-pane","arguments":{"paneId":"%61","lines":"30"}}}' | node build/index.js

echo ""
echo "🎉 All tests completed!"