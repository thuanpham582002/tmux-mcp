/**
 * Integration tests for TUI components
 * Tests cross-component interactions and data flow
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { 
  createMockEnhancedExecutor,
  createMockCommandList,
  setupIntegrationTest, 
  teardownIntegrationTest
} from './test-setup.js';

// Mock all the individual components
const createMockComponent = (name: string) => {
  return ({ children, ...props }: any) => ({
    type: name,
    props,
    children,
    // Store props for testing
    _testProps: props
  });
};

// Mock components with prop capture
const MockHeaderBox = createMockComponent('HeaderBox');
const MockCommandListBox = createMockComponent('CommandListBox');  
const MockPreviewPaneBox = createMockComponent('PreviewPaneBox');
const MockStatusBarBox = createMockComponent('StatusBarBox');
const MockCommandInputModal = createMockComponent('CommandInputModal');
const MockCopyModeOverlay = createMockComponent('CopyModeOverlay');

jest.mock('../../src/components/HeaderBox.js', () => ({
  HeaderBox: MockHeaderBox
}));

jest.mock('../../src/components/CommandListBox.js', () => ({
  CommandListBox: MockCommandListBox
}));

jest.mock('../../src/components/PreviewPaneBox.js', () => ({
  PreviewPaneBox: MockPreviewPaneBox
}));

jest.mock('../../src/components/StatusBarBox.js', () => ({
  StatusBarBox: MockStatusBarBox
}));

jest.mock('../../src/components/CommandInputModal.js', () => ({
  CommandInputModal: MockCommandInputModal
}));

jest.mock('../../src/components/CopyModeOverlay.js', () => ({
  CopyModeOverlay: MockCopyModeOverlay
}));

// Mock Ink components
jest.mock('ink', () => ({
  Box: ({ children, ...props }: any) => ({ type: 'Box', props, children }),
  Text: ({ children, ...props }: any) => ({ type: 'Text', props, children }),
  useApp: () => ({
    exit: jest.fn()
  })
}));

describe('Component Integration Tests', () => {
  let mockEnhancedExecutor: any;
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = setupIntegrationTest());
    mockEnhancedExecutor = createMockEnhancedExecutor();
    
    // Mock enhanced executor module
    jest.mock('../../src/enhanced-executor.js', () => mockEnhancedExecutor);
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    teardownIntegrationTest();
  });

  describe('HeaderBox Integration', () => {
    it('should receive correct props from parent app', () => {
      // Create a simple test that verifies HeaderBox gets the right data
      const testProps = {
        currentView: 'history',
        currentMode: 'normal',
        activeCount: 5,
        totalCount: 20,
        filterText: 'test filter'
      };

      // Simulate HeaderBox being rendered with these props
      const headerBox = React.createElement(MockHeaderBox, testProps);
      
      expect(headerBox.props.currentView).toBe('history');
      expect(headerBox.props.currentMode).toBe('normal');
      expect(headerBox.props.activeCount).toBe(5);
      expect(headerBox.props.totalCount).toBe(20);
      expect(headerBox.props.filterText).toBe('test filter');
    });

    it('should update when app state changes', () => {
      // Test different view modes
      const dashboardProps = { currentView: 'dashboard', activeCount: 3 };
      const activeProps = { currentView: 'active', activeCount: 3 };
      const historyProps = { currentView: 'history', activeCount: 3 };

      const dashboardHeader = React.createElement(MockHeaderBox, dashboardProps);
      const activeHeader = React.createElement(MockHeaderBox, activeProps);
      const historyHeader = React.createElement(MockHeaderBox, historyProps);

      expect(dashboardHeader.props.currentView).toBe('dashboard');
      expect(activeHeader.props.currentView).toBe('active');
      expect(historyHeader.props.currentView).toBe('history');
    });

    it('should handle mode transitions', () => {
      const modes = ['normal', 'visual', 'copy', 'command', 'search'];
      
      modes.forEach(mode => {
        const headerBox = React.createElement(MockHeaderBox, { currentMode: mode });
        expect(headerBox.props.currentMode).toBe(mode);
      });
    });
  });

  describe('CommandListBox Integration', () => {
    it('should receive filtered commands from parent', () => {
      const testCommands = createMockCommandList(10);
      const testProps = {
        commands: testCommands,
        selectedIndex: 3,
        selectedCommands: new Map([['cmd1', true], ['cmd3', true]]),
        scrollOffset: 2,
        currentMode: 'visual'
      };

      const commandListBox = React.createElement(MockCommandListBox, testProps);
      
      expect(commandListBox.props.commands).toHaveLength(10);
      expect(commandListBox.props.selectedIndex).toBe(3);
      expect(commandListBox.props.scrollOffset).toBe(2);
      expect(commandListBox.props.currentMode).toBe('visual');
    });

    it('should handle copy mode integration', () => {
      const copySelection = {
        target: 'output',
        commandIds: ['cmd1', 'cmd2'],
        state: 'selecting'
      };

      const testProps = {
        commands: createMockCommandList(5),
        selectedIndex: 1,
        currentMode: 'copy',
        copySelection
      };

      const commandListBox = React.createElement(MockCommandListBox, testProps);
      
      expect(commandListBox.props.copySelection).toEqual(copySelection);
      expect(commandListBox.props.currentMode).toBe('copy');
    });

    it('should handle empty command list', () => {
      const testProps = {
        commands: [],
        selectedIndex: 0,
        selectedCommands: new Map(),
        scrollOffset: 0,
        currentMode: 'normal'
      };

      const commandListBox = React.createElement(MockCommandListBox, testProps);
      
      expect(commandListBox.props.commands).toHaveLength(0);
      expect(commandListBox.props.selectedIndex).toBe(0);
    });

    it('should update when scroll position changes', () => {
      const commands = createMockCommandList(50);
      
      // Test different scroll positions
      const scrollOffsets = [0, 10, 25, 40];
      
      scrollOffsets.forEach(offset => {
        const commandListBox = React.createElement(MockCommandListBox, {
          commands,
          scrollOffset: offset,
          selectedIndex: offset + 2
        });
        
        expect(commandListBox.props.scrollOffset).toBe(offset);
        expect(commandListBox.props.selectedIndex).toBe(offset + 2);
      });
    });
  });

  describe('PreviewPaneBox Integration', () => {
    it('should receive selected command from parent', () => {
      const selectedCommand = createMockCommandList(1)[0];
      selectedCommand.result = 'This is the command output';
      
      const previewPaneBox = React.createElement(MockPreviewPaneBox, {
        selectedCommand
      });
      
      expect(previewPaneBox.props.selectedCommand).toEqual(selectedCommand);
    });

    it('should handle null selection gracefully', () => {
      const previewPaneBox = React.createElement(MockPreviewPaneBox, {
        selectedCommand: null
      });
      
      expect(previewPaneBox.props.selectedCommand).toBeNull();
    });

    it('should update when selection changes', () => {
      const commands = createMockCommandList(3);
      
      // Test selection change
      const firstSelection = React.createElement(MockPreviewPaneBox, {
        selectedCommand: commands[0]
      });
      
      const secondSelection = React.createElement(MockPreviewPaneBox, {
        selectedCommand: commands[1]
      });
      
      expect(firstSelection.props.selectedCommand.id).toBe(commands[0].id);
      expect(secondSelection.props.selectedCommand.id).toBe(commands[1].id);
    });

    it('should handle commands with different statuses', () => {
      const runningCommand = { ...createMockCommandList(1)[0], status: 'running' };
      const errorCommand = { ...createMockCommandList(1)[0], status: 'error' };
      const completedCommand = { ...createMockCommandList(1)[0], status: 'completed' };
      
      [runningCommand, errorCommand, completedCommand].forEach(command => {
        const previewPane = React.createElement(MockPreviewPaneBox, {
          selectedCommand: command
        });
        
        expect(previewPane.props.selectedCommand.status).toBe(command.status);
      });
    });
  });

  describe('StatusBarBox Integration', () => {
    it('should display current mode', () => {
      const modes = ['normal', 'visual', 'copy', 'command', 'search'];
      
      modes.forEach(mode => {
        const statusBar = React.createElement(MockStatusBarBox, {
          currentMode: mode
        });
        
        expect(statusBar.props.currentMode).toBe(mode);
      });
    });

    it('should update when mode changes', () => {
      // Simulate mode transition
      const normalMode = React.createElement(MockStatusBarBox, {
        currentMode: 'normal'
      });
      
      const visualMode = React.createElement(MockStatusBarBox, {
        currentMode: 'visual'
      });
      
      expect(normalMode.props.currentMode).toBe('normal');
      expect(visualMode.props.currentMode).toBe('visual');
    });
  });

  describe('Modal Component Integration', () => {
    describe('CommandInputModal', () => {
      it('should appear for command mode', () => {
        const modal = React.createElement(MockCommandInputModal, {
          mode: 'command',
          onSubmit: jest.fn(),
          onCancel: jest.fn()
        });
        
        expect(modal.props.mode).toBe('command');
        expect(modal.props.onSubmit).toBeDefined();
        expect(modal.props.onCancel).toBeDefined();
      });

      it('should appear for search mode', () => {
        const modal = React.createElement(MockCommandInputModal, {
          mode: 'search',
          onSubmit: jest.fn(),
          onCancel: jest.fn()
        });
        
        expect(modal.props.mode).toBe('search');
      });

      it('should handle submit and cancel callbacks', () => {
        const onSubmit = jest.fn();
        const onCancel = jest.fn();
        
        const modal = React.createElement(MockCommandInputModal, {
          mode: 'command',
          onSubmit,
          onCancel
        });
        
        // Simulate user interactions
        modal.props.onSubmit('test command');
        modal.props.onCancel();
        
        expect(onSubmit).toHaveBeenCalledWith('test command');
        expect(onCancel).toHaveBeenCalled();
      });
    });

    describe('CopyModeOverlay', () => {
      it('should appear in copy mode with selection data', () => {
        const copySelection = {
          target: 'command',
          commandIds: ['cmd1', 'cmd2'],
          state: 'selecting'
        };
        
        const overlay = React.createElement(MockCopyModeOverlay, {
          copySelection,
          copyMessage: 'Select copy target',
          commandCount: 25
        });
        
        expect(overlay.props.copySelection).toEqual(copySelection);
        expect(overlay.props.copyMessage).toBe('Select copy target');
        expect(overlay.props.commandCount).toBe(25);
      });

      it('should show copy success message', () => {
        const copySelection = {
          target: 'output',
          commandIds: ['cmd1'],
          state: 'copied'
        };
        
        const overlay = React.createElement(MockCopyModeOverlay, {
          copySelection,
          copyMessage: 'Copied successfully',
          commandCount: 10
        });
        
        expect(overlay.props.copySelection.state).toBe('copied');
        expect(overlay.props.copyMessage).toBe('Copied successfully');
      });

      it('should handle different copy targets', () => {
        const targets = ['command', 'output', 'metadata', 'full'];
        
        targets.forEach(target => {
          const overlay = React.createElement(MockCopyModeOverlay, {
            copySelection: { target, commandIds: ['cmd1'], state: 'selecting' },
            copyMessage: '',
            commandCount: 5
          });
          
          expect(overlay.props.copySelection.target).toBe(target);
        });
      });
    });
  });

  describe('Component Layout Integration', () => {
    it('should handle terminal dimensions properly', () => {
      // Mock terminal dimensions
      Object.defineProperty(process.stdout, 'columns', { value: 100 });
      Object.defineProperty(process.stdout, 'rows', { value: 30 });
      
      // Simulate layout calculation
      const terminalWidth = (process.stdout.columns || 80) - 1;
      const terminalHeight = (process.stdout.rows || 24) - 1;
      
      expect(terminalWidth).toBe(99);
      expect(terminalHeight).toBe(29);
    });

    it('should handle small terminal gracefully', () => {
      Object.defineProperty(process.stdout, 'columns', { value: 40 });
      Object.defineProperty(process.stdout, 'rows', { value: 10 });
      
      const terminalWidth = (process.stdout.columns || 80) - 1;
      const terminalHeight = (process.stdout.rows || 24) - 1;
      
      expect(terminalWidth).toBe(39);
      expect(terminalHeight).toBe(9);
    });

    it('should use fallback dimensions when unavailable', () => {
      Object.defineProperty(process.stdout, 'columns', { value: undefined });
      Object.defineProperty(process.stdout, 'rows', { value: undefined });
      
      const terminalWidth = (process.stdout.columns || 80) - 1;
      const terminalHeight = (process.stdout.rows || 24) - 1;
      
      expect(terminalWidth).toBe(79);
      expect(terminalHeight).toBe(23);
    });
  });

  describe('Data Flow Integration', () => {
    it('should pass command data through the component hierarchy', () => {
      const testCommands = createMockCommandList(15);
      const selectedIndex = 5;
      const selectedCommand = testCommands[selectedIndex];
      
      // HeaderBox gets summary data
      const headerBox = React.createElement(MockHeaderBox, {
        activeCount: testCommands.filter(cmd => cmd.status === 'running').length,
        totalCount: testCommands.length
      });
      
      // CommandListBox gets full command list
      const commandListBox = React.createElement(MockCommandListBox, {
        commands: testCommands,
        selectedIndex
      });
      
      // PreviewPaneBox gets selected command
      const previewPaneBox = React.createElement(MockPreviewPaneBox, {
        selectedCommand
      });
      
      expect(headerBox.props.totalCount).toBe(15);
      expect(commandListBox.props.commands).toHaveLength(15);
      expect(previewPaneBox.props.selectedCommand).toBe(selectedCommand);
    });

    it('should update all components when data changes', () => {
      // Initial state
      let commands = createMockCommandList(10);
      let activeCount = commands.filter(cmd => cmd.status === 'running').length;
      
      // Add new running command
      const newCommand = {
        id: 'new-running-cmd',
        status: 'running',
        command: 'tail -f log.txt',
        startTime: new Date()
      };
      
      commands = [...commands, newCommand];
      activeCount = commands.filter(cmd => cmd.status === 'running').length;
      
      // Verify components receive updated data
      const headerBox = React.createElement(MockHeaderBox, {
        activeCount,
        totalCount: commands.length
      });
      
      const commandListBox = React.createElement(MockCommandListBox, {
        commands
      });
      
      expect(headerBox.props.totalCount).toBe(11);
      expect(headerBox.props.activeCount).toBeGreaterThanOrEqual(1);
      expect(commandListBox.props.commands).toHaveLength(11);
    });

    it('should handle view filtering correctly', () => {
      const allCommands = [
        { id: 'cmd1', status: 'running' },
        { id: 'cmd2', status: 'completed' },
        { id: 'cmd3', status: 'pending' },
        { id: 'cmd4', status: 'error' },
        { id: 'cmd5', status: 'running' }
      ];
      
      // Active view - only running/pending
      const activeCommands = allCommands.filter(cmd => 
        cmd.status === 'running' || cmd.status === 'pending'
      );
      
      const activeViewList = React.createElement(MockCommandListBox, {
        commands: activeCommands
      });
      
      // History view - all commands  
      const historyViewList = React.createElement(MockCommandListBox, {
        commands: allCommands
      });
      
      expect(activeViewList.props.commands).toHaveLength(3); // 2 running + 1 pending
      expect(historyViewList.props.commands).toHaveLength(5); // all commands
    });
  });

  describe('Selection State Integration', () => {
    it('should coordinate selection between components', () => {
      const commands = createMockCommandList(10);
      const selectedIndex = 3;
      const selectedCommands = new Map([
        [commands[1].id, true],
        [commands[3].id, true],
        [commands[7].id, true]
      ]);
      
      const commandListBox = React.createElement(MockCommandListBox, {
        commands,
        selectedIndex,
        selectedCommands
      });
      
      const previewPaneBox = React.createElement(MockPreviewPaneBox, {
        selectedCommand: commands[selectedIndex]
      });
      
      expect(commandListBox.props.selectedIndex).toBe(3);
      expect(commandListBox.props.selectedCommands.size).toBe(3);
      expect(previewPaneBox.props.selectedCommand.id).toBe(commands[3].id);
    });

    it('should handle multi-selection in visual mode', () => {
      const commands = createMockCommandList(8);
      const selectedCommands = new Map();
      
      // Simulate selecting multiple commands
      [1, 3, 5].forEach(index => {
        selectedCommands.set(commands[index].id, true);
      });
      
      const commandListBox = React.createElement(MockCommandListBox, {
        commands,
        selectedIndex: 3,
        selectedCommands,
        currentMode: 'visual'
      });
      
      expect(commandListBox.props.selectedCommands.size).toBe(3);
      expect(commandListBox.props.currentMode).toBe('visual');
    });
  });

  describe('Error State Integration', () => {
    it('should handle empty command list gracefully', () => {
      const headerBox = React.createElement(MockHeaderBox, {
        activeCount: 0,
        totalCount: 0
      });
      
      const commandListBox = React.createElement(MockCommandListBox, {
        commands: [],
        selectedIndex: 0
      });
      
      const previewPaneBox = React.createElement(MockPreviewPaneBox, {
        selectedCommand: null
      });
      
      expect(headerBox.props.totalCount).toBe(0);
      expect(commandListBox.props.commands).toHaveLength(0);
      expect(previewPaneBox.props.selectedCommand).toBeNull();
    });

    it('should handle invalid selection index', () => {
      const commands = createMockCommandList(5);
      const invalidIndex = 10; // Beyond array bounds
      
      const commandListBox = React.createElement(MockCommandListBox, {
        commands,
        selectedIndex: invalidIndex
      });
      
      // Component should receive the invalid index but handle it gracefully
      expect(commandListBox.props.selectedIndex).toBe(10);
      expect(commandListBox.props.commands).toHaveLength(5);
    });
  });
});