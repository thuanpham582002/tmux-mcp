import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { InteractionMode } from '../ink-tui-app.js';
import * as enhancedExecutor from '../enhanced-executor.js';

interface CommandListBoxProps {
  commands: enhancedExecutor.EnhancedCommandExecution[];
  selectedIndex: number;
  selectedCommands: Map<string, boolean>;
  scrollOffset: number;
  currentMode: InteractionMode;
}

export const CommandListBox: React.FC<CommandListBoxProps> = ({
  commands,
  selectedIndex,
  selectedCommands,
  scrollOffset,
  currentMode
}) => {
  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'error': return '❌';
      case 'cancelled': return '🚫';
      case 'timeout': return '⏰';
      case 'pending': return '⏳';
      default: return '?';
    }
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
      return text.padEnd(maxLength);
    }
    return text.substring(0, maxLength - 3) + '...';
  };

  const formatDuration = (cmd: enhancedExecutor.EnhancedCommandExecution): string => {
    const duration = cmd.endTime 
      ? new Date(cmd.endTime).getTime() - new Date(cmd.startTime).getTime()
      : Date.now() - new Date(cmd.startTime).getTime();
    
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${Math.round(duration / 1000)}s`;
    if (duration < 3600000) return `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;
    
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    const seconds = Math.round((duration % 60000) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const formatStartTime = (startTime: Date): string => {
    const now = new Date();
    const start = new Date(startTime);
    const diff = now.getTime() - start.getTime();
    
    if (diff < 86400000) { // Less than 24 hours
      return start.toLocaleTimeString();
    } else {
      return start.toLocaleDateString();
    }
  };

  // Calculate visible commands based on terminal height but with safety limits
  const terminalHeight = process.stdout.rows || 24;
  // Account for header (3) + status bar (3) + borders and padding (~4) = 10 total reserved
  const availableHeight = Math.max(5, terminalHeight - 10);
  const maxVisibleCommands = Math.min(availableHeight, 50); // Cap at 50 to prevent performance issues
  
  const visibleCommands = commands.slice(scrollOffset, scrollOffset + maxVisibleCommands);

  const commandRows = useMemo(() => {
    if (visibleCommands.length === 0) {
      return [
        <Text key="empty" color="gray">
          No commands found
        </Text>
      ];
    }

    const rows = [];
    
    // Table header
    rows.push(
      <Text key="header" bold>
        Status │ Command                    │ Pane │ Duration │ Started    │ Shell
      </Text>
    );
    rows.push(
      <Text key="divider">
        {'─'.repeat(75)}
      </Text>
    );

    // Command rows
    visibleCommands.forEach((cmd, index) => {
      const globalIndex = scrollOffset + index;
      const isSelected = globalIndex === selectedIndex;
      const isVisuallySelected = selectedCommands.has(cmd.id);
      
      const statusIcon = getStatusIcon(cmd.status);
      const command = truncateText(cmd.command, 25);
      const pane = cmd.paneId || '?';
      const duration = formatDuration(cmd);
      const started = formatStartTime(cmd.startTime);
      const shell = cmd.shellType || '?';
      
      let line = `${statusIcon} │ ${command} │ ${pane.padEnd(4)} │ ${duration.padEnd(8)} │ ${started.padEnd(10)} │ ${shell}`;
      
      let color: string | undefined;
      let inverse = false;
      
      if (isSelected) {
        inverse = true;
      } else if (isVisuallySelected && currentMode === 'visual') {
        color = 'yellow';
      }
      
      rows.push(
        <Text 
          key={cmd.id}
          color={color}
          inverse={inverse}
        >
          {line}
        </Text>
      );
    });

    // Fill remaining space with empty lines to occupy full terminal height
    const terminalHeight = process.stdout.rows || 24;
    const usedRows = rows.length;
    const availableRows = Math.max(0, terminalHeight - 6); // Account for header, status bar
    
    for (let i = usedRows; i < availableRows; i++) {
      rows.push(
        <Text key={`empty-${i}`}>
          {' '.repeat(75)}
        </Text>
      );
    }

    return rows;
  }, [visibleCommands, selectedIndex, selectedCommands, currentMode, scrollOffset]);

  return (
    <Box 
      width="60%"
      flexDirection="column"
      borderStyle="single"
      borderColor="white"
      paddingX={1}
      flexGrow={1}
    >
      {commandRows}
    </Box>
  );
};