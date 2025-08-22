#!/bin/bash

echo "🔨 Building project..."
npm run build

echo ""
echo "🧪 Testing hierarchy..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get-hierarchy","arguments":{}}}' | node build/index.js

echo ""
echo "🧪 Testing list sessions..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list-sessions","arguments":{}}}' | node build/index.js

echo ""
echo "🧪 Testing find session..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find-session","arguments":{"name":"0"}}}' | node build/index.js