/**
 * Demo Integration Tests - Show các tính năng chính
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  createMockEnhancedExecutor,
  createMockCommandList,
  setupIntegrationTest, 
  teardownIntegrationTest
} from './test-setup';

describe('🎭 Demo Integration Tests for Ink TUI', () => {
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = setupIntegrationTest());
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    teardownIntegrationTest();
  });

  describe('📊 Mock Command Executor Demo', () => {
    it('🚀 should execute commands and track status', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      mockExecutor._clearAllCommands();
      
      console.log('🎯 Executing mock command...');
      
      // Execute a command
      const commandId = await mockExecutor.executeCommand('%0', 'echo "Hello Integration Test!"');
      expect(commandId).toBeDefined();
      
      // Wait for async completion
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Check command status
      const command = await mockExecutor.getEnhancedCommandStatus(commandId);
      expect(command?.status).toBe('completed');
      expect(command?.result).toContain('Output for: echo "Hello Integration Test!"');
      
      console.log('✅ Command executed successfully:', {
        id: command?.id,
        status: command?.status,
        command: command?.command,
        result: command?.result
      });
    });

    it('🎯 should handle multiple command statuses', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      mockExecutor._clearAllCommands();
      
      console.log('📝 Creating mixed status commands...');
      
      // Add commands with different statuses
      const testCommands = [
        { 
          id: 'cmd-running', 
          status: 'running', 
          command: 'tail -f app.log',
          paneId: '%0',
          startTime: new Date(),
          aborted: false,
          retryCount: 0
        },
        { 
          id: 'cmd-completed', 
          status: 'completed', 
          command: 'npm install',
          paneId: '%1', 
          startTime: new Date(),
          endTime: new Date(),
          result: 'Packages installed successfully',
          exitCode: 0,
          aborted: false,
          retryCount: 0
        },
        { 
          id: 'cmd-error', 
          status: 'error', 
          command: 'make build',
          paneId: '%2',
          startTime: new Date(),
          endTime: new Date(),
          result: 'Build failed: missing dependency',
          exitCode: 1,
          aborted: false,
          retryCount: 0
        }
      ];
      
      testCommands.forEach(cmd => mockExecutor._addMockCommand(cmd));
      
      // Test filtering by status
      const allCommands = await mockExecutor.listAllCommands();
      const activeCommands = await mockExecutor.listActiveCommands();
      
      expect(allCommands).toHaveLength(3);
      expect(activeCommands).toHaveLength(1); // Only running commands
      
      console.log('📊 Command Status Summary:');
      console.log('  Total commands:', allCommands.length);
      console.log('  Active commands:', activeCommands.length);
      console.log('  Command statuses:', allCommands.map(cmd => ({ 
        id: cmd.id, 
        status: cmd.status, 
        command: cmd.command 
      })));
    });
  });

  describe('⚡ Performance Demo', () => {
    it('🏎️ should handle large datasets efficiently', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      mockExecutor._clearAllCommands();
      
      console.log('⏱️ Performance test: Creating 1000 commands...');
      
      const startTime = performance.now();
      
      // Create 1000 commands
      const commands = createMockCommandList(1000);
      commands.forEach(cmd => mockExecutor._addMockCommand(cmd));
      
      const addTime = performance.now() - startTime;
      console.log(`⚡ Added 1000 commands in ${addTime.toFixed(2)}ms`);
      
      // Test retrieval performance
      const retrieveStart = performance.now();
      const allCommands = await mockExecutor.listAllCommands();
      const retrieveTime = performance.now() - retrieveStart;
      
      console.log(`📊 Retrieved ${allCommands.length} commands in ${retrieveTime.toFixed(2)}ms`);
      
      expect(allCommands).toHaveLength(1000);
      expect(addTime).toBeLessThan(500); // Should be fast
      expect(retrieveTime).toBeLessThan(100); // Should be very fast
      
      // Test filtering performance
      const filterStart = performance.now();
      const completedCommands = allCommands.filter(cmd => cmd.status === 'completed');
      const filterTime = performance.now() - filterStart;
      
      console.log(`🔍 Filtered to ${completedCommands.length} completed commands in ${filterTime.toFixed(2)}ms`);
      expect(filterTime).toBeLessThan(50); // Filtering should be very fast
    });

    it('🔄 should handle concurrent operations', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      mockExecutor._clearAllCommands();
      
      console.log('🚀 Testing concurrent operations...');
      
      const startTime = performance.now();
      
      // Run multiple operations concurrently
      const operations = [
        mockExecutor.executeCommand('%0', 'npm test'),
        mockExecutor.executeCommand('%1', 'npm build'), 
        mockExecutor.executeCommand('%2', 'npm lint'),
        mockExecutor.listAllCommands(),
        mockExecutor.listActiveCommands(),
        mockExecutor.listAllCommands()
      ];
      
      const results = await Promise.all(operations);
      const duration = performance.now() - startTime;
      
      console.log(`⚡ Completed ${operations.length} concurrent operations in ${duration.toFixed(2)}ms`);
      console.log('📊 Results:', {
        executeResults: results.slice(0, 3).map(id => `Command ${id} executed`),
        listResults: results.slice(3).map((list, i) => `List operation ${i+1}: ${Array.isArray(list) ? list.length : 0} items`)
      });
      
      expect(results).toHaveLength(6);
      expect(duration).toBeLessThan(300); // Should handle concurrency well
    });
  });

  describe('🎨 TUI Simulation Demo', () => {
    it('📱 should simulate terminal environment', () => {
      console.log('📐 Terminal Environment:');
      console.log('  Width:', process.stdout.columns);
      console.log('  Height:', process.stdout.rows);
      console.log('  Write function available:', typeof process.stdout.write);
      
      expect(process.stdout.columns).toBe(120);
      expect(process.stdout.rows).toBe(30);
      expect(process.stdout.write).toBeDefined();
    });

    it('📋 should create realistic command data', () => {
      console.log('🎲 Generating realistic test data...');
      
      const commands = createMockCommandList(10);
      
      console.log('📊 Sample Commands Generated:');
      commands.slice(0, 3).forEach((cmd, i) => {
        console.log(`  ${i+1}. [${cmd.status}] ${cmd.command} (${cmd.id})`);
      });
      
      expect(commands).toHaveLength(10);
      
      // Check data variety
      const statuses = new Set(commands.map(cmd => cmd.status));
      const commandTypes = new Set(commands.map(cmd => cmd.command.split(' ')[0]));
      
      console.log('📈 Data Variety:');
      console.log('  Unique statuses:', Array.from(statuses));
      console.log('  Command types:', Array.from(commandTypes).slice(0, 5));
      
      expect(statuses.size).toBeGreaterThan(1);
      expect(commandTypes.size).toBeGreaterThan(1);
    });
  });

  describe('🛠️ Error Handling Demo', () => {
    it('⚠️ should handle errors gracefully', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      
      console.log('🚨 Testing error scenarios...');
      
      // Test 1: Non-existent command
      const missingCommand = await mockExecutor.getEnhancedCommandStatus('non-existent');
      expect(missingCommand).toBeNull();
      console.log('✅ Handled missing command gracefully');
      
      // Test 2: Cancel non-existent command
      const cancelResult = await mockExecutor.cancelCommand('non-existent');
      expect(cancelResult).toBe(false);
      console.log('✅ Handled invalid cancellation gracefully');
      
      // Test 3: Mock function error
      mockExecutor.listAllCommands.mockRejectedValueOnce(new Error('API Error'));
      await expect(mockExecutor.listAllCommands()).rejects.toThrow('API Error');
      console.log('✅ Handled async errors correctly');
      
      // Test 4: Recovery after error
      const commands = await mockExecutor.listAllCommands(); // Should work again
      expect(Array.isArray(commands)).toBe(true);
      console.log('✅ Recovered successfully after error');
    });
  });

  describe('🎭 User Workflow Simulation', () => {
    it('🎯 should simulate complete user workflow', async () => {
      const mockExecutor = createMockEnhancedExecutor();
      mockExecutor._clearAllCommands();
      
      console.log('👤 Simulating user workflow...');
      
      // Step 1: User starts some commands
      console.log('  1️⃣ User starts multiple commands...');
      const cmd1 = await mockExecutor.executeCommand('%0', 'npm start');
      const cmd2 = await mockExecutor.executeCommand('%1', 'npm test --watch');
      
      // Step 2: User checks status
      console.log('  2️⃣ User checks active commands...');
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for completion
      const activeCommands = await mockExecutor.listActiveCommands();
      console.log(`     Found ${activeCommands.length} active commands`);
      
      // Step 3: User cancels a command  
      console.log('  3️⃣ User cancels a command...');
      // Add a running command first to cancel
      mockExecutor._addMockCommand({
        id: cmd1,
        status: 'running',
        command: 'npm start',
        paneId: '%0',
        startTime: new Date(),
        aborted: false,
        retryCount: 0
      });
      
      const cancelled = await mockExecutor.cancelCommand(cmd1);
      expect(cancelled).toBe(true);
      
      // Step 4: User views final status
      console.log('  4️⃣ User views final status...');
      const finalCommands = await mockExecutor.listAllCommands();
      const statusSummary = finalCommands.reduce((acc, cmd) => {
        acc[cmd.status] = (acc[cmd.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('     Final status summary:', statusSummary);
      
      expect(finalCommands.length).toBeGreaterThan(0);
      console.log('✅ User workflow completed successfully!');
    });
  });
});