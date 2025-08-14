import { spawn } from 'child_process';

export interface ClipboardResult {
  success: boolean;
  message?: string;
}

/**
 * Copy content to system clipboard with cross-platform support
 */
export async function copyToClipboard(content: string): Promise<ClipboardResult> {
  if (!content || content.trim() === '') {
    return { success: false, message: 'No content to copy' };
  }

  try {
    const platform = process.platform;
    let command: string;
    let args: string[] = [];

    // Determine platform-specific clipboard command
    switch (platform) {
      case 'darwin':
        command = 'pbcopy';
        break;
      case 'linux':
        // Try xclip first, then wl-copy for Wayland
        command = 'xclip';
        args = ['-selection', 'clipboard'];
        break;
      case 'win32':
        command = 'clip';
        break;
      default:
        return { 
          success: false, 
          message: `Clipboard not supported on platform: ${platform}` 
        };
    }

    // Execute clipboard command
    return new Promise((resolve) => {
      const child = spawn(command, args);
      let error = '';

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: 'Copied to clipboard' });
        } else {
          // Fallback for Linux: try wl-copy if xclip failed
          if (platform === 'linux' && command === 'xclip') {
            tryWlCopy(content).then(resolve);
          } else {
            resolve({ 
              success: false, 
              message: `Clipboard command failed: ${error || 'Unknown error'}` 
            });
          }
        }
      });

      child.on('error', (err) => {
        if (platform === 'linux' && command === 'xclip') {
          // Try wl-copy as fallback
          tryWlCopy(content).then(resolve);
        } else {
          resolve({ 
            success: false, 
            message: `Clipboard command not found: ${err.message}` 
          });
        }
      });

      // Write content to stdin
      child.stdin.write(content);
      child.stdin.end();
    });

  } catch (error) {
    return { 
      success: false, 
      message: `Clipboard error: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Fallback for Linux Wayland systems using wl-copy
 */
async function tryWlCopy(content: string): Promise<ClipboardResult> {
  return new Promise((resolve) => {
    const child = spawn('wl-copy');
    let error = '';

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: 'Copied to clipboard (wl-copy)' });
      } else {
        resolve({ 
          success: false, 
          message: `Both xclip and wl-copy failed. Error: ${error || 'Unknown error'}` 
        });
      }
    });

    child.on('error', () => {
      resolve({ 
        success: false, 
        message: 'Clipboard unavailable. Please install xclip or wl-copy.' 
      });
    });

    child.stdin.write(content);
    child.stdin.end();
  });
}

/**
 * Display content to console as fallback when clipboard is unavailable
 */
export function displayToConsole(content: string, contentType: string = 'content'): void {
  console.log('\n📋 Clipboard unavailable - Content displayed below:');
  console.log(`\n--- ${contentType.toUpperCase()} ---`);
  console.log(content);
  console.log(`--- END ${contentType.toUpperCase()} ---\n`);
}

/**
 * Copy with fallback to console display
 */
export async function copyWithFallback(content: string, contentType: string = 'content'): Promise<ClipboardResult> {
  const result = await copyToClipboard(content);
  
  if (!result.success) {
    displayToConsole(content, contentType);
    return { 
      success: true, 
      message: `${result.message} - Content displayed in console instead` 
    };
  }
  
  return result;
}