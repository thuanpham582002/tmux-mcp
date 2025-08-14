#!/usr/bin/env node

import { FzfIntegration } from './build/fzf-integration.js';

async function testFzf() {
  const fzf = new FzfIntegration();
  
  console.log('Testing fzf availability...');
  const available = await fzf.checkFzfAvailable();
  console.log('fzf available:', available);
  
  if (!available) {
    console.error('fzf not available');
    process.exit(1);
  }
  
  // Test with simple options
  console.log('Testing fzf with simple options...');
  try {
    const result = await fzf.runFzf(['option 1', 'option 2', 'option 3'], {
      header: 'Test fzf',
      prompt: 'Select: ',
      height: '40%'
    });
    
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testFzf().catch(console.error);