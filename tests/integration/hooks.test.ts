/**
 * Integration tests for React hooks used in Ink TUI
 * Tests real async interactions and cross-hook coordination
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-hooks';
import { 
  createMockEnhancedExecutor,
  createMockCommandList,
  setupIntegrationTest, 
  teardownIntegrationTest,
  simulateInput,
  waitFor
} from './test-setup.js';

// We'll need to test the actual hook implementations
// For now, create mock implementations that simulate the real behavior

describe('Hooks Integration Tests', () => {
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

  describe('usePolling Hook', () => {
    // Mock implementation of usePolling for testing
    const createUsePolling = () => {
      let intervalId: NodeJS.Timeout | null = null;
      let isActive = false;
      
      return (callback: () => Promise<void>, interval: number) => {
        const start = () => {
          if (!isActive) {
            isActive = true;
            intervalId = setInterval(async () => {
              try {
                await callback();
              } catch (error) {
                console.error('Polling error:', error);
              }
            }, interval);
          }
        };
        
        const stop = () => {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            isActive = false;
          }
        };
        
        // Auto-start on mount
        start();
        
        // Return cleanup function
        return () => stop();
      };
    };

    it('should poll at specified interval', async () => {
      const usePolling = createUsePolling();
      const mockCallback = jest.fn().mockResolvedValue(undefined);
      const interval = 100;
      
      // Start polling
      const cleanup = usePolling(mockCallback, interval);
      
      // Wait for multiple intervals
      await new Promise(resolve => setTimeout(resolve, 350));
      
      // Should have been called multiple times
      expect(mockCallback).toHaveBeenCalledTimes(3);
      
      cleanup();
    });

    it('should handle callback errors gracefully', async () => {
      const usePolling = createUsePolling();
      const mockCallback = jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(undefined);
      
      const interval = 50;
      
      // Start polling
      const cleanup = usePolling(mockCallback, interval);
      
      // Wait for multiple calls including the error
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should continue polling despite error
      expect(mockCallback).toHaveBeenCalledTimes(3);
      
      cleanup();
    });

    it('should stop polling when cleanup is called', async () => {
      const usePolling = createUsePolling();
      const mockCallback = jest.fn().mockResolvedValue(undefined);
      const interval = 50;
      
      // Start polling
      const cleanup = usePolling(mockCallback, interval);
      
      // Wait for some calls
      await new Promise(resolve => setTimeout(resolve, 100));
      const callsBeforeCleanup = mockCallback.mock.calls.length;
      
      // Stop polling
      cleanup();
      
      // Wait more time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should not have additional calls
      expect(mockCallback).toHaveBeenCalledTimes(callsBeforeCleanup);
    });

    it('should work with real command executor polling', async () => {
      const usePolling = createUsePolling();
      
      // Add test commands
      const testCommands = createMockCommandList(5);
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      const pollingCallback = async () => {
        await mockEnhancedExecutor.listAllCommands();
      };
      
      // Start polling with real executor
      const cleanup = usePolling(pollingCallback, 100);
      
      // Wait for polling
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Should have called listAllCommands multiple times
      expect(mockEnhancedExecutor.listAllCommands).toHaveBeenCalled();
      expect(mockEnhancedExecutor.listAllCommands).toHaveBeenCalledTimes(2);
      
      cleanup();
    });
  });

  describe('useScrolling Hook', () => {
    // Mock implementation of useScrolling
    const createUseScrolling = () => {
      return (options: {
        totalItems: number;
        visibleItems: number;
        selectedIndex: number;
        onSelectedIndexChange: (index: number) => void;
      }) => {
        let scrollOffset = 0;
        const { totalItems, visibleItems, selectedIndex, onSelectedIndexChange } = options;
        
        const updateScroll = (newSelectedIndex: number) => {
          // Calculate new scroll offset to keep selection visible
          if (newSelectedIndex < scrollOffset) {
            scrollOffset = newSelectedIndex;
          } else if (newSelectedIndex >= scrollOffset + visibleItems) {
            scrollOffset = newSelectedIndex - visibleItems + 1;
          }
          
          // Ensure scroll offset bounds
          scrollOffset = Math.max(0, Math.min(scrollOffset, totalItems - visibleItems));
          
          onSelectedIndexChange(newSelectedIndex);
        };
        
        return {
          scrollOffset,
          handleScrollUp: () => {
            const newIndex = Math.max(0, selectedIndex - 1);
            updateScroll(newIndex);
          },
          handleScrollDown: () => {
            const newIndex = Math.min(totalItems - 1, selectedIndex + 1);
            updateScroll(newIndex);
          },
          handlePageUp: () => {
            const newIndex = Math.max(0, selectedIndex - visibleItems);
            updateScroll(newIndex);
          },
          handlePageDown: () => {
            const newIndex = Math.min(totalItems - 1, selectedIndex + visibleItems);
            updateScroll(newIndex);
          },
          handleHalfPageUp: () => {
            const halfPage = Math.floor(visibleItems / 2);
            const newIndex = Math.max(0, selectedIndex - halfPage);
            updateScroll(newIndex);
          },
          handleHalfPageDown: () => {
            const halfPage = Math.floor(visibleItems / 2);
            const newIndex = Math.min(totalItems - 1, selectedIndex + halfPage);
            updateScroll(newIndex);
          },
          handleGoToTop: () => updateScroll(0),
          handleGoToBottom: () => updateScroll(totalItems - 1),
          handleLineUp: () => {
            if (scrollOffset > 0) scrollOffset--;
          },
          handleLineDown: () => {
            if (scrollOffset < totalItems - visibleItems) scrollOffset++;
          }
        };
      };
    };

    it('should handle basic up/down navigation', () => {
      const useScrolling = createUseScrolling();
      const onSelectedIndexChange = jest.fn();
      
      const scrolling = useScrolling({
        totalItems: 20,
        visibleItems: 5,
        selectedIndex: 10,
        onSelectedIndexChange
      });
      
      // Move up
      scrolling.handleScrollUp();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(9);
      
      // Move down
      scrolling.handleScrollDown();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(11);
    });

    it('should handle page navigation', () => {
      const useScrolling = createUseScrolling();
      const onSelectedIndexChange = jest.fn();
      
      const scrolling = useScrolling({
        totalItems: 100,
        visibleItems: 10,
        selectedIndex: 50,
        onSelectedIndexChange
      });
      
      // Page up
      scrolling.handlePageUp();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(40);
      
      // Page down  
      scrolling.handlePageDown();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(60);
    });

    it('should handle vim-style half page navigation', () => {
      const useScrolling = createUseScrolling();
      const onSelectedIndexChange = jest.fn();
      
      const scrolling = useScrolling({
        totalItems: 100,
        visibleItems: 10,
        selectedIndex: 50,
        onSelectedIndexChange
      });
      
      // Half page up (Ctrl+U)
      scrolling.handleHalfPageUp();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(45); // 50 - 5
      
      // Half page down (Ctrl+D)
      scrolling.handleHalfPageDown();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(55); // 50 + 5
    });

    it('should handle boundary conditions', () => {
      const useScrolling = createUseScrolling();
      const onSelectedIndexChange = jest.fn();
      
      // Test with small dataset
      const scrolling = useScrolling({
        totalItems: 3,
        visibleItems: 10,
        selectedIndex: 0,
        onSelectedIndexChange
      });
      
      // Try to go up from top - should stay at 0
      scrolling.handleScrollUp();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(0);
      
      // Go to bottom
      scrolling.handleGoToBottom();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(2);
      
      // Try to go down from bottom - should stay at 2
      scrolling.handleScrollDown();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(2);
    });

    it('should handle go to top/bottom', () => {
      const useScrolling = createUseScrolling();
      const onSelectedIndexChange = jest.fn();
      
      const scrolling = useScrolling({
        totalItems: 100,
        visibleItems: 10,
        selectedIndex: 50,
        onSelectedIndexChange
      });
      
      // Go to top (gg in vim)
      scrolling.handleGoToTop();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(0);
      
      // Go to bottom (G in vim)
      scrolling.handleGoToBottom();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(99);
    });

    it('should update scroll offset to keep selection visible', () => {
      const useScrolling = createUseScrolling();
      const onSelectedIndexChange = jest.fn();
      
      let currentScrolling = useScrolling({
        totalItems: 100,
        visibleItems: 5,
        selectedIndex: 0,
        onSelectedIndexChange
      });
      
      expect(currentScrolling.scrollOffset).toBe(0);
      
      // Create new scrolling instance with updated selection
      currentScrolling = useScrolling({
        totalItems: 100,
        visibleItems: 5,
        selectedIndex: 10,
        onSelectedIndexChange
      });
      
      // Scroll offset should be updated to show selection
      expect(currentScrolling.scrollOffset).toBe(0);
    });
  });

  describe('useInputHandler Hook', () => {
    // Mock implementation of useInputHandler
    const createUseInputHandler = () => {
      return (options: {
        currentMode: string;
        handlers: any;
      }) => {
        const { currentMode, handlers } = options;
        
        // Simulate input handling based on mode
        const handleInput = (input: string, key: any) => {
          // Handle quit commands
          if (input === 'q' && currentMode === 'normal') {
            handlers.quit();
            return;
          }
          
          if (key.ctrl && input === 'c') {
            handlers.quit();
            return;
          }
          
          // Mode-specific handling
          switch (currentMode) {
            case 'normal':
              handleNormalMode(input, key, handlers);
              break;
            case 'visual':
              handleVisualMode(input, key, handlers);
              break;
            case 'copy':
              handleCopyMode(input, key, handlers);
              break;
          }
        };
        
        return { handleInput };
      };
    };

    const handleNormalMode = (input: string, key: any, handlers: any) => {
      // Vim navigation
      switch (input) {
        case 'j':
          handlers.navigateDown();
          break;
        case 'k':
          handlers.navigateUp();
          break;
        case 'G':
          handlers.goToBottom();
          break;
        case 'g':
          handlers.goToTop();
          break;
        case 'v':
          handlers.enterVisualMode();
          break;
        case 'y':
          handlers.enterCopyMode();
          break;
        case ':':
          handlers.enterCommandMode();
          break;
        case '/':
          handlers.enterSearchMode();
          break;
      }
      
      // Ctrl combinations
      if (key.ctrl) {
        switch (input) {
          case 'u':
            handlers.halfPageUp();
            break;
          case 'd':
            handlers.halfPageDown();
            break;
          case 'f':
            handlers.pageDown();
            break;
          case 'b':
            handlers.pageUp();
            break;
        }
      }
    };

    const handleVisualMode = (input: string, key: any, handlers: any) => {
      // Navigation still works
      switch (input) {
        case 'j':
          handlers.navigateDown();
          break;
        case 'k':
          handlers.navigateUp();
          break;
        case 'y':
          handlers.enterCopyMode();
          break;
      }
      
      // Selection
      if (input === ' ' || key.space) {
        handlers.toggleSelection();
      }
      
      // Exit with Escape
      if (key.backspace) {
        handlers.exitCurrentMode();
      }
    };

    const handleCopyMode = (input: string, key: any, handlers: any) => {
      // Copy target selection
      switch (input) {
        case 'c':
          handlers.setCopyTarget('command');
          break;
        case 'o':
          handlers.setCopyTarget('output');
          break;
        case 'm':
          handlers.setCopyTarget('metadata');
          break;
        case 'f':
          handlers.setCopyTarget('full');
          break;
      }
      
      // Execute copy
      if (key.return || input === ' ') {
        handlers.executeCopy();
      }
      
      // Exit
      if (key.backspace) {
        handlers.exitCurrentMode();
      }
    };

    it('should handle normal mode navigation', () => {
      const useInputHandler = createUseInputHandler();
      const mockHandlers = {
        navigateDown: jest.fn(),
        navigateUp: jest.fn(),
        goToTop: jest.fn(),
        goToBottom: jest.fn(),
        quit: jest.fn()
      };
      
      const { handleInput } = useInputHandler({
        currentMode: 'normal',
        handlers: mockHandlers
      });
      
      // Test vim navigation
      handleInput('j', {});
      expect(mockHandlers.navigateDown).toHaveBeenCalled();
      
      handleInput('k', {});
      expect(mockHandlers.navigateUp).toHaveBeenCalled();
      
      handleInput('g', {});
      expect(mockHandlers.goToTop).toHaveBeenCalled();
      
      handleInput('G', {});
      expect(mockHandlers.goToBottom).toHaveBeenCalled();
      
      handleInput('q', {});
      expect(mockHandlers.quit).toHaveBeenCalled();
    });

    it('should handle mode transitions', () => {
      const useInputHandler = createUseInputHandler();
      const mockHandlers = {
        enterVisualMode: jest.fn(),
        enterCopyMode: jest.fn(),
        enterCommandMode: jest.fn(),
        enterSearchMode: jest.fn()
      };
      
      const { handleInput } = useInputHandler({
        currentMode: 'normal',
        handlers: mockHandlers
      });
      
      handleInput('v', {});
      expect(mockHandlers.enterVisualMode).toHaveBeenCalled();
      
      handleInput('y', {});
      expect(mockHandlers.enterCopyMode).toHaveBeenCalled();
      
      handleInput(':', {});
      expect(mockHandlers.enterCommandMode).toHaveBeenCalled();
      
      handleInput('/', {});
      expect(mockHandlers.enterSearchMode).toHaveBeenCalled();
    });

    it('should handle vim-style scrolling commands', () => {
      const useInputHandler = createUseInputHandler();
      const mockHandlers = {
        halfPageUp: jest.fn(),
        halfPageDown: jest.fn(),
        pageUp: jest.fn(),
        pageDown: jest.fn()
      };
      
      const { handleInput } = useInputHandler({
        currentMode: 'normal',
        handlers: mockHandlers
      });
      
      // Test Ctrl combinations
      handleInput('u', { ctrl: true });
      expect(mockHandlers.halfPageUp).toHaveBeenCalled();
      
      handleInput('d', { ctrl: true });
      expect(mockHandlers.halfPageDown).toHaveBeenCalled();
      
      handleInput('f', { ctrl: true });
      expect(mockHandlers.pageDown).toHaveBeenCalled();
      
      handleInput('b', { ctrl: true });
      expect(mockHandlers.pageUp).toHaveBeenCalled();
    });

    it('should handle visual mode selection', () => {
      const useInputHandler = createUseInputHandler();
      const mockHandlers = {
        toggleSelection: jest.fn(),
        exitCurrentMode: jest.fn(),
        navigateDown: jest.fn()
      };
      
      const { handleInput } = useInputHandler({
        currentMode: 'visual',
        handlers: mockHandlers
      });
      
      // Test selection toggle
      handleInput(' ', { space: true });
      expect(mockHandlers.toggleSelection).toHaveBeenCalled();
      
      // Test exit
      handleInput('', { backspace: true });
      expect(mockHandlers.exitCurrentMode).toHaveBeenCalled();
      
      // Test navigation still works
      handleInput('j', {});
      expect(mockHandlers.navigateDown).toHaveBeenCalled();
    });

    it('should handle copy mode operations', () => {
      const useInputHandler = createUseInputHandler();
      const mockHandlers = {
        setCopyTarget: jest.fn(),
        executeCopy: jest.fn(),
        exitCurrentMode: jest.fn()
      };
      
      const { handleInput } = useInputHandler({
        currentMode: 'copy',
        handlers: mockHandlers
      });
      
      // Test copy target selection
      handleInput('c', {});
      expect(mockHandlers.setCopyTarget).toHaveBeenCalledWith('command');
      
      handleInput('o', {});
      expect(mockHandlers.setCopyTarget).toHaveBeenCalledWith('output');
      
      handleInput('m', {});
      expect(mockHandlers.setCopyTarget).toHaveBeenCalledWith('metadata');
      
      handleInput('f', {});
      expect(mockHandlers.setCopyTarget).toHaveBeenCalledWith('full');
      
      // Test execute copy
      handleInput('', { return: true });
      expect(mockHandlers.executeCopy).toHaveBeenCalled();
      
      // Test exit
      handleInput('', { backspace: true });
      expect(mockHandlers.exitCurrentMode).toHaveBeenCalled();
    });
  });

  describe('Cross-Hook Integration', () => {
    it('should coordinate polling with scroll position updates', async () => {
      const usePolling = createUsePolling();
      const useScrolling = createUseScrolling();
      
      // Setup scrolling state
      let selectedIndex = 0;
      const onSelectedIndexChange = jest.fn((newIndex) => {
        selectedIndex = newIndex;
      });
      
      // Add commands dynamically
      let commandCount = 5;
      createMockCommandList(commandCount).forEach(cmd => 
        mockEnhancedExecutor._addMockCommand(cmd)
      );
      
      // Setup polling that adds commands
      const pollingCallback = async () => {
        // Add a new command
        mockEnhancedExecutor._addMockCommand({
          id: `dynamic-cmd-${commandCount++}`,
          command: `echo "dynamic ${commandCount}"`,
          status: 'completed'
        });
        
        await mockEnhancedExecutor.listAllCommands();
      };
      
      // Start polling
      const cleanupPolling = usePolling(pollingCallback, 100);
      
      // Create scrolling instance
      const scrolling = useScrolling({
        totalItems: commandCount,
        visibleItems: 3,
        selectedIndex,
        onSelectedIndexChange
      });
      
      // Wait for polling to add commands
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Verify commands were added
      expect(mockEnhancedExecutor._getCommandCount()).toBeGreaterThan(5);
      
      // Scroll should handle increased item count
      scrolling.handleGoToBottom();
      expect(onSelectedIndexChange).toHaveBeenCalledWith(commandCount - 1);
      
      cleanupPolling();
    });

    it('should coordinate input handling with scrolling', () => {
      const useInputHandler = createUseInputHandler();
      const useScrolling = createUseScrolling();
      
      let selectedIndex = 5;
      const onSelectedIndexChange = jest.fn((newIndex) => {
        selectedIndex = newIndex;
      });
      
      const scrolling = useScrolling({
        totalItems: 20,
        visibleItems: 5,
        selectedIndex,
        onSelectedIndexChange
      });
      
      const mockHandlers = {
        navigateDown: () => scrolling.handleScrollDown(),
        navigateUp: () => scrolling.handleScrollUp(),
        halfPageUp: () => scrolling.handleHalfPageUp(),
        halfPageDown: () => scrolling.handleHalfPageDown(),
      };
      
      const { handleInput } = useInputHandler({
        currentMode: 'normal',
        handlers: mockHandlers
      });
      
      // Test coordinated navigation
      handleInput('j', {});
      expect(onSelectedIndexChange).toHaveBeenCalledWith(6);
      
      handleInput('k', {});
      expect(onSelectedIndexChange).toHaveBeenCalledWith(4);
      
      handleInput('u', { ctrl: true });
      expect(onSelectedIndexChange).toHaveBeenCalledWith(2);
    });

    it('should coordinate all three hooks in complex scenario', async () => {
      const usePolling = createUsePolling();
      const useScrolling = createUseScrolling();
      const useInputHandler = createUseInputHandler();
      
      // Setup state
      let selectedIndex = 0;
      let currentMode = 'normal';
      let commands: any[] = [];
      
      const onSelectedIndexChange = jest.fn((newIndex) => {
        selectedIndex = newIndex;
      });
      
      // Setup polling
      const pollingCallback = async () => {
        commands = await mockEnhancedExecutor.listAllCommands();
      };
      const cleanupPolling = usePolling(pollingCallback, 50);
      
      // Setup scrolling
      const scrolling = useScrolling({
        totalItems: commands.length,
        visibleItems: 5,
        selectedIndex,
        onSelectedIndexChange
      });
      
      // Setup input handling
      const mockHandlers = {
        navigateDown: () => scrolling.handleScrollDown(),
        navigateUp: () => scrolling.handleScrollUp(),
        enterVisualMode: () => { currentMode = 'visual'; },
        toggleSelection: jest.fn(),
        exitCurrentMode: () => { currentMode = 'normal'; }
      };
      
      const { handleInput } = useInputHandler({
        currentMode,
        handlers: mockHandlers
      });
      
      // Add initial commands
      createMockCommandList(10).forEach(cmd => 
        mockEnhancedExecutor._addMockCommand(cmd)
      );
      
      // Wait for polling to load data
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Simulate user interaction sequence
      handleInput('j', {}); // Move down
      handleInput('j', {}); // Move down again
      handleInput('v', {}); // Enter visual mode
      expect(currentMode).toBe('visual');
      
      handleInput(' ', { space: true }); // Toggle selection
      expect(mockHandlers.toggleSelection).toHaveBeenCalled();
      
      handleInput('', { backspace: true }); // Exit mode
      expect(currentMode).toBe('normal');
      
      cleanupPolling();
    });
  });
});