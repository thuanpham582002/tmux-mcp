import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useApp } from 'ink';
import { HeaderBox } from './components/HeaderBox.js';
import { CommandListBox } from './components/CommandListBox.js';
import { PreviewPaneBox } from './components/PreviewPaneBox.js';
import { StatusBarBox } from './components/StatusBarBox.js';
import { CommandInputModal } from './components/CommandInputModal.js';
import { usePolling } from './hooks/usePolling.js';
import { useScrolling } from './hooks/useScrolling.js';
import { useInputHandler } from './hooks/useInputHandler.js';
import * as enhancedExecutor from './enhanced-executor.js';

export type ViewMode = 'dashboard' | 'active' | 'history' | 'logs' | 'watch';
export type InteractionMode = 'normal' | 'visual' | 'command' | 'search';

export interface CommandSelection {
  id: string;
  selected: boolean;
  index: number;
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
    visibleItems: Math.max(5, Math.min((process.stdout.rows || 24) - 10, 50)), // Dynamic based on terminal size
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
      setCurrentMode('search');
      setShowCommandInput(true);
    },
    exitCurrentMode: () => {
      setCurrentMode('normal');
      setShowCommandInput(false);
      setFilterText('');
      setSelectedCommands(new Map());
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
    
    quit: () => {
      exit();
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
  
  const terminalHeight = process.stdout.rows || 24;
  
  return (
    <Box flexDirection="column" minHeight={terminalHeight}>
      <HeaderBox 
        currentView={currentView}
        currentMode={currentMode}
        activeCount={activeCount}
        totalCount={commands.length}
        filterText={filterText}
      />
      
      <Box flexGrow={1} flexDirection="row" minHeight={terminalHeight - 6}>
        <CommandListBox 
          commands={filteredCommands}
          selectedIndex={selectedIndex}
          selectedCommands={selectedCommands}
          scrollOffset={scrollOffset}
          currentMode={currentMode}
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
    </Box>
  );
};