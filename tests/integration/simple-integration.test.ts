/**
 * Simple integration tests to verify the test infrastructure works
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  createMockEnhancedExecutor,
  createMockCommandList,
  setupIntegrationTest, 
  teardownIntegrationTest
} from './test-setup';

describe('Integration Test Infrastructure', () => {
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = setupIntegrationTest());
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    teardownIntegrationTest();
  });

  describe('Mock Enhanced Executor', () => {
    it('should create and manage mock commands', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Ensure clean state
      mockExecutor._clearAllCommands();
      
      // Add test commands
      const testCommands = createMockCommandList(5);
      testCommands.forEach(cmd => mockExecutor._addMockCommand(cmd));
      
      // Test command retrieval
      const allCommands = await mockExecutor.listAllCommands();
      expect(allCommands).toHaveLength(5);
      expect(mockExecutor._getCommandCount()).toBe(5);
    });

    it('should handle command execution', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Execute a command
      const commandId = await mockExecutor.executeCommand('%0', 'echo "test"');
      expect(commandId).toBeDefined();
      expect(typeof commandId).toBe('string');
      
      // Wait for async completion
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Check command status
      const command = await mockExecutor.getEnhancedCommandStatus(commandId);
      expect(command).toBeDefined();
      expect(command?.status).toBe('completed');
    });

    it('should handle command cancellation', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Add a running command
      mockExecutor._addMockCommand({
        id: 'running-test',
        status: 'running',
        command: 'sleep 10',
        paneId: '%0'
      });
      
      // Cancel the command
      const cancelled = await mockExecutor.cancelCommand('running-test');
      expect(cancelled).toBe(true);
      
      // Check it was cancelled
      const command = await mockExecutor.getEnhancedCommandStatus('running-test');
      expect(command?.status).toBe('cancelled');
      expect(command?.aborted).toBe(true);
    });

    it('should handle active and all command listings', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Ensure clean state
      mockExecutor._clearAllCommands();
      
      // Add mixed status commands with proper structure
      const commands = [
        { 
          id: 'cmd1', 
          status: 'running', 
          command: 'test1', 
          paneId: '%0',
          startTime: new Date(),
          aborted: false,
          retryCount: 0
        },
        { 
          id: 'cmd2', 
          status: 'completed', 
          command: 'test2', 
          paneId: '%1',
          startTime: new Date(),
          endTime: new Date(),
          aborted: false,
          retryCount: 0
        },
        { 
          id: 'cmd3', 
          status: 'pending', 
          command: 'test3', 
          paneId: '%2',
          startTime: new Date(),
          aborted: false,
          retryCount: 0
        },
        { 
          id: 'cmd4', 
          status: 'error', 
          command: 'test4', 
          paneId: '%3',
          startTime: new Date(),
          endTime: new Date(),
          aborted: false,
          retryCount: 0
        }
      ];
      
      commands.forEach(cmd => mockExecutor._addMockCommand(cmd));
      
      // Test active commands (running + pending)
      const activeCommands = await mockExecutor.listActiveCommands();
      expect(activeCommands).toHaveLength(2);
      expect(activeCommands.every(cmd => 
        cmd.status === 'running' || cmd.status === 'pending'
      )).toBe(true);
      
      // Test all commands
      const allCommands = await mockExecutor.listAllCommands();
      expect(allCommands).toHaveLength(4);
    });

    it('should handle cleanup operations', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Ensure clean state
      mockExecutor._clearAllCommands();
      
      // Add some test commands
      const testCommands = createMockCommandList(10);
      testCommands.forEach(cmd => mockExecutor._addMockCommand(cmd));
      
      expect(mockExecutor._getCommandCount()).toBe(10);
      
      // Cleanup should not throw
      await expect(mockExecutor.cleanupOldCommands()).resolves.toBeUndefined();
      
      // Clear all for testing
      mockExecutor._clearAllCommands();
      expect(mockExecutor._getCommandCount()).toBe(0);
    });
  });

  describe('Test Utilities', () => {
    it('should create realistic command lists', () => {
      const commands = createMockCommandList(15);
      
      expect(commands).toHaveLength(15);
      expect(commands[0]).toHaveProperty('id');
      expect(commands[0]).toHaveProperty('command');
      expect(commands[0]).toHaveProperty('status');
      expect(commands[0]).toHaveProperty('startTime');
      expect(commands[0]).toHaveProperty('paneId');
      
      // Check variety in commands
      const statuses = commands.map(cmd => cmd.status);
      const uniqueStatuses = new Set(statuses);
      expect(uniqueStatuses.size).toBeGreaterThan(1);
    });

    it('should handle terminal mock setup', () => {
      expect(process.stdout.columns).toBe(120);
      expect(process.stdout.rows).toBe(30);
      expect(process.stdout.write).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle executor errors gracefully', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Mock a function to throw an error
      mockExecutor.listAllCommands.mockRejectedValueOnce(new Error('Test error'));
      
      // Should not throw unhandled error
      await expect(mockExecutor.listAllCommands()).rejects.toThrow('Test error');
    });

    it('should handle missing commands', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Try to get non-existent command
      const command = await mockExecutor.getEnhancedCommandStatus('non-existent');
      expect(command).toBeNull();
      
      // Try to cancel non-existent command
      const cancelled = await mockExecutor.cancelCommand('non-existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('Performance Validation', () => {
    it('should handle large command sets efficiently', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      const startTime = performance.now();
      
      // Add 1000 commands
      const commands = createMockCommandList(1000);
      commands.forEach(cmd => mockExecutor._addMockCommand(cmd));
      
      const addTime = performance.now() - startTime;
      expect(addTime).toBeLessThan(500); // Should be fast
      
      // Retrieve all commands
      const retrieveStart = performance.now();
      const allCommands = await mockExecutor.listAllCommands();
      const retrieveTime = performance.now() - retrieveStart;
      
      expect(allCommands).toHaveLength(1000);
      expect(retrieveTime).toBeLessThan(100); // Should be very fast
    });

    it('should handle concurrent operations', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      // Run multiple operations concurrently
      const operations = [
        mockExecutor.executeCommand('%0', 'test1'),
        mockExecutor.executeCommand('%1', 'test2'),
        mockExecutor.executeCommand('%2', 'test3'),
        mockExecutor.listAllCommands(),
        mockExecutor.listActiveCommands()
      ];
      
      const startTime = performance.now();
      const results = await Promise.all(operations);
      const duration = performance.now() - startTime;
      
      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(200); // Should handle concurrency well
    });
  });
});