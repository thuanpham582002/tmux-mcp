/**
 * Configuration loader for tmux-mcp
 * Handles loading, validation, and merging of configuration files
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { Config, ConfigSchema, ConfigLoadOptions, ConfigValidationResult } from './config-types.js';
import { expandPatterns, getMatchingTools, analyzePatterns, PatternMatch } from './wildcard-matcher.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Config = {
  version: "1.0.0",
  mcp: {
    disabledTools: [],
    enabledTools: [],
    settings: {}
  },
  cli: {
    defaults: {
      shellType: "bash"
    }
  }
};

/**
 * Possible configuration file locations in priority order
 */
const CONFIG_PATHS = [
  // Current directory
  "./.tmux-mcp.json",
  "./tmux-mcp.json",
  // User home directory
  `${homedir()}/.tmux-mcp.json`,
  `${homedir()}/.config/tmux-mcp/config.json`,
  // Project root (if in node_modules)
  `${__dirname}/../../../.tmux-mcp.json`
];

/**
 * Load configuration from file or create default
 */
export function loadConfig(options: ConfigLoadOptions = {}, availableTools: any[] = []): Config {
  const configPath = options.configPath || findConfigFile();
  let config = DEFAULT_CONFIG;

  if (configPath && existsSync(configPath)) {
    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      const parsedConfig = JSON.parse(fileContent);

      // Validate and merge with defaults
      const validationResult = ConfigSchema.safeParse(parsedConfig);

      if (validationResult.success) {
        config = mergeConfig(DEFAULT_CONFIG, validationResult.data);
      } else {
        console.warn(`Configuration validation warning: ${validationResult.error.message}`);
      }
    } catch (error) {
      console.warn(`Failed to load configuration from ${configPath}:`, error);
    }
  }

  // Apply command line overrides
  config = applyCliOverrides(config, options);

  // Expand wildcard patterns (requires available tools)
  if (availableTools.length > 0) {
    config = expandWildcardPatterns(config, availableTools);
  }

  return config;
}

/**
 * Find the first existing configuration file
 */
function findConfigFile(): string | null {
  for (const path of CONFIG_PATHS) {
    if (existsSync(path) && statSync(path).isFile()) {
      return path;
    }
  }
  return null;
}

/**
 * Merge user config with defaults
 */
function mergeConfig(defaultConfig: Config, userConfig: any): Config {
  return {
    ...defaultConfig,
    ...userConfig,
    mcp: {
      ...defaultConfig.mcp,
      ...userConfig.mcp,
      settings: {
        ...defaultConfig.mcp.settings,
        ...(userConfig.mcp?.settings || {})
      }
    },
    cli: {
      ...defaultConfig.cli,
      ...userConfig.cli,
      defaults: {
        ...defaultConfig.cli.defaults,
        ...(userConfig.cli?.defaults || {})
      }
    }
  };
}

/**
 * Expand wildcard patterns to exact tool names
 */
function expandWildcardPatterns(config: Config, availableTools: any[] = []): Config {
  const result = { ...config };
  const mcp = { ...result.mcp };

  // Process disabled patterns
  if (mcp.disabledPatterns && mcp.disabledPatterns.length > 0) {
    const disabledFromPatterns = getMatchingTools(mcp.disabledPatterns, availableTools);
    mcp.disabledTools = [...(mcp.disabledTools || []), ...disabledFromPatterns];
  }

  // Process enabled patterns
  if (mcp.enabledPatterns && mcp.enabledPatterns.length > 0) {
    const enabledFromPatterns = getMatchingTools(mcp.enabledPatterns, availableTools);
    mcp.enabledTools = [...(mcp.enabledTools || []), ...enabledFromPatterns];
  }

  result.mcp = mcp;
  return result;
}

/**
 * Apply command line overrides
 */
function applyCliOverrides(config: Config, options: ConfigLoadOptions): Config {
  const result = { ...config };

  if (options.disabledTools) {
    result.mcp.disabledTools = [...(result.mcp.disabledTools || []), ...options.disabledTools];
  }

  if (options.enabledTools) {
    result.mcp.enabledTools = [...(result.mcp.enabledTools || []), ...options.enabledTools];
  }

  if (options.disabledPatterns) {
    result.mcp.disabledPatterns = [...(result.mcp.disabledPatterns || []), ...options.disabledPatterns];
  }

  if (options.enabledPatterns) {
    result.mcp.enabledPatterns = [...(result.mcp.enabledPatterns || []), ...options.enabledPatterns];
  }

  return result;
}

/**
 * Validate configuration file
 */
export function validateConfig(configPath: string, availableTools: any[] = []): ConfigValidationResult {
  try {
    if (!existsSync(configPath)) {
      return {
        valid: false,
        errors: [`Configuration file not found: ${configPath}`]
      };
    }

    const fileContent = readFileSync(configPath, 'utf-8');
    const parsedConfig = JSON.parse(fileContent);

    const validationResult = ConfigSchema.safeParse(parsedConfig);

    if (!validationResult.success) {
      return {
        valid: false,
        errors: validationResult.error.errors.map(err =>
          `${err.path.join('.')}: ${err.message}`
        )
      };
    }

    // Additional validation
    const warnings: string[] = [];
    const config = validationResult.data;

    // Check for conflicting tool specifications
    if (config.mcp.disabledTools && config.mcp.enabledTools) {
      const conflicts = config.mcp.disabledTools.filter(tool =>
        config.mcp.enabledTools!.includes(tool)
      );

      if (conflicts.length > 0) {
        warnings.push(`Tools specified in both enabled and disabled lists: ${conflicts.join(', ')}`);
      }
    }

    // Validate wildcard patterns
    if (config.mcp.disabledPatterns || config.mcp.enabledPatterns) {
      const allPatterns = [
        ...(config.mcp.disabledPatterns || []),
        ...(config.mcp.enabledPatterns || [])
      ];

      const patternAnalysis = analyzePatterns(allPatterns, availableTools);

      // Add warnings for invalid patterns
      patternAnalysis.invalid.forEach(invalid => {
        warnings.push(`Invalid pattern "${invalid.pattern}": ${invalid.error}`);
      });

      // Add info about pattern matches
      if (patternAnalysis.totalMatches > 0) {
        console.log(`🔍 Pattern analysis: ${patternAnalysis.totalMatches} tools matched by ${patternAnalysis.valid.length} patterns`);
      }
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      config
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse configuration: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * Create default configuration file
 */
export function createDefaultConfig(targetPath?: string): string {
  const path = targetPath || './.tmux-mcp.json';
  const defaultConfig: Partial<Config> = {
    version: "1.0.0",
    mcp: {
      disabledTools: [
        // Example: disable potentially dangerous tools
        // "send-keys-raw"
      ],
      settings: {
        // Example: configure specific tool settings
        // "execute-command": {
        //   "timeout": 300000,
        //   "maxRetries": 5
        // }
      }
    },
    cli: {
      defaults: {
        shellType: "bash"
      }
    }
  };

  const content = JSON.stringify(defaultConfig, null, 2);

  if (!existsSync(dirname(path))) {
    throw new Error(`Directory does not exist: ${dirname(path)}`);
  }

  // In a real implementation, we would write the file
  // For now, return the content
  return content;
}

/**
 * Get configuration file locations
 */
export function getConfigPaths(): string[] {
  return CONFIG_PATHS.filter(path => existsSync(path) && statSync(path).isFile());
}