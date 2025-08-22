#!/bin/bash

# Simple test script for single-line vs multi-line commands

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to log with colors
log() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to execute command via MCP
execute_command() {
    local command="$1"
    local description="$2"
    
    log $CYAN "\n🧪 Testing: $description"
    log $BLUE "Command: $command"
    
    # Create JSON input
    local json_input=$(cat <<EOF
{
    "paneId": "%0",
    "command": "$command",
    "timeout": 5000
}
EOF
)
    
    # Execute via MCP
    local result=$(echo "$json_input" | node build/index.js execute-command 2>/dev/null)
    
    # Parse result (simple check)
    if echo "$result" | grep -q '"status":"completed"'; then
        log $GREEN "✅ SUCCESS"
        # Extract output
        local output=$(echo "$result" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
        log $GREEN "Output: $output"
    elif echo "$result" | grep -q '"status":"timeout"'; then
        log $YELLOW "⏰ TIMEOUT"
        local output=$(echo "$result" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
        log $YELLOW "Partial output: $output"
    else
        log $RED "❌ FAILED"
        log $RED "Result: $result"
    fi
    
    sleep 0.5
}

# Test single-line commands
test_single_line() {
    log $CYAN "\n📝 SINGLE-LINE COMMANDS"
    echo "========================================"
    
    execute_command "echo \"Hello World\"" "Simple echo"
    execute_command "pwd" "Print working directory"
    execute_command "date" "Current date"
    execute_command "whoami" "Current user"
    execute_command "ls -la" "List files"
    execute_command "echo \$SHELL" "Show shell"
}

# Test multi-line commands
test_multi_line() {
    log $CYAN "\n📄 MULTI-LINE COMMANDS"
    echo "========================================"
    
    # For loop
    execute_command "for i in 1 2 3; do
  echo \"Number: \$i\"
done" "Simple for loop"
    
    # If statement
    execute_command "if [ -d \"/tmp\" ]; then
  echo \"Temp directory exists\"
else
  echo \"No temp directory\"
fi" "If statement"
    
    # Heredoc
    execute_command "cat << EOF
This is a heredoc
with multiple lines
and some content
EOF" "Heredoc"
    
    # Function
    execute_command "function test_func() {
  echo \"Inside function\"
  return 0
}
test_func" "Function definition and call"
    
    # Variables
    execute_command "VAR=\"test value\"
echo \"Variable: \$VAR\"
unset VAR
echo \"After unset: \$VAR\"" "Variable operations"
}

# Test edge cases
test_edge_cases() {
    log $CYAN "\n🔥 EDGE CASES"
    echo "========================================"
    
    execute_command "sleep 2 && echo \"After sleep\"" "Command with delay"
    execute_command "echo \"Line 1\" && echo \"Line 2\" && echo \"Line 3\"" "Multiple commands"
    execute_command "ls /nonexistent 2>/dev/null || echo \"Directory not found\"" "Error handling"
    execute_command "echo \"Special chars: !@#\$%^&*()\"" "Special characters"
    execute_command "echo 'Single quotes' && echo \"Double quotes\"" "Quote handling"
}

# Main execution
main() {
    log $CYAN "🚀 Simple Command Tests"
    log $BLUE "Time: $(date)"
    
    # Check if build exists
    if [ ! -f "build/index.js" ]; then
        log $RED "❌ build/index.js not found. Run 'npm run build' first."
        exit 1
    fi
    
    test_single_line
    test_multi_line
    test_edge_cases
    
    log $GREEN "\n🎉 All tests completed!"
}

main "$@"