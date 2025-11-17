/**
 * Simplified Command Executor
 * Handles the core command execution logic with simple marker-based approach:
 * 1. Send command with end-marker
 * 2. Wait for completion marker
 * 3. Extract output and exit code
 */

import * as tmux from './tmux.js';
import { createLogger } from './logger.js';

const logger = createLogger('command-executor');

/**
 * Strip ANSI escape codes (simplified version for tmux)
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Extract timestamp and exit code from marker line
 * Format: "timestamp exit_code"
 */
function parseEndMarker(line: string, expectedTimestamp: string): { exitCode: number; valid: boolean } {
  const pattern = new RegExp(`^\\s*${expectedTimestamp}\\s+(\\d+)\\s*$`);
  const match = line.match(pattern);

  if (match) {
    return {
      exitCode: parseInt(match[1], 10),
      valid: true
    };
  }

  return { exitCode: 1, valid: false };
}

/**
 * Simplified command executor with single end-marker approach
 */
export class CommandExecutor {
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor() {}

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute command directly with end-marker
   */
  async executeCommand(paneId: string, command: string, endMarker: string): Promise<void> {
    // Send Ctrl+C to interrupt any running command
    await tmux.executeTmux(`send-keys -t '${paneId}' C-c`);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Prepare and send command with multiline support
    if (command.includes('\n')) {
      // Multiline command - send line by line
      const trimmedCommand = command.endsWith('\n') ? command.slice(0, -1) : command;

      // Create multiline script wrapped in braces
      const multiLineScript = `{
${trimmedCommand}
} && echo "${endMarker} $?"`;

      // Send line by line to handle newlines properly
      const scriptLines = multiLineScript.split('\n');
      for (let i = 0; i < scriptLines.length; i++) {
        const line = scriptLines[i];

        if (i === scriptLines.length - 1) {
          // Last line - send and execute
          await tmux.executeTmux(`send-keys -t '${paneId}' -- '${line}' Enter`);
        } else {
          // Middle lines - send with continuation
          await tmux.executeTmux(`send-keys -t '${paneId}' -- '${line}' Enter`);
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } else {
      // Single line command
      const commandWithMarker = `${command}; echo "${endMarker} $?"`;

      // Send the command
      await tmux.sendKeysRaw(paneId, commandWithMarker);

      // Send Enter to execute the command
      await tmux.executeTmux(`send-keys -t '${paneId}' Enter`);
    }
  }

  /**
   * Monitor command execution and wait for completion
   */
  async waitForCommandCompletion(
    paneId: string,
    endMarker: string,
    abortedFn: () => boolean,
    timeout?: number,
    commandId?: string
  ): Promise<{ output: string; exitCode: number | null; commandStarted: boolean; commandFinished: boolean }> {
    let output = '';
    let commandStarted = true; // Assume command started since we sent it
    let commandFinished = false;
    let exitCode: number | null = null;

    const startTime = Date.now();

    while (!commandFinished && !abortedFn()) {
      // Check for timeout
      if (timeout && Date.now() - startTime > timeout) {
        console.warn('Command execution timeout reached');
        break;
      }

      // Check for external cancellation
      if (commandId) {
        try {
          const commandLogger = (await import('./command-logger.js')).commandLogger;
          const persistentCommand = await commandLogger.getCommandById(commandId);
          if (persistentCommand && persistentCommand.status === 'cancelled') {
            console.log('Command was cancelled externally, stopping wait');
            exitCode = -1;
            break;
          }
        } catch (error) {
          console.warn('Could not check persistent storage for command cancellation:', error);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      // Get terminal buffer
      const textAfter = await this.getTerminalBufferText(paneId);
      const cleanTextAfter = stripAnsi(textAfter);
      const lines = cleanTextAfter.split('\n');

      // Find start and end markers - command line as start marker, echo result as end marker
      let startIndex = -1;
      let endIndex = -1;

      logger.debug('Looking for markers', { end: endMarker });

      // First, find the end marker (echo result with exit code) from bottom up
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();

        // Check if this line contains our end marker with exit code
        if (line.includes(endMarker)) {
          // Try to parse the marker format
          const parsed = parseEndMarker(line, endMarker);

          if (parsed.valid) {
            endIndex = i;
            exitCode = parsed.exitCode;
            logger.debug('Found end marker', { line: i, content: line, exitCode });
            break;
          }
        }
      }

      // If we found end marker, look for start marker (the command line)
      if (endIndex !== -1) {
        for (let i = endIndex - 1; i >= 0; i--) {
          const line = lines[i];

          // Look for the command line that contains our echo statement
          if (line.includes('echo') && line.includes(endMarker)) {
            startIndex = i;
            commandStarted = true;
            commandFinished = true;
            logger.debug('Found start marker (command line)', { line: i, content: line });
            break;
          }
        }
      }

      // Extract output between markers
      if (commandStarted && startIndex !== -1 && endIndex !== -1) {
        // Extract lines between start and end markers (excluding both markers)
        const outputLines = [];
        for (let i = startIndex + 1; i < endIndex; i++) {
          outputLines.push(lines[i]);
        }

        output = outputLines.join('\n').trim();
        logger.debug('Command completed', { startIndex, endIndex, outputLength: output.length, exitCode });
        break;
      }

      logger.debug('No end marker found, continuing to poll');
    }

    // Handle timeout case
    if (!commandFinished) {
      // Get whatever output we have so far
      const textAfter = await this.getTerminalBufferText(paneId);
      const cleanTextAfter = stripAnsi(textAfter);
      output = cleanTextAfter.trim();
      exitCode = 124; // Timeout exit code
    }

    // Handle empty output
    if (!output || output.trim() === '') {
      output = '(no output)';
    }

    return { output, exitCode, commandStarted, commandFinished };
  }

  /**
   * Handle existing running command abortion
   */
  async handleExistingCommand(paneId: string): Promise<void> {
    await tmux.executeTmux(`send-keys -t '${paneId}' C-c`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Get terminal buffer content as text - tmux adapter
   */
  private async getTerminalBufferText(paneId: string): Promise<string> {
    return await tmux.capturePaneContent(paneId, 1000);
  }
}