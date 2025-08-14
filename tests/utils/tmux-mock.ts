import { jest } from '@jest/globals';
import type { TmuxSession, TmuxWindow, TmuxPane } from '../../src/tmux.js';

/**
 * Mock tmux utilities for testing
 */
export class TmuxMock {
  private static mockSessions: TmuxSession[] = [];
  private static mockWindows: Map<string, TmuxWindow[]> = new Map();
  private static mockPanes: Map<string, TmuxPane[]> = new Map();
  private static mockPaneContent: Map<string, string> = new Map();
  private static commandHistory: string[] = [];

  static reset() {
    this.mockSessions = [];
    this.mockWindows.clear();
    this.mockPanes.clear();
    this.mockPaneContent.clear();
    this.commandHistory = [];
  }

  static addMockSession(session: TmuxSession) {
    this.mockSessions.push(session);
  }

  static addMockWindow(sessionId: string, window: TmuxWindow) {
    if (!this.mockWindows.has(sessionId)) {
      this.mockWindows.set(sessionId, []);
    }
    this.mockWindows.get(sessionId)!.push(window);
  }

  static addMockPane(windowId: string, pane: TmuxPane) {
    if (!this.mockPanes.has(windowId)) {
      this.mockPanes.set(windowId, []);
    }
    this.mockPanes.get(windowId)!.push(pane);
  }

  static setMockPaneContent(paneId: string, content: string) {
    this.mockPaneContent.set(paneId, content);
  }

  static appendToPaneContent(paneId: string, newContent: string) {
    const existing = this.mockPaneContent.get(paneId) || '';
    this.mockPaneContent.set(paneId, existing + newContent);
  }

  static getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  static getMockTmuxModule() {
    return {
      executeTmux: jest.fn().mockImplementation(async (command: string) => {
        this.commandHistory.push(command);
        
        // Mock different tmux commands
        if (command.includes('list-sessions')) {
          return this.mockSessions.map(s => `${s.id}:${s.name}:${s.attached ? '1' : '0'}:${s.windows}`).join('\n');
        }
        
        if (command.includes('list-windows')) {
          const match = command.match(/-t '([^']+)'/);
          const sessionId = match?.[1] || '';
          const windows = this.mockWindows.get(sessionId) || [];
          return windows.map(w => `${w.id}:${w.name}:${w.active ? '1' : '0'}`).join('\n');
        }
        
        if (command.includes('list-panes')) {
          const match = command.match(/-t '([^']+)'/);
          const windowId = match?.[1] || '';
          const panes = this.mockPanes.get(windowId) || [];
          return panes.map(p => `${p.id}:${p.title}:${p.active ? '1' : '0'}`).join('\n');
        }
        
        if (command.includes('capture-pane')) {
          const match = command.match(/-t '([^']+)'/);
          const paneId = match?.[1] || '';
          return this.mockPaneContent.get(paneId) || '';
        }
        
        if (command.includes('send-keys')) {
          // Mock sending keys to pane
          return '';
        }
        
        return '';
      }),

      isTmuxRunning: jest.fn().mockResolvedValue(true),
      
      listSessions: jest.fn().mockImplementation(async () => this.mockSessions),
      
      findSessionByName: jest.fn().mockImplementation(async (name: string) => 
        this.mockSessions.find(s => s.name === name) || null
      ),
      
      listWindows: jest.fn().mockImplementation(async (sessionId: string) => 
        this.mockWindows.get(sessionId) || []
      ),
      
      listPanes: jest.fn().mockImplementation(async (windowId: string) => 
        this.mockPanes.get(windowId) || []
      ),
      
      capturePaneContent: jest.fn().mockImplementation(async (paneId: string) => 
        this.mockPaneContent.get(paneId) || ''
      ),
      
      createSession: jest.fn().mockImplementation(async (name: string) => {
        const session = { id: `session_${Date.now()}`, name, attached: false, windows: 1 };
        this.addMockSession(session);
        return session;
      }),
      
      createWindow: jest.fn().mockImplementation(async (sessionId: string, name: string) => {
        const window = { id: `window_${Date.now()}`, name, active: false, sessionId };
        this.addMockWindow(sessionId, window);
        return window;
      }),
      
      splitPane: jest.fn().mockImplementation(async (paneId: string, direction: string) => {
        const newPane = { 
          id: `%${Date.now()}`, 
          windowId: 'mock_window', 
          title: 'mock_pane', 
          active: false 
        };
        this.addMockPane('mock_window', newPane);
        return newPane;
      }),
      
      executeCommand: jest.fn().mockResolvedValue('mock_command_id'),
      checkCommandStatus: jest.fn().mockResolvedValue(null),
      getCommand: jest.fn().mockReturnValue(null),
      getActiveCommandIds: jest.fn().mockReturnValue([]),
      cleanupOldCommands: jest.fn(),
      sendKeysRaw: jest.fn().mockResolvedValue(undefined),
      getCompleteHierarchy: jest.fn().mockResolvedValue([])
    };
  }
}

/**
 * Create a test tmux environment with mock sessions, windows, and panes
 */
export function createTestTmuxEnvironment() {
  TmuxMock.reset();
  
  // Add mock session
  TmuxMock.addMockSession({
    id: '$0',
    name: 'test-session',
    attached: true,
    windows: 2
  });
  
  // Add mock windows
  TmuxMock.addMockWindow('$0', {
    id: '@0',
    name: 'main',
    active: true,
    sessionId: '$0'
  });
  
  TmuxMock.addMockWindow('$0', {
    id: '@1',
    name: 'secondary',
    active: false,
    sessionId: '$0'
  });
  
  // Add mock panes
  TmuxMock.addMockPane('@0', {
    id: '%0',
    windowId: '@0',
    title: 'bash',
    active: true
  });
  
  TmuxMock.addMockPane('@1', {
    id: '%1',
    windowId: '@1',
    title: 'zsh',
    active: false
  });
  
  // Set initial pane content
  TmuxMock.setMockPaneContent('%0', 'user@host:~$ ');
  TmuxMock.setMockPaneContent('%1', 'user@host:~% ');
  
  return TmuxMock.getMockTmuxModule();
}