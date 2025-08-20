import { useInput } from 'ink';
import { InteractionMode } from '../ink-tui-app.js';

interface InputHandlers {
  // Navigation
  navigateUp: () => void;
  navigateDown: () => void;
  goToTop: () => void;
  goToBottom: () => void;
  
  // Advanced vim scrolling
  halfPageUp: () => void;     // Ctrl+U
  halfPageDown: () => void;   // Ctrl+D
  pageUp: () => void;         // Ctrl+B
  pageDown: () => void;       // Ctrl+F
  lineUp: () => void;         // Ctrl+Y
  lineDown: () => void;       // Ctrl+E
  
  // Mode management
  enterVisualMode: () => void;
  enterCommandMode: () => void;
  enterSearchMode: () => void;
  exitCurrentMode: () => void;
  
  // View management
  cycleView: () => void;
  
  // Selection and actions
  toggleSelection: () => void;
  cancelCurrentCommand: () => Promise<void>;
  refreshData: () => Promise<void>;
  
  // Copy mode management
  enterCopyMode: () => void;
  setCopyTarget: (target: any) => void; // Using any for CopyTarget to avoid circular import
  cycleCopyTarget: (direction: 'next' | 'previous') => void;
  executeCopy: () => Promise<void>;
  
  // FZF integration
  launchFzfActive: () => Promise<void>;
  launchFzfHistory: () => Promise<void>;
  launchFzfSearch: () => Promise<void>;
  
  // System
  quit: () => void;
}

interface UseInputHandlerOptions {
  currentMode: InteractionMode;
  handlers: InputHandlers;
}

export const useInputHandler = ({
  currentMode,
  handlers
}: UseInputHandlerOptions): void => {
  useInput((input, key) => {
    // Handle backspace key - mode-specific behavior (avoids tmux Esc key conflict)
    if (key.backspace) {
      // Exit these specific modes with backspace
      if (currentMode === 'copy' || currentMode === 'command' || currentMode === 'search') {
        handlers.exitCurrentMode();
        return;
      }
      // In normal mode, backspace exits current mode (goes back to previous state)
      if (currentMode === 'normal') {
        handlers.exitCurrentMode();
        return;
      }
      // In visual mode, backspace becomes a navigation key - handled in handleVisualMode
    }
    
    if (key.ctrl && input === 'c') {
      handlers.quit();
      return;
    }
    
    // Mode-specific input handling
    switch (currentMode) {
      case 'normal':
        handleNormalMode(input, key, handlers);
        break;
      case 'visual':
        handleVisualMode(input, key, handlers);
        break;
      case 'copy':
        handleCopyMode(input, key, handlers);
        break;
      case 'command':
      case 'search':
        // Input handling is managed by CommandInputModal component
        break;
    }
  });
};

const handleNormalMode = (input: string, key: any, handlers: InputHandlers) => {
  // Advanced vim scrolling keybindings - these are the key new features!
  if (key.ctrl) {
    switch (input) {
      case 'u': // Ctrl+U - Half page up
        handlers.halfPageUp();
        return;
      case 'd': // Ctrl+D - Half page down
        handlers.halfPageDown();
        return;
      case 'f': // Ctrl+F - Full page forward
        handlers.pageDown();
        return;
      case 'b': // Ctrl+B - Full page backward
        handlers.pageUp();
        return;
      case 'e': // Ctrl+E - Scroll down one line
        handlers.lineDown();
        return;
      case 'y': // Ctrl+Y - Scroll up one line
        handlers.lineUp();
        return;
    }
  }
  
  // Basic vim navigation
  switch (input) {
    case 'j':
      handlers.navigateDown();
      break;
    case 'k':
      handlers.navigateUp();
      break;
    case 'h':
      // TODO: Implement pane switching or keep as view cycle
      handlers.cycleView();
      break;
    case 'l':
      // TODO: Implement pane switching or keep as view cycle
      handlers.cycleView();
      break;
    case 'G':
      handlers.goToBottom();
      break;
    case 'g':
      // Note: vim 'gg' is handled as a sequence, simplified to single 'g' for now
      handlers.goToTop();
      break;
  }
  
  // Arrow key navigation
  if (key.upArrow) {
    handlers.navigateUp();
  } else if (key.downArrow) {
    handlers.navigateDown();
  } else if (key.leftArrow) {
    handlers.cycleView();
  } else if (key.rightArrow) {
    handlers.cycleView();
  }
  
  // Mode switching
  switch (input) {
    case 'v':
      handlers.enterVisualMode();
      break;
    case 'y':
      handlers.enterCopyMode();
      break;
    case ':':
      handlers.enterCommandMode();
      break;
    case '/':
      handlers.launchFzfSearch();
      break;
  }
  
  // Actions
  switch (input) {
    case 'c':
      handlers.cancelCurrentCommand();
      break;
    case 'r':
      handlers.refreshData();
      break;
  }
  
  // FZF shortcuts
  switch (input) {
    case 'a':
      if (key.ctrl) {
        handlers.launchFzfActive();
      }
      break;
    case 'h':
      if (key.ctrl) {
        handlers.launchFzfHistory();
      }
      break;
  }
  
  // View cycling
  if (key.tab) {
    handlers.cycleView();
  }
  
  // Help - TODO: implement help modal
  if (input === '?') {
    // TODO: Show help modal
  }
};

const handleVisualMode = (input: string, key: any, handlers: InputHandlers) => {
  // In visual mode, we still allow navigation and vim scrolling
  
  // Handle backspace as navigation in visual mode (vim-like behavior)
  if (key.backspace) {
    handlers.navigateUp(); // Backspace moves up like 'k'
    return;
  }
  
  // Advanced vim scrolling keybindings work in visual mode too
  if (key.ctrl) {
    switch (input) {
      case 'u': // Ctrl+U - Half page up
        handlers.halfPageUp();
        return;
      case 'd': // Ctrl+D - Half page down
        handlers.halfPageDown();
        return;
      case 'f': // Ctrl+F - Full page forward
        handlers.pageDown();
        return;
      case 'b': // Ctrl+B - Full page backward
        handlers.pageUp();
        return;
      case 'e': // Ctrl+E - Scroll down one line
        handlers.lineDown();
        return;
      case 'y': // Ctrl+Y - Scroll up one line
        handlers.lineUp();
        return;
    }
  }
  
  // Basic navigation
  switch (input) {
    case 'j':
      handlers.navigateDown();
      break;
    case 'k':
      handlers.navigateUp();
      break;
    case 'G':
      handlers.goToBottom();
      break;
    case 'g':
      handlers.goToTop();
      break;
  }
  
  // Arrow key navigation
  if (key.upArrow) {
    handlers.navigateUp();
  } else if (key.downArrow) {
    handlers.navigateDown();
  }
  
  // Visual mode specific actions
  if (input === ' ' || key.space) {
    handlers.toggleSelection();
  }
  
  // 'v' key to exit visual mode (vim-like toggle behavior)
  if (input === 'v') {
    handlers.exitCurrentMode();
    return;
  }
  
  // Actions on selected items
  switch (input) {
    case 'c':
      handlers.cancelCurrentCommand();
      break;
    case 'd':
      if (!key.ctrl) {
        // 'd' without Ctrl in visual mode could be delete
        // For now, just cancel
        handlers.cancelCurrentCommand();
      }
      break;
    case 'y':
      handlers.enterCopyMode();
      break;
  }
  
  // Enter key for action
  if (key.return) {
    // TODO: Implement action on selected items
  }
};

const handleCopyMode = (input: string, key: any, handlers: InputHandlers) => {
  // Navigation still works in copy mode
  if (key.ctrl) {
    switch (input) {
      case 'u': // Ctrl+U - Half page up
        handlers.halfPageUp();
        return;
      case 'd': // Ctrl+D - Half page down
        handlers.halfPageDown();
        return;
      case 'f': // Ctrl+F - Full page forward
        handlers.pageDown();
        return;
      case 'b': // Ctrl+B - Full page backward
        handlers.pageUp();
        return;
      case 'e': // Ctrl+E - Scroll down one line
        handlers.lineDown();
        return;
      case 'y': // Ctrl+Y - Scroll up one line
        handlers.lineUp();
        return;
    }
  }
  
  // Basic navigation
  switch (input) {
    case 'j':
      handlers.navigateDown();
      break;
    case 'k':
      handlers.navigateUp();
      break;
    case 'G':
      handlers.goToBottom();
      break;
    case 'g':
      handlers.goToTop();
      break;
  }
  
  // Arrow key navigation
  if (key.upArrow) {
    handlers.navigateUp();
  } else if (key.downArrow) {
    handlers.navigateDown();
  } else if (key.leftArrow) {
    handlers.cycleCopyTarget('previous');
  } else if (key.rightArrow) {
    handlers.cycleCopyTarget('next');
  }
  
  // Copy target selection
  switch (input) {
    case 'c':
      handlers.setCopyTarget('command');
      break;
    case 'o':
      handlers.setCopyTarget('output');
      break;
    case 'm':
      handlers.setCopyTarget('metadata');
      break;
    case 'f':
      handlers.setCopyTarget('full');
      break;
  }
  
  // Tab to cycle copy targets
  if (key.tab) {
    handlers.cycleCopyTarget('next');
  }
  
  // Execute copy
  if (key.return || input === ' ') {
    handlers.executeCopy();
  }
};