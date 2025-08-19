import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from 'uuid';
import * as tmux from "./tmux.js";
import { commandLogger } from "./command-logger.js";
import { CommandExecutor } from "./command-executor.js";

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

// Shell detection is handled by CommandExecutor using shell-strategies.ts
// Legacy shell detection code removed - modern implementation in CommandExecutor.executeShellDetection()

/**
 * Enhanced command execution with EXACT tabby-mcp 3-stage trap logic
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
    // Create CommandExecutor instance (EXACT tabby-mcp approach)
    const commandExecutor = new CommandExecutor();
    
    // Generate markers - EXACT tabby-mcp format
    const timestamp = Date.now();
    const startMarker = `_S${timestamp}`;
    const endMarker = `_E${timestamp}`;
    
    // Set up command tracking with abort handler
    let aborted = false;
    const abortHandler = () => { aborted = true; };
    
    // Step 1: Execute shell detection - EXACT tabby-mcp flow
    enhancedCommand.status = 'running';
    await commandLogger.logCommandUpdate(enhancedCommand);
    
    const { shellDetectionResult, attempts, maxAttempts } = await commandExecutor.executeShellDetection(
      paneId, command, startMarker
    );
    
    if (!shellDetectionResult) {
      enhancedCommand.status = 'error';
      enhancedCommand.result = `Failed to detect shell type after ${maxAttempts} attempts`;
      enhancedCommand.endTime = new Date();
      await commandLogger.logCommandUpdate(enhancedCommand);
      throw new Error(`Failed to detect shell type after ${maxAttempts} attempts`);
    }
    
    // Update command with shell detection results
    enhancedCommand.shellType = shellDetectionResult.shellType as any;
    enhancedCommand.currentWorkingDirectory = shellDetectionResult.currentWorkingDirectory;
    
    // Step 2: Send setup script after successful shell detection - EXACT tabby-mcp flow
    await commandExecutor.sendSetupScript(paneId, shellDetectionResult, startMarker, endMarker);
    
    // Step 3: Wait for command completion - EXACT tabby-mcp flow
    const result = await commandExecutor.waitForCommandCompletion(
      paneId, startMarker, endMarker, () => aborted, timeout
    );
    
    // Process results - EXACT tabby-mcp approach
    if (result.commandStarted && result.commandFinished) {
      enhancedCommand.status = 'completed';
      enhancedCommand.result = result.output;
      enhancedCommand.exitCode = result.exitCode ?? undefined;
    } else if (result.commandStarted && !result.commandFinished) {
      enhancedCommand.status = 'timeout';
      enhancedCommand.result = `[TIMEOUT after ${timeout}ms]\n\n${result.output}`;
      enhancedCommand.exitCode = 124; // Standard timeout exit code
    } else {
      enhancedCommand.status = 'error';
      enhancedCommand.result = result.output || 'Failed to start command execution';
      enhancedCommand.exitCode = result.exitCode ?? 1;
    }
    
    enhancedCommand.endTime = new Date();
    
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

// Old waitForCommandCompletion function removed - now using CommandExecutor.waitForCommandCompletion

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

// Old shell detection functions removed - now using ShellContext from shell-strategies.ts
