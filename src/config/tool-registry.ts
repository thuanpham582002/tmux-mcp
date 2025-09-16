/**
 * Tool registry system for tmux-mcp
 * Manages MCP tool registration and configuration-based filtering
 */

import { ToolDefinition, ToolRegistry, Config } from './config-types.js';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Tool registry implementation
 */
export class TmuxToolRegistry {
  private registry: ToolRegistry = {
    tools: new Map(),
    registeredTools: new Set(),
    disabledTools: new Set()
  };

  private server: McpServer;
  private config: Config;
  private disabledToolsSet: Set<string>;

  constructor(server: McpServer, config: Config) {
    this.server = server;
    this.config = config;
    this.disabledToolsSet = new Set(config.mcp.disabledTools || []);
  }

  /**
   * Register a tool definition
   */
  registerTool(tool: ToolDefinition): void {
    this.registry.tools.set(tool.name, tool);
  }

  /**
   * Register all enabled tools with the MCP server
   */
  registerEnabledTools(): void {
    // Clear previously registered tools
    this.registry.registeredTools.clear();

    // Register each tool if enabled
    for (const [name, tool] of this.registry.tools) {
      if (this.isToolEnabled(tool)) {
        this.registerToolWithServer(tool);
        this.registry.registeredTools.add(name);
      } else {
        this.disabledToolsSet.add(name);
        this.registry.disabledTools.add(name);
      }
    }

    console.log(`Registered ${this.registry.registeredTools.size} MCP tools`);
    if (this.disabledToolsSet.size > 0) {
      console.log(`Disabled ${this.disabledToolsSet.size} MCP tools: ${Array.from(this.disabledToolsSet).join(', ')}`);
    }
  }

  /**
   * Check if a tool should be enabled
   */
  private isToolEnabled(tool: ToolDefinition): boolean {
    const { disabledTools, enabledTools } = this.config.mcp;

    // If whitelist mode (enabledTools specified), only enable whitelisted tools
    if (enabledTools && enabledTools.length > 0) {
      return enabledTools.includes(tool.name);
    }

    // Otherwise, use blacklist mode (default)
    if (disabledTools && disabledTools.includes(tool.name)) {
      return false;
    }

    // Default to tool's default setting
    return tool.defaultEnabled;
  }

  /**
   * Register a single tool with the MCP server
   */
  private registerToolWithServer(tool: ToolDefinition): void {
    try {
      this.server.tool(
        tool.name,
        tool.description,
        tool.schema as any,
        tool.handler
      );
    } catch (error) {
      console.warn(`Failed to register tool '${tool.name}':`, error);
    }
  }

  /**
   * Get tool information
   */
  getToolInfo(name: string): ToolDefinition | undefined {
    return this.registry.tools.get(name);
  }

  /**
   * List all available tools (registered and unregistered)
   */
  listAllTools(): ToolDefinition[] {
    return Array.from(this.registry.tools.values());
  }

  /**
   * List registered (enabled) tools
   */
  listRegisteredTools(): ToolDefinition[] {
    return Array.from(this.registry.registeredTools)
      .map(name => this.registry.tools.get(name))
      .filter(Boolean) as ToolDefinition[];
  }

  /**
   * List disabled tools
   */
  listDisabledTools(): ToolDefinition[] {
    return Array.from(this.disabledToolsSet)
      .map(name => this.registry.tools.get(name))
      .filter(Boolean) as ToolDefinition[];
  }

  /**
   * Check if a tool is registered
   */
  isToolRegistered(name: string): boolean {
    return this.registry.registeredTools.has(name);
  }

  /**
   * Check if a tool is disabled
   */
  isToolDisabled(name: string): boolean {
    return this.disabledToolsSet.has(name);
  }

  /**
   * Get tool statistics
   */
  getStats(): {
    total: number;
    registered: number;
    disabled: number;
    byCategory: Record<string, { total: number; registered: number; disabled: number }>;
  } {
    const stats = {
      total: this.registry.tools.size,
      registered: this.registry.registeredTools.size,
      disabled: this.disabledToolsSet.size,
      byCategory: {} as Record<string, { total: number; registered: number; disabled: number }>
    };

    // Group by category
    for (const tool of this.registry.tools.values()) {
      if (!stats.byCategory[tool.category]) {
        stats.byCategory[tool.category] = { total: 0, registered: 0, disabled: 0 };
      }

      stats.byCategory[tool.category].total++;

      if (this.registry.registeredTools.has(tool.name)) {
        stats.byCategory[tool.category].registered++;
      }

      if (this.disabledToolsSet.has(tool.name)) {
        stats.byCategory[tool.category].disabled++;
      }
    }

    return stats;
  }

  /**
   * Update configuration (for runtime reconfiguration)
   */
  updateConfig(config: Config): void {
    this.config = config;
    this.disabledToolsSet = new Set(config.mcp.disabledTools || []);
    this.registerEnabledTools();
  }
}

/**
 * Tool factory helpers for common patterns
 */
export const ToolHelpers = {
  /**
   * Create a simple tool definition
   */
  createTool(
    name: string,
    description: string,
    schema: z.ZodObject<any, any, any>,
    handler: (args: any) => Promise<any>,
    category: string = "general",
    defaultEnabled: boolean = true
  ): ToolDefinition {
    return {
      name,
      description,
      schema,
      handler,
      category,
      defaultEnabled
    };
  },

  /**
   * Get all available tmux-mcp tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    // This will be populated with all the actual tool definitions
    // For now, return empty array - will be filled when refactoring index.ts
    return [];
  }
};

/**
 * Create tool registry instance
 */
export function createToolRegistry(server: McpServer, config: Config): TmuxToolRegistry {
  return new TmuxToolRegistry(server, config);
}