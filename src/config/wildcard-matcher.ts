/**
 * Wildcard pattern matching engine for tmux-mcp
 * Supports flexible tool configuration with wildcard patterns
 */

import { ToolDefinition } from './config-types.js';

/**
 * Pattern matching result
 */
export interface PatternMatch {
  pattern: string;
  matches: string[];
  isValid: boolean;
  error?: string;
}

/**
 * Wildcard pattern matcher options
 */
export interface WildcardOptions {
  caseSensitive?: boolean;
  debug?: boolean;
}

/**
 * Convert wildcard pattern to regular expression
 */
function wildcardToRegex(pattern: string, options: WildcardOptions = {}): RegExp {
  const { caseSensitive = false } = options;

  // Escape regex special characters except wildcards
  let regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Convert wildcards to regex equivalents
  regexPattern = regexPattern
    .replace(/\*/g, '.*')     // * becomes .*
    .replace(/\?/g, '.')       // ? becomes .
    .replace(/\[([^\]]+)\]/g, (match, chars) => {
      // Handle character classes like [abc] or [a-z]
      if (chars.includes('-')) {
        return `[${chars}]`;
      }
      return `[${chars}]`;
    });

  return new RegExp(`^${regexPattern}$`, caseSensitive ? '' : 'i');
}

/**
 * Validate wildcard pattern
 */
function validatePattern(pattern: string): { isValid: boolean; error?: string } {
  if (!pattern || typeof pattern !== 'string') {
    return { isValid: false, error: 'Pattern must be a non-empty string' };
  }

  if (pattern.length === 0) {
    return { isValid: false, error: 'Pattern cannot be empty' };
  }

  // Check for invalid character class syntax
  const bracketStack: string[] = [];
  let inCharClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === '[') {
      if (inCharClass) {
        return { isValid: false, error: 'Nested character classes not allowed' };
      }
      inCharClass = true;
      bracketStack.push(char);
    } else if (char === ']') {
      if (!inCharClass) {
        return { isValid: false, error: 'Unmatched closing bracket' };
      }
      inCharClass = false;
      bracketStack.pop();
    }
  }

  if (inCharClass || bracketStack.length > 0) {
    return { isValid: false, error: 'Unclosed character class' };
  }

  // Check for consecutive wildcards that might be confusing
  if (pattern.includes('**')) {
    return { isValid: false, error: 'Consecutive wildcards (**) not supported' };
  }

  return { isValid: true };
}

/**
 * Expand wildcard patterns to exact tool names
 */
export function expandPatterns(
  patterns: string[],
  availableTools: ToolDefinition[],
  options: WildcardOptions = {}
): PatternMatch[] {
  const results: PatternMatch[] = [];
  const { debug = false } = options;

  for (const pattern of patterns) {
    const validation = validatePattern(pattern);

    if (!validation.isValid) {
      results.push({
        pattern,
        matches: [],
        isValid: false,
        error: validation.error
      });

      if (debug) {
        console.warn(`Invalid pattern "${pattern}": ${validation.error}`);
      }

      continue;
    }

    try {
      const regex = wildcardToRegex(pattern, options);
      const matches: string[] = [];

      for (const tool of availableTools) {
        if (regex.test(tool.name)) {
          matches.push(tool.name);
        }
      }

      results.push({
        pattern,
        matches,
        isValid: true
      });

      if (debug && matches.length > 0) {
        console.log(`Pattern "${pattern}" matches: ${matches.join(', ')}`);
      }

    } catch (error) {
      results.push({
        pattern,
        matches: [],
        isValid: false,
        error: `Failed to compile pattern: ${error instanceof Error ? error.message : String(error)}`
      });

      if (debug) {
        console.warn(`Failed to compile pattern "${pattern}": ${error}`);
      }
    }
  }

  return results;
}

/**
 * Get all unique tool names matching patterns
 */
export function getMatchingTools(
  patterns: string[],
  availableTools: ToolDefinition[],
  options: WildcardOptions = {}
): string[] {
  const results = expandPatterns(patterns, availableTools, options);

  const uniqueMatches = new Set<string>();

  for (const result of results) {
    if (result.isValid) {
      for (const match of result.matches) {
        uniqueMatches.add(match);
      }
    }
  }

  return Array.from(uniqueMatches);
}

/**
 * Check if a tool name matches any pattern
 */
export function toolMatchesPatterns(
  toolName: string,
  patterns: string[],
  options: WildcardOptions = {}
): boolean {
  const validation = validatePattern(toolName);
  if (!validation.isValid) {
    return false;
  }

  for (const pattern of patterns) {
    const patternValidation = validatePattern(pattern);
    if (!patternValidation.isValid) {
      continue;
    }

    try {
      const regex = wildcardToRegex(pattern, options);
      if (regex.test(toolName)) {
        return true;
      }
    } catch (error) {
      // Skip invalid patterns
      continue;
    }
  }

  return false;
}

/**
 * Common wildcard patterns for tool categories
 */
export const ToolPatterns = {
  // Category-based patterns
  SESSION_TOOLS: 'session-*',
  WINDOW_TOOLS: 'window-*',
  PANE_TOOLS: 'pane-*',
  COMMAND_TOOLS: 'command-*',
  RAW_TOOLS: '*-raw',

  // Suffix-based patterns
  MANAGEMENT_TOOLS: '*-management',
  EXECUTION_TOOLS: '*-execution',

  // Prefix-based patterns
  LIST_TOOLS: 'list-*',
  CREATE_TOOLS: 'create-*',
  GET_TOOLS: 'get-*',
  CANCEL_TOOLS: 'cancel-*',

  // Safety patterns
  DANGEROUS_TOOLS: '*-raw,send-keys-*',
  SAFE_TOOLS: 'list-*,get-*',

  // Utility patterns
  ALL_TOOLS: '*',
  INTERACTIVE_TOOLS: 'interactive,*',
  READ_ONLY_TOOLS: 'list-*,get-*'
};

/**
 * Validate and categorize patterns
 */
export function analyzePatterns(
  patterns: string[],
  availableTools: ToolDefinition[]
): {
  valid: PatternMatch[];
  invalid: PatternMatch[];
  categories: Record<string, string[]>;
  totalMatches: number;
} {
  const results = expandPatterns(patterns, availableTools, { debug: false });

  const valid = results.filter(r => r.isValid);
  const invalid = results.filter(r => !r.isValid);

  const categories: Record<string, string[]> = {
    exact: [],
    wildcard: [],
    category: [],
    suffix: [],
    prefix: []
  };

  for (const result of valid) {
    if (result.matches.length === 0) {
      continue;
    }

    const pattern = result.pattern;

    if (!pattern.includes('*') && !pattern.includes('?') && !pattern.includes('[')) {
      categories.exact.push(pattern);
    } else if (pattern.startsWith('*') && pattern.includes('-')) {
      categories.suffix.push(pattern);
    } else if (pattern.endsWith('*') && pattern.includes('-')) {
      categories.prefix.push(pattern);
    } else if (pattern.includes('-*') || pattern.includes('*-')) {
      categories.category.push(pattern);
    } else {
      categories.wildcard.push(pattern);
    }
  }

  const totalMatches = valid.reduce((sum, result) => sum + result.matches.length, 0);

  return {
    valid,
    invalid,
    categories,
    totalMatches
  };
}