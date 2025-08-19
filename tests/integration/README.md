# Integration Tests for Ink TUI

This directory contains comprehensive integration tests for the React Ink TUI components used in the tmux-mcp project.

## Test Structure

### Core Test Files

- **`test-setup.ts`** - Test infrastructure and utilities
- **`ink-tui-manager.test.ts`** - TUI Manager lifecycle and terminal state tests
- **`ink-tui-app.test.ts`** - Main app state management and integration tests  
- **`components.test.ts`** - Component interaction and data flow tests
- **`hooks.test.ts`** - React hooks integration and async behavior tests
- **`user-workflows.test.ts`** - End-to-end user journey tests
- **`performance.test.ts`** - Performance and memory usage tests

## Test Infrastructure

### Mock System

The test infrastructure provides comprehensive mocking for:

- **Ink Components** - All React Ink components (Box, Text, useApp, useInput)
- **Terminal Dimensions** - Configurable terminal width/height simulation  
- **Command Execution** - Full command executor with realistic async behavior
- **Input Simulation** - Keyboard input and vim keybinding simulation
- **Performance Measurement** - Memory and timing measurement utilities

### Test Utilities

#### Mock Enhanced Executor
```typescript
const mockExecutor = createMockEnhancedExecutor();
mockExecutor._addMockCommand(command);
mockExecutor._clearAllCommands();
await mockExecutor.listAllCommands();
```

#### Input Simulation
```typescript
simulateInput.key('j'); // Vim navigation
simulateInput.key('u', { ctrl: true }); // Ctrl+U
simulateInput.sequence([
  { key: 'v' },
  { key: ' ', modifiers: { space: true } },
  { key: 'y' }
]);
```

#### Performance Testing
```typescript
const { result, duration, memory } = measurePerformance(() => {
  // Performance-critical operation
});
expect(duration).toBeLessThan(100);
expect(memory).toBeLessThan(50 * 1024 * 1024);
```

## Test Categories

### 1. TUI Manager Tests (`ink-tui-manager.test.ts`)

Tests the TUI lifecycle management:

- **Initialization** - Command logger setup, terminal configuration
- **Terminal State** - Alternate screen, cursor management, restoration
- **Exit Handling** - Signal handlers, cleanup, error recovery
- **Configuration** - Option passing, defaults, validation

**Key Scenarios:**
- Clean startup and shutdown
- Signal-based termination (SIGINT, SIGTERM)
- Error handling during initialization
- Multiple start/stop cycles

### 2. TUI App Tests (`ink-tui-app.test.ts`)

Tests the main application logic:

- **State Management** - Mode transitions, selection state, filtering
- **Real-time Updates** - Polling integration, data refresh
- **Mode Transitions** - Normal → Visual → Copy → Command modes
- **Error Handling** - API failures, invalid states, recovery

**Key Scenarios:**
- Mode switching workflows
- Data filtering and view changes
- Copy operations with different targets
- Vim keybinding functionality

### 3. Component Integration Tests (`components.test.ts`)

Tests cross-component communication:

- **Data Flow** - Parent to child component prop passing
- **State Synchronization** - Selection, scrolling, filtering coordination  
- **Layout Integration** - Terminal sizing, responsive behavior
- **Modal Overlays** - Command input, copy mode overlays

**Key Scenarios:**
- HeaderBox receiving summary data
- CommandListBox handling large datasets
- PreviewPaneBox showing selected commands
- Modal component integration

### 4. Hooks Integration Tests (`hooks.test.ts`)

Tests React hooks behavior:

- **usePolling** - Real-time data updates, error handling
- **useScrolling** - Vim-style navigation, boundary handling
- **useInputHandler** - Keyboard input, mode-specific handling
- **Cross-Hook Coordination** - State synchronization between hooks

**Key Scenarios:**
- Polling with async command execution
- Scroll position calculations with large datasets
- Complex input sequences (visual mode selection)
- Hook interaction and dependency management

### 5. User Workflow Tests (`user-workflows.test.ts`)

Tests complete user journeys:

- **Navigation Workflows** - Vim keybinding sequences
- **Selection Workflows** - Visual mode, multi-selection
- **Copy Workflows** - Target selection, execution
- **Search Workflows** - Filtering, view switching
- **Error Recovery** - Invalid states, empty data

**Key Scenarios:**
- Navigate → Select → Copy complete workflows
- Complex multi-step operations
- Mode transition consistency
- Error state handling

### 6. Performance Tests (`performance.test.ts`)

Tests performance and scalability:

- **Large Datasets** - 1000+ commands, filtering efficiency
- **Memory Usage** - Memory leaks, cleanup efficiency
- **Rendering Performance** - Virtualization, re-render optimization
- **Concurrency** - Multiple operations, responsiveness

**Key Scenarios:**
- 10K+ command dataset handling
- Memory pressure and cleanup
- Rapid re-renders and scroll operations
- Concurrent polling and user input

## Running Tests

### All Integration Tests
```bash
npm run test:integration
```

### Specific Test Files
```bash
npm test -- tests/integration/ink-tui-manager.test.ts
npm test -- tests/integration/performance.test.ts
```

### With Coverage
```bash
npm run test:coverage -- --testPathPattern=integration
```

### Watch Mode
```bash
npm run test:watch -- --testPathPattern=integration
```

## Test Configuration

Tests are configured in `jest.config.cjs` with:

- **TypeScript Support** - ts-jest for TypeScript compilation
- **Node Environment** - For CLI application testing
- **Module Resolution** - ESM/CommonJS compatibility
- **Timeout Settings** - Extended timeout for integration tests (30s)
- **Coverage Settings** - Source file inclusion/exclusion

## Performance Benchmarks

The performance tests establish benchmarks for:

- **Command Loading**: < 50ms for 1000 commands
- **Filtering**: < 25ms for text/status filtering  
- **Scrolling**: < 5ms for position calculations
- **Memory Usage**: < 50MB for large datasets
- **Rendering**: < 100ms for component re-renders

## Mock Validation

All mocks are validated to ensure they:

- **Maintain API Compatibility** - Same interface as real components
- **Provide Realistic Behavior** - Async operations, timing, errors
- **Support Test Isolation** - Clean setup/teardown between tests
- **Enable Performance Testing** - Measurable operations and resource usage

## Troubleshooting

### Common Issues

1. **Test Timeouts** - Increase timeout for async operations
2. **Memory Leaks** - Ensure proper cleanup in afterEach
3. **Mock Inconsistencies** - Verify mock behavior matches real components
4. **Race Conditions** - Use waitFor for async state changes

### Debug Mode

Enable verbose logging for test debugging:

```bash
npm test -- --verbose tests/integration/
```

### Performance Profiling

Run performance tests with detailed output:

```bash
npm test -- tests/integration/performance.test.ts --verbose
```