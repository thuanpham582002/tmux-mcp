import { jest } from '@jest/globals';
import type { EnhancedCommandExecution, ShellType } from '../../src/enhanced-executor.js';

/**
 * Mock enhanced executor for testing
 */
export class EnhancedExecutorMock {
  private static mockCommands: Map<string, EnhancedCommandExecution> = new Map();
  private static commandCounter = 0;

  static reset() {
    this.mockCommands.clear();
    this.commandCounter = 0;
  }

  static addMockCommand(command: Partial<EnhancedCommandExecution>): string {
    const id = command.id || `mock_cmd_${++this.commandCounter}`;
    const fullCommand: EnhancedCommandExecution = {
      id,
      paneId: command.paneId || '%0',
      command: command.command || 'echo "test"',
      status: command.status || 'pending',
      startTime: command.startTime || new Date(),
      aborted: command.aborted || false,
      retryCount: command.retryCount || 0,
      ...command
    };
    
    this.mockCommands.set(id, fullCommand);
    return id;
  }

  static updateCommandStatus(id: string, updates: Partial<EnhancedCommandExecution>) {
    const existing = this.mockCommands.get(id);
    if (existing) {
      this.mockCommands.set(id, { ...existing, ...updates });
    }
  }

  static getMockEnhancedExecutor() {
    return {
      // detectShellType removed - shell detection is handled by CommandExecutor

      executeCommand: jest.fn().mockImplementation(async (
        paneId: string,
        command: string,
        options: any = {}
      ) => {
        const commandId = this.addMockCommand({
          paneId,
          command,
          status: 'running',
          shellType: 'bash',
          currentWorkingDirectory: '/home/user'
        });

        // Simulate async execution
        setTimeout(() => {
          this.updateCommandStatus(commandId, {
            status: 'completed',
            endTime: new Date(),
            result: `Mock output for: ${command}`,
            exitCode: 0
          });
        }, 100);

        return commandId;
      }),

      cancelCommand: jest.fn().mockImplementation(async (commandId: string) => {
        const command = this.mockCommands.get(commandId);
        if (command && (command.status === 'running' || command.status === 'pending')) {
          this.updateCommandStatus(commandId, {
            status: 'cancelled',
            aborted: true,
            endTime: new Date()
          });
          return true;
        }
        return false;
      }),

      getEnhancedCommandStatus: jest.fn().mockImplementation((commandId: string) => {
        return this.mockCommands.get(commandId) || null;
      }),

      listActiveCommands: jest.fn().mockImplementation(() => {
        return Array.from(this.mockCommands.values())
          .filter(cmd => cmd.status === 'running' || cmd.status === 'pending');
      }),

      listAllCommands: jest.fn().mockImplementation(() => {
        return Array.from(this.mockCommands.values());
      }),

      cleanupOldCommands: jest.fn().mockImplementation((maxAgeMinutes: number = 60) => {
        const now = new Date();
        const cutoff = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);
        
        for (const [id, command] of this.mockCommands.entries()) {
          if (command.endTime && command.endTime < cutoff) {
            this.mockCommands.delete(id);
          }
        }
      })
    };
  }

  static getCommands() {
    return Array.from(this.mockCommands.values());
  }
}

/**
 * Create test scenarios for enhanced commands
 */
export function createTestCommandScenarios() {
  EnhancedExecutorMock.reset();
  
  // Running command
  EnhancedExecutorMock.addMockCommand({
    id: 'running_cmd',
    command: 'sleep 10',
    status: 'running',
    paneId: '%0',
    shellType: 'bash'
  });
  
  // Completed command
  EnhancedExecutorMock.addMockCommand({
    id: 'completed_cmd',
    command: 'echo "hello"',
    status: 'completed',
    paneId: '%0',
    shellType: 'bash',
    result: 'hello',
    exitCode: 0,
    endTime: new Date()
  });
  
  // Failed command
  EnhancedExecutorMock.addMockCommand({
    id: 'failed_cmd',
    command: 'exit 1',
    status: 'error',
    paneId: '%0',
    shellType: 'bash',
    result: '',
    exitCode: 1,
    endTime: new Date()
  });
  
  // Cancelled command
  EnhancedExecutorMock.addMockCommand({
    id: 'cancelled_cmd',
    command: 'find /',
    status: 'cancelled',
    paneId: '%0',
    shellType: 'bash',
    aborted: true,
    endTime: new Date()
  });
  
  return EnhancedExecutorMock.getMockEnhancedExecutor();
}