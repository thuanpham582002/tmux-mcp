/**
 * Integration tests for InkTUIManager
 * Tests TUI lifecycle, terminal state management, and cleanup
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { InkTUIManager } from '../../src/ink-tui-manager';
import { 
  mockInkComponents, 
  mockTerminal, 
  setupIntegrationTest, 
  teardownIntegrationTest,
  waitFor 
} from './test-setup.js';

// Mock dependencies
jest.mock('ink', () => mockInkComponents);

// Mock command logger
const mockCommandLogger = {
  initialize: jest.fn().mockResolvedValue(undefined)
};
jest.mock('../../src/command-logger', () => ({
  commandLogger: mockCommandLogger
}));

describe('InkTUIManager Integration Tests', () => {
  let tuiManager: InkTUIManager;
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = setupIntegrationTest());
    tuiManager = new InkTUIManager({
      title: 'Test TUI',
      refreshInterval: 100,
      enableMouse: false,
      vimMode: true
    });
    
    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    teardownIntegrationTest();
  });

  describe('Lifecycle Management', () => {
    it('should initialize and start TUI successfully', async () => {
      // Mock successful render
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      const startPromise = tuiManager.start();
      
      // Verify command logger initialization
      expect(mockCommandLogger.initialize).toHaveBeenCalledTimes(1);
      
      // Verify terminal setup
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?1049h'); // Enter alternate screen
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[2J\x1b[H'); // Clear screen
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?25l'); // Hide cursor
      
      // Verify Ink render call
      expect(mockInkComponents.render).toHaveBeenCalledWith(
        expect.anything(),
        {
          exitOnCtrlC: false,
          patchConsole: false,
          stdout: process.stdout,
          stdin: process.stdin
        }
      );
      
      expect(tuiManager.isActive()).toBe(true);
      
      // Simulate app exit
      mockRenderResult.waitUntilExit.mockResolvedValue(undefined);
      
      await startPromise;
      
      // Verify cleanup was called
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?25h'); // Show cursor
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?1049l'); // Exit alternate screen
    });

    it('should handle start failure gracefully', async () => {
      // Mock render failure
      const error = new Error('Render failed');
      mockInkComponents.render.mockImplementation(() => {
        throw error;
      });

      await expect(tuiManager.start()).rejects.toThrow('Render failed');
      
      // Verify cleanup was called even after failure
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?25h'); // Show cursor
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?1049l'); // Exit alternate screen
      expect(tuiManager.isActive()).toBe(false);
    });

    it('should prevent multiple start calls', async () => {
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolve
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      // Start the TUI
      const startPromise = tuiManager.start();
      
      // Verify it's running
      expect(tuiManager.isActive()).toBe(true);
      
      // Try to start again - should throw
      await expect(tuiManager.start()).rejects.toThrow('TUI Manager is already running');
      
      // Cleanup
      tuiManager.cleanup();
      await waitFor(() => !tuiManager.isActive(), 1000);
    });
  });

  describe('Terminal State Management', () => {
    it('should properly setup terminal for full-screen vim-like experience', async () => {
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      await tuiManager.start();

      // Verify alternate screen buffer entry
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?1049h');
      
      // Verify screen clearing and cursor positioning
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[2J\x1b[H');
      
      // Verify cursor hiding
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?25l');
    });

    it('should restore terminal state on cleanup', async () => {
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      await tuiManager.start();

      // Verify restoration
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?25h'); // Show cursor
      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[?1049l'); // Exit alternate screen
      expect(tuiManager.isActive()).toBe(false);
    });

    it('should handle cleanup being called multiple times', () => {
      tuiManager.cleanup();
      tuiManager.cleanup();
      tuiManager.cleanup();
      
      // Should not throw and should be idempotent
      expect(tuiManager.isActive()).toBe(false);
    });
  });

  describe('Exit Handler Management', () => {
    let originalEventListeners: any;

    beforeEach(() => {
      // Store original listeners
      originalEventListeners = {
        exit: process.listeners('exit').slice(),
        SIGINT: process.listeners('SIGINT').slice(),
        SIGTERM: process.listeners('SIGTERM').slice(),
        SIGUSR1: process.listeners('SIGUSR1').slice(),
        SIGUSR2: process.listeners('SIGUSR2').slice(),
        uncaughtException: process.listeners('uncaughtException').slice()
      };
    });

    afterEach(() => {
      // Clean up any remaining listeners
      ['exit', 'SIGINT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2', 'uncaughtException'].forEach(event => {
        process.removeAllListeners(event);
        // Restore original listeners
        if (originalEventListeners[event]) {
          originalEventListeners[event].forEach((listener: any) => {
            process.on(event as any, listener);
          });
        }
      });
    });

    it('should setup exit handlers during start', async () => {
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolve
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      // Count initial listeners
      const initialExitListeners = process.listeners('exit').length;
      const initialSIGINTListeners = process.listeners('SIGINT').length;

      const startPromise = tuiManager.start();
      
      // Wait a bit for setup
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify new listeners were added
      expect(process.listeners('exit').length).toBeGreaterThan(initialExitListeners);
      expect(process.listeners('SIGINT').length).toBeGreaterThan(initialSIGINTListeners);
      
      // Cleanup
      tuiManager.cleanup();
      await waitFor(() => !tuiManager.isActive(), 1000);
    });

    it('should remove exit handlers on cleanup', async () => {
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      // Count initial listeners
      const initialExitListeners = process.listeners('exit').length;
      const initialSIGINTListeners = process.listeners('SIGINT').length;

      await tuiManager.start();

      // Verify listeners were removed after cleanup
      expect(process.listeners('exit').length).toBe(initialExitListeners);
      expect(process.listeners('SIGINT').length).toBe(initialSIGINTListeners);
    });

    it('should handle process signals gracefully', async () => {
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolve
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      const startPromise = tuiManager.start();
      
      // Wait for setup
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(tuiManager.isActive()).toBe(true);
      
      // Simulate SIGINT
      process.emit('SIGINT' as any, 'SIGINT');
      
      // Wait for cleanup
      await waitFor(() => !tuiManager.isActive(), 1000);
      
      expect(tuiManager.isActive()).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should pass configuration options to InkTUIApp', async () => {
      const options = {
        title: 'Custom Title',
        refreshInterval: 500,
        enableMouse: true,
        vimMode: false
      };
      
      tuiManager = new InkTUIManager(options);
      
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      await tuiManager.start();

      // Verify render was called with options
      expect(mockInkComponents.render).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            options: options
          })
        }),
        expect.anything()
      );
    });

    it('should use default options when none provided', async () => {
      const defaultManager = new InkTUIManager();
      
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockResolvedValue(undefined),
        unmount: jest.fn()
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      await defaultManager.start();

      // Verify render was called with default options
      expect(mockInkComponents.render).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            options: {}
          })
        }),
        expect.anything()
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle command logger initialization failure', async () => {
      mockCommandLogger.initialize.mockRejectedValue(new Error('Logger init failed'));

      await expect(tuiManager.start()).rejects.toThrow('Logger init failed');
      expect(tuiManager.isActive()).toBe(false);
    });

    it('should handle unmount errors gracefully during cleanup', async () => {
      const mockRenderResult = {
        waitUntilExit: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolve
        unmount: jest.fn().mockImplementation(() => {
          throw new Error('Unmount failed');
        })
      };
      mockInkComponents.render.mockReturnValue(mockRenderResult);

      const startPromise = tuiManager.start();
      
      // Wait for setup
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Cleanup should not throw even if unmount fails
      expect(() => tuiManager.cleanup()).not.toThrow();
      expect(tuiManager.isActive()).toBe(false);
    });
  });
});