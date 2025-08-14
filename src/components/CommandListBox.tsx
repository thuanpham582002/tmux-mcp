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
  // Header = 3 lines (border + padding + content)
  // Status bar = 3 lines (border + padding + content)  
  // Table header = 2 lines (header + divider)
  // Total reserved = 8 lines, but add 2 extra lines buffer to prevent any overlap
  const reservedLines = 10;
  const availableHeight = Math.max(3, terminalHeight - reservedLines);
  const maxVisibleCommands = Math.min(availableHeight, 50); // Cap at 50 to prevent performance issues
  
  const visibleCommands = commands.slice(scrollOffset, scrollOffset + maxVisibleCommands);

  const commandRows = useMemo(() => {
    // Calculate available width for command list (half of terminal width minus borders and padding)
    const terminalWidth = (process.stdout.columns || 80) - 4; // Account for borders and padding
    const listWidth = Math.floor(terminalWidth * 0.6); // 60% of terminal width for list
    const maxLineWidth = Math.max(50, Math.min(listWidth, 100)); // Between 50-100 chars
    
    if (visibleCommands.length === 0) {
      return [
        <Text key="empty" color="gray">
          No commands found
        </Text>
      ];
    }

    const rows = [];
    
    // Responsive table header without horizontal divider line
    const commandWidth = Math.max(15, Math.floor(maxLineWidth * 0.35));
    rows.push(
      <Text key="header" bold color="cyan">
        Status │ Command{' '.repeat(Math.max(0, commandWidth - 7))} │ Pane │ Duration │ Started   
      </Text>
    );

    // Command rows
    visibleCommands.forEach((cmd, index) => {
      const globalIndex = scrollOffset + index;
      const isSelected = globalIndex === selectedIndex;
      const isVisuallySelected = selectedCommands.has(cmd.id);
      
      const statusIcon = getStatusIcon(cmd.status);
      const command = truncateText(cmd.command, commandWidth);
      const pane = (cmd.paneId || '?').substring(0, 4).padEnd(4);
      const duration = formatDuration(cmd).substring(0, 8).padEnd(8);
      const started = formatStartTime(cmd.startTime).substring(0, 9).padEnd(9);
      
      // Create responsive line that fits within terminal width
      let line = `${statusIcon} │ ${command} │ ${pane} │ ${duration} │ ${started}`;
      
      // Ensure line doesn't exceed max width
      if (line.length > maxLineWidth) {
        line = line.substring(0, maxLineWidth - 3) + '...';
      }
      
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

    // Fill remaining space with empty lines but don't exceed terminal bounds
    const terminalHeight = (process.stdout.rows || 24) - 1;
    const usedRows = rows.length;
    const availableRows = Math.max(0, terminalHeight - 8); // Account for header, status bar with extra buffer
    
    for (let i = usedRows; i < availableRows; i++) {
      rows.push(
        <Text key={`empty-${i}`}>
          {' '.repeat(Math.min(maxLineWidth, 10))}
        </Text>
      );
    }

    return rows;
  }, [visibleCommands, selectedIndex, selectedCommands, currentMode, scrollOffset]);

  return (
    <Box 
      width="60%"
      flexDirection="column"
      borderStyle="round"
      borderColor="white"
      paddingX={1}
      flexGrow={1}
    >
      {commandRows}
    </Box>
  );
};