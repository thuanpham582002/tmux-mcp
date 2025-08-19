/**
 * Integration tests for end-to-end user workflows
 * Tests complete user journeys through the TUI
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  createMockEnhancedExecutor,
  createMockCommandList,
  setupIntegrationTest, 
  teardownIntegrationTest,
  waitFor
} from './test-setup.js';

// Mock the TUI components for workflow testing
const createWorkflowTester = () => {
  let currentView = 'history';
  let currentMode = 'normal';
  let selectedIndex = 0;
  let selectedCommands = new Map<string, boolean>();
  let filterText = '';
  let commands: any[] = [];
  let copySelection = {
    target: 'command',
    commandIds: [],
    state: 'idle'
  };
  let copyMessage = '';
  
  // Simulate the input handler logic
  const simulateInput = (input: string, key: any = {}) => {
    // Handle quit commands
    if (input === 'q' && currentMode === 'normal') {
      return { action: 'quit' };
    }
    
    if (key.ctrl && input === 'c') {
      return { action: 'quit' };
    }
    
    // Mode-specific input handling
    switch (currentMode) {
      case 'normal':
        return handleNormalMode(input, key);
      case 'visual':
        return handleVisualMode(input, key);
      case 'copy':
        return handleCopyMode(input, key);
      case 'command':
      case 'search':
        return handleModalMode(input, key);
    }
    
    return { action: 'none' };
  };
  
  const handleNormalMode = (input: string, key: any) => {
    // Vim scrolling
    if (key.ctrl) {
      switch (input) {
        case 'u':
          selectedIndex = Math.max(0, selectedIndex - Math.floor(5 / 2));
          return { action: 'half_page_up' };
        case 'd':
          selectedIndex = Math.min(commands.length - 1, selectedIndex + Math.floor(5 / 2));
          return { action: 'half_page_down' };
        case 'f':
          selectedIndex = Math.min(commands.length - 1, selectedIndex + 5);
          return { action: 'page_down' };
        case 'b':
          selectedIndex = Math.max(0, selectedIndex - 5);
          return { action: 'page_up' };
      }
    }
    
    // Basic navigation
    switch (input) {
      case 'j':
        selectedIndex = Math.min(commands.length - 1, selectedIndex + 1);
        return { action: 'navigate_down' };
      case 'k':
        selectedIndex = Math.max(0, selectedIndex - 1);
        return { action: 'navigate_up' };
      case 'G':
        selectedIndex = Math.max(0, commands.length - 1);
        return { action: 'go_to_bottom' };
      case 'g':
        selectedIndex = 0;
        return { action: 'go_to_top' };
      case 'h':
      case 'l':
        const views = ['dashboard', 'active', 'history'];
        const currentIndex = views.indexOf(currentView);
        const nextIndex = (currentIndex + 1) % views.length;
        currentView = views[nextIndex];
        selectedIndex = 0;
        return { action: 'cycle_view', view: currentView };
    }
    
    // Mode switching
    switch (input) {
      case 'v':
        currentMode = 'visual';
        return { action: 'enter_visual_mode' };
      case 'y':
        if (commands.length > 0) {
          currentMode = 'copy';
          copySelection = {
            target: 'command',
            commandIds: selectedCommands.size > 0 
              ? Array.from(selectedCommands.keys())
              : [commands[selectedIndex]?.id],
            state: 'selecting'
          };
          return { action: 'enter_copy_mode' };
        }
        return { action: 'none' };
      case ':':
        currentMode = 'command';
        return { action: 'enter_command_mode' };
      case '/':
        currentMode = 'search';
        return { action: 'enter_search_mode' };
    }
    
    // Actions
    if (input === 'r') {
      return { action: 'refresh_data' };
    }
    
    if (key.tab) {
      const views = ['dashboard', 'active', 'history'];
      const currentIndex = views.indexOf(currentView);
      const nextIndex = (currentIndex + 1) % views.length;
      currentView = views[nextIndex];
      selectedIndex = 0;
      return { action: 'cycle_view', view: currentView };
    }
    
    return { action: 'none' };
  };
  
  const handleVisualMode = (input: string, key: any) => {
    // Navigation still works in visual mode
    if (key.ctrl) {
      switch (input) {
        case 'u':
          selectedIndex = Math.max(0, selectedIndex - Math.floor(5 / 2));
          return { action: 'half_page_up' };
        case 'd':
          selectedIndex = Math.min(commands.length - 1, selectedIndex + Math.floor(5 / 2));
          return { action: 'half_page_down' };
      }
    }
    
    switch (input) {
      case 'j':
        selectedIndex = Math.min(commands.length - 1, selectedIndex + 1);
        return { action: 'navigate_down' };
      case 'k':
        selectedIndex = Math.max(0, selectedIndex - 1);
        return { action: 'navigate_up' };
      case 'G':
        selectedIndex = Math.max(0, commands.length - 1);
        return { action: 'go_to_bottom' };
      case 'g':
        selectedIndex = 0;
        return { action: 'go_to_top' };
    }
    
    // Selection toggle
    if (input === ' ' || key.space) {
      if (commands.length > 0) {
        const command = commands[selectedIndex];
        if (selectedCommands.has(command.id)) {
          selectedCommands.delete(command.id);
        } else {
          selectedCommands.set(command.id, true);
        }
        return { action: 'toggle_selection', selectedCount: selectedCommands.size };
      }
    }
    
    // Actions
    if (input === 'y') {
      currentMode = 'copy';
      copySelection = {
        target: 'command',
        commandIds: Array.from(selectedCommands.keys()),
        state: 'selecting'
      };
      return { action: 'enter_copy_mode' };
    }
    
    // Exit visual mode
    if (key.backspace) {
      currentMode = 'normal';
      return { action: 'exit_visual_mode' };
    }
    
    return { action: 'none' };
  };
  
  const handleCopyMode = (input: string, key: any) => {
    // Navigation still works
    switch (input) {
      case 'j':
        selectedIndex = Math.min(commands.length - 1, selectedIndex + 1);
        return { action: 'navigate_down' };
      case 'k':
        selectedIndex = Math.max(0, selectedIndex - 1);
        return { action: 'navigate_up' };
    }
    
    // Copy target selection
    switch (input) {
      case 'c':
        copySelection = { ...copySelection, target: 'command' };
        return { action: 'set_copy_target', target: 'command' };
      case 'o':
        copySelection = { ...copySelection, target: 'output' };
        return { action: 'set_copy_target', target: 'output' };
      case 'm':
        copySelection = { ...copySelection, target: 'metadata' };
        return { action: 'set_copy_target', target: 'metadata' };
      case 'f':
        copySelection = { ...copySelection, target: 'full' };
        return { action: 'set_copy_target', target: 'full' };
    }
    
    // Cycle copy targets with arrow keys
    if (key.leftArrow || key.rightArrow) {
      const targets = ['command', 'output', 'full', 'metadata'];
      const currentIndex = targets.indexOf(copySelection.target);
      const newIndex = key.rightArrow 
        ? (currentIndex + 1) % targets.length
        : (currentIndex - 1 + targets.length) % targets.length;
      copySelection = { ...copySelection, target: targets[newIndex] };
      return { action: 'cycle_copy_target', target: targets[newIndex] };
    }
    
    // Execute copy
    if (key.return || input === ' ') {
      copySelection = { ...copySelection, state: 'copying' };
      copyMessage = 'Copied successfully';
      
      // Simulate auto-exit after copy
      setTimeout(() => {
        currentMode = 'normal';
        copySelection = { target: 'command', commandIds: [], state: 'idle' };
        copyMessage = '';
      }, 100);
      
      return { action: 'execute_copy', target: copySelection.target };
    }
    
    // Exit copy mode
    if (key.backspace) {
      currentMode = 'normal';
      copySelection = { target: 'command', commandIds: [], state: 'idle' };
      return { action: 'exit_copy_mode' };
    }
    
    return { action: 'none' };
  };
  
  const handleModalMode = (input: string, key: any) => {
    // Exit modal modes
    if (key.backspace) {
      currentMode = 'normal';
      return { action: 'exit_modal_mode' };
    }
    
    return { action: 'none' };
  };
  
  const applyFilter = (text: string) => {
    filterText = text;
    selectedIndex = 0; // Reset selection when filtering
    return { action: 'filter_applied', filterText };
  };
  
  const loadCommands = (newCommands: any[]) => {
    commands = newCommands;
    // Adjust selected index if needed
    if (selectedIndex >= commands.length) {
      selectedIndex = Math.max(0, commands.length - 1);
    }
  };
  
  const getFilteredCommands = () => {
    let filtered = [...commands];
    
    // Apply text filter
    if (filterText) {
      const searchText = filterText.toLowerCase();
      filtered = filtered.filter(cmd => 
        cmd.command.toLowerCase().includes(searchText) ||
        cmd.id.toLowerCase().includes(searchText) ||
        cmd.status.toLowerCase().includes(searchText)
      );
    }
    
    // Apply view filter
    switch (currentView) {
      case 'active':
        filtered = filtered.filter(cmd => 
          cmd.status === 'running' || cmd.status === 'pending'
        );
        break;
      case 'history':
        // Show all commands
        break;
    }
    
    return filtered;
  };
  
  return {
    simulateInput,
    applyFilter,
    loadCommands,
    getState: () => ({
      currentView,
      currentMode,
      selectedIndex,
      selectedCommands: new Map(selectedCommands),
      filterText,
      commands: getFilteredCommands(),
      copySelection: { ...copySelection },
      copyMessage
    }),
    // Test utilities
    resetState: () => {
      currentView = 'history';
      currentMode = 'normal';
      selectedIndex = 0;
      selectedCommands.clear();
      filterText = '';
      commands = [];
      copySelection = { target: 'command', commandIds: [], state: 'idle' };
      copyMessage = '';
    }
  };
};

describe('User Workflow Integration Tests', () => {
  let workflowTester: any;
  let mockEnhancedExecutor: any;
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = setupIntegrationTest());
    mockEnhancedExecutor = createMockEnhancedExecutor();
    workflowTester = createWorkflowTester();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    teardownIntegrationTest();
  });

  describe('Basic Navigation Workflows', () => {
    beforeEach(() => {
      const testCommands = createMockCommandList(20);
      workflowTester.loadCommands(testCommands);
    });

    it('should navigate through command list with vim keys', () => {
      let state = workflowTester.getState();
      expect(state.selectedIndex).toBe(0);
      
      // Move down with j
      let result = workflowTester.simulateInput('j');
      state = workflowTester.getState();
      expect(result.action).toBe('navigate_down');
      expect(state.selectedIndex).toBe(1);
      
      // Move down more
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('j');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(3);
      
      // Move up with k
      result = workflowTester.simulateInput('k');
      state = workflowTester.getState();
      expect(result.action).toBe('navigate_up');
      expect(state.selectedIndex).toBe(2);
    });

    it('should handle vim scrolling commands', () => {
      // Go to middle
      workflowTester.simulateInput('G'); // Go to bottom first
      let state = workflowTester.getState();
      expect(state.selectedIndex).toBe(19);
      
      // Half page up (Ctrl+U)
      let result = workflowTester.simulateInput('u', { ctrl: true });
      state = workflowTester.getState();
      expect(result.action).toBe('half_page_up');
      expect(state.selectedIndex).toBeLessThan(19);
      
      // Full page down (Ctrl+F)
      result = workflowTester.simulateInput('f', { ctrl: true });
      state = workflowTester.getState();
      expect(result.action).toBe('page_down');
      
      // Go to top (g)
      result = workflowTester.simulateInput('g');
      state = workflowTester.getState();
      expect(result.action).toBe('go_to_top');
      expect(state.selectedIndex).toBe(0);
    });

    it('should handle boundary navigation gracefully', () => {
      let state = workflowTester.getState();
      expect(state.selectedIndex).toBe(0);
      
      // Try to go up from top
      workflowTester.simulateInput('k');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(0); // Should stay at top
      
      // Go to bottom
      workflowTester.simulateInput('G');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(19);
      
      // Try to go down from bottom
      workflowTester.simulateInput('j');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(19); // Should stay at bottom
    });
  });

  describe('View Switching Workflows', () => {
    beforeEach(() => {
      const testCommands = [
        { id: 'cmd1', status: 'running', command: 'tail -f log.txt' },
        { id: 'cmd2', status: 'completed', command: 'npm install' },
        { id: 'cmd3', status: 'pending', command: 'git push' },
        { id: 'cmd4', status: 'error', command: 'yarn test' },
        { id: 'cmd5', status: 'running', command: 'docker build' }
      ];
      workflowTester.loadCommands(testCommands);
    });

    it('should cycle through views with tab key', () => {
      let state = workflowTester.getState();
      expect(state.currentView).toBe('history');
      expect(state.commands).toHaveLength(5); // All commands
      
      // Cycle to dashboard
      let result = workflowTester.simulateInput('', { tab: true });
      state = workflowTester.getState();
      expect(result.action).toBe('cycle_view');
      expect(state.currentView).toBe('dashboard');
      
      // Cycle to active
      workflowTester.simulateInput('', { tab: true });
      state = workflowTester.getState();
      expect(state.currentView).toBe('active');
      expect(state.commands).toHaveLength(3); // Only running/pending
      
      // Cycle back to history
      workflowTester.simulateInput('', { tab: true });
      state = workflowTester.getState();
      expect(state.currentView).toBe('history');
      expect(state.commands).toHaveLength(5); // All commands again
    });

    it('should reset selection when changing views', () => {
      // Navigate to position 3
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('j');
      
      let state = workflowTester.getState();
      expect(state.selectedIndex).toBe(3);
      
      // Change view
      workflowTester.simulateInput('', { tab: true });
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(0); // Reset to top
    });

    it('should handle view-specific filtering', () => {
      // History view shows all
      let state = workflowTester.getState();
      expect(state.currentView).toBe('history');
      expect(state.commands).toHaveLength(5);
      
      // Switch to active view
      workflowTester.simulateInput('', { tab: true }); // dashboard
      workflowTester.simulateInput('', { tab: true }); // active
      
      state = workflowTester.getState();
      expect(state.currentView).toBe('active');
      expect(state.commands).toHaveLength(3); // 2 running + 1 pending
      
      const activeCommands = state.commands;
      expect(activeCommands.every(cmd => 
        cmd.status === 'running' || cmd.status === 'pending'
      )).toBe(true);
    });
  });

  describe('Visual Mode Workflows', () => {
    beforeEach(() => {
      const testCommands = createMockCommandList(10);
      workflowTester.loadCommands(testCommands);
    });

    it('should enter and exit visual mode', () => {
      let state = workflowTester.getState();
      expect(state.currentMode).toBe('normal');
      
      // Enter visual mode
      let result = workflowTester.simulateInput('v');
      state = workflowTester.getState();
      expect(result.action).toBe('enter_visual_mode');
      expect(state.currentMode).toBe('visual');
      
      // Exit visual mode
      result = workflowTester.simulateInput('', { backspace: true });
      state = workflowTester.getState();
      expect(result.action).toBe('exit_visual_mode');
      expect(state.currentMode).toBe('normal');
    });

    it('should select multiple items in visual mode', () => {
      // Enter visual mode
      workflowTester.simulateInput('v');
      
      let state = workflowTester.getState();
      expect(state.currentMode).toBe('visual');
      expect(state.selectedCommands.size).toBe(0);
      
      // Select current item
      let result = workflowTester.simulateInput(' ', { space: true });
      state = workflowTester.getState();
      expect(result.action).toBe('toggle_selection');
      expect(state.selectedCommands.size).toBe(1);
      
      // Move and select another
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('j');
      workflowTester.simulateInput(' ', { space: true });
      
      state = workflowTester.getState();
      expect(state.selectedCommands.size).toBe(2);
      expect(state.selectedIndex).toBe(2);
    });

    it('should maintain navigation in visual mode', () => {
      workflowTester.simulateInput('v'); // Enter visual mode
      
      // Test vim navigation still works
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('j');
      let state = workflowTester.getState();
      expect(state.selectedIndex).toBe(2);
      
      // Test vim scrolling still works
      let result = workflowTester.simulateInput('u', { ctrl: true });
      expect(result.action).toBe('half_page_up');
      
      state = workflowTester.getState();
      expect(state.currentMode).toBe('visual'); // Still in visual mode
    });

    it('should toggle selection on same item', () => {
      workflowTester.simulateInput('v'); // Enter visual mode
      
      // Select item
      workflowTester.simulateInput(' ', { space: true });
      let state = workflowTester.getState();
      expect(state.selectedCommands.size).toBe(1);
      
      // Unselect same item
      workflowTester.simulateInput(' ', { space: true });
      state = workflowTester.getState();
      expect(state.selectedCommands.size).toBe(0);
    });
  });

  describe('Copy Mode Workflows', () => {
    beforeEach(() => {
      const testCommands = createMockCommandList(5);
      workflowTester.loadCommands(testCommands);
    });

    it('should enter copy mode from normal mode', () => {
      let result = workflowTester.simulateInput('y');
      let state = workflowTester.getState();
      
      expect(result.action).toBe('enter_copy_mode');
      expect(state.currentMode).toBe('copy');
      expect(state.copySelection.state).toBe('selecting');
      expect(state.copySelection.target).toBe('command');
    });

    it('should enter copy mode from visual mode with selections', () => {
      // Enter visual mode and select items
      workflowTester.simulateInput('v');
      workflowTester.simulateInput(' ', { space: true });
      workflowTester.simulateInput('j');
      workflowTester.simulateInput(' ', { space: true });
      
      let state = workflowTester.getState();
      expect(state.selectedCommands.size).toBe(2);
      
      // Enter copy mode
      let result = workflowTester.simulateInput('y');
      state = workflowTester.getState();
      
      expect(result.action).toBe('enter_copy_mode');
      expect(state.currentMode).toBe('copy');
      expect(state.copySelection.commandIds).toHaveLength(2);
    });

    it('should change copy targets', () => {
      workflowTester.simulateInput('y'); // Enter copy mode
      
      let state = workflowTester.getState();
      expect(state.copySelection.target).toBe('command');
      
      // Change to output
      let result = workflowTester.simulateInput('o');
      state = workflowTester.getState();
      expect(result.action).toBe('set_copy_target');
      expect(state.copySelection.target).toBe('output');
      
      // Change to metadata
      workflowTester.simulateInput('m');
      state = workflowTester.getState();
      expect(state.copySelection.target).toBe('metadata');
      
      // Change to full
      workflowTester.simulateInput('f');
      state = workflowTester.getState();
      expect(state.copySelection.target).toBe('full');
      
      // Back to command
      workflowTester.simulateInput('c');
      state = workflowTester.getState();
      expect(state.copySelection.target).toBe('command');
    });

    it('should cycle copy targets with arrow keys', () => {
      workflowTester.simulateInput('y'); // Enter copy mode
      
      let state = workflowTester.getState();
      expect(state.copySelection.target).toBe('command');
      
      // Cycle right: command -> output
      let result = workflowTester.simulateInput('', { rightArrow: true });
      state = workflowTester.getState();
      expect(result.action).toBe('cycle_copy_target');
      expect(state.copySelection.target).toBe('output');
      
      // Cycle left: output -> command
      result = workflowTester.simulateInput('', { leftArrow: true });
      state = workflowTester.getState();
      expect(state.copySelection.target).toBe('command');
    });

    it('should execute copy operation', async () => {
      workflowTester.simulateInput('y'); // Enter copy mode
      workflowTester.simulateInput('o'); // Select output target
      
      let state = workflowTester.getState();
      expect(state.copySelection.target).toBe('output');
      
      // Execute copy
      let result = workflowTester.simulateInput('', { return: true });
      expect(result.action).toBe('execute_copy');
      expect(result.target).toBe('output');
      
      // Should transition to copying state
      state = workflowTester.getState();
      expect(state.copySelection.state).toBe('copying');
      
      // Wait for auto-exit simulation
      await new Promise(resolve => setTimeout(resolve, 150));
      
      state = workflowTester.getState();
      expect(state.currentMode).toBe('normal');
    });

    it('should exit copy mode manually', () => {
      workflowTester.simulateInput('y'); // Enter copy mode
      
      let state = workflowTester.getState();
      expect(state.currentMode).toBe('copy');
      
      // Exit copy mode
      let result = workflowTester.simulateInput('', { backspace: true });
      state = workflowTester.getState();
      
      expect(result.action).toBe('exit_copy_mode');
      expect(state.currentMode).toBe('normal');
      expect(state.copySelection.state).toBe('idle');
    });
  });

  describe('Search and Filter Workflows', () => {
    beforeEach(() => {
      const testCommands = [
        { id: 'cmd1', command: 'npm install react', status: 'completed' },
        { id: 'cmd2', command: 'docker build -t app .', status: 'running' },
        { id: 'cmd3', command: 'yarn start', status: 'completed' },
        { id: 'cmd4', command: 'git commit -m "fix"', status: 'error' },
        { id: 'cmd5', command: 'npm test', status: 'pending' }
      ];
      workflowTester.loadCommands(testCommands);
    });

    it('should enter search mode', () => {
      let result = workflowTester.simulateInput('/');
      let state = workflowTester.getState();
      
      expect(result.action).toBe('enter_search_mode');
      expect(state.currentMode).toBe('search');
    });

    it('should filter commands by text', () => {
      let state = workflowTester.getState();
      expect(state.commands).toHaveLength(5);
      
      // Apply npm filter
      let result = workflowTester.applyFilter('npm');
      state = workflowTester.getState();
      
      expect(result.action).toBe('filter_applied');
      expect(state.filterText).toBe('npm');
      expect(state.commands).toHaveLength(2); // npm install and npm test
      expect(state.selectedIndex).toBe(0); // Reset to top
    });

    it('should filter commands by status', () => {
      workflowTester.applyFilter('running');
      let state = workflowTester.getState();
      
      expect(state.commands).toHaveLength(1);
      expect(state.commands[0].status).toBe('running');
    });

    it('should combine view and text filters', () => {
      // Switch to active view
      workflowTester.simulateInput('', { tab: true }); // dashboard
      workflowTester.simulateInput('', { tab: true }); // active
      
      let state = workflowTester.getState();
      expect(state.currentView).toBe('active');
      expect(state.commands).toHaveLength(2); // running + pending
      
      // Apply text filter
      workflowTester.applyFilter('npm');
      state = workflowTester.getState();
      
      // Should show only npm commands that are active (running/pending)
      expect(state.commands).toHaveLength(1); // Only npm test (pending)
      expect(state.commands[0].command).toBe('npm test');
      expect(state.commands[0].status).toBe('pending');
    });

    it('should handle empty filter results', () => {
      workflowTester.applyFilter('nonexistent');
      let state = workflowTester.getState();
      
      expect(state.commands).toHaveLength(0);
      expect(state.selectedIndex).toBe(0);
    });

    it('should clear filter when exiting search mode', () => {
      // Apply filter
      workflowTester.applyFilter('docker');
      let state = workflowTester.getState();
      expect(state.commands).toHaveLength(1);
      
      // Clear filter (simulated by exit action)
      workflowTester.applyFilter('');
      state = workflowTester.getState();
      expect(state.commands).toHaveLength(5); // All commands back
    });
  });

  describe('Complex Multi-Step Workflows', () => {
    beforeEach(() => {
      const testCommands = createMockCommandList(15);
      workflowTester.loadCommands(testCommands);
    });

    it('should complete a full navigation → selection → copy workflow', () => {
      // 1. Navigate to specific command
      workflowTester.simulateInput('j'); // Move down
      workflowTester.simulateInput('j'); // Move down
      workflowTester.simulateInput('j'); // Move down
      
      let state = workflowTester.getState();
      expect(state.selectedIndex).toBe(3);
      
      // 2. Enter visual mode and select multiple items
      workflowTester.simulateInput('v');
      workflowTester.simulateInput(' ', { space: true }); // Select item at index 3
      workflowTester.simulateInput('j'); // Move to index 4
      workflowTester.simulateInput(' ', { space: true }); // Select item at index 4
      workflowTester.simulateInput('j'); // Move to index 5
      workflowTester.simulateInput(' ', { space: true }); // Select item at index 5
      
      state = workflowTester.getState();
      expect(state.currentMode).toBe('visual');
      expect(state.selectedCommands.size).toBe(3);
      expect(state.selectedIndex).toBe(5);
      
      // 3. Enter copy mode with selected items
      workflowTester.simulateInput('y');
      
      state = workflowTester.getState();
      expect(state.currentMode).toBe('copy');
      expect(state.copySelection.commandIds).toHaveLength(3);
      expect(state.copySelection.target).toBe('command');
      
      // 4. Change copy target and execute
      workflowTester.simulateInput('o'); // Change to output
      workflowTester.simulateInput('', { return: true }); // Execute copy
      
      state = workflowTester.getState();
      expect(state.copySelection.state).toBe('copying');
    });

    it('should handle search → navigate → view change → copy workflow', async () => {
      // 1. Apply search filter
      workflowTester.applyFilter('cmd-1');
      let state = workflowTester.getState();
      expect(state.commands.length).toBeGreaterThan(0);
      
      // 2. Navigate in filtered results
      workflowTester.simulateInput('j');
      state = workflowTester.getState();
      const selectedInFiltered = state.selectedIndex;
      
      // 3. Clear filter to see all commands
      workflowTester.applyFilter('');
      state = workflowTester.getState();
      expect(state.commands).toHaveLength(15);
      
      // 4. Change to active view
      workflowTester.simulateInput('', { tab: true }); // dashboard
      workflowTester.simulateInput('', { tab: true }); // active
      
      state = workflowTester.getState();
      expect(state.currentView).toBe('active');
      expect(state.selectedIndex).toBe(0); // Reset on view change
      
      // 5. Enter copy mode and execute
      if (state.commands.length > 0) {
        workflowTester.simulateInput('y');
        workflowTester.simulateInput('f'); // Full copy
        workflowTester.simulateInput('', { return: true });
        
        state = workflowTester.getState();
        expect(state.copySelection.target).toBe('full');
        
        // Wait for auto-exit
        await new Promise(resolve => setTimeout(resolve, 150));
        
        state = workflowTester.getState();
        expect(state.currentMode).toBe('normal');
      }
    });

    it('should handle error recovery in workflows', () => {
      // 1. Try to copy with no commands
      workflowTester.loadCommands([]);
      
      let result = workflowTester.simulateInput('y');
      let state = workflowTester.getState();
      
      expect(result.action).toBe('none'); // Should not enter copy mode
      expect(state.currentMode).toBe('normal');
      
      // 2. Load commands and try again
      workflowTester.loadCommands(createMockCommandList(5));
      
      result = workflowTester.simulateInput('y');
      state = workflowTester.getState();
      
      expect(result.action).toBe('enter_copy_mode');
      expect(state.currentMode).toBe('copy');
    });

    it('should maintain consistency across mode transitions', () => {
      // Track selection through multiple mode changes
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('j');
      
      let state = workflowTester.getState();
      const initialIndex = state.selectedIndex;
      expect(initialIndex).toBe(3);
      
      // Enter visual mode - selection should persist
      workflowTester.simulateInput('v');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(initialIndex);
      
      // Navigate in visual mode
      workflowTester.simulateInput('j');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(initialIndex + 1);
      
      // Enter copy mode - selection should persist
      workflowTester.simulateInput('y');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(initialIndex + 1);
      
      // Navigate in copy mode
      workflowTester.simulateInput('k');
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(initialIndex);
      
      // Exit to normal mode
      workflowTester.simulateInput('', { backspace: true });
      state = workflowTester.getState();
      expect(state.currentMode).toBe('normal');
      expect(state.selectedIndex).toBe(initialIndex);
    });
  });

  describe('Error Handling in Workflows', () => {
    it('should handle empty command list gracefully', () => {
      workflowTester.loadCommands([]);
      
      let state = workflowTester.getState();
      expect(state.commands).toHaveLength(0);
      expect(state.selectedIndex).toBe(0);
      
      // Navigation should be safe
      workflowTester.simulateInput('j');
      workflowTester.simulateInput('k');
      workflowTester.simulateInput('G');
      workflowTester.simulateInput('g');
      
      state = workflowTester.getState();
      expect(state.selectedIndex).toBe(0);
      
      // Mode transitions should work
      workflowTester.simulateInput('v');
      state = workflowTester.getState();
      expect(state.currentMode).toBe('visual');
      
      workflowTester.simulateInput('', { backspace: true });
      state = workflowTester.getState();
      expect(state.currentMode).toBe('normal');
    });

    it('should handle rapid mode switching', () => {
      workflowTester.loadCommands(createMockCommandList(5));
      
      // Rapid mode changes
      workflowTester.simulateInput('v'); // visual
      workflowTester.simulateInput('y'); // copy
      workflowTester.simulateInput('', { backspace: true }); // normal
      workflowTester.simulateInput('/'); // search
      workflowTester.simulateInput('', { backspace: true }); // normal
      workflowTester.simulateInput(':'); // command
      workflowTester.simulateInput('', { backspace: true }); // normal
      
      let state = workflowTester.getState();
      expect(state.currentMode).toBe('normal');
    });

    it('should maintain data integrity during complex operations', () => {
      const originalCommands = createMockCommandList(10);
      workflowTester.loadCommands(originalCommands);
      
      // Perform complex workflow
      workflowTester.simulateInput('v'); // visual mode
      workflowTester.simulateInput(' ', { space: true }); // select
      workflowTester.simulateInput('j');
      workflowTester.simulateInput(' ', { space: true }); // select
      
      let state = workflowTester.getState();
      const selectedCount = state.selectedCommands.size;
      expect(selectedCount).toBe(2);
      
      // Enter copy mode
      workflowTester.simulateInput('y');
      state = workflowTester.getState();
      expect(state.copySelection.commandIds).toHaveLength(selectedCount);
      
      // Exit without copying
      workflowTester.simulateInput('', { backspace: true });
      state = workflowTester.getState();
      expect(state.currentMode).toBe('normal');
      expect(state.copySelection.state).toBe('idle');
      
      // Original commands should be unchanged
      expect(state.commands).toHaveLength(10);
    });
  });
});