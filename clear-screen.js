#!/usr/bin/env node

// Simple script to clear screen artifacts
console.clear();
process.stdout.write('\x1b[2J\x1b[H');
process.stdout.write('\x1b[?25h'); // Show cursor
console.log('Screen cleared. Try running TUI again:');
console.log('node build/index.js interactive');