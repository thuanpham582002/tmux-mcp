# Tmux MCP Server

Model Context Protocol server that enables Claude Desktop to interact with and view tmux session content. This integration allows AI assistants to read from, control, and observe your terminal sessions.

## Features

- List and search tmux sessions
- View and navigate tmux windows and panes
- Capture and expose terminal content from any pane
- Execute commands in tmux panes and retrieve results (use it at your own risk ⚠️)
- Create new tmux sessions and windows

Check out this short video to get excited!

</br>

[![youtube video](http://i.ytimg.com/vi/3W0pqRF1RS0/hqdefault.jpg)](https://www.youtube.com/watch?v=3W0pqRF1RS0)

## Prerequisites

- Node.js
- tmux installed and running

## Usage

### Configure Claude Desktop

Add this MCP server to your Claude Desktop configuration:

```json
"mcpServers": {
  "tmux": {
    "command": "npx",
    "args": ["-y", "tmux-mcp"]
  }
}
```

### MCP server options

You can optionally specify the command line shell you are using, if unspecified it defaults to `bash`

```json
"mcpServers": {
  "tmux": {
    "command": "npx",
    "args": ["-y", "tmux-mcp", "--shell-type=fish"]
  }
}
```

The MCP server needs to know the shell only when executing commands, to properly read its exit status.

## Available Resources

- `tmux://sessions` - List all tmux sessions
- `tmux://pane/{paneId}` - View content of a specific tmux pane
- `tmux://command/{commandId}/result` - Results from executed commands

## Available Tools

### Basic Tools
- `list-sessions` - List all active tmux sessions
- `find-session` - Find a tmux session by name
- `list-windows` - List windows in a tmux session
- `list-panes` - List panes in a tmux window
- `capture-pane` - Capture content from a tmux pane
- `create-session` - Create a new tmux session
- `create-window` - Create a new window in a tmux session
- `split-pane` - Split a tmux pane horizontally or vertically
- `send-keys-raw` - Send raw keys to a tmux pane (advanced)
- `get-hierarchy` - Get complete tmux hierarchy overview

### Command Execution (Original)
- `execute-command` - Execute a command in a tmux pane
- `get-command-result` - Get the result of an executed command

### 🚀 Enhanced Command Execution (NEW!)
- `execute-command-enhanced` - Execute commands with shell detection, trap logic, and cancellation support
- `get-command-status` - Get detailed status of enhanced commands
- `cancel-command` - Cancel running commands
- `list-active-commands` - List all currently running commands
- `list-all-commands` - List complete command history
- `cleanup-commands` - Clean up old command history

> **Enhanced Features**: The new enhanced tools provide better shell detection, proper trap mechanisms, command cancellation, and detailed monitoring. See [ENHANCED_FEATURES.md](./ENHANCED_FEATURES.md) for detailed documentation.

