/**
 * Integration test setup for Ink TUI components
 * Provides utilities for testing React Ink components with proper mocking
 */

import { jest } from '@jest/globals';
import type { ReactNode } from 'react';

// Mock Ink components and hooks
export const mockInkComponents = {
  Box: ({ children, ...props }: { children?: ReactNode; [key: string]: any }) => children,
  Text: ({ children, ...props }: { children?: ReactNode; [key: string]: any }) => children,
  useApp: () => ({
    exit: jest.fn(),
    stdout: process.stdout,
    stdin: process.stdin
  }),
  useInput: jest.fn(),
  render: jest.fn().mockReturnValue({
    waitUntilExit: jest.fn().mockResolvedValue(undefined),
    unmount: jest.fn()
  })
};

// Mock terminal dimensions for consistent testing
export const mockTerminal = {
  width: 120,
  height: 30,
  setupMock: () => {
    Object.defineProperty(process.stdout, 'columns', {
      value: 120,
      configurable: true
    });
    Object.defineProperty(process.stdout, 'rows', {
      value: 30,
      configurable: true
    });
    
    // Mock terminal write operations
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  },
  teardownMock: () => {
    jest.restoreAllMocks();
  }
};

// Mock input simulation utilities
export const simulateInput = {
  key: (key: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) => ({
    input: key,
    key: {
      ctrl: modifiers.ctrl || false,
      shift: modifiers.shift || false,
      upArrow: key === 'upArrow',
      downArrow: key === 'downArrow',
      leftArrow: key === 'leftArrow',
      rightArrow: key === 'rightArrow',
      return: key === 'return',
      space: key === 'space',
      backspace: key === 'backspace',
      tab: key === 'tab'
    }
  }),
  sequence: (keys: Array<{ key: string; modifiers?: { ctrl?: boolean; shift?: boolean } }>) => {
    return keys.map(({ key, modifiers }) => simulateInput.key(key, modifiers));
  }
};

// Enhanced command execution mock for integration tests
export const createMockCommandExecution = (overrides: any = {}) => ({
  id: 'test-cmd-123',
  paneId: '%0',
  command: 'echo "test command"',
  status: 'completed',
  startTime: new Date('2024-01-01T10:00:00Z'),
  endTime: new Date('2024-01-01T10:00:01Z'),
  result: 'test command',
  exitCode: 0,
  aborted: false,
  retryCount: 0,
  shellType: 'bash' as const,
  currentWorkingDirectory: '/home/user',
  ...overrides
});

// Create multiple mock commands for testing
export const createMockCommandList = (count: number = 10): any[] => {
  const statuses = ['running', 'completed', 'error', 'cancelled', 'timeout'];
  const commands = [
    'ls -la',
    'grep -r "pattern" .',
    'npm install',
    'docker build -t app .',
    'tail -f /var/log/app.log',
    'curl -X POST api/endpoint',
    'find . -name "*.js"',
    'git push origin main',
    'pytest tests/',
    'webpack --mode production'
  ];

  return Array.from({ length: count }, (_, i) => {
    const baseTime = new Date('2024-01-01T10:00:00Z');
    const startTime = new Date(baseTime.getTime() + i * 1000);
    const status = statuses[i % statuses.length];
    
    return createMockCommandExecution({
      id: `cmd-${i + 1}`,
      paneId: `%${i}`,
      command: commands[i % commands.length],
      status,
      startTime,
      endTime: status === 'running' ? undefined : new Date(startTime.getTime() + 2000),
      result: status === 'error' ? 'Command failed' : `Output for command ${i + 1}`,
      exitCode: status === 'error' ? 1 : 0
    });
  });
};

// Mock enhanced executor with realistic behavior
export const createMockEnhancedExecutor = () => {
  const commands = new Map<string, any>();
  let commandCounter = 0;

  // Populate with initial test data
  createMockCommandList(20).forEach(cmd => commands.set(cmd.id, cmd));

  return {
    executeCommand: jest.fn().mockImplementation(async (paneId: string, command: string) => {
      const id = `mock-cmd-${++commandCounter}`;
      const newCommand = createMockCommandExecution({
        id,
        paneId,
        command,
        status: 'running'
      });
      
      commands.set(id, newCommand);
      
      // Simulate async completion after 100ms
      setTimeout(() => {
        commands.set(id, {
          ...newCommand,
          status: 'completed',
          endTime: new Date(),
          result: `Output for: ${command}`
        });
      }, 100);
      
      return id;
    }),

    cancelCommand: jest.fn().mockImplementation(async (commandId: string) => {
      const command = commands.get(commandId);
      if (command && (command.status === 'running' || command.status === 'pending')) {
        commands.set(commandId, {
          ...command,
          status: 'cancelled',
          aborted: true,
          endTime: new Date()
        });
        return true;
      }
      return false;
    }),

    getEnhancedCommandStatus: jest.fn().mockImplementation(async (commandId: string) => {
      return commands.get(commandId) || null;
    }),

    listActiveCommands: jest.fn().mockImplementation(async () => {
      return Array.from(commands.values())
        .filter(cmd => cmd.status === 'running' || cmd.status === 'pending');
    }),

    listAllCommands: jest.fn().mockImplementation(async () => {
      return Array.from(commands.values())
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }),

    cleanupOldCommands: jest.fn().mockImplementation(async () => {
      // Mock cleanup - remove commands older than 1 hour
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const [id, command] of commands.entries()) {
        if (command.endTime && command.endTime.getTime() < oneHourAgo) {
          commands.delete(id);
        }
      }
    }),

    // Test utilities
    _addMockCommand: (command: any) => {
      commands.set(command.id, command);
    },
    _getAllCommands: () => Array.from(commands.values()),
    _clearAllCommands: () => commands.clear(),
    _getCommandCount: () => commands.size
  };
};

// Async test utilities
export const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 50
): Promise<void> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
};

// Test cleanup utilities
export const setupIntegrationTest = () => {
  mockTerminal.setupMock();
  
  // Mock Ink components
  jest.mock('ink', () => mockInkComponents);
  
  return {
    cleanup: () => {
      mockTerminal.teardownMock();
      jest.clearAllMocks();
    }
  };
};

export const teardownIntegrationTest = () => {
  mockTerminal.teardownMock();
  jest.restoreAllMocks();
};

// Add missing react-testing-library setup
jest.mock('@testing-library/react-hooks', () => ({
  renderHook: jest.fn(),
  act: jest.fn()
}));