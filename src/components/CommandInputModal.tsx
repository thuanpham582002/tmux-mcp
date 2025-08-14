import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { InteractionMode } from '../ink-tui-app.js';

interface CommandInputModalProps {
  mode: InteractionMode;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const CommandInputModal: React.FC<CommandInputModalProps> = ({
  mode,
  onSubmit,
  onCancel
}) => {
  const [inputValue, setInputValue] = useState('');

  useInput((input, key) => {
    if (key.return) {
      onSubmit(inputValue);
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.backspace || key.delete) {
      setInputValue(prev => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setInputValue(prev => prev + input);
    }
  });

  const getLabel = (): string => {
    switch (mode) {
      case 'search':
        return 'Search Commands';
      case 'command':
        return 'Command Mode';
      default:
        return 'Input';
    }
  };

  return (
    <Box
      height={3}
      borderStyle="single"
      borderColor="blue"
      paddingX={1}
    >
      <Text color="white">
        {getLabel()}: {inputValue}
        <Text backgroundColor="white" color="black"> </Text>
      </Text>
    </Box>
  );
};