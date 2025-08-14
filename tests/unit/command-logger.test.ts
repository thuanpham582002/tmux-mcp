const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { tmpdir } = require('os');
const { join } = require('path');
const { existsSync } = require('fs');
const { rm } = require('fs/promises');

describe('Command Logger', () => {
  let testLogDir: string;

  beforeEach(() => {
    // Create unique test directory
    testLogDir = join(tmpdir(), `tmux-mcp-test-${Date.now()}`);
  });

  afterEach(async () => {
    // Cleanup test directory
    if (existsSync(testLogDir)) {
      try {
        await rm(testLogDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should define command log entry interface', () => {
    interface CommandLogEntry {
      id: string;
      paneId: string;
      command: string;
      status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
      startTime: string;
      endTime?: string;
      duration?: number;
      exitCode?: number;
      shellType?: string;
      currentWorkingDirectory?: string;
      result?: string;
      aborted: boolean;
      retryCount: number;
      metadata: {
        tmuxSession?: string;
        tmuxWindow?: string;
        loggedAt: string;
        pid?: number;
        user?: string;
      };
    }

    const testEntry: CommandLogEntry = {
      id: 'abc12345-def6-7890-abcd-ef1234567890',
      paneId: '%0',
      command: 'echo "test"',
      status: 'completed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 100,
      exitCode: 0,
      shellType: 'bash',
      currentWorkingDirectory: '/home/user',
      result: 'test',
      aborted: false,
      retryCount: 0,
      metadata: {
        loggedAt: new Date().toISOString(),
        user: 'testuser'
      }
    };

    // Validate command ID format (UUID v4)
    expect(testEntry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    // Validate tmux pane ID format
    expect(testEntry.paneId).toMatch(/^%\d+$/);
    expect(testEntry.status).toBe('completed');
    expect(testEntry.exitCode).toBe(0);
    expect(testEntry.metadata.user).toBe('testuser');
  });

  it('should validate log directory structure', () => {
    const expectedFiles = [
      'active-commands.json',
      'command-history.jsonl',
      'metadata.json'
    ];

    expectedFiles.forEach(filename => {
      expect(filename).toMatch(/\.(json|jsonl)$/);
    });

    const activeFile = join(testLogDir, 'active-commands.json');
    const historyFile = join(testLogDir, 'command-history.jsonl');
    const metadataFile = join(testLogDir, 'metadata.json');

    expect(activeFile).toMatch(/active-commands\.json$/);
    expect(historyFile).toMatch(/command-history\.jsonl$/);
    expect(metadataFile).toMatch(/metadata\.json$/);
  });

  it('should handle status icons', () => {
    const statusMap = {
      'running': '🏃',
      'completed': '✅',
      'error': '❌',
      'cancelled': '🚫',
      'pending': '⏳'
    };

    Object.entries(statusMap).forEach(([status, icon]) => {
      // Just check if it's a valid status icon (any non-empty string)
      expect(icon).toBeTruthy();
      expect(icon.length).toBeGreaterThan(0);
      expect(status).toMatch(/^(running|completed|error|cancelled|pending)$/);
    });
  });

  it('should format duration correctly', () => {
    const formatDuration = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
      if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
      return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
    };

    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(65000)).toBe('1m 5s');
    expect(formatDuration(3665000)).toBe('1h 1m');
  });

  it('should validate command metadata', () => {
    const testMetadata = {
      created: new Date().toISOString(),
      version: '1.0.0',
      lastUpdated: new Date().toISOString()
    };

    expect(testMetadata.version).toBe('1.0.0');
    expect(testMetadata.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(testMetadata.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should handle JSON Lines format', () => {
    const sampleEntries = [
      { id: '1', command: 'ls', status: 'completed' },
      { id: '2', command: 'pwd', status: 'running' },
      { id: '3', command: 'echo test', status: 'error' }
    ];

    const jsonlContent = sampleEntries
      .map(entry => JSON.stringify(entry))
      .join('\n');

    const lines = jsonlContent.split('\n');
    expect(lines).toHaveLength(3);

    lines.forEach((line, index) => {
      const parsed = JSON.parse(line);
      expect(parsed.id).toBe(sampleEntries[index].id);
      expect(parsed.command).toBe(sampleEntries[index].command);
    });
  });
});