import type { EnhancedCommandExecution } from '../enhanced-executor.js';
import type { CopyTarget } from '../ink-tui-app.js';

/**
 * Format command for command-only copy
 */
export function formatCommandOnly(command: EnhancedCommandExecution): string {
  return command.command;
}

/**
 * Format output for output-only copy  
 */
export function formatOutputOnly(command: EnhancedCommandExecution): string {
  if (!command.result || command.result.trim() === '') {
    return '[No output]';
  }
  return command.result;
}

/**
 * Format metadata for metadata-only copy
 */
export function formatMetadata(command: EnhancedCommandExecution): string {
  const lines = [];
  
  lines.push(`ID: ${command.id}`);
  lines.push(`Status: ${command.status.toUpperCase()}`);
  lines.push(`Pane: ${command.paneId}`);
  
  if (command.shellType) {
    lines.push(`Shell: ${command.shellType}`);
  }
  
  if (command.currentWorkingDirectory) {
    lines.push(`Directory: ${command.currentWorkingDirectory}`);
  }
  
  if (command.exitCode !== undefined) {
    lines.push(`Exit Code: ${command.exitCode}`);
  }
  
  lines.push(`Started: ${new Date(command.startTime).toLocaleString()}`);
  
  if (command.endTime) {
    lines.push(`Ended: ${new Date(command.endTime).toLocaleString()}`);
  }
  
  // Calculate duration
  const duration = command.endTime 
    ? new Date(command.endTime).getTime() - new Date(command.startTime).getTime()
    : Date.now() - new Date(command.startTime).getTime();
  
  lines.push(`Duration: ${formatDuration(duration)}`);
  
  if (command.retryCount > 0) {
    lines.push(`Retries: ${command.retryCount}`);
  }
  
  if (command.aborted) {
    lines.push(`Aborted: Yes`);
  }
  
  return lines.join('\n');
}

/**
 * Format full command information (command + output + metadata)
 */
export function formatFullCommand(command: EnhancedCommandExecution): string {
  const sections = [];
  
  // Command section
  sections.push('=== COMMAND ===');
  sections.push(command.command);
  sections.push('');
  
  // Metadata section
  sections.push('=== METADATA ===');
  sections.push(formatMetadata(command));
  sections.push('');
  
  // Output section
  sections.push('=== OUTPUT ===');
  sections.push(formatOutputOnly(command));
  
  return sections.join('\n');
}

/**
 * Format multiple commands for bulk copy operations
 */
export function formatMultipleCommands(
  commands: EnhancedCommandExecution[], 
  target: CopyTarget
): string {
  if (commands.length === 0) {
    return '[No commands selected]';
  }
  
  const sections = commands.map((command, index) => {
    let content: string;
    
    switch (target) {
      case 'command':
        content = formatCommandOnly(command);
        break;
      case 'output':
        content = formatOutputOnly(command);
        break;
      case 'metadata':
        content = formatMetadata(command);
        break;
      case 'full':
        content = formatFullCommand(command);
        break;
      default:
        content = command.command;
    }
    
    if (commands.length > 1) {
      return `# Command ${index + 1}\n${content}`;
    } else {
      return content;
    }
  });
  
  return sections.join('\n\n' + '='.repeat(50) + '\n\n');
}

/**
 * Format content based on target type and commands
 */
export function formatContent(
  commands: EnhancedCommandExecution[],
  target: CopyTarget
): string {
  if (commands.length === 0) {
    return '[No commands selected]';
  }
  
  if (commands.length === 1) {
    const command = commands[0];
    switch (target) {
      case 'command':
        return formatCommandOnly(command);
      case 'output':
        return formatOutputOnly(command);
      case 'metadata':
        return formatMetadata(command);
      case 'full':
        return formatFullCommand(command);
      default:
        return command.command;
    }
  }
  
  return formatMultipleCommands(commands, target);
}

/**
 * Helper function to format duration in human readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Get human-readable description of copy target
 */
export function getCopyTargetDescription(target: CopyTarget): string {
  switch (target) {
    case 'command':
      return 'Command text only';
    case 'output':
      return 'Output only';
    case 'metadata':
      return 'Metadata only';
    case 'full':
      return 'Full command info';
    default:
      return 'Unknown';
  }
}

/**
 * Get short label for copy target
 */
export function getCopyTargetLabel(target: CopyTarget): string {
  switch (target) {
    case 'command':
      return 'CMD';
    case 'output':
      return 'OUT';
    case 'metadata':
      return 'META';
    case 'full':
      return 'FULL';
    default:
      return '?';
  }
}

/**
 * Copy target cycle order
 */
export const COPY_TARGET_ORDER: CopyTarget[] = ['command', 'output', 'metadata', 'full'];

/**
 * Get next copy target in cycle
 */
export function getNextCopyTarget(current: CopyTarget): CopyTarget {
  const currentIndex = COPY_TARGET_ORDER.indexOf(current);
  const nextIndex = (currentIndex + 1) % COPY_TARGET_ORDER.length;
  return COPY_TARGET_ORDER[nextIndex];
}

/**
 * Get previous copy target in cycle
 */
export function getPreviousCopyTarget(current: CopyTarget): CopyTarget {
  const currentIndex = COPY_TARGET_ORDER.indexOf(current);
  const previousIndex = currentIndex === 0 ? COPY_TARGET_ORDER.length - 1 : currentIndex - 1;
  return COPY_TARGET_ORDER[previousIndex];
}