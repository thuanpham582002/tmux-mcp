/**
 * Command Executor - EXACT copy from tabby-mcp
 * Handles the core command execution logic with exact 3-stage process:
 * 1. executeShellDetection
 * 2. sendSetupScript  
 * 3. waitForCommandCompletion
 */

import { ShellContext, escapeShellString } from './shell-strategies.js';
import * as tmux from './tmux.js';

/**
 * Strip ANSI escape codes (simplified version for tmux)
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Handles the core command execution logic - EXACT copy from tabby-mcp
 */
export class CommandExecutor {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  public shellContext = new ShellContext();

  constructor() {}

  /**
   * Execute shell detection only (without running the command yet)
   */
  async executeShellDetection(paneId: string, command: string, startMarker: string): Promise<{ shellDetectionResult: any; attempts: number; maxAttempts: number }> {
    const detectShellScript = this.shellContext.getShellDetectionScript();
    
    // Send Ctrl+C to interrupt any running command
    await tmux.executeTmux(`send-keys -t '${paneId}' C-c`);
    await new Promise(resolve => setTimeout(resolve, 100));
    
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
          await tmux.executeTmux(`send-keys -t '${paneId}' '${line}' Enter`);
        } else if (i === scriptLines.length - 1) {
          // Last line - send without continuation
          await tmux.executeTmux(`send-keys -t '${paneId}' '${line}' Enter`);
        } else {
          // Middle lines - send normally
          await tmux.executeTmux(`send-keys -t '${paneId}' '${line}' Enter`);
        }
      }
    } else {
      const singleLineScript = `stty -echo;read ds;eval "$ds";read ss;eval "$ss";stty echo;echo "${startMarker}";\\`;
      await tmux.executeTmux(`send-keys -t '${paneId}' "${escapeShellString(singleLineScript)}" Enter`);
      await tmux.executeTmux(`send-keys -t '${paneId}' "${escapeShellString(trimmedCommand)}" Enter`);
    }

    // Send shell detection script with proper escaping 
    await tmux.executeTmux(`send-keys -t '${paneId}' "${escapeShellString(detectShellScript)}" Enter`);

    // Wait for shell detection  
    let attempts = 0;
    const maxAttempts = 50;
    let shellDetectionResult: { shellType: string; currentWorkingDirectory: string; systemInfo?: string } | null = null;

    while (shellDetectionResult === null && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
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
    timeout?: number // No default timeout - will run indefinitely if not specified
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
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms

      // Get terminal buffer
      const textAfter = await this.getTerminalBufferText(paneId);

      // Clean ANSI codes and process output 
      const cleanTextAfter = stripAnsi(textAfter);
      const lines = cleanTextAfter.split('\n');

      // Find start and end markers 
      let startIndex = -1;
      let endIndex = -1;

      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith(startMarker)) {
          startIndex = i;
          commandStarted = true;
          for (let j = startIndex + 1; j < lines.length; j++) {
            if (lines[j].includes(endMarker)) {
              endIndex = j;
              commandFinished = true;
              break;
            }
          }
          break;
        }
      }

      // Extract output between markers 
      if (commandStarted && commandFinished && startIndex !== -1 && endIndex !== -1) {
        const commandOutput = lines.slice(startIndex + 1, endIndex)
          .filter((line: string) => !line.includes(startMarker) && !line.includes(endMarker))
          .join('\n')
          .trim();

        // Extract exit code if available 
        for (let i = endIndex; i < Math.min(endIndex + 5, lines.length); i++) {
          if (lines[i].startsWith('exit_code:')) {
            exitCode = parseInt(lines[i].split(':')[1].trim(), 10);
            break;
          }
        }

        output = commandOutput;
        break;
      }
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
