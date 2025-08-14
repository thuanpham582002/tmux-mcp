#!/usr/bin/env node

import * as enhancedExecutor from './build/enhanced-executor.js';

async function testEmpty() {
  try {
    console.log('Testing enhanced executor...');
    
    const active = await enhancedExecutor.listActiveCommands();
    console.log('Active commands:', active.length);
    active.forEach((cmd, i) => {
      console.log(`${i+1}. ${cmd.id}: ${cmd.command} (${cmd.status})`);
    });
    
    // Cancel all active commands
    if (active.length > 0) {
      console.log('\nCancelling active commands...');
      for (const cmd of active) {
        try {
          await enhancedExecutor.cancelCommand(cmd.id);
          console.log(`Cancelled: ${cmd.id}`);
        } catch (error) {
          console.log(`Failed to cancel ${cmd.id}: ${error.message}`);
        }
      }
    }
    
    const all = await enhancedExecutor.listAllCommands();
    console.log('All commands:', all.length);
    
    // Cleanup all commands
    console.log('\nCleaning up...');
    await enhancedExecutor.cleanupOldCommands(0); // Clean all
    
    const afterCleanup = await enhancedExecutor.listActiveCommands();
    console.log('After cleanup:', afterCleanup.length);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testEmpty().catch(console.error);