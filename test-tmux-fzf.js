#!/usr/bin/env node

import { spawn } from 'child_process';

async function testTmuxFzf() {
  console.log('Testing tmux popup with fzf...');
  
  // Simple test: just run fzf in tmux popup with static data
  const cmd = `echo -e "option 1\\noption 2\\noption 3" | fzf`;
  const tmuxCmd = `tmux popup -w 60% -h 60% -E "${cmd}"`;
  
  console.log('Running:', tmuxCmd);
  
  const child = spawn('bash', ['-c', tmuxCmd], {
    stdio: 'inherit',
    env: process.env
  });
  
  child.on('close', (code) => {
    console.log('Popup closed with code:', code);
  });
  
  child.on('error', (error) => {
    console.error('Error:', error);
  });
}

testTmuxFzf().catch(console.error);