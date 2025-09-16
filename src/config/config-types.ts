/**
 * Configuration types for tmux-mcp
 * MCP tool configuration system
 */

import { z } from "zod";

/**
 * Tool-specific settings
 */
export interface ToolSettings {
  timeout?: number;
  maxRetries?: number;
  showWarning?: boolean;
  [key: string]: any;
}

/**
 * MCP-specific configuration
 */
export interface McpConfig {
  disabledTools?: string[];
  enabledTools?: string[];
  settings?: Record<string, ToolSettings>;
}

/**
 * CLI-specific configuration
 */
export interface CliConfig {
  defaults?: {
    shellType?: string;
    timeout?: number;
  };
}

/**
 * Complete configuration structure
 */
export interface Config {
  version: string;
  mcp: McpConfig;
  cli: CliConfig;
}

/**
 * Tool metadata for registration
 */
export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any, any, any>;
  handler: (args: any) => Promise<any>;
  category: string;
  defaultEnabled: boolean;
}

/**
 * Configuration schema for validation
 */
export const ConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  mcp: z.object({
    disabledTools: z.array(z.string()).optional().default([]),
    enabledTools: z.array(z.string()).optional(),
    settings: z.record(z.record(z.any())).optional().default({}),
  }).default({}),
  cli: z.object({
    defaults: z.object({
      shellType: z.string().optional(),
      timeout: z.number().optional(),
    }).optional(),
  }).default({}),
});

/**
 * Tool registry state
 */
export interface ToolRegistry {
  tools: Map<string, ToolDefinition>;
  registeredTools: Set<string>;
  disabledTools: Set<string>;
}

/**
 * Configuration loading options
 */
export interface ConfigLoadOptions {
  configPath?: string;
  disabledTools?: string[];
  enabledTools?: string[];
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  config?: Config;
}