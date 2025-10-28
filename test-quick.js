#!/usr/bin/env node

// Quick test of Atuin integration
import { getAtuinIntegration } from './build/atuin-integration.js';

async function quickTest() {
  console.log('Testing Atuin integration...');

  try {
    const atuin = getAtuinIntegration();
    const initialized = await atuin.initialize();
    console.log('Atuin initialized:', initialized);

    if (initialized) {
      const commandId = 'test-' + Date.now();
      console.log('Testing saveCommandStart...');

      const result = await atuin.saveCommandStart(
        'echo "Direct test from Node.js"',
        commandId,
        process.cwd()
      );

      console.log('saveCommandStart result:', result);

      if (result) {
        console.log('Testing updateCommand...');
        await atuin.updateCommand(result, 0, 150);
        console.log('updateCommand completed');
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

quickTest();