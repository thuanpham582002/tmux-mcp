#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as tmux from "./tmux.js";
import * as enhancedExecutor from "./enhanced-executor.js";
import { commandLogger } from "./command-logger.js";

// Create MCP server
const server = new McpServer({
  name: "tmux-context",
  version: "0.1.0"
}, {
  capabilities: {
    resources: {
      subscribe: true,
      listChanged: true
    },
    tools: {
      listChanged: true
    },
    logging: {}
  }
});

// List all tmux sessions - Tool
server.tool(
  "list-sessions",
  "List all active tmux sessions",
  {},
  async () => {
    try {
      const sessions = await tmux.listSessions();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(sessions, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error listing tmux sessions: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Find session by name - Tool
server.tool(
  "find-session",
  "Find a tmux session by name",
  {
    name: z.string().describe("Name of the tmux session to find")
  },
  async ({ name }) => {
    try {
      const session = await tmux.findSessionByName(name);
      return {
        content: [{
          type: "text",
          text: session ? JSON.stringify(session, null, 2) : `Session not found: ${name}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error finding tmux session: ${error}`
        }],
        isError: true
      };
    }
  }
);

// List windows in a session - Tool
server.tool(
  "list-windows",
  "List windows in a tmux session",
  {
    sessionId: z.string().describe("ID of the tmux session")
  },
  async ({ sessionId }) => {
    try {
      const windows = await tmux.listWindows(sessionId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(windows, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error listing windows: ${error}`
        }],
        isError: true
      };
    }
  }
);

// List panes in a window - Tool
server.tool(
  "list-panes",
  "List panes in a tmux window",
  {
    windowId: z.string().describe("ID of the tmux window")
  },
  async ({ windowId }) => {
    try {
      const panes = await tmux.listPanes(windowId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(panes, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error listing panes: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Capture pane content - Tool
server.tool(
  "capture-pane",
  "Capture content from a tmux pane",
  {
    paneId: z.string().describe("ID of the tmux pane"),
    lines: z.string().optional().describe("Number of lines to capture")
  },
  async ({ paneId, lines }) => {
    try {
      // Parse lines parameter if provided
      const linesCount = lines ? parseInt(lines, 10) : undefined;
      const content = await tmux.capturePaneContent(paneId, linesCount);
      return {
        content: [{
          type: "text",
          text: content || "No content captured"
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error capturing pane content: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Create new session - Tool
server.tool(
  "create-session",
  "Create a new tmux session",
  {
    name: z.string().describe("Name for the new tmux session")
  },
  async ({ name }) => {
    try {
      const session = await tmux.createSession(name);
      return {
        content: [{
          type: "text",
          text: session
            ? `Session created: ${JSON.stringify(session, null, 2)}`
            : `Failed to create session: ${name}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error creating session: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Create new window - Tool
server.tool(
  "create-window",
  "Create a new window in a tmux session",
  {
    sessionId: z.string().describe("ID of the tmux session"),
    name: z.string().describe("Name for the new window")
  },
  async ({ sessionId, name }) => {
    try {
      const window = await tmux.createWindow(sessionId, name);
      return {
        content: [{
          type: "text",
          text: window
            ? `Window created: ${JSON.stringify(window, null, 2)}`
            : `Failed to create window: ${name}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error creating window: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Split pane - Tool
server.tool(
  "split-pane",
  "Split a tmux pane horizontally or vertically",
  {
    paneId: z.string().describe("ID of the tmux pane to split"),
    direction: z.enum(["horizontal", "vertical"]).describe("Split direction"),
    percentage: z.number().optional().describe("Percentage of space for new pane (1-99)")
  },
  async ({ paneId, direction, percentage }) => {
    try {
      const newPane = await tmux.splitPane(paneId, direction, percentage);
      return {
        content: [{
          type: "text",
          text: newPane
            ? `Pane split successfully: ${JSON.stringify(newPane, null, 2)}`
            : `Failed to split pane`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error splitting pane: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Execute command in pane - Tool
server.tool(
  "execute-command",
  "Execute a command in a tmux pane and get results. IMPORTANT: Avoid heredoc syntax (cat << EOF) and other multi-line constructs as they conflict with command wrapping. For file writing, prefer: printf 'content\\n' > file, echo statements, or write to temp files instead.",
  {
    paneId: z.string().describe("ID of the tmux pane"),
    command: z.string().describe("Command to execute")
  },
  async ({ paneId, command }) => {
    try {
      const commandId = await tmux.executeCommand(paneId, command);

      // Create the resource URI for this command's results
      const resourceUri = `tmux://command/${commandId}/result`;

      return {
        content: [{
          type: "text",
          text: `Command execution started.\n\nTo get results, subscribe to and read resource: ${resourceUri}\n\nStatus will change from 'pending' to 'completed' or 'error' when finished.`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing command: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Get command result - Tool
server.tool(
  "get-command-result",
  "Get the result of an executed command",
  {
    commandId: z.string().describe("ID of the executed command")
  },
  async ({ commandId }) => {
    try {
      // Check and update command status
      const command = await tmux.checkCommandStatus(commandId);

      if (!command) {
        return {
          content: [{
            type: "text",
            text: `Command not found: ${commandId}`
          }],
          isError: true
        };
      }

      // Format the response based on command status
      let resultText;
      if (command.status === 'pending') {
        resultText = `Command still executing...\nStarted: ${command.startTime.toISOString()}\nCommand: ${command.command}`;
      } else {
        resultText = `Status: ${command.status}\nExit code: ${command.exitCode}\nCommand: ${command.command}\n\n--- Output ---\n${command.result}`;
      }

      return {
        content: [{
          type: "text",
          text: resultText
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error retrieving command result: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Send raw keys - Tool
server.tool(
  "send-keys-raw",
  "Send raw keys to a tmux pane without safety markers. WARNING: This bypasses all safety checks. Use only for sending keystrokes into existing applications or processes (like text editors). For tmux commands or general operations, use the Bash tool instead.",
  {
    paneId: z.string().describe("ID of the tmux pane"),
    keys: z.string().describe("Keys to send (e.g., 'Hello' or 'C-x C-s' for Ctrl+X Ctrl+S)")
  },
  async ({ paneId, keys }) => {
    try {
      await tmux.sendKeysRaw(paneId, keys);
      return {
        content: [{
          type: "text",
          text: `Raw keys sent to pane ${paneId}: ${keys}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error sending raw keys: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Get complete hierarchy - Tool
server.tool(
  "get-hierarchy",
  "Get complete tmux hierarchy showing all sessions, windows, and panes with detailed information including active states, running processes, dimensions, and current paths",
  {},
  async () => {
    try {
      const hierarchy = await tmux.getCompleteHierarchy();
      
      // Format the hierarchy for better readability
      let output = "TMUX HIERARCHY\n==============\n\n";
      
      for (const session of hierarchy) {
        output += `SESSION: ${session.name} (${session.id})${session.attached ? ' [ATTACHED]' : ''}\n`;
        output += `  Created: ${new Date(parseInt(session.created) * 1000).toLocaleString()}\n`;
        output += `  Windows: ${session.windows.length}\n\n`;
        
        for (const window of session.windows) {
          output += `  WINDOW: ${window.name} (${window.id})${window.active ? ' [ACTIVE]' : ''}\n`;
          output += `    Layout: ${window.layout}\n`;
          output += `    Panes: ${window.panes.length}\n\n`;
          
          for (const pane of window.panes) {
            output += `    PANE: ${pane.id}${pane.active ? ' [ACTIVE]' : ''}\n`;
            output += `      Title: ${pane.title}\n`;
            output += `      Command: ${pane.command} (PID: ${pane.pid})\n`;
            output += `      Size: ${pane.width}x${pane.height}\n`;
            output += `      Path: ${pane.currentPath}\n\n`;
          }
        }
      }
      
      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting tmux hierarchy: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Enhanced execute command with better trap logic - Tool
server.tool(
  "execute-command-enhanced",
  "Execute a command with enhanced trap logic, shell detection, and cancellation support. This provides better command completion detection and allows for command cancellation.",
  {
    paneId: z.string().describe("ID of the tmux pane"),
    command: z.string().describe("Command to execute"),
    detectShell: z.boolean().optional().default(true).describe("Whether to detect shell type automatically"),
    timeout: z.number().optional().default(30000).describe("Command timeout in milliseconds"),
    maxRetries: z.number().optional().default(3).describe("Maximum number of retries on failure")
  },
  async ({ paneId, command, detectShell, timeout, maxRetries }) => {
    try {
      const commandId = await enhancedExecutor.executeCommandEnhanced(paneId, command, {
        detectShell,
        timeout,
        maxRetries
      });

      return {
        content: [{
          type: "text",
          text: `Enhanced command execution started.\n\nCommand ID: ${commandId}\n\nUse 'get-command-status' to check progress or 'cancel-command' to stop execution.`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing enhanced command: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Get enhanced command status - Tool
server.tool(
  "get-command-status",
  "Get the status of a command executed with execute-command-enhanced, including detailed execution information and ability to see progress",
  {
    commandId: z.string().describe("ID of the command to check")
  },
  async ({ commandId }) => {
    try {
      const command = enhancedExecutor.getEnhancedCommandStatus(commandId);

      if (!command) {
        return {
          content: [{
            type: "text",
            text: `Command not found: ${commandId}`
          }],
          isError: true
        };
      }

      const duration = command.endTime 
        ? command.endTime.getTime() - command.startTime.getTime()
        : Date.now() - command.startTime.getTime();

      let statusText = `Command Status: ${command.status.toUpperCase()}\n`;
      statusText += `Command: ${command.command}\n`;
      statusText += `Pane ID: ${command.paneId}\n`;
      statusText += `Started: ${command.startTime.toISOString()}\n`;
      statusText += `Duration: ${duration}ms\n`;
      
      if (command.shellType) {
        statusText += `Shell Type: ${command.shellType}\n`;
      }
      
      if (command.currentWorkingDirectory) {
        statusText += `Working Directory: ${command.currentWorkingDirectory}\n`;
      }

      if (command.exitCode !== undefined) {
        statusText += `Exit Code: ${command.exitCode}\n`;
      }

      if (command.retryCount > 0) {
        statusText += `Retry Count: ${command.retryCount}\n`;
      }

      statusText += `Aborted: ${command.aborted}\n`;

      if (command.result) {
        statusText += `\n--- Output ---\n${command.result}`;
      }

      return {
        content: [{
          type: "text",
          text: statusText
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error retrieving command status: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Cancel running command - Tool
server.tool(
  "cancel-command",
  "Cancel a running command that was started with execute-command-enhanced. This will send Ctrl+C to interrupt the command.",
  {
    commandId: z.string().describe("ID of the command to cancel")
  },
  async ({ commandId }) => {
    try {
      const success = await enhancedExecutor.cancelCommand(commandId);

      if (success) {
        return {
          content: [{
            type: "text",
            text: `Command ${commandId} has been cancelled successfully.`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `Failed to cancel command ${commandId}. Command may not exist or may already be completed.`
          }],
          isError: true
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error cancelling command: ${error}`
        }],
        isError: true
      };
    }
  }
);

// List active commands - Tool
server.tool(
  "list-active-commands",
  "List all currently running commands that can be cancelled. Shows command ID, status, and basic information.",
  {},
  async () => {
    try {
      const activeCommands = await enhancedExecutor.listActiveCommands();

      if (activeCommands.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No active commands currently running."
          }]
        };
      }

      let output = "ACTIVE COMMANDS\n===============\n\n";
      
      for (const cmd of activeCommands) {
        const duration = Date.now() - cmd.startTime.getTime();
        output += `Command ID: ${cmd.id}\n`;
        output += `Status: ${cmd.status.toUpperCase()}\n`;
        output += `Command: ${cmd.command}\n`;
        output += `Pane: ${cmd.paneId}\n`;
        output += `Duration: ${duration}ms\n`;
        if (cmd.shellType) output += `Shell: ${cmd.shellType}\n`;
        output += `Started: ${cmd.startTime.toISOString()}\n`;
        output += "\n---\n\n";
      }

      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error listing active commands: ${error}`
        }],
        isError: true
      };
    }
  }
);

// List all commands (including completed) - Tool
server.tool(
  "list-all-commands",
  "List all commands (active and completed) with their status and execution details. Useful for debugging and monitoring command history.",
  {},
  async () => {
    try {
      const allCommands = await enhancedExecutor.listAllCommands();

      if (allCommands.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No commands found in history."
          }]
        };
      }

      let output = "ALL COMMANDS HISTORY\n===================\n\n";
      
      for (const cmd of allCommands) {
        const duration = cmd.endTime 
          ? cmd.endTime.getTime() - cmd.startTime.getTime()
          : Date.now() - cmd.startTime.getTime();
          
        output += `Command ID: ${cmd.id}\n`;
        output += `Status: ${cmd.status.toUpperCase()}\n`;
        output += `Command: ${cmd.command}\n`;
        output += `Pane: ${cmd.paneId}\n`;
        output += `Duration: ${duration}ms\n`;
        if (cmd.shellType) output += `Shell: ${cmd.shellType}\n`;
        if (cmd.exitCode !== undefined) output += `Exit Code: ${cmd.exitCode}\n`;
        output += `Started: ${cmd.startTime.toISOString()}\n`;
        if (cmd.endTime) output += `Ended: ${cmd.endTime.toISOString()}\n`;
        output += `Aborted: ${cmd.aborted}\n`;
        output += "\n---\n\n";
      }

      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error listing all commands: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Cleanup old commands - Tool
server.tool(
  "cleanup-commands",
  "Clean up old completed commands from memory to free up resources. Only affects completed commands older than specified age.",
  {
    maxAgeMinutes: z.number().optional().default(60).describe("Maximum age in minutes for commands to keep")
  },
  async ({ maxAgeMinutes }) => {
    try {
      const beforeCount = (await enhancedExecutor.listAllCommands()).length;
      enhancedExecutor.cleanupOldCommands(maxAgeMinutes);
      const afterCount = (await enhancedExecutor.listAllCommands()).length;
      const cleanedCount = beforeCount - afterCount;

      return {
        content: [{
          type: "text",
          text: `Cleanup completed. Removed ${cleanedCount} old commands. ${afterCount} commands remaining.`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error during cleanup: ${error}`
        }],
        isError: true
      };
    }
  }
);

// Expose tmux session list as a resource
server.resource(
  "Tmux Sessions",
  "tmux://sessions",
  async () => {
    try {
      const sessions = await tmux.listSessions();
      return {
        contents: [{
          uri: "tmux://sessions",
          text: JSON.stringify(sessions.map(session => ({
            id: session.id,
            name: session.name,
            attached: session.attached,
            windows: session.windows
          })), null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: "tmux://sessions",
          text: `Error listing tmux sessions: ${error}`
        }]
      };
    }
  }
);

// Expose pane content as a resource
server.resource(
  "Tmux Pane Content",
  new ResourceTemplate("tmux://pane/{paneId}", {
    list: async () => {
    try {
    // Get all sessions
    const sessions = await tmux.listSessions();
    const paneResources = [];

    // For each session, get all windows
    for (const session of sessions) {
    const windows = await tmux.listWindows(session.id);

    // For each window, get all panes
    for (const window of windows) {
    const panes = await tmux.listPanes(window.id);

    // For each pane, create a resource with descriptive name
    for (const pane of panes) {
    paneResources.push({
      name: `Pane: ${session.name} - ${pane.id} - ${pane.title} ${pane.active ? "(active)" : ""}`,
        uri: `tmux://pane/${pane.id}`,
          description: `Content from pane ${pane.id} - ${pane.title} in session ${session.name}`
          });
         }
     }
     }

    return {
        resources: paneResources
        };
      } catch (error) {
        server.server.sendLoggingMessage({
            level: 'error',
            data: `Error listing panes: ${error}`
        });

        return { resources: [] };
      }
    }
  }),
  async (uri, { paneId }) => {
    try {
      // Ensure paneId is a string
      const paneIdStr = Array.isArray(paneId) ? paneId[0] : paneId;
      const content = await tmux.capturePaneContent(paneIdStr);
      return {
        contents: [{
          uri: uri.href,
          text: content || "No content captured"
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error capturing pane content: ${error}`
        }]
      };
    }
  }
);

// Create dynamic resource for command executions
server.resource(
  "Command Execution Result",
  new ResourceTemplate("tmux://command/{commandId}/result", {
    list: async () => {
      // Only list active commands that aren't too old
      tmux.cleanupOldCommands(10); // Clean commands older than 10 minutes

      const resources = [];
      for (const id of tmux.getActiveCommandIds()) {
        const command = tmux.getCommand(id);
        if (command) {
          resources.push({
            name: `Command: ${command.command.substring(0, 30)}${command.command.length > 30 ? '...' : ''}`,
            uri: `tmux://command/${id}/result`,
            description: `Execution status: ${command.status}`
          });
        }
      }

      return { resources };
    }
  }),
  async (uri, { commandId }) => {
    try {
      // Ensure commandId is a string
      const commandIdStr = Array.isArray(commandId) ? commandId[0] : commandId;

      // Check command status
      const command = await tmux.checkCommandStatus(commandIdStr);

      if (!command) {
        return {
          contents: [{
            uri: uri.href,
            text: `Command not found: ${commandIdStr}`
          }]
        };
      }

      // Format the response based on command status
      let resultText;
      if (command.status === 'pending') {
        resultText = `Command still executing...\nStarted: ${command.startTime.toISOString()}\nCommand: ${command.command}`;
      } else {
        resultText = `Status: ${command.status}\nExit code: ${command.exitCode}\nCommand: ${command.command}\n\n--- Output ---\n${command.result}`;
      }

      return {
        contents: [{
          uri: uri.href,
          text: resultText
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error retrieving command result: ${error}`
        }]
      };
    }
  }
);

/**
 * Show help information
 */
function showHelp() {
  console.log(`
Tmux MCP Server - Enhanced tmux integration with command management

USAGE:
  tmux-mcp [COMMAND] [OPTIONS]

COMMANDS:
  (none)              Start MCP server (default)
  command-running     Show currently running commands
  command-history     Show all commands including completed
  command-cancel ID   Cancel a running command by ID
  command-cleanup     Clean up old command history
  interactive, i      Interactive command management mode
  help, -h, --help    Show this help message

OPTIONS:
  --shell-type, -s    Shell type (bash, zsh, fish, sh) [default: bash]

EXAMPLES:
  tmux-mcp                           # Start MCP server
  tmux-mcp command-running           # Show active commands  
  tmux-mcp command-history           # Show all commands
  tmux-mcp command-cancel abc123     # Cancel command by ID
  tmux-mcp command-cleanup           # Clean old history
  tmux-mcp interactive               # Interactive mode

TMUX INTEGRATION:
  Add to your .tmux.conf:
    bind-key C-m run-shell "tmux split-window -p 30 'tmux-mcp command-running; read'"
    bind-key C-h run-shell "tmux split-window -p 40 'tmux-mcp command-history; read'"
`);
}

/**
 * Handle CLI commands
 */
async function handleCliCommand(command: string, args: string[], options: any) {
  try {
    await commandLogger.initialize();
    
    switch (command) {
      case 'command-running':
        await handleCommandRunning();
        break;
        
      case 'command-history':
        await handleCommandHistory();
        break;
        
      case 'command-cancel':
        await handleCommandCancel(args[0]);
        break;
        
      case 'command-cleanup':
        await handleCommandCleanup();
        break;
        
      case 'command-interactive':
      case 'interactive':
      case 'i':
        await handleInteractiveMode();
        break;
        
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "tmux-mcp help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error executing command: ${error}`);
    process.exit(1);
  }
}

/**
 * Show currently running commands
 */
async function handleCommandRunning() {
  console.log('\x1b[2J\x1b[H'); // Clear screen
  console.log('🏃 TMUX MCP - Active Commands\n');
  
  const output = await commandLogger.getFormattedActiveCommands();
  console.log(output);
  
  const activeCommands = await commandLogger.getActiveCommands();
  const commandIds = Object.keys(activeCommands);
  
  if (commandIds.length > 0) {
    console.log('\nACTIONS:');
    console.log('  Enter command ID to cancel: <ID>');
    console.log('  Press Ctrl+C to exit');
    console.log('  Type "help" for more options');
    
    // Simple interactive mode (only if in a TTY)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
    
    let input = '';
    
    process.stdin.on('data', async (key: string) => {
      if (key === '\u0003') { // Ctrl+C
        console.log('\n\nExiting...');
        process.exit(0);
      } else if (key === '\r' || key === '\n') { // Enter
        if (input.trim() === 'help') {
          console.log('\nCommands:');
          console.log('  <command-id>  Cancel command by ID');
          console.log('  refresh       Refresh command list');
          console.log('  help          Show this help');
          console.log('  exit          Exit this view');
        } else if (input.trim() === 'refresh') {
          await handleCommandRunning();
          return;
        } else if (input.trim() === 'exit') {
          process.exit(0);
        } else if (input.trim()) {
          // Try to cancel command
          await handleCommandCancel(input.trim());
          setTimeout(async () => {
            await handleCommandRunning();
          }, 1000);
          return;
        }
        input = '';
        process.stdout.write('\n> ');
      } else if (key === '\u007f') { // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (key >= ' ') { // Printable characters
        input += key;
        process.stdout.write(key);
      }
    });
    
    process.stdout.write('\n> ');
    } else {
      // Non-interactive mode
      console.log('\nNon-interactive mode - showing commands only');
      process.exit(0);
    }
  } else {
    if (process.stdin.isTTY) {
      console.log('\nPress any key to exit...');
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.exit(0);
      });
    } else {
      console.log('\nNo active commands - exiting');
      process.exit(0);
    }
  }
}

/**
 * Show command history
 */
async function handleCommandHistory() {
  console.log('\x1b[2J\x1b[H'); // Clear screen
  console.log('📜 TMUX MCP - Command History\n');
  
  const output = await commandLogger.getFormattedAllCommands(100);
  console.log(output);
  
  if (process.stdin.isTTY) {
    console.log('\nPress any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.exit(0);
    });
  } else {
    console.log('\nHistory shown - exiting');
    process.exit(0);
  }
}

/**
 * Cancel a command
 */
async function handleCommandCancel(commandId: string) {
  if (!commandId) {
    console.error('❌ Command ID is required');
    console.error('Usage: tmux-mcp command-cancel <command-id>');
    process.exit(1);
  }
  
  console.log(`🛑 Cancelling command: ${commandId}`);
  
  try {
    const success = await enhancedExecutor.cancelCommand(commandId);
    
    if (success) {
      console.log('✅ Command cancelled successfully');
      
      // Also remove from log
      await commandLogger.removeActiveCommand(commandId);
    } else {
      console.log('❌ Failed to cancel command (may not exist or already completed)');
    }
  } catch (error) {
    console.error(`❌ Error cancelling command: ${error}`);
    process.exit(1);
  }
}

/**
 * Clean up old commands
 */
async function handleCommandCleanup() {
  console.log('🧹 Cleaning up old command history...');
  
  try {
    const removedCount = await commandLogger.cleanup(24); // 24 hours
    console.log(`✅ Cleaned up ${removedCount} old commands`);
    
    // Also cleanup in-memory commands
    enhancedExecutor.cleanupOldCommands(60); // 60 minutes
    console.log('✅ Cleaned up in-memory commands');
  } catch (error) {
    console.error(`❌ Error during cleanup: ${error}`);
    process.exit(1);
  }
}

async function main() {
  try {
    const { values, positionals } = parseArgs({
      options: {
        'shell-type': { type: 'string', default: 'bash', short: 's' },
        'help': { type: 'boolean', default: false, short: 'h' }
      },
      allowPositionals: true
    });

    // Handle CLI commands
    if (positionals.length > 0) {
      const command = positionals[0];
      await handleCliCommand(command, positionals.slice(1), values);
      return;
    }

    // Show help if requested
    if (values.help) {
      showHelp();
      return;
    }

    // Set shell configuration
    tmux.setShellConfig({
      type: values['shell-type'] as string
    });

    // Check if tmux is running
    const tmuxRunning = await tmux.isTmuxRunning();
    if (!tmuxRunning) {
      server.server.sendLoggingMessage({
          level: 'error',
          data: 'Tmux seems not running'
      });

      throw "Tmux server is not running";
    }

    // Start the MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

/**
 * Interactive command management mode
 */
async function handleInteractiveMode() {
  console.log('\x1b[2J\x1b[H'); // Clear screen
  console.log('🎛️  TMUX MCP - Interactive Command Manager\n');
  
  // Check if we're in a TTY or tmux environment (tmux popup doesn't report isTTY properly)
  const isTmuxEnvironment = !!process.env.TMUX;
  if (!process.stdin.isTTY && !isTmuxEnvironment) {
    console.log('Interactive mode requires a TTY or tmux environment. Use individual commands instead.');
    return;
  }

  const { createInterface } = await import('readline');
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let running = true;

  const showMenu = () => {
    console.log('\x1b[2J\x1b[H'); // Clear screen
    console.log('🎛️  TMUX MCP - Interactive Command Manager');
    console.log('==========================================\n');
    console.log('Options:');
    console.log('  [1] Show running commands');
    console.log('  [2] Show command history');
    console.log('  [3] Search history with fzf 🔍');
    console.log('  [4] Cancel a command');
    console.log('  [5] Cleanup old commands');
    console.log('  [q] Quit\n');
  };

  const showRunningCommands = async () => {
    console.log('\x1b[2J\x1b[H');
    console.log('🏃 Active Commands\n');
    
    const activeCommands = await enhancedExecutor.listActiveCommands();
    if (activeCommands.length === 0) {
      console.log('No active commands currently running.\n');
    } else {
      activeCommands.forEach((cmd, index) => {
        const status = cmd.status === 'running' ? '🔄' : '⏳';
        console.log(`${status} [${index + 1}] ${cmd.command} (ID: ${cmd.id.substring(0, 8)})`);
        console.log(`    Pane: ${cmd.paneId} | Started: ${new Date(cmd.startTime).toLocaleTimeString()}\n`);
      });
    }
    
    console.log('Press Enter to return to menu...');
    await new Promise(resolve => rl.once('line', resolve));
  };

  const showCommandHistory = async () => {
    console.log('\x1b[2J\x1b[H');
    console.log('📜 Command History\n');
    
    const allCommands = await enhancedExecutor.listAllCommands();
    if (allCommands.length === 0) {
      console.log('No commands found in history.\n');
    } else {
      allCommands.slice(0, 10).forEach((cmd, index) => {
        const statusIcon = cmd.status === 'completed' ? '✅' : 
                          cmd.status === 'error' ? '❌' : 
                          cmd.status === 'running' ? '🔄' : '⏳';
        console.log(`${statusIcon} [${index + 1}] ${cmd.command}`);
        console.log(`    ID: ${cmd.id.substring(0, 8)} | ${cmd.status.toUpperCase()}`);
        if (cmd.endTime) {
          const duration = new Date(cmd.endTime).getTime() - new Date(cmd.startTime).getTime();
          console.log(`    Duration: ${Math.round(duration / 1000)}s\n`);
        } else {
          console.log(`    Started: ${new Date(cmd.startTime).toLocaleTimeString()}\n`);
        }
      });
      
      if (allCommands.length > 10) {
        console.log(`... and ${allCommands.length - 10} more commands\n`);
      }
    }
    
    console.log('Press Enter to return to menu...');
    await new Promise(resolve => rl.once('line', resolve));
  };

  const searchHistoryWithFzf = async () => {
    console.log('\x1b[2J\x1b[H');
    console.log('🔍 Search Command History with fzf\n');
    
    try {
      const allCommands = await enhancedExecutor.listAllCommands();
      if (allCommands.length === 0) {
        console.log('No commands found in history.\n');
        console.log('Press Enter to return to menu...');
        await new Promise(resolve => rl.once('line', resolve));
        return;
      }

      // Prepare fzf input data
      const fzfData = allCommands.map((cmd, index) => {
        const statusIcon = cmd.status === 'completed' ? '✅' : 
                          cmd.status === 'error' ? '❌' : 
                          cmd.status === 'running' ? '🔄' : 
                          cmd.status === 'cancelled' ? '🚫' : '⏳';
        const duration = cmd.endTime 
          ? Math.round((new Date(cmd.endTime).getTime() - new Date(cmd.startTime).getTime()) / 1000)
          : Math.round((Date.now() - new Date(cmd.startTime).getTime()) / 1000);
        const timeStr = new Date(cmd.startTime).toLocaleString();
        
        return `${statusIcon} ${cmd.command} | ID: ${cmd.id.substring(0, 8)} | ${cmd.status.toUpperCase()} | ${duration}s | ${timeStr}`;
      }).join('\n');

      // Use fzf to select command
      const { spawn } = await import('child_process');
      
      console.log('🔍 Use fzf to search and select a command...\n');
      
      const fzfProcess = spawn('/opt/homebrew/bin/fzf', [
        '--height=80%',
        '--layout=reverse',
        '--border',
        '--prompt=Search Command History > ',
        '--preview-window=down:3:wrap',
        '--preview=echo "Command Details:" && echo {} | cut -d"|" -f1',
        '--header=Use arrows to navigate, Enter to select details, Esc to cancel'
      ], {
        stdio: ['pipe', 'pipe', 'inherit']
      });

      // Send data to fzf
      fzfProcess.stdin?.write(fzfData);
      fzfProcess.stdin?.end();

      let selectedLine = '';
      fzfProcess.stdout?.on('data', (data) => {
        selectedLine += data.toString();
      });

      await new Promise((resolve) => {
        fzfProcess.on('close', (code) => {
          if (code === 0 && selectedLine.trim()) {
            // Extract command ID from selected line
            const match = selectedLine.match(/ID: ([a-f0-9]{8})/);
            if (match) {
              const commandId = match[1];
              const fullCommand = allCommands.find(cmd => cmd.id.startsWith(commandId));
              
              if (fullCommand) {
                console.log('\x1b[2J\x1b[H');
                console.log('📋 Selected Command Details\n');
                console.log('==========================================\n');
                console.log(`Command: ${fullCommand.command}`);
                console.log(`ID: ${fullCommand.id}`);
                console.log(`Status: ${fullCommand.status.toUpperCase()}`);
                console.log(`Pane: ${fullCommand.paneId}`);
                if (fullCommand.shellType) console.log(`Shell: ${fullCommand.shellType}`);
                if (fullCommand.currentWorkingDirectory) console.log(`Directory: ${fullCommand.currentWorkingDirectory}`);
                if (fullCommand.exitCode !== undefined) console.log(`Exit Code: ${fullCommand.exitCode}`);
                console.log(`Started: ${new Date(fullCommand.startTime).toLocaleString()}`);
                if (fullCommand.endTime) console.log(`Ended: ${new Date(fullCommand.endTime).toLocaleString()}`);
                
                const duration = fullCommand.endTime 
                  ? new Date(fullCommand.endTime).getTime() - new Date(fullCommand.startTime).getTime()
                  : Date.now() - new Date(fullCommand.startTime).getTime();
                console.log(`Duration: ${Math.round(duration / 1000)}s`);
                
                if (fullCommand.result) {
                  console.log('\n--- Output ---');
                  // Truncate long output
                  const output = fullCommand.result.length > 500 
                    ? fullCommand.result.substring(0, 500) + '\n... (truncated)'
                    : fullCommand.result;
                  console.log(output);
                }
                console.log('\n==========================================');
              }
            }
          } else {
            console.log('No command selected or cancelled.');
          }
          resolve(code);
        });
      });
      
    } catch (error) {
      console.log(`❌ Error running fzf: ${error}`);
      console.log('Make sure fzf is installed: brew install fzf');
    }
    
    console.log('\nPress Enter to return to menu...');
    await new Promise(resolve => rl.once('line', resolve));
  };

  const cancelCommand = async () => {
    console.log('\x1b[2J\x1b[H');
    console.log('🚫 Cancel Command\n');
    
    const activeCommands = await enhancedExecutor.listActiveCommands();
    if (activeCommands.length === 0) {
      console.log('No active commands to cancel.\n');
      console.log('Press Enter to return to menu...');
      await new Promise(resolve => rl.once('line', resolve));
      return;
    }

    console.log('Active commands:');
    activeCommands.forEach((cmd, index) => {
      console.log(`  [${index + 1}] ${cmd.command} (${cmd.id.substring(0, 8)})`);
    });
    
    console.log('\nEnter command number to cancel (or press Enter to return):');
    const answer = await new Promise<string>(resolve => rl.once('line', resolve));
    
    const cmdIndex = parseInt(answer.trim()) - 1;
    if (cmdIndex >= 0 && cmdIndex < activeCommands.length) {
      const cmd = activeCommands[cmdIndex];
      const success = await enhancedExecutor.cancelCommand(cmd.id);
      console.log(success ? '✅ Command cancelled successfully!' : '❌ Failed to cancel command');
    } else if (answer.trim() !== '') {
      console.log('❌ Invalid selection');
    }
    
    if (answer.trim() !== '') {
      console.log('\nPress Enter to return to menu...');
      await new Promise(resolve => rl.once('line', resolve));
    }
  };

  const cleanupCommands = async () => {
    console.log('\x1b[2J\x1b[H');
    console.log('🧹 Cleanup Old Commands\n');
    
    const beforeCount = (await enhancedExecutor.listAllCommands()).length;
    console.log(`Found ${beforeCount} commands in history.`);
    console.log('Clean up commands older than 1 hour? (y/N):');
    
    const answer = await new Promise<string>(resolve => rl.once('line', resolve));
    
    if (answer.trim().toLowerCase() === 'y') {
      enhancedExecutor.cleanupOldCommands(60);
      const afterCount = (await enhancedExecutor.listAllCommands()).length;
      const cleanedCount = beforeCount - afterCount;
      console.log(`✅ Cleanup completed! Removed ${cleanedCount} old commands.`);
    } else {
      console.log('Cleanup cancelled.');
    }
    
    console.log('\nPress Enter to return to menu...');
    await new Promise(resolve => rl.once('line', resolve));
  };

  while (running) {
    showMenu();
    console.log('Choose an option:');
    
    const choice = await new Promise<string>(resolve => rl.once('line', resolve));
    
    switch (choice.trim()) {
      case '1':
        await showRunningCommands();
        break;
      case '2':
        await showCommandHistory();
        break;
      case '3':
        await searchHistoryWithFzf();
        break;
      case '4':
        await cancelCommand();
        break;
      case '5':
        await cleanupCommands();
        break;
      case 'q':
      case 'quit':
      case 'exit':
        running = false;
        break;
      default:
        console.log('Invalid option. Press Enter to try again...');
        await new Promise(resolve => rl.once('line', resolve));
        break;
    }
  }
  
  rl.close();
  console.log('👋 Goodbye!');
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
