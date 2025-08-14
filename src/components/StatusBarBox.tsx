import React from 'react';
import { Box, Text } from 'ink';
import { InteractionMode } from '../ink-tui-app.js';

interface StatusBarBoxProps {
  currentMode: InteractionMode;
}

export const StatusBarBox: React.FC<StatusBarBoxProps> = ({
  currentMode
}) => {
  const getKeyHelp = (): string => {
    switch (currentMode) {
      case 'visual':
        return 'j/k:Nav │ Space:Toggle │ c:Cancel │ Esc:Normal';
      case 'command':
        return 'Enter:Execute │ Esc:Cancel';
      case 'search':
        return 'Type to search │ Enter:Apply │ Esc:Clear';
      default:
        return 'j/k:Nav │ Ctrl+U/D:Half │ Ctrl+F/B:Full │ c:Cancel │ r:Refresh │ /:Search │ v:Visual │ q:Quit';
    }
  };

  return (
    <Box 
      height={3}
      paddingX={1}
      paddingY={1}
      borderStyle="round"
      borderColor="gray"
      overflow="hidden"
    >
      <Text color="white">
        {getKeyHelp()}
      </Text>
    </Box>
  );
};