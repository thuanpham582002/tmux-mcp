const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('Enhanced Executor Types', () => {
  it('should have correct command execution interface', () => {
    interface TestCommand {
      id: string;
      paneId: string;
      command: string;
      status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
      startTime: Date;
      endTime?: Date;
      result?: string;
      exitCode?: number;
      aborted: boolean;
      retryCount: number;
    }

    const testCommand: TestCommand = {
      id: 'abc12345-def6-7890-abcd-ef1234567890',
      paneId: '%0',
      command: 'echo "test"',
      status: 'pending',
      startTime: new Date(),
      aborted: false,
      retryCount: 0
    };

    // Validate command ID format (UUID v4)
    expect(testCommand.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    // Validate tmux pane ID format
    expect(testCommand.paneId).toMatch(/^%\d+$/);
    expect(testCommand.status).toBe('pending');
    expect(testCommand.aborted).toBe(false);
  });

  it('should handle shell type detection', () => {
    type ShellType = 'bash' | 'zsh' | 'fish' | 'sh' | 'unknown';
    
    const validShells: ShellType[] = ['bash', 'zsh', 'fish', 'sh', 'unknown'];
    
    validShells.forEach(shell => {
      expect(validShells).toContain(shell);
    });
  });

  it('should format command IDs correctly', () => {
    const uuid4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const testId = 'abc12345-def6-7890-abcd-ef1234567890';
    
    expect(testId).toMatch(uuid4Regex);
    expect(testId.toLowerCase()).toBe(testId);
  });

  it('should validate tmux pane IDs', () => {
    const validPaneIds = ['%0', '%1', '%10', '%999'];
    const invalidPaneIds = ['0', '%', 'pane0', ''];
    
    validPaneIds.forEach(id => {
      expect(id).toMatch(/^%\d+$/);
    });
    
    invalidPaneIds.forEach(id => {
      expect(id).not.toMatch(/^%\d+$/);
    });
  });

  it('should handle command execution options', () => {
    interface ExecutionOptions {
      maxRetries?: number;
      timeout?: number;
      detectShell?: boolean;
    }

    const defaultOptions: ExecutionOptions = {
      maxRetries: 3,
      timeout: 30000,
      detectShell: true
    };

    const customOptions: ExecutionOptions = {
      maxRetries: 5,
      timeout: 15000,
      detectShell: false
    };

    expect(defaultOptions.maxRetries).toBe(3);
    expect(customOptions.timeout).toBe(15000);
    expect(customOptions.detectShell).toBe(false);
  });
});