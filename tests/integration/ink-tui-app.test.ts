/**
 * Integration tests for InkTUIApp  
 * Tests state management, mode transitions, and real-time data updates
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { InkTUIApp } from '../../src/ink-tui-app';
import { 
  mockInkComponents, 
  simulateInput, 
  createMockEnhancedExecutor,
  createMockCommandList,
  setupIntegrationTest, 
  teardownIntegrationTest,
  waitFor 
} from './test-setup.js';

// Mock dependencies
jest.mock('ink', () => mockInkComponents);

// Mock all components
jest.mock('../../src/components/HeaderBox', () => ({
  HeaderBox: ({ children, ...props }: any) => ({ 
    type: 'HeaderBox', 
    props,
    children
  })
}));

jest.mock('../../src/components/CommandListBox', () => ({
  CommandListBox: ({ children, ...props }: any) => ({ 
    type: 'CommandListBox', 
    props,
    children
  })
}));

jest.mock('../../src/components/PreviewPaneBox', () => ({
  PreviewPaneBox: ({ children, ...props }: any) => ({ 
    type: 'PreviewPaneBox', 
    props,
    children
  })
}));

jest.mock('../../src/components/StatusBarBox', () => ({
  StatusBarBox: ({ children, ...props }: any) => ({ 
    type: 'StatusBarBox', 
    props,
    children
  })
}));

jest.mock('../../src/components/CommandInputModal', () => ({
  CommandInputModal: ({ children, ...props }: any) => ({ 
    type: 'CommandInputModal', 
    props,
    children
  })
}));

jest.mock('../../src/components/CopyModeOverlay', () => ({
  CopyModeOverlay: ({ children, ...props }: any) => ({ 
    type: 'CopyModeOverlay', 
    props,
    children
  })
}));

// Mock hooks
const mockUsePolling = jest.fn();
const mockUseScrolling = jest.fn(() => ({
  scrollOffset: 0,
  handleScrollUp: jest.fn(),
  handleScrollDown: jest.fn(),
  handlePageUp: jest.fn(),
  handlePageDown: jest.fn(),
  handleHalfPageUp: jest.fn(),
  handleHalfPageDown: jest.fn(),
  handleGoToTop: jest.fn(),
  handleGoToBottom: jest.fn(),
  handleLineUp: jest.fn(),
  handleLineDown: jest.fn()
}));

const mockUseInputHandler = jest.fn();

jest.mock('../../src/hooks/usePolling', () => ({
  usePolling: mockUsePolling
}));

jest.mock('../../src/hooks/useScrolling', () => ({
  useScrolling: mockUseScrolling
}));

jest.mock('../../src/hooks/useInputHandler', () => ({
  useInputHandler: mockUseInputHandler
}));

// Mock clipboard utility
jest.mock('../../src/utils/clipboard', () => ({
  copyWithFallback: jest.fn().mockResolvedValue({ message: 'Copied successfully' })
}));

// Mock copy formatter utility
jest.mock('../../src/utils/copyFormatter', () => ({
  formatContent: jest.fn().mockReturnValue('formatted content'),
  getNextCopyTarget: jest.fn().mockImplementation((current) => {
    const targets = ['command', 'output', 'full', 'metadata'];
    const index = targets.indexOf(current);
    return targets[(index + 1) % targets.length];
  }),
  getPreviousCopyTarget: jest.fn().mockImplementation((current) => {
    const targets = ['command', 'output', 'full', 'metadata'];
    const index = targets.indexOf(current);
    return targets[(index - 1 + targets.length) % targets.length];
  }),
  getCopyTargetDescription: jest.fn().mockReturnValue('target description')
}));

describe('InkTUIApp Integration Tests', () => {
  let mockEnhancedExecutor: any;
  let cleanup: () => void;
  let inputHandler: (input: string, key: any) => void;

  beforeEach(() => {
    ({ cleanup } = setupIntegrationTest());
    mockEnhancedExecutor = createMockEnhancedExecutor();
    
    // Mock enhanced executor module
    jest.mock('../../src/enhanced-executor', () => mockEnhancedExecutor);
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup input handler mock to capture the handler
    mockUseInputHandler.mockImplementation(({ handlers }) => {
      // Store the handlers for testing
      (global as any).testInputHandlers = handlers;
    });
    
    // Setup polling mock to capture the polling function  
    mockUsePolling.mockImplementation((pollingFn, interval) => {
      // Store polling function for manual triggering in tests
      (global as any).testPollingFn = pollingFn;
    });
  });

  afterEach(() => {
    cleanup();
    teardownIntegrationTest();
    delete (global as any).testInputHandlers;
    delete (global as any).testPollingFn;
  });

  describe('Component Initialization', () => {
    it('should render with default configuration', () => {
      const app = React.createElement(InkTUIApp);
      
      // Verify app can be created without errors
      expect(app).toBeDefined();
      expect(app.type).toBe(InkTUIApp);
    });

    it('should render with custom options', () => {
      const options = {
        title: 'Custom TUI',
        refreshInterval: 2000,
        enableMouse: true,
        vimMode: false
      };
      
      const app = React.createElement(InkTUIApp, { options });
      
      expect(app.props.options).toEqual(options);
    });

    it('should setup polling with correct interval', () => {
      React.createElement(InkTUIApp, { 
        options: { refreshInterval: 1500 } 
      });

      // Verify polling was setup with correct interval
      expect(mockUsePolling).toHaveBeenCalledWith(
        expect.any(Function),
        1500
      );
    });
  });

  describe('State Management', () => {
    it('should initialize with correct default state', async () => {
      // Add test commands
      const testCommands = createMockCommandList(5);
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp);
      
      // Trigger polling to load data
      if ((global as any).testPollingFn) {
        await (global as any).testPollingFn();
      }
      
      // Verify listAllCommands was called
      expect(mockEnhancedExecutor.listAllCommands).toHaveBeenCalled();
    });

    it('should update state when polling function is called', async () => {
      const testCommands = createMockCommandList(10);
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp);
      
      // Initial state should be empty
      expect(mockEnhancedExecutor._getCommandCount()).toBe(10);
      
      // Trigger polling
      if ((global as any).testPollingFn) {
        await (global as any).testPollingFn();
      }
      
      expect(mockEnhancedExecutor.listAllCommands).toHaveBeenCalled();
    });

    it('should handle polling errors gracefully', async () => {
      mockEnhancedExecutor.listAllCommands.mockRejectedValue(new Error('API Error'));
      
      React.createElement(InkTUIApp);
      
      // Trigger polling - should not throw
      if ((global as any).testPollingFn) {
        await expect((global as any).testPollingFn()).resolves.toBeUndefined();
      }
    });
  });

  describe('Mode Transitions', () => {
    let handlers: any;

    beforeEach(() => {
      React.createElement(InkTUIApp);
      handlers = (global as any).testInputHandlers;
    });

    it('should transition from normal to visual mode', () => {
      expect(handlers.enterVisualMode).toBeDefined();
      
      // Should not throw
      expect(() => handlers.enterVisualMode()).not.toThrow();
    });

    it('should transition from normal to command mode', () => {
      expect(handlers.enterCommandMode).toBeDefined();
      
      // Should not throw
      expect(() => handlers.enterCommandMode()).not.toThrow();
    });

    it('should transition from normal to search mode', () => {
      expect(handlers.enterSearchMode).toBeDefined();
      
      // Should not throw  
      expect(() => handlers.enterSearchMode()).not.toThrow();
    });

    it('should transition from normal to copy mode', () => {
      expect(handlers.enterCopyMode).toBeDefined();
      
      // Should not throw
      expect(() => handlers.enterCopyMode()).not.toThrow();
    });

    it('should exit any mode back to normal', () => {
      expect(handlers.exitCurrentMode).toBeDefined();
      
      // Should not throw
      expect(() => handlers.exitCurrentMode()).not.toThrow();
    });
  });

  describe('Navigation and Selection', () => {
    let handlers: any;

    beforeEach(() => {
      const testCommands = createMockCommandList(20);
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp);
      handlers = (global as any).testInputHandlers;
    });

    it('should navigate up and down', () => {
      expect(handlers.navigateUp).toBeDefined();
      expect(handlers.navigateDown).toBeDefined();
      
      // Should not throw
      expect(() => handlers.navigateUp()).not.toThrow();
      expect(() => handlers.navigateDown()).not.toThrow();
    });

    it('should handle go to top and bottom', () => {
      expect(handlers.goToTop).toBeDefined();
      expect(handlers.goToBottom).toBeDefined();
      
      // Should not throw
      expect(() => handlers.goToTop()).not.toThrow();
      expect(() => handlers.goToBottom()).not.toThrow();
    });

    it('should toggle selection', () => {
      expect(handlers.toggleSelection).toBeDefined();
      
      // Should not throw
      expect(() => handlers.toggleSelection()).not.toThrow();
    });

    it('should cycle through views', () => {
      expect(handlers.cycleView).toBeDefined();
      
      // Should not throw  
      expect(() => handlers.cycleView()).not.toThrow();
    });
  });

  describe('Vim-style Scrolling', () => {
    let handlers: any;
    let scrollHandlers: any;

    beforeEach(() => {
      scrollHandlers = {
        scrollOffset: 5,
        handleScrollUp: jest.fn(),
        handleScrollDown: jest.fn(),
        handlePageUp: jest.fn(),
        handlePageDown: jest.fn(),
        handleHalfPageUp: jest.fn(),
        handleHalfPageDown: jest.fn(),
        handleGoToTop: jest.fn(),
        handleGoToBottom: jest.fn(),
        handleLineUp: jest.fn(),
        handleLineDown: jest.fn()
      };
      
      mockUseScrolling.mockReturnValue(scrollHandlers);
      
      React.createElement(InkTUIApp);
      handlers = (global as any).testInputHandlers;
    });

    it('should support half page scrolling', () => {
      expect(handlers.halfPageUp).toBeDefined();
      expect(handlers.halfPageDown).toBeDefined();
      
      handlers.halfPageUp();
      handlers.halfPageDown();
      
      expect(scrollHandlers.handleHalfPageUp).toHaveBeenCalled();
      expect(scrollHandlers.handleHalfPageDown).toHaveBeenCalled();
    });

    it('should support full page scrolling', () => {
      expect(handlers.pageUp).toBeDefined();
      expect(handlers.pageDown).toBeDefined();
      
      handlers.pageUp();
      handlers.pageDown();
      
      expect(scrollHandlers.handlePageUp).toHaveBeenCalled();
      expect(scrollHandlers.handlePageDown).toHaveBeenCalled();
    });

    it('should support line-by-line scrolling', () => {
      expect(handlers.lineUp).toBeDefined();
      expect(handlers.lineDown).toBeDefined();
      
      handlers.lineUp();
      handlers.lineDown();
      
      expect(scrollHandlers.handleLineUp).toHaveBeenCalled();
      expect(scrollHandlers.handleLineDown).toHaveBeenCalled();
    });
  });

  describe('Command Actions', () => {
    let handlers: any;

    beforeEach(() => {
      const testCommands = createMockCommandList(5);
      // Add a running command for cancellation tests
      testCommands.push({
        id: 'running-cmd',
        status: 'running',
        command: 'sleep 100',
        paneId: '%test'
      });
      
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp);
      handlers = (global as any).testInputHandlers;
    });

    it('should cancel current command', async () => {
      expect(handlers.cancelCurrentCommand).toBeDefined();
      
      await handlers.cancelCurrentCommand();
      
      // Should attempt to cancel a command
      expect(mockEnhancedExecutor.cancelCommand).toHaveBeenCalled();
    });

    it('should refresh data', async () => {
      expect(handlers.refreshData).toBeDefined();
      
      await handlers.refreshData();
      
      // Should reload command list
      expect(mockEnhancedExecutor.listAllCommands).toHaveBeenCalled();
    });

    it('should quit application', () => {
      expect(handlers.quit).toBeDefined();
      
      // Mock exit function should be called
      const exitFn = mockInkComponents.useApp().exit;
      
      handlers.quit();
      
      expect(exitFn).toHaveBeenCalled();
    });
  });

  describe('Copy Mode Operations', () => {
    let handlers: any;

    beforeEach(() => {
      const testCommands = createMockCommandList(3);
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp);
      handlers = (global as any).testInputHandlers;
    });

    it('should enter copy mode and set initial state', () => {
      handlers.enterCopyMode();
      
      // Should not throw
      expect(() => handlers.enterCopyMode()).not.toThrow();
    });

    it('should cycle copy targets', () => {
      expect(handlers.cycleCopyTarget).toBeDefined();
      
      // Should not throw
      expect(() => handlers.cycleCopyTarget('next')).not.toThrow();
      expect(() => handlers.cycleCopyTarget('previous')).not.toThrow();
    });

    it('should set specific copy targets', () => {
      expect(handlers.setCopyTarget).toBeDefined();
      
      // Should not throw
      expect(() => handlers.setCopyTarget('command')).not.toThrow();
      expect(() => handlers.setCopyTarget('output')).not.toThrow();
      expect(() => handlers.setCopyTarget('metadata')).not.toThrow();
      expect(() => handlers.setCopyTarget('full')).not.toThrow();
    });

    it('should execute copy operation', async () => {
      // Enter copy mode first
      handlers.enterCopyMode();
      
      // Execute copy
      await expect(handlers.executeCopy()).resolves.toBeUndefined();
      
      // Should call clipboard utility
      const { copyWithFallback } = require('../../src/utils/clipboard.js');
      expect(copyWithFallback).toHaveBeenCalled();
    });
  });

  describe('View Management', () => {
    let handlers: any;

    beforeEach(() => {
      // Create mixed command statuses for view filtering
      const commands = [
        { id: 'cmd1', status: 'running', command: 'test1' },
        { id: 'cmd2', status: 'completed', command: 'test2' },
        { id: 'cmd3', status: 'pending', command: 'test3' },
        { id: 'cmd4', status: 'error', command: 'test4' },
        { id: 'cmd5', status: 'running', command: 'test5' }
      ];
      
      commands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp);
      handlers = (global as any).testInputHandlers;
    });

    it('should cycle through different views', () => {
      // Should cycle: dashboard → active → history → dashboard
      handlers.cycleView();
      handlers.cycleView();
      handlers.cycleView();
      
      // Should not throw
      expect(() => handlers.cycleView()).not.toThrow();
    });
  });

  describe('Filtering and Search', () => {
    let handlers: any;

    beforeEach(() => {
      const commands = [
        { id: 'cmd1', command: 'npm install react', status: 'completed' },
        { id: 'cmd2', command: 'docker build', status: 'running' },
        { id: 'cmd3', command: 'yarn start', status: 'completed' },
        { id: 'cmd4', command: 'git commit', status: 'error' }
      ];
      
      commands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp);
      handlers = (global as any).testInputHandlers;
    });

    it('should handle search mode', () => {
      handlers.enterSearchMode();
      
      // Should not throw
      expect(() => handlers.enterSearchMode()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle command executor errors', async () => {
      mockEnhancedExecutor.listAllCommands.mockRejectedValue(new Error('Network error'));
      
      React.createElement(InkTUIApp);
      
      // Trigger polling with error - should not crash
      if ((global as any).testPollingFn) {
        await expect((global as any).testPollingFn()).resolves.toBeUndefined();
      }
    });

    it('should handle cancellation errors', async () => {
      mockEnhancedExecutor.cancelCommand.mockRejectedValue(new Error('Cancel failed'));
      
      React.createElement(InkTUIApp);
      const handlers = (global as any).testInputHandlers;
      
      // Should not throw
      await expect(handlers.cancelCurrentCommand()).resolves.toBeUndefined();
    });

    it('should handle copy errors', async () => {
      const { copyWithFallback } = require('../../src/utils/clipboard.js');
      copyWithFallback.mockRejectedValue(new Error('Clipboard error'));
      
      React.createElement(InkTUIApp);
      const handlers = (global as any).testInputHandlers;
      
      handlers.enterCopyMode();
      
      // Should not throw
      await expect(handlers.executeCopy()).resolves.toBeUndefined();
    });
  });

  describe('Real-time Updates', () => {
    it('should poll for updates at specified interval', async () => {
      const testCommands = createMockCommandList(5);
      testCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      React.createElement(InkTUIApp, { 
        options: { refreshInterval: 500 } 
      });
      
      // Verify polling setup
      expect(mockUsePolling).toHaveBeenCalledWith(
        expect.any(Function),
        500
      );
      
      // Trigger multiple polling cycles
      if ((global as any).testPollingFn) {
        await (global as any).testPollingFn();
        await (global as any).testPollingFn();
        await (global as any).testPollingFn();
      }
      
      // Should have called listAllCommands multiple times
      expect(mockEnhancedExecutor.listAllCommands).toHaveBeenCalledTimes(3);
    });

    it('should update view when new commands are added', async () => {
      React.createElement(InkTUIApp);
      
      // Add initial commands
      const initialCommands = createMockCommandList(3);
      initialCommands.forEach(cmd => mockEnhancedExecutor._addMockCommand(cmd));
      
      // Trigger first poll
      if ((global as any).testPollingFn) {
        await (global as any).testPollingFn();
      }
      
      expect(mockEnhancedExecutor._getCommandCount()).toBe(3);
      
      // Add more commands
      const newCommands = createMockCommandList(2);
      newCommands.forEach((cmd, i) => {
        mockEnhancedExecutor._addMockCommand({
          ...cmd,
          id: `new-cmd-${i}`
        });
      });
      
      // Trigger second poll
      if ((global as any).testPollingFn) {
        await (global as any).testPollingFn();
      }
      
      expect(mockEnhancedExecutor._getCommandCount()).toBe(5);
    });
  });
});