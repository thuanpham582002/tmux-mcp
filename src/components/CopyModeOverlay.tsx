import React from 'react';
import { Box, Text } from 'ink';
import { CopySelection, CopyTarget } from '../ink-tui-app.js';
import { getCopyTargetDescription, getCopyTargetLabel } from '../utils/copyFormatter.js';

interface CopyModeOverlayProps {
  copySelection: CopySelection;
  copyMessage: string;
  commandCount: number;
}

export const CopyModeOverlay: React.FC<CopyModeOverlayProps> = ({
  copySelection,
  copyMessage,
  commandCount
}) => {
  const getTargetColor = (target: CopyTarget): string => {
    switch (target) {
      case 'command':
        return 'blue';
      case 'output':
        return 'green';
      case 'full':
        return 'yellow';
      case 'metadata':
        return 'cyan';
      default:
        return 'white';
    }
  };

  const getStateIcon = (): string => {
    switch (copySelection.state) {
      case 'selecting':
        return '🎯';
      case 'selected':
        return '✅';
      case 'copying':
        return '📋';
      case 'copied':
        return '✨';
      default:
        return '📋';
    }
  };

  const getStateText = (): string => {
    switch (copySelection.state) {
      case 'selecting':
        return 'SELECTING';
      case 'selected':
        return 'READY TO COPY';
      case 'copying':
        return 'COPYING...';
      case 'copied':
        return 'COPIED!';
      default:
        return 'COPY MODE';
    }
  };

  const selectedCount = copySelection.commandIds.length;
  const targetColor = getTargetColor(copySelection.target);
  const stateIcon = getStateIcon();
  const stateText = getStateText();
  
  return (
    <Box
      width={30}
      flexDirection="column"
      borderStyle="round"
      borderColor={targetColor}
      paddingX={1}
      paddingY={0}
    >
      {/* Header */}
      <Text color={targetColor} bold>
        {stateIcon} {stateText}
      </Text>
      
      {/* Target info */}
      <Text color={targetColor}>
        Target: {getCopyTargetLabel(copySelection.target)} ({getCopyTargetDescription(copySelection.target)})
      </Text>
      
      {/* Selection info */}
      <Text color="gray">
        Items: {selectedCount} of {commandCount}
      </Text>
      
      {/* Copy message */}
      {copyMessage && (
        <Text color={copySelection.state === 'copied' ? 'black' : 'white'}>
          {copyMessage}
        </Text>
      )}
      
      {/* Quick help */}
      {copySelection.state === 'selecting' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray" dimColor>
            Quick keys:
          </Text>
          <Text color={targetColor === 'blue' ? 'white' : 'blue'}>
            c: Command
          </Text>
          <Text color={targetColor === 'green' ? 'white' : 'green'}>
            o: Output
          </Text>
          <Text color={targetColor === 'cyan' ? 'white' : 'cyan'}>
            m: Metadata
          </Text>
          <Text color={targetColor === 'yellow' ? 'white' : 'yellow'}>
            f: Full
          </Text>
        </Box>
      )}
    </Box>
  );
};