import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from 'uuid';
import * as tmux from "./tmux.js";
import { commandLogger } from "./command-logger.js";
import { CommandExecutor } from "./command-executor.js";
import { getAtuinIntegration } from "./atuin-integration.js";
import { createLogger } from "./logger.js";

const exec = promisify(execCallback);
const logger = createLogger('enhanced-executor');

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

/**
 * Simplified command execution with single end-marker approach
 */
export async function executeCommand(
  paneId: string,
  command: string,
  options: {
    maxRetries?: number;
    timeout?: number;
    detectShell?: boolean;
  } = {}
): Promise<string> {
  const commandId = uuidv4();
  const { maxRetries = 3, timeout } = options;

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

  // Save command to Atuin when it starts
  let atuinCommandId: string | null = null;
  try {
    const atuin = getAtuinIntegration();
    atuinCommandId = await atuin.saveCommandStart(command, commandId, enhancedCommand.currentWorkingDirectory);
    logger.debug('Command saved to Atuin', { command, commandId: atuinCommandId });
  } catch (atuinError) {
    logger.debug('Failed to save command to Atuin', { error: atuinError });
  }

  try {
    // Create CommandExecutor instance
    const commandExecutor = new CommandExecutor();

    // Generate single end marker - just use timestamp
    const timestamp = Date.now().toString();
    const endMarker = timestamp;

    // Set up command tracking with abort handler
    let aborted = false;
    const abortHandler = () => { aborted = true; };

    // Mark command as running
    enhancedCommand.status = 'running';
    await commandLogger.logCommandUpdate(enhancedCommand);

    // Step 1: Execute command directly with end marker
    await commandExecutor.executeCommand(paneId, command, endMarker);

    // Step 2: Wait for command completion
    const result = await commandExecutor.waitForCommandCompletion(
      paneId, endMarker, () => aborted, timeout, commandId
    );

    // Process results with clear status priority: cancelled > timeout > running > completed
    try {
      const persistentCommand = await commandLogger.getCommandById(commandId);
      if (persistentCommand && persistentCommand.status === 'cancelled') {
        enhancedCommand.status = 'cancelled';
        enhancedCommand.result = `Command cancelled by user request\n\nPartial Output:\n${result.output || '(no output captured)'}`;
        enhancedCommand.exitCode = -1;
        logger.debug('Command cancelled externally', { commandId });
      } else if (aborted) {
        enhancedCommand.status = 'cancelled';
        enhancedCommand.result = `Command aborted internally\n\nPartial Output:\n${result.output || '(no output captured)'}`;
        enhancedCommand.exitCode = -1;
        logger.debug('Command aborted internally', { commandId });
      } else if (result.commandStarted && result.commandFinished) {
        // Command completed successfully
        enhancedCommand.status = 'completed';
        enhancedCommand.result = result.output;
        enhancedCommand.exitCode = result.exitCode ?? 0;
        logger.debug('Command completed', { commandId, exitCode: enhancedCommand.exitCode });

        // Update command in Atuin history with final results
        if (atuinCommandId) {
          try {
            const atuin = getAtuinIntegration();
            const duration = enhancedCommand.endTime ? enhancedCommand.endTime.getTime() - enhancedCommand.startTime.getTime() : 0;
            await atuin.updateCommand(atuinCommandId, enhancedCommand.exitCode ?? 0, duration);
            logger.debug('Command updated in Atuin', { commandId: atuinCommandId, exitCode: enhancedCommand.exitCode, duration });
          } catch (atuinError) {
            logger.debug('Failed to update command in Atuin', { error: atuinError });
          }
        }
      } else if (result.commandStarted && !result.commandFinished) {
        // Command timed out (started but didn't finish)
        enhancedCommand.status = 'timeout';
        const statusText = result.commandStarted ? 'RUNNING' : 'NOT_STARTED';
        enhancedCommand.result = `Command execution timed out after ${timeout}ms

Command: ${command}

Status: ${statusText}
Buffer Output:
${result.output || '(no output captured)'}

Use 'wait-for-output' to continue monitoring or 'cancel-command' to stop`;
        enhancedCommand.exitCode = 124; // Standard timeout exit code
        logger.debug('Command timed out', { commandId, timeout });
      } else {
        // Command failed to start or other error
        enhancedCommand.status = 'error';
        enhancedCommand.result = result.output || 'Failed to start command execution';
        enhancedCommand.exitCode = result.exitCode ?? 1;
        logger.debug('Command failed to start or had error', { commandId });
      }
    } catch (error) {
      console.warn(`Could not check persistent storage for command ${commandId}, using result-based status:`, error);
      // Fallback to result-based status if persistent storage unavailable
      if (result.commandStarted && result.commandFinished) {
        enhancedCommand.status = 'completed';
        enhancedCommand.result = result.output;
        enhancedCommand.exitCode = result.exitCode ?? 0;

        // Update command in Atuin history with final results (fallback)
        if (atuinCommandId) {
          try {
            const atuin = getAtuinIntegration();
            const duration = enhancedCommand.endTime ? enhancedCommand.endTime.getTime() - enhancedCommand.startTime.getTime() : 0;
            await atuin.updateCommand(atuinCommandId, enhancedCommand.exitCode ?? 0, duration);
            logger.debug('Command updated in Atuin', { commandId: atuinCommandId, exitCode: enhancedCommand.exitCode, duration });
          } catch (atuinError) {
            logger.debug('Failed to update command in Atuin', { error: atuinError });
          }
        }
      } else if (result.commandStarted && !result.commandFinished) {
        enhancedCommand.status = 'timeout';
        enhancedCommand.result = `Command timed out\n\nOutput:\n${result.output || '(no output captured)'}`;
        enhancedCommand.exitCode = 124;
      } else {
        enhancedCommand.status = 'error';
        enhancedCommand.result = result.output || 'Failed to execute command';
        enhancedCommand.exitCode = 1;
      }
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