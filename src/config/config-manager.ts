/**
 * Configuration manager for tmux-mcp
 * Central configuration management and utilities
 */

import { Config, ConfigLoadOptions } from './config-types.js';
import { loadConfig, validateConfig, createDefaultConfig, getConfigPaths } from './config-loader.js';
import { TmuxToolRegistry } from './tool-registry.js';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Configuration manager class
 */
export class ConfigManager {
  private config: Config;
  private toolRegistry: TmuxToolRegistry | null = null;

  constructor(options: ConfigLoadOptions = {}) {
    this.config = loadConfig(options);
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Config): void {
    this.config = config;
    if (this.toolRegistry) {
      this.toolRegistry.updateConfig(config);
    }
  }

  /**
   * Set tool registry
   */
  setToolRegistry(registry: TmuxToolRegistry): void {
    this.toolRegistry = registry;
  }

  /**
   * Get MCP tool settings
   */
  getToolSettings(toolName: string): Record<string, any> {
    return this.config.mcp.settings?.[toolName] || {};
  }

  /**
   * Get CLI default settings
   */
  getCliDefaults(): Config['cli']['defaults'] {
    return this.config.cli.defaults || {};
  }

  /**
   * Check if MCP tool is disabled
   */
  isToolDisabled(toolName: string): boolean {
    return this.config.mcp.disabledTools?.includes(toolName) || false;
  }

  /**
   * Get disabled tools set
   */
  getDisabledTools(): Set<string> {
    return new Set(this.config.mcp.disabledTools || []);
  }

  /**
   * Check if whitelist mode is enabled
   */
  isWhitelistMode(): boolean {
    return !!(this.config.mcp.enabledTools && this.config.mcp.enabledTools.length > 0);
  }

  /**
   * Check if tool is in whitelist
   */
  isInWhitelist(toolName: string): boolean {
    if (!this.isWhitelistMode()) return true;
    return this.config.mcp.enabledTools?.includes(toolName) || false;
  }

  /**
   * Validate configuration file
   */
  validateConfigFile(configPath: string): ReturnType<typeof validateConfig> {
    return validateConfig(configPath);
  }

  /**
   * Create default configuration file content
   */
  createDefaultConfigContent(targetPath?: string): string {
    return createDefaultConfig(targetPath);
  }

  /**
   * Get available configuration file paths
   */
  getAvailableConfigPaths(): string[] {
    return getConfigPaths();
  }

  /**
   * Get configuration summary
   */
  getConfigSummary(): {
    version: string;
    mcp: {
      disabledCount: number;
      enabledCount: number;
      whitelistMode: boolean;
    };
    cli: {
      defaults: Config['cli']['defaults'];
    };
    configFile?: string;
  } {
    return {
      version: this.config.version,
      mcp: {
        disabledCount: this.config.mcp.disabledTools?.length || 0,
        enabledCount: this.config.mcp.enabledTools?.length || 0,
        whitelistMode: this.isWhitelistMode()
      },
      cli: {
        defaults: this.getCliDefaults()
      },
      configFile: this.getAvailableConfigPaths()[0]
    };
  }

  /**
   * Export configuration for debugging
   */
  exportConfig() {
    const result: any = {
      config: this.config,
      summary: this.getConfigSummary()
    };

    if (this.toolRegistry) {
      result.toolRegistryStats = this.toolRegistry.getStats();
    }

    return result;
  }
}

/**
 * Global configuration manager instance
 */
let globalConfigManager: ConfigManager | null = null;

/**
 * Get or create global configuration manager
 */
export function getConfigManager(options?: ConfigLoadOptions): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(options);
  }
  return globalConfigManager;
}

/**
 * Create and setup tool registry with configuration
 */
export function setupToolRegistry(server: McpServer, config?: Config): TmuxToolRegistry {
  const configManager = config ? new ConfigManager() : getConfigManager();
  const effectiveConfig = config || configManager.getConfig();

  const registry = new TmuxToolRegistry(server, effectiveConfig);
  configManager.setToolRegistry(registry);

  return registry;
}

/**
 * Reset global configuration manager (for testing)
 */
export function resetConfigManager(): void {
  globalConfigManager = null;
}