import React from 'react';
import { Box, Text } from 'ink';
import { ViewMode, InteractionMode } from '../ink-tui-app.js';

interface HeaderBoxProps {
  currentView: ViewMode;
  currentMode: InteractionMode;
  activeCount: number;
  totalCount: number;
  filterText: string;
}

export const HeaderBox: React.FC<HeaderBoxProps> = ({
  currentView,
  currentMode,
  activeCount,
  totalCount,
  filterText
}) => {
  const getViewTitle = (): string => {
    switch (currentView) {
      case 'active': return 'Active Commands';
      case 'history': return 'Command History';
      case 'dashboard': return 'Dashboard';
      case 'logs': return 'Logs';
      case 'watch': return 'Watch Mode';
      default: return 'Dashboard';
    }
  };

  const getModeInfo = (): string => {
    switch (currentMode) {
      case 'normal': return 'Mode: NORMAL';
      case 'visual': return 'Mode: VISUAL';
      case 'command': return 'Mode: COMMAND';
      case 'search': return 'Mode: SEARCH';
      default: return 'Mode: NORMAL';
    }
  };

  const filterInfo = filterText ? ` 🔍 Filter: ${filterText}` : '';
  
  const header = 
    `TMUX MCP Command Manager │ 🔄 ${activeCount} active │ ` +
    `📚 ${totalCount} total │${filterInfo} │ ${getModeInfo()}`;

  return (
    <Box 
      height={3}
      paddingX={1}
      paddingY={1}
      borderStyle="single" 
      borderColor="blue"
    >
      <Text color="white" bold>
        {header}
      </Text>
    </Box>
  );
};