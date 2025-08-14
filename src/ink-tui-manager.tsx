import React from 'react';
import { render } from 'ink';
import { InkTUIApp, InkTUIOptions } from './ink-tui-app.js';
import { commandLogger } from './command-logger.js';

export class InkTUIManager {
  private app: any;
  private isRunning = false;
  private exitHandler: (() => void) | null = null;

  constructor(private options: InkTUIOptions = {}) {}

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('TUI Manager is already running');
    }

    this.isRunning = true;

    try {
      // Initialize command logger before starting TUI
      await commandLogger.initialize();

      // Setup proper exit handlers for clean terminal restoration
      this.setupExitHandlers();

      // Enter alternate screen buffer manually for vim-like behavior
      process.stdout.write('\x1b[?1049h'); // Enter alternate screen
      process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and go to top-left
      process.stdout.write('\x1b[?25l'); // Hide cursor

      // Render the React Ink application in full-screen mode
      this.app = render(<InkTUIApp options={this.options} />, {
        exitOnCtrlC: false, // We handle quit ourselves
        patchConsole: false, // Don't interfere with console
        stdout: process.stdout,
        stdin: process.stdin
      });

      // Wait for the app to exit
      await this.app.waitUntilExit();
    } catch (error) {
      console.error('Error running Ink TUI:', error);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  private setupExitHandlers(): void {
    // Clean exit handler
    this.exitHandler = () => {
      this.cleanup();
    };

    // Handle various exit scenarios
    process.on('exit', this.exitHandler);
    process.on('SIGINT', this.exitHandler);
    process.on('SIGTERM', this.exitHandler);
    process.on('SIGUSR1', this.exitHandler);
    process.on('SIGUSR2', this.exitHandler);
    process.on('uncaughtException', this.exitHandler);
  }

  private removeExitHandlers(): void {
    if (this.exitHandler) {
      process.removeListener('exit', this.exitHandler);
      process.removeListener('SIGINT', this.exitHandler);
      process.removeListener('SIGTERM', this.exitHandler);
      process.removeListener('SIGUSR1', this.exitHandler);
      process.removeListener('SIGUSR2', this.exitHandler);
      process.removeListener('uncaughtException', this.exitHandler);
      this.exitHandler = null;
    }
  }

  public cleanup(): void {
    if (this.isRunning) {
      this.isRunning = false;
      
      // Remove exit handlers to prevent multiple calls
      this.removeExitHandlers();
      
      // Restore terminal state before unmounting
      process.stdout.write('\x1b[?25h'); // Show cursor
      process.stdout.write('\x1b[?1049l'); // Exit alternate screen buffer
      
      // Unmount the app if it exists
      if (this.app) {
        try {
          this.app.unmount();
        } catch (error) {
          // Ignore unmount errors during cleanup
        }
        this.app = null;
      }
    }
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}

// Export the same interface as the original TUIManager for compatibility
export type { InkTUIOptions as TUIOptions };