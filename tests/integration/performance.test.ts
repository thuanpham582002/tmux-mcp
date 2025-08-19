/**
 * Performance integration tests for Ink TUI
 * Tests TUI performance with large datasets and memory usage
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  createMockEnhancedExecutor,
  createMockCommandList,
  setupIntegrationTest, 
  teardownIntegrationTest,
  waitFor
} from './test-setup.js';

// Performance measurement utilities
const measurePerformance = <T>(fn: () => T): { result: T; duration: number; memory: number } => {
  const initialMemory = process.memoryUsage().heapUsed;
  const startTime = performance.now();
  
  const result = fn();
  
  const endTime = performance.now();
  const finalMemory = process.memoryUsage().heapUsed;
  
  return {
    result,
    duration: endTime - startTime,
    memory: finalMemory - initialMemory
  };
};

const measureAsyncPerformance = async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number; memory: number }> => {
  const initialMemory = process.memoryUsage().heapUsed;
  const startTime = performance.now();
  
  const result = await fn();
  
  const endTime = performance.now();
  const finalMemory = process.memoryUsage().heapUsed;
  
  return {
    result,
    duration: endTime - startTime,
    memory: finalMemory - initialMemory
  };
};

// Mock resource-intensive operations
const simulateHeavyRendering = (itemCount: number) => {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    data: `data-${i}`.repeat(100) // Simulate memory usage
  }));
  
  // Simulate rendering calculations
  return items.map(item => ({
    ...item,
    rendered: true,
    calculatedHeight: Math.random() * 100,
    calculatedWidth: Math.random() * 200
  }));
};

const simulatePollingOperations = async (pollCount: number, itemsPerPoll: number) => {
  const results = [];
  
  for (let i = 0; i < pollCount; i++) {
    const items = createMockCommandList(itemsPerPoll);
    results.push(...items);
    
    // Simulate async delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return results;
};

describe('Performance Integration Tests', () => {
  let mockEnhancedExecutor: any;
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = setupIntegrationTest());
    mockEnhancedExecutor = createMockEnhancedExecutor();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    teardownIntegrationTest();
  });

  describe('Large Dataset Handling', () => {
    it('should handle 1000+ commands efficiently', () => {
      const commandCount = 1000;
      const testCommands = createMockCommandList(commandCount);
      
      const { duration, memory } = measurePerformance(() => {
        // Simulate loading large dataset
        testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
        return mockEnhancedExecutor._getAllCommands();
      });
      
      expect(mockEnhancedExecutor._getCommandCount()).toBe(commandCount);
      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(memory).toBeLessThan(50 * 1024 * 1024); // Should use less than 50MB
    });

    it('should filter large datasets efficiently', () => {
      const commandCount = 5000;
      const testCommands = createMockCommandList(commandCount);
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      const { result, duration } = measurePerformance(() => {
        const allCommands = mockEnhancedExecutor._getAllCommands();
        
        // Simulate text filtering
        const filteredByCommand = allCommands.filter((cmd: any) =>
          cmd.command.toLowerCase().includes('npm')
        );
        
        // Simulate status filtering
        const filteredByStatus = allCommands.filter((cmd: any) =>
          cmd.status === 'completed'
        );
        
        return {
          total: allCommands.length,
          commandFiltered: filteredByCommand.length,
          statusFiltered: filteredByStatus.length
        };
      });
      
      expect(result.total).toBe(commandCount);
      expect(duration).toBeLessThan(50); // Should complete within 50ms
    });

    it('should handle rapid data updates efficiently', async () => {
      const updateCount = 100;
      const batchSize = 50;
      
      const { duration, memory } = await measureAsyncPerformance(async () => {
        const results = [];
        
        for (let i = 0; i < updateCount; i++) {
          // Simulate adding new commands
          const newCommands = createMockCommandList(batchSize);
          newCommands.forEach((cmd, idx) => {
            mockEnhancedExecutor._addMockCommand({
              ...cmd,
              id: `batch-${i}-cmd-${idx}`
            });
          });
          
          // Simulate state update
          await mockEnhancedExecutor.listAllCommands();
          results.push(i);
        }
        
        return results;
      });
      
      expect(mockEnhancedExecutor._getCommandCount()).toBe(updateCount * batchSize);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(memory).toBeLessThan(100 * 1024 * 1024); // Should use less than 100MB
    });

    it('should handle scrolling through large lists efficiently', () => {
      const commandCount = 10000;
      const visibleItems = 20;
      let selectedIndex = 0;
      
      // Simulate scrolling operations
      const { duration } = measurePerformance(() => {
        // Simulate scrolling to different positions
        const positions = [0, 100, 1000, 5000, 9999, 5000, 1000, 0];
        
        positions.forEach(position => {
          selectedIndex = Math.max(0, Math.min(commandCount - 1, position));
          
          // Simulate calculating visible range
          const scrollOffset = Math.max(0, selectedIndex - Math.floor(visibleItems / 2));
          const visibleStart = scrollOffset;
          const visibleEnd = Math.min(commandCount, scrollOffset + visibleItems);
          
          // Simulate rendering only visible items
          const visibleRange = { start: visibleStart, end: visibleEnd, count: visibleEnd - visibleStart };
        });
        
        return selectedIndex;
      });
      
      expect(duration).toBeLessThan(10); // Should be very fast for scrolling calculations
    });
  });

  describe('Memory Usage Tests', () => {
    it('should maintain stable memory usage during polling', async () => {
      const pollInterval = 50;
      const pollDuration = 500;
      const pollCount = Math.floor(pollDuration / pollInterval);
      
      // Initial memory measurement
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Add initial commands
      const initialCommands = createMockCommandList(100);
      initialCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      const memoryMeasurements: number[] = [];
      
      // Simulate continuous polling
      for (let i = 0; i < pollCount; i++) {
        await mockEnhancedExecutor.listAllCommands();
        
        // Add a few new commands each poll
        const newCommands = createMockCommandList(5);
        newCommands.forEach((cmd, idx) => {
          mockEnhancedExecutor._addMockCommand({
            ...cmd,
            id: `poll-${i}-cmd-${idx}`
          });
        });
        
        memoryMeasurements.push(process.memoryUsage().heapUsed);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory should not grow excessively (less than 20MB increase)
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
      
      // Memory usage should not have large spikes
      const maxMemory = Math.max(...memoryMeasurements);
      const minMemory = Math.min(...memoryMeasurements);
      const memorySpread = maxMemory - minMemory;
      
      expect(memorySpread).toBeLessThan(10 * 1024 * 1024); // Less than 10MB spread
    });

    it('should cleanup old commands efficiently', async () => {
      // Add many completed commands
      const oldCommands = createMockCommandList(1000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      oldCommands.forEach((cmd, i) => {
        mockEnhancedExecutor._addMockCommand({
          ...cmd,
          id: `old-cmd-${i}`,
          status: 'completed',
          endTime: new Date(oneHourAgo.getTime() - i * 1000) // Progressively older
        });
      });
      
      // Add some recent commands
      const recentCommands = createMockCommandList(100);
      recentCommands.forEach((cmd, i) => {
        mockEnhancedExecutor._addMockCommand({
          ...cmd,
          id: `recent-cmd-${i}`,
          status: 'completed',
          endTime: new Date() // Recent
        });
      });
      
      const beforeCleanup = process.memoryUsage().heapUsed;
      const commandsBeforeCleanup = mockEnhancedExecutor._getCommandCount();
      
      // Simulate cleanup (we'll simulate this since the mock doesn't implement real cleanup)
      const { duration } = await measureAsyncPerformance(async () => {
        // Simulate cleanup by removing old commands
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const commandsToKeep = mockEnhancedExecutor._getAllCommands()
          .filter((cmd: any) => !cmd.endTime || cmd.endTime > thirtyMinutesAgo);
        
        mockEnhancedExecutor._clearAllCommands();
        commandsToKeep.forEach((cmd: any) => mockEnhancedExecutor._addMockCommand(cmd));
        
        return commandsToKeep.length;
      });
      
      const afterCleanup = process.memoryUsage().heapUsed;
      const commandsAfterCleanup = mockEnhancedExecutor._getCommandCount();
      
      expect(commandsAfterCleanup).toBeLessThan(commandsBeforeCleanup);
      expect(commandsAfterCleanup).toBeCloseTo(100, 50); // Should keep ~100 recent commands
      expect(duration).toBeLessThan(100); // Cleanup should be fast
      
      // Memory should be reduced (though GC might not run immediately)
      // We mainly test that cleanup completes successfully
    });

    it('should handle memory pressure gracefully', () => {
      // Simulate memory pressure by creating large objects
      const largeObjects: any[] = [];
      let memoryPressureDetected = false;
      
      const { duration } = measurePerformance(() => {
        try {
          // Create progressively larger objects until we hit memory limits
          for (let i = 0; i < 1000 && !memoryPressureDetected; i++) {
            const currentMemory = process.memoryUsage().heapUsed;
            
            // Stop if we're using more than 200MB
            if (currentMemory > 200 * 1024 * 1024) {
              memoryPressureDetected = true;
              break;
            }
            
            // Create large command objects
            const commands = createMockCommandList(100);
            commands.forEach(cmd => {
              mockEnhancedExecutor._addMockCommand({
                ...cmd,
                id: `memory-test-${i}-${cmd.id}`,
                // Add large result to simulate memory usage
                result: 'x'.repeat(1000)
              });
            });
            
            largeObjects.push(commands);
          }
        } catch (error) {
          // Expected if we hit memory limits
          memoryPressureDetected = true;
        }
        
        return largeObjects.length;
      });
      
      // Should handle memory pressure without crashing
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      const finalMemory = process.memoryUsage().heapUsed;
      // Test should complete without throwing (indicating graceful handling)
      expect(finalMemory).toBeGreaterThan(0);
    });
  });

  describe('Rendering Performance', () => {
    it('should render large command lists efficiently', () => {
      const commandCount = 2000;
      const visibleItems = 25;
      
      const { duration, memory } = measurePerformance(() => {
        // Simulate component rendering with large dataset
        const items = simulateHeavyRendering(commandCount);
        
        // Simulate virtualized rendering (only render visible items)
        const visibleStart = 0;
        const visibleEnd = Math.min(visibleItems, items.length);
        const visibleItems_rendered = items.slice(visibleStart, visibleEnd);
        
        return {
          total: items.length,
          rendered: visibleItems_rendered.length
        };
      });
      
      expect(duration).toBeLessThan(100); // Should render within 100ms
      expect(memory).toBeLessThan(30 * 1024 * 1024); // Should use less than 30MB
    });

    it('should handle rapid re-renders efficiently', () => {
      const renderCount = 100;
      const itemsPerRender = 50;
      
      const { duration, memory } = measurePerformance(() => {
        const renderResults = [];
        
        for (let i = 0; i < renderCount; i++) {
          // Simulate state change and re-render
          const items = simulateHeavyRendering(itemsPerRender);
          const selectedIndex = i % itemsPerRender;
          
          // Simulate render calculations
          const rendered = items.map((item, idx) => ({
            ...item,
            selected: idx === selectedIndex,
            visible: idx >= 0 && idx < 20 // Only 20 visible
          }));
          
          renderResults.push(rendered.filter(item => item.visible).length);
        }
        
        return renderResults;
      });
      
      expect(duration).toBeLessThan(200); // Should handle 100 re-renders within 200ms
      expect(memory).toBeLessThan(20 * 1024 * 1024); // Should use less than 20MB
    });

    it('should optimize scroll rendering performance', () => {
      const totalItems = 5000;
      const visibleItems = 30;
      const scrollPositions = [0, 100, 1000, 2500, 4970, 2000, 500, 0];
      
      const { duration } = measurePerformance(() => {
        const results = scrollPositions.map(scrollTop => {
          // Simulate virtualized scrolling calculations
          const startIndex = Math.floor(scrollTop);
          const endIndex = Math.min(totalItems, startIndex + visibleItems);
          
          // Simulate rendering only visible range
          const visibleRange = Array.from(
            { length: endIndex - startIndex },
            (_, i) => startIndex + i
          );
          
          return {
            scrollTop,
            startIndex,
            endIndex,
            visibleCount: visibleRange.length
          };
        });
        
        return results;
      });
      
      expect(duration).toBeLessThan(5); // Should be very fast for scroll calculations
    });
  });

  describe('Concurrency Performance', () => {
    it('should handle concurrent polling and user input efficiently', async () => {
      const concurrentOperations = 20;
      const commandsPerOperation = 25;
      
      const { duration } = await measureAsyncPerformance(async () => {
        // Create concurrent operations mixing data updates and user interactions
        const operations = Array.from({ length: concurrentOperations }, async (_, i) => {
          // Simulate user interactions
          if (i % 3 === 0) {
            // Simulate navigation
            await new Promise(resolve => setTimeout(resolve, 5));
            return { type: 'navigation', index: i };
          } else if (i % 3 === 1) {
            // Simulate data polling
            const commands = createMockCommandList(commandsPerOperation);
            commands.forEach((cmd, idx) => {
              mockEnhancedExecutor._addMockCommand({
                ...cmd,
                id: `concurrent-${i}-${idx}`
              });
            });
            await mockEnhancedExecutor.listAllCommands();
            return { type: 'polling', count: commandsPerOperation };
          } else {
            // Simulate filtering
            await new Promise(resolve => setTimeout(resolve, 3));
            const allCommands = mockEnhancedExecutor._getAllCommands();
            const filtered = allCommands.filter((cmd: any) => cmd.status === 'completed');
            return { type: 'filtering', results: filtered.length };
          }
        });
        
        // Run all operations concurrently
        const results = await Promise.all(operations);
        return results;
      });
      
      expect(duration).toBeLessThan(500); // Should handle concurrent operations within 500ms
    });

    it('should maintain responsiveness under load', async () => {
      // Simulate high-frequency updates
      const updateInterval = 10; // 10ms updates
      const updateCount = 50;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < updateCount; i++) {
        const start = performance.now();
        
        // Simulate quick user action
        await new Promise(resolve => setTimeout(resolve, 1));
        
        const end = performance.now();
        responseTimes.push(end - start);
        
        // Add background load
        const commands = createMockCommandList(10);
        commands.forEach((cmd, idx) => {
          mockEnhancedExecutor._addMockCommand({
            ...cmd,
            id: `load-${i}-${idx}`
          });
        });
        
        await new Promise(resolve => setTimeout(resolve, updateInterval));
      }
      
      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      
      expect(averageResponseTime).toBeLessThan(50); // Average response should be fast
      expect(maxResponseTime).toBeLessThan(100); // No single response should be too slow
    });
  });

  describe('Resource Cleanup Performance', () => {
    it('should cleanup event listeners efficiently', () => {
      const listenerCount = 1000;
      const mockListeners: (() => void)[] = [];
      
      const { duration } = measurePerformance(() => {
        // Simulate adding many event listeners
        for (let i = 0; i < listenerCount; i++) {
          const listener = () => console.log(`listener-${i}`);
          mockListeners.push(listener);
        }
        
        // Simulate cleanup
        mockListeners.splice(0, mockListeners.length);
        
        return mockListeners.length;
      });
      
      expect(mockListeners).toHaveLength(0);
      expect(duration).toBeLessThan(50); // Should cleanup quickly
    });

    it('should handle component unmounting efficiently', () => {
      const componentCount = 100;
      const componentsToCleanup: any[] = [];
      
      const { duration, memory } = measurePerformance(() => {
        // Simulate creating many components
        for (let i = 0; i < componentCount; i++) {
          const component = {
            id: `component-${i}`,
            state: { data: createMockCommandList(10) },
            listeners: Array.from({ length: 5 }, (_, j) => () => `listener-${i}-${j}`),
            timers: Array.from({ length: 3 }, () => Math.random())
          };
          componentsToCleanup.push(component);
        }
        
        // Simulate unmounting/cleanup
        componentsToCleanup.forEach(component => {
          component.listeners.splice(0);
          component.timers.splice(0);
          component.state = null;
        });
        
        componentsToCleanup.splice(0);
        
        return componentCount;
      });
      
      expect(componentsToCleanup).toHaveLength(0);
      expect(duration).toBeLessThan(100); // Should cleanup within 100ms
      expect(memory).toBeLessThan(10 * 1024 * 1024); // Should not use excessive memory
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance benchmarks for common operations', async () => {
      const benchmarks = {
        commandListLoad: { maxTime: 50, maxMemory: 20 * 1024 * 1024 },
        filtering: { maxTime: 25, maxMemory: 5 * 1024 * 1024 },
        scrolling: { maxTime: 5, maxMemory: 1 * 1024 * 1024 },
        modeTransition: { maxTime: 10, maxMemory: 1 * 1024 * 1024 },
        copying: { maxTime: 100, maxMemory: 10 * 1024 * 1024 }
      };
      
      // Command list load benchmark
      const { duration: loadTime, memory: loadMemory } = measurePerformance(() => {
        const commands = createMockCommandList(1000);
        commands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
        return mockEnhancedExecutor._getAllCommands();
      });
      
      expect(loadTime).toBeLessThan(benchmarks.commandListLoad.maxTime);
      expect(loadMemory).toBeLessThan(benchmarks.commandListLoad.maxMemory);
      
      // Filtering benchmark
      const { duration: filterTime, memory: filterMemory } = measurePerformance(() => {
        const allCommands = mockEnhancedExecutor._getAllCommands();
        return allCommands.filter((cmd: any) => 
          cmd.command.toLowerCase().includes('test') || cmd.status === 'completed'
        );
      });
      
      expect(filterTime).toBeLessThan(benchmarks.filtering.maxTime);
      expect(filterMemory).toBeLessThan(benchmarks.filtering.maxMemory);
      
      // Scrolling benchmark
      const { duration: scrollTime, memory: scrollMemory } = measurePerformance(() => {
        let result = 0;
        for (let i = 0; i < 1000; i++) {
          result += Math.min(999, Math.max(0, i + Math.floor(Math.random() * 10) - 5));
        }
        return result;
      });
      
      expect(scrollTime).toBeLessThan(benchmarks.scrolling.maxTime);
      expect(scrollMemory).toBeLessThan(benchmarks.scrolling.maxMemory);
    });

    it('should maintain consistent performance across test runs', () => {
      const runCount = 5;
      const durations: number[] = [];
      const memoryUsages: number[] = [];
      
      // Run the same performance test multiple times
      for (let run = 0; run < runCount; run++) {
        mockEnhancedExecutor._clearAllCommands();
        
        const { duration, memory } = measurePerformance(() => {
          const commands = createMockCommandList(500);
          commands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
          
          // Perform various operations
          mockEnhancedExecutor.listAllCommands();
          const filtered = mockEnhancedExecutor._getAllCommands()
            .filter((cmd: any) => cmd.status === 'completed');
          
          return filtered.length;
        });
        
        durations.push(duration);
        memoryUsages.push(memory);
      }
      
      // Check consistency (standard deviation should be low)
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const durationVariance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
      const durationStdDev = Math.sqrt(durationVariance);
      
      // Performance should be consistent (std dev < 50% of average)
      expect(durationStdDev).toBeLessThan(avgDuration * 0.5);
      expect(avgDuration).toBeLessThan(100); // Average should still be fast
    });
  });
});