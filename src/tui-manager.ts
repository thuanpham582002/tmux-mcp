import chalk from 'chalk';
import ms from 'ms';
import stripAnsi from 'strip-ansi';
import { spawn } from 'child_process';
import * as enhancedExecutor from './enhanced-executor.js';

export interface TUIOptions {
  title?: string;
  refreshInterval?: number;
  enableMouse?: boolean;
  vimMode?: boolean;
}

export type ViewMode = 'dashboard' | 'active' | 'history' | 'logs' | 'watch';
export type InteractionMode = 'normal' | 'visual' | 'command' | 'search';

export interface CommandSelection {
  id: string;
  selected: boolean;
  index: number;
}

export class TUIManager {
  private screen: any;
  private headerBox!: any;
  private mainBox!: any;
  private previewBox!: any;
  private statusBox!: any;
  private commandBox!: any;
  
  private currentView: ViewMode = 'dashboard';
  private currentMode: InteractionMode = 'normal';
  private selectedIndex = 0;
  private selectedCommands = new Map<string, boolean>();
  private filterText = '';
  private isRunning = true;
  
  private refreshTimer?: NodeJS.Timeout;
  private commands: enhancedExecutor.EnhancedCommandExecution[] = [];
  private filteredCommands: enhancedExecutor.EnhancedCommandExecution[] = [];
  
  private blessed: any;

  constructor(private options: TUIOptions = {}) {
    // blessed will be initialized in the start method
  }

  private async initializeBlessed(): Promise<void> {
    // Dynamic import for neo-blessed
    // @ts-ignore
    this.blessed = await import('neo-blessed').then(module => module.default || module);
    
    this.screen = this.blessed.screen({
      smartCSR: false,
      title: this.options.title || 'TMUX MCP Command Manager',
      mouse: false,
      debug: false,
      dockBorders: false,
      fullUnicode: false,
      autoPadding: false,
      fastCSR: false,
      useBCE: true,
      sendFocus: false,
      warnings: false,
      tabSize: 4,
      terminal: 'xterm-256color',
      forceUnicode: false
    });
    
    this.initializeLayout();
    this.setupKeybindings();
    await this.startRealTimeUpdates();
  }

  private initializeLayout(): void {
    // Header bar (status and navigation)
    this.headerBox = this.blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '',
      tags: false,
      wrap: false,
      style: {
        fg: 'white',
        bg: 'blue'
      },
      border: {
        type: 'line'
      }
    });

    // Main content area
    this.mainBox = this.blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '60%',
      height: '85%',
      content: '',
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: 'white',
        bg: 'black'
      },
      border: {
        type: 'line'
      },
      keys: true,
      vi: true,
      mouse: this.options.enableMouse || false
    });

    // Preview pane
    this.previewBox = this.blessed.box({
      parent: this.screen,
      top: 3,
      left: '60%',
      width: '40%',
      height: '85%',
      content: '',
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: 'white',
        bg: 'black'
      },
      border: {
        type: 'line'
      },
      padding: {
        left: 1,
        right: 1,
        top: 1,
        bottom: 1
      }
    });

    // Status bar (keybindings help)
    this.statusBox = this.blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '',
      style: {
        fg: 'white',
        bg: 'gray'
      },
      border: {
        type: 'line'
      },
      padding: {
        left: 1,
        right: 1
      }
    });

    // Command input box (for command mode)
    this.commandBox = this.blessed.textbox({
      parent: this.screen,
      bottom: 3,
      left: 0,
      width: '100%',
      height: 3,
      inputOnFocus: true,
      tags: false,
      wrap: false,
      style: {
        fg: 'white',
        bg: 'blue'
      },
      border: {
        type: 'line'
      },
      hidden: true
    });

    // Command box event handlers
    this.commandBox.on('keypress', (ch: string, key: any) => {
      if (this.currentMode === 'search') {
        // Real-time search as user types (debounced)
        setTimeout(() => {
          this.filterText = this.commandBox.value || '';
          this.applyCurrentFilter();
          this.forceFullRender();
        }, 50);
      }
    });

    this.commandBox.on('submit', (value: string) => {
      if (this.currentMode === 'search') {
        this.filterText = value;
        this.applyCurrentFilter();
        this.exitCurrentMode();
      } else if (this.currentMode === 'command') {
        // TODO: Execute command
        this.exitCurrentMode();
      }
    });

    this.commandBox.on('cancel', () => {
      this.exitCurrentMode();
    });
  }

  private setupKeybindings(): void {
    // Global quit
    this.screen.key(['q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    // Modal keybindings
    this.screen.key(['j', 'down'], () => {
      if (this.currentMode === 'normal') {
        this.navigateDown();
      }
    });

    this.screen.key(['k', 'up'], () => {
      if (this.currentMode === 'normal') {
        this.navigateUp();
      }
    });

    this.screen.key(['h', 'left'], () => {
      if (this.currentMode === 'normal') {
        this.switchPane('left');
      }
    });

    this.screen.key(['l', 'right'], () => {
      if (this.currentMode === 'normal') {
        this.switchPane('right');
      }
    });

    // Mode switches
    this.screen.key(['tab'], () => {
      this.cycleView();
    });

    this.screen.key(['v'], () => {
      if (this.currentMode === 'normal') {
        this.enterVisualMode();
      }
    });

    this.screen.key([':'], () => {
      if (this.currentMode === 'normal') {
        this.enterCommandMode();
      }
    });

    this.screen.key(['/'], () => {
      if (this.currentMode === 'normal') {
        this.enterSearchMode();
      }
    });

    // Quick actions
    this.screen.key(['c'], () => {
      if (this.currentMode === 'normal') {
        this.cancelCurrentCommand();
      }
    });

    this.screen.key(['r'], () => {
      this.refreshData();
    });

    this.screen.key(['enter'], () => {
      if (this.currentMode === 'normal') {
        this.viewCommandDetails();
      }
    });

    this.screen.key(['space'], () => {
      if (this.currentMode === 'visual') {
        this.toggleSelection();
      }
    });

    this.screen.key(['escape'], () => {
      this.exitCurrentMode();
    });

    this.screen.key(['?'], () => {
      this.showHelp();
    });

    // Vim-style navigation
    this.screen.key(['g', 'g'], () => {
      this.goToTop();
    });

    this.screen.key(['G'], () => {
      this.goToBottom();
    });
  }

  private async startRealTimeUpdates(): Promise<void> {
    const refreshInterval = this.options.refreshInterval || 1000;
    
    this.refreshTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.updateData();
        this.render();
      }
    }, refreshInterval);
    
    // Initial data load
    await this.updateData();
    this.render();
  }

  private async updateData(): Promise<void> {
    try {
      // Get fresh command data
      const allCommands = await enhancedExecutor.listAllCommands();
      const activeCommands = await enhancedExecutor.listActiveCommands();
      
      this.commands = allCommands;
      this.applyCurrentFilter();
      
    } catch (error) {
      console.error('Error updating data:', error);
    }
  }

  private applyCurrentFilter(): void {
    let filtered = this.commands;

    // Apply text filter if present
    if (this.filterText) {
      const searchText = this.filterText.toLowerCase();
      filtered = filtered.filter(cmd => 
        cmd.command.toLowerCase().includes(searchText) ||
        cmd.id.toLowerCase().includes(searchText) ||
        cmd.status.toLowerCase().includes(searchText)
      );
    }

    // Apply view-specific filters
    switch (this.currentView) {
      case 'active':
        filtered = filtered.filter(cmd => 
          cmd.status === 'running' || cmd.status === 'pending'
        );
        break;
      case 'history':
        // Show all commands (no additional filtering)
        break;
    }

    this.filteredCommands = filtered;
    
    // Adjust selected index if needed
    if (this.selectedIndex >= this.filteredCommands.length) {
      this.selectedIndex = Math.max(0, this.filteredCommands.length - 1);
    }
  }

  private render(): void {
    // Proper render with screen clearing
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    
    this.renderHeader();
    this.renderMainContent();
    this.renderPreview();
    this.renderStatusBar();
    
    // Force screen repaint
    this.screen.realloc();
    this.screen.render();
  }

  private renderHeader(): void {
    const activeCount = this.commands.filter(cmd => 
      cmd.status === 'running' || cmd.status === 'pending'
    ).length;
    
    const viewTitle = this.getViewTitle();
    const modeInfo = this.getModeInfo();
    const filterInfo = this.filterText ? ` 🔍 Filter: ${this.filterText}` : '';
    
    const header = 
      `TMUX MCP Command Manager │ 🔄 ${activeCount} active │ ` +
      `📚 ${this.commands.length} total │${filterInfo} │ ${modeInfo}`;
    
    this.headerBox.setContent(header);
  }

  private renderMainContent(): void {
    if (this.filteredCommands.length === 0) {
      this.mainBox.setContent(chalk.gray('No commands found'));
      return;
    }

    const lines: string[] = [];
    const maxLines = this.mainBox.height as number - 4; // Account for borders and padding
    
    // Table header
    lines.push(
      chalk.bold(
        'Status │ Command                    │ Pane │ Duration │ Started    │ Shell'
      )
    );
    lines.push('─'.repeat(75));

    // Command rows
    this.filteredCommands.slice(0, maxLines - 2).forEach((cmd, index) => {
      const isSelected = index === this.selectedIndex;
      const isVisuallySelected = this.selectedCommands.has(cmd.id);
      
      const statusIcon = this.getStatusIcon(cmd.status);
      const command = this.truncateText(cmd.command, 25);
      const pane = cmd.paneId || '?';
      const duration = this.formatDuration(cmd);
      const started = this.formatStartTime(cmd.startTime);
      const shell = cmd.shellType || '?';
      
      let line = `${statusIcon} │ ${command} │ ${pane.padEnd(4)} │ ${duration} │ ${started} │ ${shell}`;
      
      if (isSelected) {
        line = chalk.inverse(line);
      }
      
      if (isVisuallySelected) {
        line = chalk.yellow(line);
      }
      
      lines.push(line);
    });

    this.mainBox.setContent(lines.join('\n'));
  }

  private renderPreview(): void {
    if (this.filteredCommands.length === 0) {
      this.previewBox.setContent('No command selected');
      return;
    }

    const selectedCommand = this.filteredCommands[this.selectedIndex];
    if (!selectedCommand) {
      this.previewBox.setContent('No command selected');
      return;
    }

    const lines: string[] = [];
    
    lines.push(chalk.bold(`Preview: ${selectedCommand.command}`));
    lines.push(chalk.gray(`ID: ${selectedCommand.id}`));
    lines.push('─'.repeat(40));
    lines.push('');
    
    lines.push(`Command: ${selectedCommand.command}`);
    lines.push(`Status:  ${this.getStatusIcon(selectedCommand.status)} ${selectedCommand.status.toUpperCase()}`);
    lines.push(`Pane:    ${selectedCommand.paneId}`);
    
    if (selectedCommand.shellType) {
      lines.push(`Shell:   ${selectedCommand.shellType}`);
    }
    
    if (selectedCommand.currentWorkingDirectory) {
      lines.push(`Dir:     ${selectedCommand.currentWorkingDirectory}`);
    }
    
    if (selectedCommand.exitCode !== undefined) {
      lines.push(`Exit:    ${selectedCommand.exitCode}`);
    }
    
    lines.push(`Started: ${new Date(selectedCommand.startTime).toLocaleString()}`);
    
    if (selectedCommand.endTime) {
      lines.push(`Ended:   ${new Date(selectedCommand.endTime).toLocaleString()}`);
    }
    
    const duration = selectedCommand.endTime 
      ? new Date(selectedCommand.endTime).getTime() - new Date(selectedCommand.startTime).getTime()
      : Date.now() - new Date(selectedCommand.startTime).getTime();
    lines.push(`Duration: ${this.formatDurationMs(duration)}`);
    
    if (selectedCommand.result) {
      lines.push('');
      lines.push(chalk.bold('Output:'));
      lines.push('─'.repeat(40));
      
      // Truncate long output for preview
      const output = selectedCommand.result.length > 800 
        ? selectedCommand.result.substring(0, 800) + '\n... (truncated)'
        : selectedCommand.result;
      
      lines.push(output);
    }
    
    this.previewBox.setContent(lines.join('\n'));
  }

  private renderStatusBar(): void {
    const keyHelp = this.getKeyHelp();
    this.statusBox.setContent(keyHelp);
  }

  // Navigation methods
  private navigateUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.render();
    }
  }

  private navigateDown(): void {
    if (this.selectedIndex < this.filteredCommands.length - 1) {
      this.selectedIndex++;
      this.render();
    }
  }

  private goToTop(): void {
    this.selectedIndex = 0;
    this.render();
  }

  private goToBottom(): void {
    this.selectedIndex = Math.max(0, this.filteredCommands.length - 1);
    this.render();
  }

  private switchPane(direction: 'left' | 'right'): void {
    // TODO: Implement pane switching logic
    // For now, just cycle through views
    this.cycleView();
  }

  private cycleView(): void {
    const views: ViewMode[] = ['dashboard', 'active', 'history'];
    const currentIndex = views.indexOf(this.currentView);
    const nextIndex = (currentIndex + 1) % views.length;
    this.currentView = views[nextIndex];
    
    this.selectedIndex = 0; // Reset selection when changing views
    this.applyCurrentFilter();
    this.render();
  }

  // Mode management
  private enterVisualMode(): void {
    this.currentMode = 'visual';
    this.render();
  }

  private enterCommandMode(): void {
    this.currentMode = 'command';
    this.commandBox.hidden = false;
    this.commandBox.focus();
    this.screen.render();
  }

  private enterSearchMode(): void {
    this.currentMode = 'search';
    this.commandBox.hidden = false;
    this.commandBox.clearValue();
    this.commandBox.focus();
    this.commandBox.setLabel(' Search Commands ');
    this.screen.render();
  }

  private exitCurrentMode(): void {
    this.currentMode = 'normal';
    this.commandBox.hidden = true;
    this.commandBox.clearValue();
    this.selectedCommands.clear();
    this.forceFullRender();
  }

  private forceFullRender(): void {
    // Simple full render
    this.render();
  }

  // Actions
  private toggleSelection(): void {
    if (this.filteredCommands.length > 0) {
      const command = this.filteredCommands[this.selectedIndex];
      const isSelected = this.selectedCommands.has(command.id);
      
      if (isSelected) {
        this.selectedCommands.delete(command.id);
      } else {
        this.selectedCommands.set(command.id, true);
      }
      
      this.render();
    }
  }

  private async cancelCurrentCommand(): Promise<void> {
    if (this.filteredCommands.length > 0) {
      const command = this.filteredCommands[this.selectedIndex];
      
      if (command.status === 'running' || command.status === 'pending') {
        const success = await enhancedExecutor.cancelCommand(command.id);
        if (success) {
          // Show brief success message
          this.showTemporaryMessage('✅ Command cancelled');
        } else {
          this.showTemporaryMessage('❌ Failed to cancel command');
        }
        
        // Refresh data
        await this.updateData();
        this.render();
      }
    }
  }

  private async refreshData(): Promise<void> {
    await this.updateData();
    this.render();
    this.showTemporaryMessage('🔄 Data refreshed');
  }

  private viewCommandDetails(): void {
    // TODO: Implement detailed command view
    // For now, just show in preview
    this.render();
  }

  private showHelp(): void {
    // TODO: Implement help modal
    this.showTemporaryMessage('Help: j/k:nav, c:cancel, r:refresh, v:visual(toggle), /:search, bksp:back');
  }

  private showTemporaryMessage(message: string, duration: number = 2000): void {
    const originalContent = this.statusBox.content;
    this.statusBox.setContent(message);
    this.screen.render();
    
    setTimeout(() => {
      this.statusBox.setContent(originalContent as string);
      this.screen.render();
    }, duration);
  }

  // Utility methods
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'error': return '❌';
      case 'cancelled': return '🚫';
      case 'timeout': return '⏰';
      case 'pending': return '⏳';
      default: return '?';
    }
  }

  private getViewTitle(): string {
    switch (this.currentView) {
      case 'active': return 'Active Commands';
      case 'history': return 'Command History';
      case 'dashboard': return 'Dashboard';
      case 'logs': return 'Logs';
      case 'watch': return 'Watch Mode';
      default: return 'Dashboard';
    }
  }

  private getModeInfo(): string {
    switch (this.currentMode) {
      case 'normal': return 'Mode: NORMAL';
      case 'visual': return 'Mode: VISUAL';
      case 'command': return 'Mode: COMMAND';
      case 'search': return 'Mode: SEARCH';
      default: return 'Mode: NORMAL';
    }
  }

  private getKeyHelp(): string {
    switch (this.currentMode) {
      case 'visual':
        return 'j/k:Nav │ Space:Toggle │ c:Cancel Selected │ d:Delete │ Esc:Normal │ Enter:Action';
      case 'command':
        return 'Enter:Execute │ Esc:Cancel │ :kill :cleanup :filter :help';
      case 'search':
        return 'Type to search │ Enter:Apply │ Esc:Clear │ Ctrl-R:Regex';
      default:
        return 'j/k:Nav │ Enter:View │ c:Cancel │ r:Refresh │ /:Filter │ v:Visual │ ?:Help │ q:Quit │ Tab:Mode';
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text.padEnd(maxLength);
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  private formatDuration(cmd: enhancedExecutor.EnhancedCommandExecution): string {
    const duration = cmd.endTime 
      ? new Date(cmd.endTime).getTime() - new Date(cmd.startTime).getTime()
      : Date.now() - new Date(cmd.startTime).getTime();
    
    return this.formatDurationMs(duration);
  }

  private formatDurationMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  private formatStartTime(startTime: Date): string {
    const now = new Date();
    const start = new Date(startTime);
    const diff = now.getTime() - start.getTime();
    
    if (diff < 86400000) { // Less than 24 hours
      return start.toLocaleTimeString();
    } else {
      return start.toLocaleDateString();
    }
  }

  // Public interface
  public async start(): Promise<void> {
    await this.initializeBlessed();
    this.isRunning = true;
    this.screen.render();
    
    // Focus main box for key events
    this.mainBox.focus();
  }

  public cleanup(): void {
    this.isRunning = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.screen.destroy();
  }
}