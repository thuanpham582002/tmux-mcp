import React from 'react';
import { render } from 'ink';
import { InkTUIApp, InkTUIOptions } from './ink-tui-app.js';
import { commandLogger } from './command-logger.js';

export class InkTUIManager {
  private app: any;
  private isRunning = false;

  constructor(private options: InkTUIOptions = {}) {}

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('TUI Manager is already running');
    }

    this.isRunning = true;

    try {
      // Initialize command logger before starting TUI
      await commandLogger.initialize();

      // Clear screen and go to top-left (like vim/watch behavior)
      process.stdout.write('\x1b[2J\x1b[H');
      
      // Hide cursor for clean TUI experience
      process.stdout.write('\x1b[?25l');

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
      this.isRunning = false;
    }
  }

  public cleanup(): void {
    if (this.app && this.isRunning) {
      // Show cursor again before exiting
      process.stdout.write('\x1b[?25h');
      
      this.app.unmount();
      this.isRunning = false;
    }
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}

// Export the same interface as the original TUIManager for compatibility
export type { InkTUIOptions as TUIOptions };