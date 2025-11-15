/**
 * Command Executor - EXACT copy from tabby-mcp
 * Handles the core command execution logic with exact 3-stage process:
 * 1. executeShellDetection
 * 2. sendSetupScript  
 * 3. waitForCommandCompletion
 */

import { ShellContext, escapeShellString } from './shell-strategies.js';
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
 * Extract text from a line before the end marker
 * Returns the text portion before the marker, or empty line if only marker is present
 */
function extractTextBeforeEndMarker(line: string, endMarker: string): string {
  const markerIndex = line.indexOf(endMarker);
  if (markerIndex === -1) {
    return line; // No marker found, return full line
  }
  const textBeforeMarker = line.substring(0, markerIndex);
  return textBeforeMarker.trim();
}

/**
 * Handles the core command execution logic - EXACT copy from tabby-mcp
 */
export class CommandExecutor {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  public shellContext = new ShellContext();

  constructor() {}

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  /**
   * Execute shell detection only (without running the command yet)
   */
  async executeShellDetection(paneId: string, command: string, startMarker: string): Promise<{ shellDetectionResult: any; attempts: number; maxAttempts: number }> {
    const detectShellScript = this.shellContext.getShellDetectionScript();
    
    // Send Ctrl+C to interrupt any running command
    await tmux.executeTmux(`send-keys -t '${paneId}' C-c`);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send visual separator to distinguish this command execution
    await tmux.executeTmux(`send-keys -t '${paneId}' -- '############################' Enter`);
    await this.sleep(50);
    
    const trimmedCommand = command.endsWith('\n') ? command.slice(0, -1) : command;
    
    // Send command with shell detection
    if (command.includes('\n')) {
      
      // Use exact tabby-mcp block format
      const multiLineScript = `stty -echo;read ds;eval "$ds";read ss;eval "$ss";stty echo; {
echo "${startMarker}"
${trimmedCommand}
}`;
      
      // Send line by line to avoid escaping issues with newlines in tmux
      const scriptLines = multiLineScript.split('\n');
      for (let i = 0; i < scriptLines.length; i++) {
        const line = scriptLines[i];
        if (i === 0) {
          // First line - send with continuation
          await tmux.executeTmux(`send-keys -t '${paneId}' -- '${line}' Enter`);
          await this.sleep(50); // Wait for the command to be processed
        } else if (i === scriptLines.length - 1) {
          // Last line - send without continuation
          await tmux.executeTmux(`send-keys -t '${paneId}' -- '${line}' Enter`);
          await this.sleep(50); // Wait for the command to be processed
        } else {
          // Middle lines - send normally
          await tmux.executeTmux(`send-keys -t '${paneId}' -- '${line}' Enter`);
          await this.sleep(50); // Wait for the command to be processed
        }
      }
    } else {
      const singleLineScript = `stty -echo;read ds;eval "$ds";read ss;eval "$ss";stty echo;echo "${startMarker}";\\`;
      await tmux.executeTmux(`send-keys -t '${paneId}' "${escapeShellString(singleLineScript)}" Enter`);
      await this.sleep(100); // Wait for the command to be processed
      await tmux.executeTmux(`send-keys -t '${paneId}' -- "${escapeShellString(trimmedCommand)}" Enter`);
      await this.sleep(100); // Wait for the command to be processed
    }

    // Send shell detection script with proper escaping 
    await tmux.executeTmux(`send-keys -t '${paneId}' "${escapeShellString(detectShellScript)}" Enter`);

    // Wait for shell detection  
    let attempts = 0;
    const maxAttempts = 50;
    let shellDetectionResult: { shellType: string; currentWorkingDirectory: string; systemInfo?: string } | null = null;

    while (shellDetectionResult === null && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 150));
      const textAfterSetup = await this.getTerminalBufferText(paneId);
      shellDetectionResult = this.shellContext.detectShellType(textAfterSetup);
      attempts++;
    }

    return { shellDetectionResult, attempts, maxAttempts };
  }

  /**
   * Send setup script after shell detection
   */
  async sendSetupScript(paneId: string, shellDetectionResult: any, startMarker: string, endMarker: string): Promise<void> {
    if (shellDetectionResult) {
      // Send setup script 
      const shellStrategy = this.shellContext.getStrategy(shellDetectionResult.shellType ?? 'unknown');
      const setupScript = shellStrategy.getSetupScript(startMarker, endMarker);
      
      // Send actual trap setup script 
      await tmux.executeTmux(`send-keys -t '${paneId}' "${escapeShellString(setupScript)}" Enter`);
    }
  }

  /**
   * Monitor command execution and wait for completion
   */
  async waitForCommandCompletion(
    paneId: string,
    startMarker: string,
    endMarker: string,
    abortedFn: () => boolean,
    timeout?: number, // No default timeout - will run indefinitely if not specified
    commandId?: string // Command ID to check persistent storage for cancellation
  ): Promise<{ output: string; exitCode: number | null; commandStarted: boolean; commandFinished: boolean }> {
    let output = '';
    let commandStarted = false;
    let commandFinished = false;
    let exitCode: number | null = null;
    
    // Add timeout protection to prevent infinite waiting 
    const startTime = Date.now();

    while (!commandFinished && !abortedFn()) {
      // Check for timeout only if timeout is specified
      if (timeout && Date.now() - startTime > timeout) {
        console.warn('Command execution timeout reached');
        break;
      }

      // Add 100ms delay to prevent high CPU usage in tight loop
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check if command was cancelled in persistent storage by another process
      if (commandId) {
        try {
          const commandLogger = (await import('./command-logger.js')).commandLogger;
          const persistentCommand = await commandLogger.getCommandById(commandId);
          if (persistentCommand && persistentCommand.status === 'cancelled') {
            console.log('Command was cancelled externally, stopping wait');
            exitCode = -1; // Set exit code to indicate cancellation
            break;
          }
        } catch (error) {
          // If we can't check persistent storage, continue with normal flow
          console.warn('Could not check persistent storage for command cancellation:', error);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms

      // Get terminal buffer
      const textAfter = await this.getTerminalBufferText(paneId);

      // Clean ANSI codes and process output 
      const cleanTextAfter = stripAnsi(textAfter);
      const lines = cleanTextAfter.split('\n');

      // Find start and end markers - use includes() since markers can appear anywhere in line
    // Step 1: Find endMarker from bottom up first
    let endIndex = -1;
    let startIndex = -1;

    // Debug: Log buffer content for troubleshooting
    logger.debug('Looking for markers', { start: startMarker, end: endMarker });
    logger.debug('Buffer lines (last 5)', { lines: lines.slice(-5).map((line, i) => `${lines.length - 5 + i}: ${line}`) });

    // Step 1: Find endMarker from bottom up
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(endMarker)) {
        endIndex = i;
        commandFinished = true;
        logger.debug('Found end marker', { line: i, content: lines[i] });
        break;
      }
    }

    // If no endMarker found, continue polling in next while loop iteration
    if (endIndex === -1) {
      logger.debug('No end marker found, continuing to poll');
      continue;
    }

    // Step 2: Find startMarker from endIndex-1 going up
    for (let j = endIndex - 1; j >= 0; j--) {
      if (lines[j].includes(startMarker)) {
        startIndex = j;
        commandStarted = true;
        logger.debug('Found start marker', { line: j, content: lines[j] });
        break;
      }
    }

    // If no startMarker found, take last 250 lines as fallback
    if (startIndex === -1) {
      logger.debug('No start marker found, using last 250 lines as fallback');
      const fallbackLines = lines.slice(-250);
      output = fallbackLines.join('\n').trim();
      commandStarted = true; // Assume command started
      // Since we have endMarker, command is finished
      break;
    }

    // Extract output between markers 
      if (commandStarted && startIndex !== -1) {
        if (commandFinished && endIndex !== -1) {
          // Complete command - extract between start and end markers
          // Include text from the end marker line before the marker
          const extractedLines: string[] = [];

          // Extract lines between start and end markers (excluding start marker line)
          for (let i = startIndex + 1; i < endIndex; i++) {
            if (!lines[i].includes(startMarker) && !lines[i].includes(endMarker)) {
              extractedLines.push(lines[i]);
            }
          }

          // Extract text from the end marker line before the marker
          const endMarkerLine = lines[endIndex];
          const textBeforeEndMarker = extractTextBeforeEndMarker(endMarkerLine, endMarker);
          if (textBeforeEndMarker && !textBeforeEndMarker.includes(startMarker)) {
            extractedLines.push(textBeforeEndMarker);
          }

          const commandOutput = extractedLines.join('\n').trim();

          // Extract exit code if available
          for (let i = endIndex; i < Math.min(endIndex + 5, lines.length); i++) {
            if (lines[i].startsWith('exit_code:')) {
              exitCode = parseInt(lines[i].split(':')[1].trim(), 10);
              logger.debug('Found exit code', { exitCode });
              break;
            }
          }

          output = commandOutput;
          logger.debug('Complete command output', { length: commandOutput.length, preview: commandOutput.substring(0, 200) });
          break;
        } else {
          // Partial command (timeout case) - extract from start marker to end of buffer
          const partialOutput = lines.slice(startIndex + 1)
            .filter((line: string) => !line.includes(startMarker))
            .join('\n')
            .trim();
          
          output = partialOutput;
          logger.debug('Partial command output', { length: partialOutput.length, preview: partialOutput.substring(0, 200) });
          // Continue polling - don't break yet
        }
      }
    }

    // Handle empty output
    if (!output || output.trim() === '') {
      output = 'executed';
    }

    return { output, exitCode, commandStarted, commandFinished };
  }

  /**
   * Handle existing running command abortion 
   */
  async handleExistingCommand(paneId: string): Promise<void> {
    // For tmux, just send Ctrl+C and wait
    await tmux.executeTmux(`send-keys -t '${paneId}' C-c`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Get partial output for aborted command
   */
  getPartialOutput(paneId: string, startMarker: string): string {
    // Note: This would need to be async in tmux context, but keeping interface same as tabby-mcp
    // For now, return empty - this would need terminal buffer access
    return '';
  }

  /**
   * Get terminal buffer content as text - tmux adapter
   */
  private async getTerminalBufferText(paneId: string): Promise<string> {
    return await tmux.capturePaneContent(paneId, 1000);
  }
}
