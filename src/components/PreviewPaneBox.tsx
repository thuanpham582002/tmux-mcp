import React from 'react';
import { Box, Text } from 'ink';
import * as enhancedExecutor from '../enhanced-executor.js';

interface PreviewPaneBoxProps {
  selectedCommand: enhancedExecutor.EnhancedCommandExecution | null;
}

export const PreviewPaneBox: React.FC<PreviewPaneBoxProps> = ({
  selectedCommand
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

  const formatDurationMs = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  if (!selectedCommand) {
    return (
      <Box 
        width="40%"
        flexDirection="column"
        borderStyle="single"
        borderColor="white"
        paddingX={1}
        paddingY={1}
      >
        <Text color="gray">No command selected</Text>
      </Box>
    );
  }

  const duration = selectedCommand.endTime 
    ? new Date(selectedCommand.endTime).getTime() - new Date(selectedCommand.startTime).getTime()
    : Date.now() - new Date(selectedCommand.startTime).getTime();

  const lines = [
    <Text key="title" bold>Preview: {selectedCommand.command}</Text>,
    <Text key="id" color="gray">ID: {selectedCommand.id}</Text>,
    <Text key="divider">{'─'.repeat(40)}</Text>,
    <Text key="blank1"> </Text>,
    <Text key="command">Command: {selectedCommand.command}</Text>,
    <Text key="status">
      Status:  {getStatusIcon(selectedCommand.status)} {selectedCommand.status.toUpperCase()}
    </Text>,
    <Text key="pane">Pane:    {selectedCommand.paneId}</Text>
  ];

  if (selectedCommand.shellType) {
    lines.push(<Text key="shell">Shell:   {selectedCommand.shellType}</Text>);
  }

  if (selectedCommand.currentWorkingDirectory) {
    lines.push(<Text key="dir">Dir:     {selectedCommand.currentWorkingDirectory}</Text>);
  }

  if (selectedCommand.exitCode !== undefined) {
    lines.push(<Text key="exit">Exit:    {selectedCommand.exitCode}</Text>);
  }

  lines.push(
    <Text key="started">Started: {new Date(selectedCommand.startTime).toLocaleString()}</Text>
  );

  if (selectedCommand.endTime) {
    lines.push(
      <Text key="ended">Ended:   {new Date(selectedCommand.endTime).toLocaleString()}</Text>
    );
  }

  lines.push(
    <Text key="duration">Duration: {formatDurationMs(duration)}</Text>
  );

  if (selectedCommand.result) {
    lines.push(
      <Text key="blank2"> </Text>,
      <Text key="output-title" bold>Output:</Text>,
      <Text key="output-divider">{'─'.repeat(40)}</Text>
    );
    
    // Truncate long output for preview
    const output = selectedCommand.result.length > 800 
      ? selectedCommand.result.substring(0, 800) + '\n... (truncated)'
      : selectedCommand.result;
    
    // Split output into lines for proper display
    const outputLines = output.split('\n');
    outputLines.forEach((line, index) => {
      lines.push(<Text key={`output-${index}`}>{line}</Text>);
    });
  }

  return (
    <Box 
      width="40%"
      flexDirection="column"
      borderStyle="single"
      borderColor="white"
      paddingX={1}
      paddingY={1}
    >
      {lines}
    </Box>
  );
};