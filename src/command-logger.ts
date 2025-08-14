import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { EnhancedCommandExecution } from './enhanced-executor.js';

/**
 * Command Logger - Persists command state and metadata to files
 * Enables easy retrieval and monitoring of command execution
 */

export interface CommandLogEntry {
  id: string;
  paneId: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled' | 'timeout';
  startTime: string; // ISO string
  endTime?: string; // ISO string
  duration?: number; // milliseconds
  exitCode?: number;
  shellType?: string;
  currentWorkingDirectory?: string;
  result?: string;
  aborted: boolean;
  retryCount: number;
  metadata: {
    tmuxSession?: string;
    tmuxWindow?: string;
    loggedAt: string; // ISO string
    pid?: number;
    user?: string;
  };
}

export class CommandLogger {
  private logDir: string;
  private activeLogFile: string;
  private historyLogFile: string;
  private metadataFile: string;

  constructor(baseDir?: string) {
    this.logDir = baseDir || join(homedir(), '.tmux-mcp', 'logs');
    this.activeLogFile = join(this.logDir, 'active-commands.json');
    this.historyLogFile = join(this.logDir, 'command-history.jsonl');
    this.metadataFile = join(this.logDir, 'metadata.json');
  }

  /**
   * Initialize logging directory and files
   */
  async initialize(): Promise<void> {
    try {
      if (!existsSync(this.logDir)) {
        await mkdir(this.logDir, { recursive: true });
      }

      // Initialize active commands file if not exists
      if (!existsSync(this.activeLogFile)) {
        await writeFile(this.activeLogFile, '{}');
      }

      // Initialize metadata file if not exists
      if (!existsSync(this.metadataFile)) {
        const metadata = {
          created: new Date().toISOString(),
          version: '1.0.0',
          lastUpdated: new Date().toISOString()
        };
        await writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
      }
    } catch (error) {
      console.error('Failed to initialize command logger:', error);
    }
  }

  /**
   * Log command start
   */
  async logCommandStart(command: EnhancedCommandExecution): Promise<void> {
    try {
      await this.initialize();

      const logEntry: CommandLogEntry = {
        id: command.id,
        paneId: command.paneId,
        command: command.command,
        status: command.status,
        startTime: command.startTime.toISOString(),
        endTime: command.endTime?.toISOString(),
        duration: command.endTime ? command.endTime.getTime() - command.startTime.getTime() : undefined,
        exitCode: command.exitCode,
        shellType: command.shellType,
        currentWorkingDirectory: command.currentWorkingDirectory,
        result: command.result,
        aborted: command.aborted,
        retryCount: command.retryCount,
        metadata: {
          loggedAt: new Date().toISOString(),
          user: process.env.USER || 'unknown'
        }
      };

      // Add to active commands
      const activeCommands = await this.getActiveCommands();
      activeCommands[command.id] = logEntry;
      await writeFile(this.activeLogFile, JSON.stringify(activeCommands, null, 2));

      // Update metadata
      await this.updateMetadata();
    } catch (error) {
      console.error('Failed to log command start:', error);
    }
  }

  /**
   * Log command completion/update
   */
  async logCommandUpdate(command: EnhancedCommandExecution): Promise<void> {
    try {
      await this.initialize();

      const logEntry: CommandLogEntry = {
        id: command.id,
        paneId: command.paneId,
        command: command.command,
        status: command.status,
        startTime: command.startTime.toISOString(),
        endTime: command.endTime?.toISOString(),
        duration: command.endTime ? command.endTime.getTime() - command.startTime.getTime() : undefined,
        exitCode: command.exitCode,
        shellType: command.shellType,
        currentWorkingDirectory: command.currentWorkingDirectory,
        result: command.result,
        aborted: command.aborted,
        retryCount: command.retryCount,
        metadata: {
          loggedAt: new Date().toISOString(),
          user: process.env.USER || 'unknown'
        }
      };

      // Update active commands
      const activeCommands = await this.getActiveCommands();
      
      if (command.status === 'completed' || command.status === 'error' || command.status === 'cancelled') {
        // Move to history and remove from active
        await this.appendToHistory(logEntry);
        delete activeCommands[command.id];
      } else {
        // Update active commands
        activeCommands[command.id] = logEntry;
      }

      await writeFile(this.activeLogFile, JSON.stringify(activeCommands, null, 2));
      await this.updateMetadata();
    } catch (error) {
      console.error('Failed to log command update:', error);
    }
  }

  /**
   * Get all active commands
   */
  async getActiveCommands(): Promise<{ [commandId: string]: CommandLogEntry }> {
    try {
      await this.initialize();
      const content = await readFile(this.activeLogFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return {};
    }
  }

  /**
   * Get command history (last N entries)
   */
  async getCommandHistory(limit: number = 100): Promise<CommandLogEntry[]> {
    try {
      if (!existsSync(this.historyLogFile)) {
        return [];
      }

      const content = await readFile(this.historyLogFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      // Get last N lines
      const recentLines = lines.slice(-limit);
      
      return recentLines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(entry => entry !== null);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get formatted command list for display
   */
  async getFormattedActiveCommands(): Promise<string> {
    const activeCommands = await this.getActiveCommands();
    const commands = Object.values(activeCommands);

    if (commands.length === 0) {
      return "No active commands currently running.";
    }

    let output = "ACTIVE COMMANDS\n";
    output += "===============\n\n";

    for (const cmd of commands) {
      const duration = cmd.duration || (Date.now() - new Date(cmd.startTime).getTime());
      const durationStr = this.formatDuration(duration);
      
      output += `[${cmd.id.substring(0, 8)}] ${this.getStatusIcon(cmd.status)} ${cmd.status.toUpperCase()}\n`;
      output += `  Command: ${cmd.command}\n`;
      output += `  Pane: ${cmd.paneId}\n`;
      output += `  Duration: ${durationStr}\n`;
      if (cmd.shellType) output += `  Shell: ${cmd.shellType}\n`;
      if (cmd.currentWorkingDirectory) output += `  Dir: ${cmd.currentWorkingDirectory}\n`;
      output += `  Started: ${new Date(cmd.startTime).toLocaleString()}\n`;
      output += "\n";
    }

    return output;
  }

  /**
   * Get formatted command list with history
   */
  async getFormattedAllCommands(limit: number = 50): Promise<string> {
    const activeCommands = await this.getActiveCommands();
    const historyCommands = await this.getCommandHistory(limit);
    
    const allCommands = [
      ...Object.values(activeCommands),
      ...historyCommands
    ].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    if (allCommands.length === 0) {
      return "No commands found in history.";
    }

    let output = "ALL COMMANDS\n";
    output += "============\n\n";

    for (const cmd of allCommands) {
      const duration = cmd.duration || (Date.now() - new Date(cmd.startTime).getTime());
      const durationStr = this.formatDuration(duration);
      
      output += `[${cmd.id.substring(0, 8)}] ${this.getStatusIcon(cmd.status)} ${cmd.status.toUpperCase()}\n`;
      output += `  Command: ${cmd.command}\n`;
      output += `  Pane: ${cmd.paneId}\n`;
      output += `  Duration: ${durationStr}\n`;
      if (cmd.exitCode !== undefined) output += `  Exit Code: ${cmd.exitCode}\n`;
      if (cmd.shellType) output += `  Shell: ${cmd.shellType}\n`;
      output += `  Started: ${new Date(cmd.startTime).toLocaleString()}\n`;
      if (cmd.endTime) output += `  Ended: ${new Date(cmd.endTime).toLocaleString()}\n`;
      output += "\n";
    }

    return output;
  }

  /**
   * Clean up old history entries
   */
  async cleanup(maxAgeHours: number = 24): Promise<number> {
    try {
      const history = await this.getCommandHistory(1000); // Get more entries for cleanup
      const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      
      const recentEntries = history.filter(entry => 
        new Date(entry.startTime) > cutoff
      );

      // Rewrite history file with only recent entries
      const historyContent = recentEntries.map(entry => JSON.stringify(entry)).join('\n');
      await writeFile(this.historyLogFile, historyContent);

      return history.length - recentEntries.length;
    } catch (error) {
      console.error('Failed to cleanup command history:', error);
      return 0;
    }
  }

  /**
   * Remove command from active list (for cancellation)
   */
  async removeActiveCommand(commandId: string): Promise<void> {
    try {
      const activeCommands = await this.getActiveCommands();
      const command = activeCommands[commandId];
      
      if (command) {
        // Mark as cancelled and move to history
        command.status = 'cancelled';
        command.aborted = true;
        command.endTime = new Date().toISOString();
        command.duration = new Date().getTime() - new Date(command.startTime).getTime();
        
        await this.appendToHistory(command);
        delete activeCommands[commandId];
        await writeFile(this.activeLogFile, JSON.stringify(activeCommands, null, 2));
      }
    } catch (error) {
      console.error('Failed to remove active command:', error);
    }
  }

  /**
   * Private helpers
   */
  private async appendToHistory(entry: CommandLogEntry): Promise<void> {
    try {
      const line = JSON.stringify(entry) + '\n';
      
      if (existsSync(this.historyLogFile)) {
        const content = await readFile(this.historyLogFile, 'utf-8');
        await writeFile(this.historyLogFile, content + line);
      } else {
        await writeFile(this.historyLogFile, line);
      }
    } catch (error) {
      console.error('Failed to append to history:', error);
    }
  }

  private async updateMetadata(): Promise<void> {
    try {
      const metadata = {
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };
      await writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Failed to update metadata:', error);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running': return '🏃';
      case 'completed': return '✅';
      case 'error': return '❌';
      case 'cancelled': return '🚫';
      case 'pending': return '⏳';
      case 'timeout': return '⏰';
      default: return '💻';
    }
  }
}

// Global logger instance
export const commandLogger = new CommandLogger();