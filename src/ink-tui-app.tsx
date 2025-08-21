import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useApp } from 'ink';
import { HeaderBox } from './components/HeaderBox.js';
import { CommandListBox } from './components/CommandListBox.js';
import { PreviewPaneBox } from './components/PreviewPaneBox.js';
import { StatusBarBox } from './components/StatusBarBox.js';
import { CommandInputModal } from './components/CommandInputModal.js';
import { CopyModeOverlay } from './components/CopyModeOverlay.js';
import { usePolling } from './hooks/usePolling.js';
import { useScrolling } from './hooks/useScrolling.js';
import { useInputHandler } from './hooks/useInputHandler.js';
import * as enhancedExecutor from './enhanced-executor.js';
import { copyWithFallback } from './utils/clipboard.js';
import { formatContent, getNextCopyTarget, getPreviousCopyTarget, getCopyTargetDescription } from './utils/copyFormatter.js';
import { FzfIntegration } from './fzf-integration.js';

export type ViewMode = 'dashboard' | 'active' | 'history' | 'logs' | 'watch';
export type InteractionMode = 'normal' | 'visual' | 'command' | 'search' | 'copy';

export interface CommandSelection {
  id: string;
  selected: boolean;
  index: number;
}

export type CopyTarget = 'command' | 'output' | 'full' | 'metadata';
export type CopyModeState = 'idle' | 'selecting' | 'selected' | 'copying' | 'copied';

export interface CopySelection {
  target: CopyTarget;
  commandIds: string[];
  state: CopyModeState;
}

export interface InkTUIOptions {
  title?: string;
  refreshInterval?: number;
  enableMouse?: boolean;
  vimMode?: boolean;
}

interface InkTUIAppProps {
  options?: InkTUIOptions;
}

export const InkTUIApp: React.FC<InkTUIAppProps> = ({ 
  options = {} 
}) => {
  const { exit } = useApp();
  
  // State management
  const [currentView, setCurrentView] = useState<ViewMode>('history');
  const [currentMode, setCurrentMode] = useState<InteractionMode>('normal');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCommands, setSelectedCommands] = useState(new Map<string, boolean>());
  const [filterText, setFilterText] = useState('');
  const [commands, setCommands] = useState<enhancedExecutor.EnhancedCommandExecution[]>([]);
  const [showCommandInput, setShowCommandInput] = useState(false);
  
  // Copy mode state
  const [copySelection, setCopySelection] = useState<CopySelection>({
    target: 'command',
    commandIds: [],
    state: 'idle'
  });
  const [copyMessage, setCopyMessage] = useState<string>('');
  
  // Real-time data polling
  usePolling(async () => {
    try {
      const allCommands = await enhancedExecutor.listAllCommands();
      setCommands(allCommands);
    } catch (error) {
      console.error('Error updating data:', error);
    }
  }, options.refreshInterval || 1000);
  
  // Apply filters to commands
  const filteredCommands = useMemo(() => {
    let filtered = commands;


    // Apply text filter if present
    if (filterText) {
      const searchText = filterText.toLowerCase();
      filtered = filtered.filter(cmd => 
        cmd.command.toLowerCase().includes(searchText) ||
        cmd.id.toLowerCase().includes(searchText) ||
        cmd.status.toLowerCase().includes(searchText)
      );
    }

    // Apply view-specific filters
    switch (currentView) {
      case 'active':
        filtered = filtered.filter(cmd => 
          cmd.status === 'running' || cmd.status === 'pending'
        );
        break;
      case 'history':
        // Show all commands (no additional filtering)
        break;
    }

    return filtered;
  }, [commands, filterText, currentView]);
  
  // Adjust selected index if needed when filtered commands change
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);
  
  // Calculate terminal dimensions first
  const terminalHeight = (process.stdout.rows || 24) - 1; // Reserve 1 line for safety
  const terminalWidth = (process.stdout.columns || 80) - 1; // Reserve 1 column for safety
  
  // Scrolling functionality with vim keybindings
  const {
    scrollOffset,
    handleScrollUp,
    handleScrollDown,
    handlePageUp,
    handlePageDown,
    handleHalfPageUp,
    handleHalfPageDown,
    handleGoToTop,
    handleGoToBottom,
    handleLineUp,
    handleLineDown
  } = useScrolling({
    totalItems: filteredCommands.length,
    visibleItems: Math.max(3, Math.min(terminalHeight - 10, 50)), // Match CommandListBox calculation with extra buffer
    selectedIndex,
    onSelectedIndexChange: setSelectedIndex
  });
  
  // Input handling with vim keybindings
  const inputHandlers = {
    // Navigation
    navigateUp: () => {
      if (selectedIndex > 0) {
        const newIndex = selectedIndex - 1;
        setSelectedIndex(newIndex);
        handleScrollUp();
      }
    },
    navigateDown: () => {
      if (selectedIndex < filteredCommands.length - 1) {
        const newIndex = selectedIndex + 1;
        setSelectedIndex(newIndex);
        handleScrollDown();
      }
    },
    goToTop: () => {
      setSelectedIndex(0);
      handleGoToTop();
    },
    goToBottom: () => {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
      handleGoToBottom();
    },
    
    // Vim scrolling commands
    halfPageUp: handleHalfPageUp,
    halfPageDown: handleHalfPageDown,
    pageUp: handlePageUp,
    pageDown: handlePageDown,
    lineUp: handleLineUp,
    lineDown: handleLineDown,
    
    // Mode management
    enterVisualMode: () => setCurrentMode('visual'),
    enterCommandMode: () => {
      setCurrentMode('command');
      setShowCommandInput(true);
    },
    enterSearchMode: () => {
      // Replaced with fzf integration - use launchFzfSearch instead
      // setCurrentMode('search');
      // setShowCommandInput(true);
    },
    exitCurrentMode: () => {
      setCurrentMode('normal');
      setShowCommandInput(false);
      setFilterText('');
      setSelectedCommands(new Map());
      setCopySelection({ target: 'command', commandIds: [], state: 'idle' });
      setCopyMessage('');
    },
    
    // View management
    cycleView: () => {
      const views: ViewMode[] = ['dashboard', 'active', 'history'];
      const currentIndex = views.indexOf(currentView);
      const nextIndex = (currentIndex + 1) % views.length;
      setCurrentView(views[nextIndex]);
      setSelectedIndex(0); // Reset selection when changing views
    },
    
    // Selection and actions
    toggleSelection: () => {
      if (filteredCommands.length > 0) {
        const command = filteredCommands[selectedIndex];
        const isSelected = selectedCommands.has(command.id);
        const newSelections = new Map(selectedCommands);
        
        if (isSelected) {
          newSelections.delete(command.id);
        } else {
          newSelections.set(command.id, true);
        }
        
        setSelectedCommands(newSelections);
      }
    },
    
    cancelCurrentCommand: async () => {
      if (filteredCommands.length > 0) {
        const command = filteredCommands[selectedIndex];
        
        if (command.status === 'running' || command.status === 'pending') {
          const success = await enhancedExecutor.cancelCommand(command.id);
          // TODO: Show temporary message about success/failure
        }
      }
    },
    
    refreshData: async () => {
      try {
        const allCommands = await enhancedExecutor.listAllCommands();
        setCommands(allCommands);
        // TODO: Show temporary refresh message
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    },
    
    // Copy mode management
    enterCopyMode: () => {
      const currentCommand = filteredCommands[selectedIndex];
      if (currentCommand) {
        setCurrentMode('copy');
        setCopySelection({
          target: 'command',
          commandIds: selectedCommands.size > 0 
            ? Array.from(selectedCommands.keys())
            : [currentCommand.id],
          state: 'selecting'
        });
        setCopyMessage('');
      }
    },
    
    setCopyTarget: (target: CopyTarget) => {
      setCopySelection(prev => ({ ...prev, target }));
    },
    
    cycleCopyTarget: (direction: 'next' | 'previous') => {
      setCopySelection(prev => ({
        ...prev,
        target: direction === 'next' 
          ? getNextCopyTarget(prev.target)
          : getPreviousCopyTarget(prev.target)
      }));
    },
    
    executeCopy: async () => {
      const commandsToCopy = filteredCommands.filter(cmd => 
        copySelection.commandIds.includes(cmd.id)
      );
      
      if (commandsToCopy.length > 0) {
        setCopySelection(prev => ({ ...prev, state: 'copying' }));
        
        const content = formatContent(commandsToCopy, copySelection.target);
        const result = await copyWithFallback(content, getCopyTargetDescription(copySelection.target));
        
        setCopySelection(prev => ({ ...prev, state: 'copied' }));
        setCopyMessage(result.message || 'Copied successfully');
        
        // Auto-exit copy mode after 1.5 seconds
        setTimeout(() => {
          setCurrentMode('normal');
          setCopySelection({ target: 'command', commandIds: [], state: 'idle' });
          setCopyMessage('');
        }, 1500);
      }
    },
    
    quit: () => {
      // Clean exit using Ink's built-in exit function
      exit();
    },
    
    // FZF integration handlers
    launchFzfActive: async () => {
      try {
        const fzf = new FzfIntegration();
        
        // Check if fzf is available
        if (!await fzf.checkFzfAvailable()) {
          console.error('❌ fzf is not available. Install it with: brew install fzf');
          return;
        }
        
        // Temporarily exit the TUI to give fzf full terminal control
        exit();
        
        // Run fzf interface
        const result = await fzf.showActiveCommands();
        
        if (!result.cancelled && result.selected.length > 0) {
          console.log(`\n✅ Selected ${result.selected.length} active command(s):`);
          for (const selection of result.selected) {
            const commandId = fzf.parseSelection(selection);
            console.log(`  • ${selection}`);
            console.log(`    Command ID: ${commandId}`);
          }
        }
      } catch (error) {
        console.error('Error in fzf active commands:', error);
      }
    },
    
    launchFzfHistory: async () => {
      try {
        const fzf = new FzfIntegration();
        
        // Check if fzf is available
        if (!await fzf.checkFzfAvailable()) {
          console.error('❌ fzf is not available. Install it with: brew install fzf');
          return;
        }
        
        // Temporarily exit the TUI to give fzf full terminal control
        exit();
        
        // Run fzf interface
        const result = await fzf.showCommandHistory();
        
        if (!result.cancelled && result.selected.length > 0) {
          console.log(`\n✅ Selected command:`);
          const selection = result.selected[0];
          const commandId = fzf.parseSelection(selection);
          console.log(`  • ${selection}`);
          console.log(`    Command ID: ${commandId}`);
          
          // Get full command details for copying
          const allCommands = await enhancedExecutor.listAllCommands();
          const selectedCommand = allCommands.find(cmd => cmd.id.startsWith(commandId));
          
          if (selectedCommand) {
            // Auto-copy command text to clipboard
            try {
              const copyResult = await copyWithFallback(selectedCommand.command, 'command text');
              console.log(`📋 ${copyResult.message}`);
              
              // Show options for additional copying
              console.log(`\n📋 Copy Options:`);
              console.log(`  1. Command: ${selectedCommand.command} ✅ (already copied)`);
              console.log(`  2. Press 'o' to copy full output`);
              console.log(`  3. Press 'f' to copy command + output`);
              console.log(`  4. Press any other key to continue...`);
              
              // Wait for user input for additional copy options
              process.stdin.setRawMode(true);
              process.stdin.resume();
              process.stdin.once('data', async (key) => {
                const keyStr = key.toString();
                
                try {
                  if (keyStr === 'o' && selectedCommand.result) {
                    const outputResult = await copyWithFallback(selectedCommand.result, 'command output');
                    console.log(`📋 ${outputResult.message}`);
                  } else if (keyStr === 'f') {
                    const fullContent = `${selectedCommand.command}\n\n${selectedCommand.result || '(no output)'}`;
                    const fullResult = await copyWithFallback(fullContent, 'full command + output');
                    console.log(`📋 ${fullResult.message}`);
                  }
                } catch (error) {
                  console.log(`📋 Copy error: ${error}`);
                }
                
                process.stdin.setRawMode(false);
                process.stdin.pause();
                console.log(`\nPress any key to exit...`);
              });
            } catch (error) {
              console.log(`📋 Could not copy to clipboard: ${error}`);
            }
          }
        }
      } catch (error) {
        console.error('Error in fzf history:', error);
      }
    },
    
    launchFzfSearch: async () => {
      try {
        const fzf = new FzfIntegration();
        
        // Check if fzf is available
        if (!await fzf.checkFzfAvailable()) {
          console.error('❌ fzf is not available. Install it with: brew install fzf');
          return;
        }
        
        // Temporarily exit the TUI to give fzf full terminal control
        exit();
        
        // Run fzf smart search interface
        const result = await fzf.smartSearch();
        
        if (!result.cancelled && result.selected.length > 0) {
          console.log(`\n🔍 Search results:`);
          const selection = result.selected[0];
          const commandId = fzf.parseSelection(selection);
          console.log(`  • ${selection}`);
          console.log(`    Command ID: ${commandId}`);
          
          // Get full command details for copying
          const allCommands = await enhancedExecutor.listAllCommands();
          const selectedCommand = allCommands.find(cmd => cmd.id.startsWith(commandId));
          
          if (selectedCommand) {
            // Auto-copy command text to clipboard
            try {
              const copyResult = await copyWithFallback(selectedCommand.command, 'command text');
              console.log(`📋 ${copyResult.message}`);
              
              // Show options for additional copying
              console.log(`\n📋 Copy Options:`);
              console.log(`  1. Command: ${selectedCommand.command} ✅ (already copied)`);
              console.log(`  2. Press 'o' to copy full output`);
              console.log(`  3. Press 'f' to copy command + output`);
              console.log(`  4. Press any other key to continue...`);
              
              // Wait for user input for additional copy options
              process.stdin.setRawMode(true);
              process.stdin.resume();
              process.stdin.once('data', async (key) => {
                const keyStr = key.toString();
                
                try {
                  if (keyStr === 'o' && selectedCommand.result) {
                    const outputResult = await copyWithFallback(selectedCommand.result, 'command output');
                    console.log(`📋 ${outputResult.message}`);
                  } else if (keyStr === 'f') {
                    const fullContent = `${selectedCommand.command}\n\n${selectedCommand.result || '(no output)'}`;
                    const fullResult = await copyWithFallback(fullContent, 'full command + output');
                    console.log(`📋 ${fullResult.message}`);
                  }
                } catch (error) {
                  console.log(`📋 Copy error: ${error}`);
                }
                
                process.stdin.setRawMode(false);
                process.stdin.pause();
                console.log(`\nPress any key to exit...`);
              });
            } catch (error) {
              console.log(`📋 Could not copy to clipboard: ${error}`);
            }
          }
        }
      } catch (error) {
        console.error('Error in fzf search:', error);
      }
    }
  };
  
  // Initialize input handling
  useInputHandler({
    currentMode,
    handlers: inputHandlers
  });
  
  // Get selected command for preview
  const selectedCommand = filteredCommands[selectedIndex] || null;
  
  // Get active command count for header
  const activeCount = commands.filter(cmd => 
    cmd.status === 'running' || cmd.status === 'pending'
  ).length;
  
  return (
    <Box 
      flexDirection="column" 
      width={terminalWidth}
      height={terminalHeight}
      overflow="hidden"
    >
      <HeaderBox 
        currentView={currentView}
        currentMode={currentMode}
        activeCount={activeCount}
        totalCount={commands.length}
        filterText={filterText}
      />
      
      <Box flexGrow={1} flexDirection="row">
        <CommandListBox 
          commands={filteredCommands}
          selectedIndex={selectedIndex}
          selectedCommands={selectedCommands}
          scrollOffset={scrollOffset}
          currentMode={currentMode}
          copySelection={currentMode === 'copy' ? copySelection : undefined}
        />
        
        <PreviewPaneBox 
          selectedCommand={selectedCommand}
        />
      </Box>
      
      <StatusBarBox 
        currentMode={currentMode}
      />
      
      {showCommandInput && (
        <CommandInputModal
          mode={currentMode}
          onSubmit={(value) => {
            if (currentMode === 'search') {
              setFilterText(value);
            }
            // TODO: Handle command mode
            inputHandlers.exitCurrentMode();
          }}
          onCancel={inputHandlers.exitCurrentMode}
        />
      )}
      
      {currentMode === 'copy' && (
        <CopyModeOverlay
          copySelection={copySelection}
          copyMessage={copyMessage}
          commandCount={filteredCommands.length}
        />
      )}
    </Box>
  );
};