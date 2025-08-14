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
        return 'j/k:Nav │ Space:Toggle │ c:Cancel Selected │ d:Delete │ Esc:Normal │ Enter:Action';
      case 'command':
        return 'Enter:Execute │ Esc:Cancel │ :kill :cleanup :filter :help';
      case 'search':
        return 'Type to search │ Enter:Apply │ Esc:Clear │ Ctrl-R:Regex';
      default:
        return 'j/k:Nav │ Ctrl+U/D:Half-page │ Ctrl+F/B:Full-page │ c:Cancel │ r:Refresh │ /:Search │ v:Visual │ q:Quit';
    }
  };

  return (
    <Box 
      height={3}
      paddingX={1}
      paddingY={1}
      borderStyle="single"
      borderColor="gray"
    >
      <Text color="white">
        {getKeyHelp()}
      </Text>
    </Box>
  );
};