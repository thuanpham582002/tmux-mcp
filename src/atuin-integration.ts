import { exec as execCallback } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createLogger } from "./logger.js";

const exec = promisify(execCallback);
const logger = createLogger('atuin-integration');

export interface AtuinHistoryEntry {
  command: string;
  cwd: string;
  exit: number;
  duration: number;
}

export interface AtuinConfig {
  dbPath?: string;
  session?: string;
  hostname?: string;
}

/**
 * Atuin integration for tmux-mcp
 *
 * This module provides functionality to save commands executed via tmux-mcp
 * to the Atuin history database using direct SQLite insertion.
 */
export class AtuinIntegration {
  private config: AtuinConfig;
  private initialized: boolean = false;

  constructor(config: AtuinConfig = {}) {
    this.config = {
      dbPath: path.join(os.homedir(), '.local', 'share', 'atuin', 'history.db'),
      session: process.env.ATUIN_SESSION,
      hostname: this.getDefaultHostname(),
      ...config
    };
  }

  private getDefaultHostname(): string {
    const username = os.userInfo().username;
    const hostname = os.hostname();
    return `${username}@${hostname}`;
  }

  /**
   * Check if atuin database exists
   */
  async checkDatabaseExists(): Promise<boolean> {
    try {
      await fs.access(this.config.dbPath!);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session ID from file or environment
   */
  private async getSessionId(): Promise<string> {
    if (this.config.session) {
      return this.config.session;
    }

    try {
      const sessionPath = path.join(os.homedir(), '.local', 'share', 'atuin', 'session');
      const sessionContent = await fs.readFile(sessionPath, 'utf-8');
      return sessionContent.trim();
    } catch {
      // Generate a fallback session ID
      return 'tmux-mcp-session';
    }
  }

  /**
   * Initialize atuin integration
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    const dbExists = await this.checkDatabaseExists();
    if (!dbExists) {
      console.warn('Atuin database not found. Commands will not be saved to Atuin history.');
      return false;
    }

    this.initialized = true;
    return true;
  }

  /**
   * Save a command to atuin history using direct SQLite insertion
   */
  async saveCommand(entry: AtuinHistoryEntry, commandId?: string): Promise<string | null> {
    if (!this.initialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        return null;
      }
    }

    try {
      const sessionId = await this.getSessionId();
      const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
      const timestampNanos = timestamp * 1_000_000_000; // Convert to nanoseconds for Atuin

      // Generate unique ID
      const id = commandId || `tmux-mcp-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

      // Escape single quotes for SQLite string values
      const escapedCommand = entry.command.replace(/'/g, "''");
      const escapedCwd = entry.cwd.replace(/'/g, "''");

      // Use shell parameter passing to avoid quote issues
      const insertCmd = `sqlite3 "${this.config.dbPath}" << 'EOF'
INSERT OR IGNORE INTO history(id, timestamp, duration, exit, command, cwd, session, hostname, deleted_at)
VALUES ('${id}', ${timestampNanos}, ${entry.duration}, ${entry.exit}, '${escapedCommand}', '${escapedCwd}', '${sessionId}', '${this.config.hostname}', NULL);
EOF`;

      await exec(insertCmd);
      logger.debug('Command saved to Atuin', { command: entry.command, id });
      return id;
    } catch (error) {
      // Log error but don't throw - we don't want to break command execution
      logger.error('Failed to save command to Atuin', { error, command: entry.command });
      return null;
    }
  }

  /**
   * Update an existing command in atuin history with final exit code and duration
   */
  async updateCommand(commandId: string, exitCode: number, duration: number): Promise<void> {
    if (!this.initialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        return;
      }
    }

    try {
      const escapedCommandId = commandId.replace(/'/g, "''");
      const updateCmd = `sqlite3 "${this.config.dbPath}" << 'EOF'
UPDATE history SET exit = ${exitCode}, duration = ${duration} WHERE id = '${escapedCommandId}';
EOF`;
      await exec(updateCmd);
      logger.debug('Command updated in Atuin', { commandId, exitCode, duration });
    } catch (error) {
      logger.error('Failed to update command in Atuin', { error, commandId });
    }
  }

  /**
   * Create history entry from command execution data
   */
  createHistoryEntry(
    command: string,
    exitCode: number,
    duration: number,
    cwd?: string
  ): AtuinHistoryEntry {
    return {
      command,
      cwd: cwd || process.cwd(),
      exit: exitCode,
      duration: Math.floor(duration) // Atuin stores duration in milliseconds (integers)
    };
  }

  /**
   * Save command with all parameters (for backward compatibility)
   */
  async saveCommandFull(
    command: string,
    exitCode: number,
    duration: number,
    cwd?: string
  ): Promise<void> {
    const entry = this.createHistoryEntry(command, exitCode, duration, cwd);
    await this.saveCommand(entry);
  }

  /**
   * Save command when it starts (with unknown exit code and duration)
   */
  async saveCommandStart(
    command: string,
    commandId: string,
    cwd?: string
  ): Promise<string | null> {
    const entry = this.createHistoryEntry(command, -1, -1, cwd); // -1 for unknown exit/duration
    return await this.saveCommand(entry, commandId);
  }
}

// Singleton instance for the application
let atuinInstance: AtuinIntegration | null = null;

export function getAtuinIntegration(config?: AtuinConfig): AtuinIntegration {
  if (!atuinInstance) {
    atuinInstance = new AtuinIntegration(config);
  }
  return atuinInstance;
}