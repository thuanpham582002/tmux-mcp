import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from 'uuid';
import * as tmux from "./tmux.js";
import { commandLogger } from "./command-logger.js";

const exec = promisify(execCallback);

export interface EnhancedCommandExecution {
  id: string;
  paneId: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled' | 'timeout';
  startTime: Date;
  endTime?: Date;
  result?: string;
  exitCode?: number;
  aborted: boolean;
  retryCount: number;
  shellType?: 'bash' | 'zsh' | 'fish' | 'sh' | 'unknown';
  currentWorkingDirectory?: string;
}

// Note: Enhanced command tracking now uses persistent storage only
// Memory-based tracking removed in favor of consistent persistent storage

export type ShellType = 'bash' | 'zsh' | 'fish' | 'sh' | 'unknown';

// Helper function to convert CommandLogEntry to EnhancedCommandExecution
function logEntryToCommand(entry: any): EnhancedCommandExecution {
  return {
    id: entry.id,
    paneId: entry.paneId,
    command: entry.command,
    status: entry.status,
    startTime: new Date(entry.startTime),
    endTime: entry.endTime ? new Date(entry.endTime) : undefined,
    exitCode: entry.exitCode,
    shellType: entry.shellType,
    currentWorkingDirectory: entry.currentWorkingDirectory,
    result: entry.result,
    aborted: entry.aborted || false,
    retryCount: entry.retryCount || 0
  };
}

const SHELL_DETECTION_COMMANDS = {
  bash: 'echo "SHELL_DETECTION:bash:$(pwd):$BASHPID"',
  zsh: 'echo "SHELL_DETECTION:zsh:$(pwd):$$"',
  fish: 'echo "SHELL_DETECTION:fish:"(pwd)":"(echo $fish_pid)',
  sh: 'echo "SHELL_DETECTION:sh:$(pwd):$$"'
};

// Ultra-compressed trap setup commands - ~50% shorter than original
const TRAP_SETUP_COMMANDS = {
  bash: (startMarker: string, endMarker: string) => 
    `__TM=0;__tc(){unset PROMPT_COMMAND __tpc __TM;}__tpc(){[[ $__TM = 0 ]]&&{e=$?;c=$(history 1|awk '{print $2}');[[ "$c" == *"${startMarker}"* ]]&&{__TM=1;echo "${endMarker}";echo "exit_code: $e";__tc;};}}PROMPT_COMMAND="__tpc;$PROMPT_COMMAND"`,
  
  zsh: (startMarker: string, endMarker: string) => 
    `__TM=0;__tc(){precmd_functions=();unset __tpc __TM;};__tpc(){[[ $__TM = 0 ]]&&{e=$?;c=$(fc -ln -1);[[ "$c" == *"${startMarker}"* ]]&&{__TM=1;echo "${endMarker}";echo "exit_code: $e";__tc;};}};precmd_functions=(__tpc)`,
  
  fish: (startMarker: string, endMarker: string) => 
    `function __tmux_mcp_exit --on-event fish_exit; echo "${endMarker}$status"; end; echo "${startMarker}"`,
  
  sh: (startMarker: string, endMarker: string) => 
    `__TF="/tmp/tmux_cmd_$$";__tc(){[ "$OLD_PS1" ]&&PS1="$OLD_PS1";unset __tpc OLD_PS1 __TF;rm -f "$__TF";}__tpc(){e=$?;[ -f "$__TF" ]&&{echo "${endMarker}";echo "exit_code: $e";rm -f "$__TF";__tc;}}trap '[ -f "$__TF" ]&&{echo "${endMarker}";echo "exit_code: $?";rm -f "$__TF";__tc;}' EXIT;OLD_PS1="$PS1";PS1='$(__tpc)'$PS1`
};

/**
 * Detect shell type in the given pane
 */
export async function detectShellType(paneId: string): Promise<{ shellType: ShellType; currentWorkingDirectory?: string }> {
  try {
    // Try different shell detection commands
    for (const [shell, command] of Object.entries(SHELL_DETECTION_COMMANDS)) {
      try {
        await tmux.executeTmux(`send-keys -t '${paneId}' '${command}' Enter`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for response
        
        const content = await tmux.capturePaneContent(paneId, 50);
        const lines = content.split('\n');
        
        // Look for shell detection response
        for (const line of lines.reverse()) {
          if (line.includes('SHELL_DETECTION:')) {
            const parts = line.split(':');
            if (parts.length >= 3 && parts[1] === shell) {
              return {
                shellType: shell as ShellType,
                currentWorkingDirectory: parts[2]
              };
            }
          }
        }
      } catch (error) {
        // Continue to next shell
        continue;
      }
    }
    
    return { shellType: 'unknown' };
  } catch (error) {
    return { shellType: 'unknown' };
  }
}

/**
 * Enhanced command execution with better trap logic
 */
export async function executeCommandEnhanced(
  paneId: string, 
  command: string,
  options: {
    maxRetries?: number;
    timeout?: number;
    detectShell?: boolean;
  } = {}
): Promise<string> {
  const commandId = uuidv4();
  const { maxRetries = 3, timeout = 30000, detectShell = true } = options;
  
  // Initialize enhanced command tracking
  const enhancedCommand: EnhancedCommandExecution = {
    id: commandId,
    paneId,
    command,
    status: 'pending',
    startTime: new Date(),
    aborted: false,
    retryCount: 0
  };
  
  // Save to persistent storage immediately
  await commandLogger.logCommandStart(enhancedCommand);
  
  try {
    // Step 1: Detect shell type if requested
    if (detectShell) {
      enhancedCommand.status = 'pending';
      const detection = await detectShellType(paneId);
      enhancedCommand.shellType = detection.shellType;
      enhancedCommand.currentWorkingDirectory = detection.currentWorkingDirectory;
    }
    
    // Step 2: Setup trap mechanism with short markers (like tabby-mcp)
    const timestamp = Date.now();
    const shortId = commandId.substring(0, 8);
    const startMarker = `_S${timestamp}${shortId}`;
    const endMarker = `_E${timestamp}${shortId}`;
    
    const shellType = enhancedCommand.shellType || 'bash';
    const trapCommand = shellType !== 'unknown' ? TRAP_SETUP_COMMANDS[shellType] : TRAP_SETUP_COMMANDS.bash;
    const setupScript = trapCommand(startMarker, endMarker);
    
    // Step 3: Send command with tabby-mcp style trap reading logic
    enhancedCommand.status = 'running';
    await commandLogger.logCommandUpdate(enhancedCommand);
    
    // Clear any existing input
    await tmux.executeTmux(`send-keys -t '${paneId}' C-c`);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const trimmedCommand = command.endsWith('\n') ? command.slice(0, -1) : command;
    
    // Step 3a: Send command with read trap setup (exact tabby-mcp format)
    if (command.includes('\n')) {
      // Multi-line command
      const multiLineScript = `stty -echo;read ds;eval "$ds";read ss;eval "$ss";stty echo; {
echo "${startMarker}"
${trimmedCommand}
}`;
      await tmux.executeTmux(`send-keys -t '${paneId}' '${multiLineScript.replace(/'/g, "'\\''")}' Enter`);
    } else {
      // Single line command with line continuation (exact tabby-mcp format)
      const singleLineScript = `stty -echo;read ds;eval "$ds";read ss;eval "$ss";stty echo;echo "${startMarker}";\\`;
      await tmux.executeTmux(`send-keys -t '${paneId}' '${singleLineScript.replace(/'/g, "'\\''")}' Enter`);
      await tmux.executeTmux(`send-keys -t '${paneId}' '${trimmedCommand.replace(/'/g, "'\\''")}' Enter`);
    }
    
    // Step 3b: Wait for read ds to be ready, then send shell detection script
    await new Promise(resolve => setTimeout(resolve, 200)); // Critical timing fix
    const detectShellScript = getShellDetectionScript();
    await tmux.executeTmux(`send-keys -t '${paneId}' '${detectShellScript.replace(/'/g, "'\\''")}' Enter`);
    
    // Step 3c: Wait for and parse shell detection output
    await new Promise(resolve => setTimeout(resolve, 1000));
    const detectionOutput = await tmux.capturePaneContent(paneId, 20);
    const detectedShell = detectShellTypeFromOutput(detectionOutput);
    
    if (detectedShell) {
      enhancedCommand.shellType = detectedShell.shellType as any;
      enhancedCommand.currentWorkingDirectory = detectedShell.currentWorkingDirectory;
    }
    
    // Step 3d: Send appropriate setup script based on detected shell
    const finalShellType = detectedShell?.shellType || 'bash';
    const validShellType = ['bash', 'zsh', 'fish', 'sh'].includes(finalShellType) ? finalShellType as keyof typeof TRAP_SETUP_COMMANDS : 'bash';
    const finalTrapCommand = TRAP_SETUP_COMMANDS[validShellType];
    const finalSetupScript = finalTrapCommand(startMarker, endMarker);
    
    // Step 3e: Wait for read ss to be ready, then send setup script
    await new Promise(resolve => setTimeout(resolve, 200)); // Critical timing fix
    await tmux.executeTmux(`send-keys -t '${paneId}' '${finalSetupScript.replace(/'/g, "'\\''")}' Enter`);
    
    // Log shell detection result
    await commandLogger.logCommandUpdate(enhancedCommand);
    
    // Step 4: Wait for completion with timeout
    const result = await waitForCommandCompletion(commandId, startMarker, endMarker, timeout);
    
    // Determine status based on result
    if (result.success) {
      enhancedCommand.status = 'completed';
    } else if (result.exitCode === 124) {
      enhancedCommand.status = 'timeout';
    } else {
      enhancedCommand.status = 'error';
    }
    
    enhancedCommand.endTime = new Date();
    enhancedCommand.result = result.output;
    enhancedCommand.exitCode = result.exitCode;
    
    // Log command completion (including timeouts)
    await commandLogger.logCommandUpdate(enhancedCommand);
    
    return commandId;
    
  } catch (error) {
    enhancedCommand.status = 'error';
    enhancedCommand.endTime = new Date();
    enhancedCommand.result = `Error: ${error instanceof Error ? error.message : String(error)}`;
    
    // Log command error
    await commandLogger.logCommandUpdate(enhancedCommand);
    
    throw error;
  }
}

/**
 * Wait for command completion with proper trap detection
 */
async function waitForCommandCompletion(
  commandId: string,
  startMarker: string,
  endMarker: string,
  timeout: number
): Promise<{ success: boolean; output: string; exitCode?: number }> {
  // Get command from persistent storage
  let commandEntry = await commandLogger.getCommandById(commandId);
  if (!commandEntry) throw new Error('Command not found');
  
  let command = logEntryToCommand(commandEntry);
  
  const startTime = Date.now();
  let lastContent = '';
  
  while (Date.now() - startTime < timeout) {
    // Refresh command state from persistent storage
    commandEntry = await commandLogger.getCommandById(commandId);
    if (commandEntry) {
      command = logEntryToCommand(commandEntry);
    }
    
    // Check if command was cancelled
    if (command.aborted) {
      return { success: false, output: 'Command was cancelled by user' };
    }
    
    try {
      const content = await tmux.capturePaneContent(command.paneId, 1000);
      
      // Look for start marker
      const startIndex = content.lastIndexOf(startMarker);
      if (startIndex === -1) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      // Look for end marker
      const endIndex = content.lastIndexOf(endMarker);
      if (endIndex > startIndex) {
        // Command completed, extract exit code from separate line
        const exitCodeMatch = content.match(/exit_code:\s*(\d+)/);
        const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
        
        // Find the start marker line end
        const startMarkerEnd = content.indexOf('\n', startIndex);
        if (startMarkerEnd === -1) {
          return { success: false, output: 'Could not find end of start marker' };
        }

        // Find the end marker line start (go backwards from end marker to find line start)
        let endMarkerStart = endIndex;
        while (endMarkerStart > 0 && content[endMarkerStart - 1] !== '\n') {
          endMarkerStart--;
        }

        // Extract output between the markers
        const outputContent = content.substring(startMarkerEnd + 1, endMarkerStart).trim();
        
        return {
          success: exitCode === 0,
          output: outputContent,
          exitCode
        };
      }
      
      lastContent = content;
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Timeout reached - extract whatever output we can
  let timeoutOutput = '';
  let partialOutput = '';
  
  if (lastContent) {
    // Try to extract partial output if we found start marker
    const startIndex = lastContent.lastIndexOf(startMarker);
    if (startIndex !== -1) {
      // We found start marker but no end marker - extract partial output
      const outputStart = startIndex + startMarker.length;
      const rawOutput = lastContent.substring(outputStart).trim();
      
      // Clean the output (remove command echo and formatting)
      const outputLines = rawOutput.split('\n');
      partialOutput = outputLines.slice(1).join('\n').trim();
      
      timeoutOutput = `[TIMEOUT after ${timeout}ms]\n\nPartial output captured:\n${partialOutput || '[No output yet]'}`;
    } else {
      // No start marker found - return raw content with timeout message
      const cleanContent = lastContent.trim();
      timeoutOutput = `[TIMEOUT after ${timeout}ms]\n\nRaw terminal content:\n${cleanContent || '[No content captured]'}`;
    }
  } else {
    timeoutOutput = `[TIMEOUT after ${timeout}ms] - No output captured`;
  }
  
  return { 
    success: false, 
    output: timeoutOutput,
    exitCode: 124 // Standard timeout exit code
  };
}

/**
 * Cancel a running command
 */
export async function cancelCommand(commandId: string): Promise<boolean> {
  try {
    // Get command from persistent storage
    const commandEntry = await commandLogger.getCommandById(commandId);
    
    if (!commandEntry || (commandEntry.status !== 'running' && commandEntry.status !== 'pending')) {
      return false; // Command not found or not cancellable
    }
    
    const command = logEntryToCommand(commandEntry);
    
    // Send Ctrl+C to interrupt the command
    await tmux.executeTmux(`send-keys -t '${command.paneId}' C-c`);
    command.aborted = true;
    command.status = 'cancelled';
    command.endTime = new Date();
    
    // Update persistent storage
    await commandLogger.logCommandUpdate(command);
    
    return true;
  } catch (error) {
    console.error('Error cancelling command:', error);
    return false;
  }
}

/**
 * Get enhanced command status (from persistent storage)
 */
export async function getEnhancedCommandStatus(commandId: string): Promise<EnhancedCommandExecution | null> {
  try {
    const commandEntry = await commandLogger.getCommandById(commandId);
    return commandEntry ? logEntryToCommand(commandEntry) : null;
  } catch (error) {
    console.error('Error getting command status:', error);
    return null;
  }
}

/**
 * List all active commands (from persistent storage only)
 */
export async function listActiveCommands(): Promise<EnhancedCommandExecution[]> {
  try {
    // Get active commands from persistent storage only
    const activeFromLogs = await commandLogger.getActiveCommands();
    
    // Convert log entries to EnhancedCommandExecution format and filter active
    const persistedActive: EnhancedCommandExecution[] = Object.values(activeFromLogs)
      .filter(entry => entry.status === 'running' || entry.status === 'pending')
      .map(entry => logEntryToCommand(entry));
    
    // Sort by start time (newest first)
    return persistedActive.sort((a, b) => 
      b.startTime.getTime() - a.startTime.getTime()
    );
  } catch (error) {
    // Fallback to empty array if there's an error
    console.error('Error reading persisted active commands:', error);
    return [];
  }
}

/**
 * Synchronous version for compatibility (deprecated - returns empty array)
 * Use listActiveCommands() instead
 */
export function listActiveCommandsSync(): EnhancedCommandExecution[] {
  console.warn('listActiveCommandsSync is deprecated. Use listActiveCommands() instead.');
  return [];
}

/**
 * List all commands (including persisted history)
 */
export async function listAllCommands(): Promise<EnhancedCommandExecution[]> {
  try {
    // Get active commands from persistent storage
    const activeCommands = await commandLogger.getActiveCommands();
    
    // Get command history from persistent storage
    const persistedHistory = await commandLogger.getCommandHistory(1000); // Get up to 1000 entries
    
    // Combine active and history commands, converting to EnhancedCommandExecution format
    const allCommands = [
      ...Object.values(activeCommands).map(entry => logEntryToCommand(entry)),
      ...persistedHistory.map(entry => logEntryToCommand(entry))
    ];
    
    // Deduplicate by ID (prefer active over history)
    const uniqueCommands = new Map<string, EnhancedCommandExecution>();
    allCommands.forEach(cmd => uniqueCommands.set(cmd.id, cmd));
    
    // Sort by start time (newest first)
    return Array.from(uniqueCommands.values()).sort((a, b) => 
      b.startTime.getTime() - a.startTime.getTime()
    );
  } catch (error) {
    // Fallback to empty array if there's an error
    console.error('Error reading persisted commands:', error);
    return [];
  }
}

/**
 * Synchronous version for compatibility (deprecated - returns empty array)
 * Use listAllCommands() instead
 */
export function listAllCommandsSync(): EnhancedCommandExecution[] {
  console.warn('listAllCommandsSync is deprecated. Use listAllCommands() instead.');
  return [];
}

/**
 * Cleanup old completed commands and handle stuck pending commands
 */
export async function cleanupOldCommands(maxAgeMinutes: number = 60): Promise<void> {
  const now = new Date();
  
  // Get all active commands from persistent storage and handle stuck ones
  try {
    const activeCommands = await commandLogger.getActiveCommands();
    
    for (const [id, commandEntry] of Object.entries(activeCommands)) {
      const command = logEntryToCommand(commandEntry);
      
      if (command.status === 'pending') {
        // Handle stuck pending commands (older than 5 minutes)
        const ageMinutes = (now.getTime() - command.startTime.getTime()) / (1000 * 60);
        if (ageMinutes > 5) {
          command.status = 'timeout';
          command.endTime = new Date();
          command.result = '[TIMEOUT] - Command stuck in pending state';
          command.exitCode = 124;
          
          // Update in persistent storage
          await commandLogger.logCommandUpdate(command);
        }
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Generate ultra-short shell detection script with proper conditional logic
 */
function getShellDetectionScript(): string {
  // Fixed logic: use if-then to prevent multiple outputs
  return `if [ "$ZSH_VERSION" ];then echo "SHELL_TYPE=zsh";elif [ "$BASH_VERSION" ];then echo "SHELL_TYPE=bash";else echo "SHELL_TYPE=sh";fi;echo "PWD_PATH=$(pwd)";echo "SYSTEM_INFO=$(uname -s)"`;
}

/**
 * Get command prefix for shell type - same as tabby-mcp strategy pattern
 */
function getCommandPrefix(shellType: string): string {
  switch (shellType) {
    case 'sh':
      return 'touch "$__TF"; '; // Triggers the trap mechanism in sh
    case 'bash':
    case 'zsh':
    case 'fish':
    default:
      return ''; // No prefix needed for other shells
  }
}

/**
 * Detect shell type from terminal output - exact same logic as tabby-mcp
 */
function detectShellTypeFromOutput(terminalOutput: string): { shellType: string; currentWorkingDirectory: string; systemInfo?: string } | null {
  try {
    if (!terminalOutput || typeof terminalOutput !== 'string') {
      console.warn('[DEBUG] Invalid terminal output provided for shell detection');
      return null;
    }

    // Strip ANSI escape codes like tabby-mcp does
    const lines = terminalOutput.replace(/\x1b\[[0-9;]*m/g, '').split('\n');

    if (!lines || lines.length === 0) {
      console.warn('[DEBUG] No lines found in terminal output');
      return null;
    }

    let shellType: string | null = null;
    let currentWorkingDirectory: string | null = null;
    let systemInfo: string | null = null;

    // Check the last 10 lines for SHELL_TYPE=, PWD_PATH=, and SYSTEM_INFO= patterns
    for (let i = Math.max(0, lines.length - 10); i < lines.length; i++) {
      const line = lines[i];
      if (line && line.startsWith('SHELL_TYPE=')) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          shellType = parts[1].trim();
          console.log(`[DEBUG] Raw detected shell type: "${shellType}"`);
        }
      } else if (line && line.startsWith('PWD_PATH=')) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          currentWorkingDirectory = parts[1].trim();
          console.log(`[DEBUG] Raw detected pwd: "${currentWorkingDirectory}"`);
        }
      } else if (line && line.startsWith('SYSTEM_INFO=')) {
        const parts = line.split('=', 2); // Only split on first = to preserve spaces in system info
        if (parts.length >= 2) {
          systemInfo = parts[1].trim();
          console.log(`[DEBUG] Raw detected system info: "${systemInfo}"`);
        }
      }
    }

    if (shellType && currentWorkingDirectory) {
      return { shellType, currentWorkingDirectory, systemInfo: systemInfo || undefined };
    }

    console.warn('[DEBUG] Missing SHELL_TYPE or PWD_PATH pattern in terminal output');
    return null;
  } catch (error) {
    console.error('[DEBUG] Error detecting shell type and pwd:', error);
    return null;
  }
}

/**
 * Enhanced shell detection with tabby-mcp logic
 */
export async function detectShellTypeTabbyStyle(paneId: string): Promise<{ shellType: string; currentWorkingDirectory: string; systemInfo?: string } | null> {
  try {
    // Send shell detection script
    const detectionScript = getShellDetectionScript();
    await tmux.executeTmux(`send-keys -t '${paneId}' '${detectionScript}' Enter`);
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Capture output
    const content = await tmux.capturePaneContent(paneId, 20);
    
    // Parse shell detection output
    return detectShellTypeFromOutput(content);
  } catch (error) {
    console.error('[DEBUG] Error in tabby-style shell detection:', error);
    return null;
  }
}