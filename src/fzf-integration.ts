import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import * as enhancedExecutor from './enhanced-executor.js';

export interface FzfOptions {
  multi?: boolean;
  preview?: string;
  previewWindow?: string;
  header?: string;
  prompt?: string;
  height?: string;
  layout?: 'default' | 'reverse' | 'reverse-list';
  border?: boolean;
  bindings?: Record<string, string>;
  noSort?: boolean;
  exactMatch?: boolean;
  delimiter?: string;
  withNth?: string;
  ansi?: boolean;
}

export interface FzfResult {
  selected: string[];
  exitCode: number;
  cancelled: boolean;
}

export interface CommandListItem {
  id: string;
  display: string;
  data: enhancedExecutor.EnhancedCommandExecution;
}

export class FzfIntegration {
  private fzfPath: string;
  private tempDir: string;
  
  constructor() {
    // Try common fzf installation paths
    this.fzfPath = '/opt/homebrew/bin/fzf'; // Default for macOS with Homebrew
    this.tempDir = os.tmpdir();
  }

  /**
   * Check if fzf is available
   */
  async checkFzfAvailable(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      const child = spawn(this.fzfPath, ['--version'], { stdio: 'pipe' });
      return new Promise((resolve) => {
        child.on('exit', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  /**
   * Generic fzf launcher
   */
  async runFzf(items: string[], options: FzfOptions = {}): Promise<FzfResult> {
    if (!await this.checkFzfAvailable()) {
      throw new Error('fzf is not available. Install it with: brew install fzf');
    }

    return new Promise((resolve) => {
      const args = this.buildFzfArgs(options);
      const child = spawn(this.fzfPath, args, {
        stdio: ['pipe', 'pipe', 'inherit']
      });

      // Send items to fzf
      const input = items.join('\n');
      child.stdin?.write(input);
      child.stdin?.end();

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        const selected = output.trim().split('\n').filter(line => line.length > 0);
        resolve({
          selected,
          exitCode: code || 0,
          cancelled: code === 1 || code === 130
        });
      });

      child.on('error', () => {
        resolve({
          selected: [],
          exitCode: -1,
          cancelled: true
        });
      });
    });
  }

  /**
   * Show active commands with fzf
   */
  async showActiveCommands(): Promise<FzfResult> {
    const commands = await enhancedExecutor.listActiveCommands();
    
    if (commands.length === 0) {
      console.log('📝 No active commands found.');
      console.log('💡 Tip: Commands executed through the enhanced executor will appear here.');
      return {
        selected: [],
        exitCode: 0,
        cancelled: false
      };
    }

    const items = commands.map(cmd => this.formatCommandForFzf(cmd, 'active'));
    
    return this.runFzf(items, {
      multi: true,
      ansi: true,
      preview: 'echo "Command Details" && echo "Selected: {}"',
      previewWindow: 'right:50%',
      header: '🔄 Active Commands | Tab:Multi-select Enter:Confirm ESC:Cancel',
      prompt: 'Active > ',
      height: '80%',
      layout: 'reverse',
      border: true
    });
  }

  /**
   * Show command history with fzf
   */
  async showCommandHistory(): Promise<FzfResult> {
    const commands = await enhancedExecutor.listAllCommands();
    
    if (commands.length === 0) {
      console.log('📝 No command history found.');
      console.log('💡 Tip: Execute commands to build up history for browsing.');
      return {
        selected: [],
        exitCode: 0,
        cancelled: false
      };
    }

    const items = commands.map(cmd => this.formatCommandForFzf(cmd, 'history'));
    
    return this.runFzf(items, {
      ansi: true,
      preview: 'echo "Command History" && echo "Selected: {}"',
      previewWindow: 'right:60%',
      header: '📚 Command History | Enter:Select ESC:Cancel',
      prompt: 'History > ',
      height: '90%',
      layout: 'reverse',
      border: true
    });
  }

  /**
   * Show bulk operations interface
   */
  async showBulkOperations(): Promise<FzfResult> {
    const commands = await enhancedExecutor.listAllCommands();
    
    if (commands.length === 0) {
      return {
        selected: [],
        exitCode: 0,
        cancelled: false
      };
    }

    const items = commands.map(cmd => this.formatCommandForFzf(cmd, 'bulk'));
    
    return this.runFzf(items, {
      multi: true,
      ansi: true,
      preview: this.createBulkPreviewCommand(),
      previewWindow: 'down:40%',
      header: '📦 Bulk Operations | Ctrl-A:All Ctrl-D:None Space:Toggle',
      prompt: 'Select > ',
      height: '90%',
      layout: 'reverse',
      border: true,
      bindings: {
        'ctrl-a': 'select-all',
        'ctrl-d': 'deselect-all',
        'ctrl-c': 'execute(tmux-mcp bulk-cancel {+})',
        'ctrl-x': 'execute(tmux-mcp bulk-cleanup {+})',
        'ctrl-e': 'execute(tmux-mcp bulk-export {+})'
      }
    });
  }

  /**
   * Smart search interface
   */
  async smartSearch(query?: string): Promise<FzfResult> {
    const commands = await enhancedExecutor.listAllCommands();
    
    if (commands.length === 0) {
      console.log('📝 No commands found to search.');
      console.log('💡 Tip: Build up command history first, then use search to find specific commands.');
      return {
        selected: [],
        exitCode: 0,
        cancelled: false
      };
    }

    const items = commands.map(cmd => this.formatCommandForSearch(cmd));
    
    return this.runFzf(items, {
      ansi: true,
      preview: 'echo "Search Results" && echo "Selected: {}"',
      previewWindow: 'right:50%',
      header: '🔍 Smart Search | Enter:Select ESC:Cancel',
      prompt: query ? `Search "${query}" > ` : 'Search > ',
      height: '85%',
      layout: 'reverse',
      border: true
    });
  }

  /**
   * Filter interface with multiple criteria
   */
  async showFilterInterface(): Promise<FzfResult> {
    const filters = [
      'status:running     - Show only running commands',
      'status:completed   - Show only completed commands', 
      'status:error       - Show only failed commands',
      'status:cancelled   - Show only cancelled commands',
      'pane:%1            - Filter by tmux pane',
      'shell:bash         - Filter by shell type',
      'time:>1h           - Commands running longer than 1h',
      'time:<5m           - Commands shorter than 5 minutes',
      'exit:0             - Commands with exit code 0',
      'exit:!0            - Commands with non-zero exit code',
      'dir:/home          - Filter by working directory',
      'recent             - Show recent commands (last 24h)',
      'long-running       - Show commands running >30min',
      'failed-today       - Show today\'s failed commands'
    ];

    return this.runFzf(filters, {
      multi: true,
      preview: 'echo "Filter: {}" | fold -w 40',
      previewWindow: 'down:20%',
      header: '🎯 Filter Commands | Space:Toggle Enter:Apply',
      prompt: 'Filters > ',
      height: '70%',
      layout: 'reverse',
      border: true
    });
  }

  /**
   * Format command for fzf display
   */
  private formatCommandForFzf(cmd: enhancedExecutor.EnhancedCommandExecution, context: 'active' | 'history' | 'bulk'): string {
    const statusIcon = this.getStatusIcon(cmd.status);
    const command = cmd.command.length > 40 ? cmd.command.substring(0, 37) + '...' : cmd.command;
    const duration = this.formatDuration(cmd);
    const time = this.formatTime(cmd.startTime);
    const id = cmd.id.substring(0, 8);
    
    switch (context) {
      case 'active':
        return `${statusIcon} ${command.padEnd(40)} │ ${cmd.paneId.padEnd(4)} │ ${duration.padEnd(8)} │ ${time} │ ${id}`;
      case 'history':
        const exitCode = cmd.exitCode !== undefined ? `[${cmd.exitCode}]` : '   ';
        return `${statusIcon} ${command.padEnd(40)} │ ${exitCode} │ ${duration.padEnd(8)} │ ${time} │ ${id}`;
      case 'bulk':
        const shell = (cmd.shellType || '?').padEnd(4);
        return `${statusIcon} ${command.padEnd(35)} │ ${shell} │ ${duration.padEnd(8)} │ ${time} │ ${id}`;
      default:
        return `${statusIcon} ${command} │ ${id}`;
    }
  }

  /**
   * Format command for search (includes more searchable text)
   */
  private formatCommandForSearch(cmd: enhancedExecutor.EnhancedCommandExecution): string {
    const statusIcon = this.getStatusIcon(cmd.status);
    const tags = [
      `status:${cmd.status}`,
      `pane:${cmd.paneId}`,
      cmd.shellType ? `shell:${cmd.shellType}` : '',
      cmd.currentWorkingDirectory ? `dir:${cmd.currentWorkingDirectory}` : '',
      cmd.exitCode !== undefined ? `exit:${cmd.exitCode}` : ''
    ].filter(Boolean).join(' ');
    
    return `${statusIcon} ${cmd.command} │ ${cmd.id.substring(0, 8)} │ ${tags}`;
  }

  /**
   * Create simple preview command
   */
  private createPreviewCommand(context: 'active' | 'history' | 'search'): string {
    // Simple preview that works without external commands
    return `echo "Details: {}"`;
  }

  /**
   * Create bulk preview command
   */
  private createBulkPreviewCommand(): string {
    return `echo "Selected commands: $(echo {+} | wc -w)" && echo {} | head -10 | while read line; do echo "• $line"; done`;
  }

  /**
   * Build fzf command line arguments
   */
  private buildFzfArgs(options: FzfOptions): string[] {
    const args: string[] = [];
    
    if (options.multi) args.push('--multi');
    if (options.ansi) args.push('--ansi');
    if (options.border) args.push('--border');
    if (options.noSort) args.push('--no-sort');
    if (options.exactMatch) args.push('--exact');
    
    if (options.height) args.push(`--height=${options.height}`);
    if (options.layout) args.push(`--layout=${options.layout}`);
    if (options.header) args.push(`--header=${options.header}`);
    if (options.prompt) args.push(`--prompt=${options.prompt}`);
    if (options.delimiter) args.push(`--delimiter=${options.delimiter}`);
    if (options.withNth) args.push(`--with-nth=${options.withNth}`);
    
    if (options.preview) {
      args.push(`--preview=${options.preview}`);
    }
    
    if (options.previewWindow) {
      args.push(`--preview-window=${options.previewWindow}`);
    }
    
    if (options.bindings) {
      Object.entries(options.bindings).forEach(([key, action]) => {
        args.push(`--bind=${key}:${action}`);
      });
    }
    
    return args;
  }

  /**
   * Get status icon for command
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running': return chalk.green('🔄');
      case 'completed': return chalk.blue('✅');
      case 'error': return chalk.red('❌');
      case 'cancelled': return chalk.yellow('🚫');
      case 'timeout': return chalk.magenta('⏰');
      case 'pending': return chalk.cyan('⏳');
      default: return '?';
    }
  }

  /**
   * Format duration for display
   */
  private formatDuration(cmd: enhancedExecutor.EnhancedCommandExecution): string {
    const duration = cmd.endTime 
      ? new Date(cmd.endTime).getTime() - new Date(cmd.startTime).getTime()
      : Date.now() - new Date(cmd.startTime).getTime();
    
    if (duration < 1000) return `${Math.round(duration)}ms`;
    if (duration < 60000) return `${Math.round(duration / 1000)}s`;
    if (duration < 3600000) return `${Math.round(duration / 60000)}m`;
    
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.round((duration % 3600000) / 60000);
    return `${hours}h${minutes}m`;
  }

  /**
   * Format time for display
   */
  private formatTime(startTime: Date): string {
    const now = new Date();
    const start = new Date(startTime);
    const diff = now.getTime() - start.getTime();
    
    if (diff < 86400000) { // Less than 24 hours
      return start.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return start.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  }

  /**
   * Parse fzf selection to extract command ID
   */
  parseSelection(selection: string): string {
    // Extract command ID from fzf formatted line
    const parts = selection.split('│');
    if (parts.length > 0) {
      // ID is typically the last part, trimmed
      return parts[parts.length - 1].trim();
    }
    return selection;
  }

  /**
   * Create temporary script for complex fzf operations
   */
  private async createTempScript(content: string): Promise<string> {
    const scriptPath = path.join(this.tempDir, `tmux-mcp-${Date.now()}.sh`);
    await fs.writeFile(scriptPath, `#!/bin/bash\n${content}`, { mode: 0o755 });
    return scriptPath;
  }

  /**
   * Cleanup temporary files
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const tempFiles = files.filter(f => f.startsWith('tmux-mcp-') && f.endsWith('.sh'));
      
      for (const file of tempFiles) {
        try {
          await fs.unlink(path.join(this.tempDir, file));
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
