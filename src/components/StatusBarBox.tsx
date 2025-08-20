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
        return 'j/k:Nav │ Backspace:Up │ Space:Toggle │ y:Copy │ c:Cancel │ v:Exit';
      case 'copy':
        return 'c:Command │ o:Output │ f:Full │ m:Meta │ ←→:Cycle │ Enter:Copy │ Backspace:Exit';
      case 'command':
        return 'Enter:Execute │ Ctrl+G:Cancel';
      case 'search':
        return 'Type to search │ Enter:Apply │ Ctrl+G:Cancel';
      default:
        return 'j/k:Nav │ /:Fzf │ Ctrl+A:Active │ Ctrl+H:History │ y:Copy │ c:Cancel │ r:Refresh │ v:Visual │ q:Quit';
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