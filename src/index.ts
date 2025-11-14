#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as tmux from "./tmux.js";
import * as enhancedExecutor from "./enhanced-executor.js";

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

// Register tools directly
const registerTools = () => {
  // Execute command tool
  server.tool(
    "execute-command",
    "Execute shell commands in tmux pane",
    {
      paneId: z.string().describe("ID of the tmux pane"),
      command: z.string().describe("Command to execute"),
      detectShell: z.boolean().optional().default(true),
      timeout: z.number().optional().default(99999999),
      maxRetries: z.number().optional().default(3)
    },
    async (args: any) => {
      try {
        const { paneId, command, detectShell = true, timeout = 99999999, maxRetries = 3 } = args;
        const commandId = await enhancedExecutor.executeCommand(paneId, command, { detectShell, timeout, maxRetries });

        const startTime = Date.now();
        const pollInterval = 100;

        while (Date.now() - startTime < timeout) {
          const status = await enhancedExecutor.getEnhancedCommandStatus(commandId);

          if (status && status.status !== 'pending') {
            const resultText = status.status === 'completed'
              ? `Command completed successfully.\n\nResult:\n${status.result || '(no output)'}\n\nExit Code: ${status.exitCode || 0}`
              : `Command failed.\n\nError:\n${status.result || '(no error details)'}\n\nExit Code: ${status.exitCode || 1}`;

            return { content: [{ type: "text", text: resultText }] };
          }

          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return { content: [{ type: "text", text: `Command timed out after ${timeout}ms` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error executing command: ${error}` }] };
      }
    }
  );

  // Send keys tool
  server.tool(
    "send-keys-raw",
    "Send raw keys to tmux pane",
    {
      paneId: z.string().describe("ID of the tmux pane"),
      keys: z.string().describe("Keys to send (e.g., 'Hello' or 'C-x C-s')")
    },
    async (args: any) => {
      try {
        await tmux.sendKeysRaw(args.paneId, args.keys);
        return { content: [{ type: "text", text: `Keys sent to pane ${args.paneId}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error sending keys: ${error}` }] };
      }
    }
  );

  // Capture pane tool
  server.tool(
    "capture-pane",
    "Capture content from tmux pane",
    {
      paneId: z.string().describe("ID of the tmux pane"),
      lines: z.string().optional().describe("Number of lines to capture")
    },
    async (args: any) => {
      try {
        const linesCount = args.lines ? parseInt(args.lines, 10) : undefined;
        const content = await tmux.capturePaneContent(args.paneId, linesCount);
        return { content: [{ type: "text", text: content || "No content captured" }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error capturing content: ${error}` }] };
      }
    }
  );
};

// Expose pane content as a resource
server.resource(
  "Tmux Pane Content",
  new ResourceTemplate("tmux://pane/{paneId}", {
    list: async () => {
      // Return empty list since we don't have session discovery tools
      // Users must know the pane ID to access content
      return { resources: [] };
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

/**
 * Show help information
 */
function showHelp() {
  console.log(`
Tmux MCP Server - 3 core tools for tmux integration

USAGE:
  tmux-mcp [COMMAND] [OPTIONS]

COMMANDS:
  (none)              Start MCP server
  execute-command     Execute command in tmux pane
  send-keys-raw       Send keystrokes to tmux pane
  capture-pane        Capture pane content
  help, -h, --help    Show this help

EXAMPLES:
  tmux-mcp                           # Start MCP server
  tmux-mcp execute-command %0 "ls -la"
  tmux-mcp send-keys-raw %0 "C-x C-s"
  tmux-mcp capture-pane %0 100
`);
}

/**
 * Handle CLI commands
 */
async function handleCliCommand(command: string, args: string[], options: any) {
  try {
    switch (command) {
      case 'execute-command':
        await handleExecuteCommand(args);
        break;

      case 'send-keys-raw':
        await handleSendKeysRaw(args);
        break;

      case 'capture-pane':
        await handleCapturePane(args);
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
 * Execute a command in a tmux pane
 */
async function handleExecuteCommand(args: string[]) {
  if (args.length < 2) {
    console.error('❌ Pane ID and command are required');
    console.error('Usage: tmux-mcp execute-command <pane-id> <command> [--timeout <ms>]');
    console.error('');
    console.error('Examples:');
    console.error('  tmux-mcp execute-command %0 "ls -la"');
    console.error('  tmux-mcp execute-command 0:1.0 "npm test" --timeout 60000');
    console.error('  tmux-mcp execute-command mysession:1.0 "cd /path && pwd" --timeout 300000');
    console.error('  tmux-mcp execute-command %1 "long-running-process" --timeout 0  # unlimited');
    process.exit(1);
  }

  // Parse arguments to extract --timeout option
  const timeoutIndex = args.findIndex(arg => arg === '--timeout');
  let timeoutMs = 999999999; // Default unlimited
  let commandArgs = [...args];

  if (timeoutIndex !== -1) {
    const timeoutValue = args[timeoutIndex + 1];
    if (timeoutValue) {
      const parsedTimeout = parseInt(timeoutValue);
      if (isNaN(parsedTimeout) || parsedTimeout < 0) {
        console.error('❌ Invalid timeout value. Use a positive number in milliseconds, or 0 for unlimited.');
        process.exit(1);
      }
      timeoutMs = parsedTimeout === 0 ? 999999999 : parsedTimeout;
      commandArgs = args.slice(0, timeoutIndex).concat(args.slice(timeoutIndex + 2));
    } else {
      console.error('❌ --timeout requires a value (milliseconds, or 0 for unlimited)');
      process.exit(1);
    }
  }

  const paneId = commandArgs[0];
  const command = commandArgs.slice(1).join(' ');

  try {
    // Execute command using the enhanced executor
    const commandId = await enhancedExecutor.executeCommand(paneId, command, {
      timeout: timeoutMs,
      maxRetries: 2,
      detectShell: true // Auto-detect shell type
    });

    // Wait for command completion with polling
    let attempts = 0;
    const maxAttempts = Math.ceil(timeoutMs / 1000); // Poll every second
    let finalOutput = '';

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const command = await enhancedExecutor.getEnhancedCommandStatus(commandId);

      if (command && command.status === 'completed') {
        finalOutput = command.result || '';
        break;
      } else if (command && (command.status === 'error' || command.status === 'cancelled')) {
        finalOutput = command.result || `Command ${command.status}`;
        break;
      }
    }

    // Clean output by removing markers and metadata
    let cleanOutput = finalOutput;
    if (cleanOutput) {
      // Remove tmux-mcp markers and exit codes
      cleanOutput = cleanOutput
        .split('\n')
        .filter(line =>
          !line.includes('_S') &&
          !line.includes('_E') &&
          !line.includes('exit_code:') &&
          !line.includes('~') &&
          !line.includes('❯')
        )
        .join('\n')
        .trim();
    }

    if (cleanOutput) {
      console.log(cleanOutput);
    }

  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

/**
 * Send raw keys to a tmux pane
 */
async function handleSendKeysRaw(args: string[]) {
  if (args.length < 2) {
    console.error('❌ Pane ID and keys are required');
    console.error('Usage: tmux-mcp send-keys-raw <pane-id> <keys>');
    console.error('');
    console.error('Examples:');
    console.error('  tmux-mcp send-keys-raw %0 "Hello World"');
    console.error('  tmux-mcp send-keys-raw 0:1.0 "C-x C-s"');
    console.error('  tmux-mcp send-keys-raw mysession:1.0 "Enter"');
    process.exit(1);
  }

  const paneId = args[0];
  const keys = args.slice(1).join(' ');

  try {
    await tmux.sendKeysRaw(paneId, keys);
    console.log(`✅ Keys sent to pane ${paneId}: ${keys}`);
  } catch (error) {
    console.error(`❌ Error sending keys: ${error}`);
    process.exit(1);
  }
}

/**
 * Capture content from a tmux pane
 */
async function handleCapturePane(args: string[]) {
  if (args.length < 1) {
    console.error('❌ Pane ID is required');
    console.error('Usage: tmux-mcp capture-pane <pane-id> [lines]');
    console.error('');
    console.error('Examples:');
    console.error('  tmux-mcp capture-pane %0');
    console.error('  tmux-mcp capture-pane 0:1.0 100');
    console.error('  tmux-mcp capture-pane mysession:1.0 50');
    process.exit(1);
  }

  const paneId = args[0];
  const lines = args[1] ? parseInt(args[1], 10) : undefined;

  try {
    const content = await tmux.capturePaneContent(paneId, lines);

    if (content && content.trim()) {
      console.log(content);
    } else {
      console.log('(No content captured)');
    }
  } catch (error) {
    console.error(`❌ Error capturing pane content: ${error}`);
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
      type: values['shell-type'] as string || 'bash'
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

    // Register all tools
    registerTools();

    // Start the MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
