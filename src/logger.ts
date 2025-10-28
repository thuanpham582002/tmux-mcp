/**
 * Centralized logging system for tmux-mcp
 * Supports multiple log levels and output formats for both CLI and MCP server modes
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export enum LogFormat {
  COMPACT = 'compact',
  DETAILED = 'detailed',
  JSON = 'json'
}

export interface LoggerConfig {
  level: LogLevel
  format: LogFormat
  enableColors: boolean
  enableTimestamps: boolean
  modulePrefixes: boolean
  mcpMode: boolean
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  metadata?: any
}

class Logger {
  private static instance: Logger;
  public config: LoggerConfig;
  public moduleName: string;

  private constructor() {
    this.config = this.getDefaultConfig();
    this.moduleName = 'tmux-mcp';
  }

  public getDefaultConfig(): LoggerConfig {
    return {
      level: LogLevel.WARN, // Default: ERROR and WARN only
      format: LogFormat.COMPACT,
      enableColors: true,
      enableTimestamps: false,
      modulePrefixes: false,
      mcpMode: false
    };
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  public setFormat(format: LogFormat): void {
    this.config.format = format;
  }

  public setModule(moduleName: string): Logger {
    this.moduleName = moduleName;
    return this;
  }

  public shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  public getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return 'ERROR';
      case LogLevel.WARN: return 'WARN';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.DEBUG: return 'DEBUG';
      default: return 'UNKNOWN';
    }
  }

  public getColorCode(level: LogLevel): string {
    if (!this.config.enableColors) return '';

    switch (level) {
      case LogLevel.ERROR: return '\x1b[31m'; // Red
      case LogLevel.WARN: return '\x1b[33m'; // Yellow
      case LogLevel.INFO: return '\x1b[36m'; // Cyan
      case LogLevel.DEBUG: return '\x1b[37m'; // White
      default: return '';
    }
  }

  public getResetCode(): string {
    return this.config.enableColors ? '\x1b[0m' : '';
  }

  public formatMessage(entry: LogEntry): string {
    switch (this.config.format) {
      case LogFormat.COMPACT:
        return this.formatCompact(entry);
      case LogFormat.DETAILED:
        return this.formatDetailed(entry);
      case LogFormat.JSON:
        return this.formatJson(entry);
      default:
        return this.formatCompact(entry);
    }
  }

  public formatCompact(entry: LogEntry): string {
    const levelName = this.getLevelName(entry.level);
    const colorCode = this.getColorCode(entry.level);
    const resetCode = this.getResetCode();

    return `${colorCode}[${levelName}]${resetCode} ${entry.message}`;
  }

  public formatDetailed(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const levelName = this.getLevelName(entry.level);
    const module = this.config.modulePrefixes ? `[${entry.module}]` : '';
    const colorCode = this.getColorCode(entry.level);
    const resetCode = this.getResetCode();

    let result = `${timestamp} ${module} ${colorCode}[${levelName}]${resetCode} ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      result += `\n${JSON.stringify(entry.metadata, null, 2)}`;
    }

    return result;
  }

  public formatJson(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: this.getLevelName(entry.level).toLowerCase(),
      module: entry.module,
      message: entry.message,
      ...(entry.metadata && { metadata: entry.metadata })
    });
  }

  public log(level: LogLevel, message: string, metadata?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.moduleName,
      message,
      metadata
    };

    const formattedMessage = this.formatMessage(entry);

    // Write to appropriate stream
    if (level === LogLevel.ERROR) {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }

  public error(message: string, ...args: any[]): void {
    const metadata = args.length > 0 ? args : undefined;
    this.log(LogLevel.ERROR, message, metadata);
  }

  public warn(message: string, ...args: any[]): void {
    const metadata = args.length > 0 ? args : undefined;
    this.log(LogLevel.WARN, message, metadata);
  }

  public info(message: string, ...args: any[]): void {
    const metadata = args.length > 0 ? args : undefined;
    this.log(LogLevel.INFO, message, metadata);
  }

  public debug(message: string, ...args: any[]): void {
    const metadata = args.length > 0 ? args : undefined;
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Initialize logger from environment variables and CLI arguments
   */
  public initializeFromEnv(cliLogLevel?: string, cliLogFormat?: string): void {
    // Determine log level (CLI > env > default)
    let logLevel = this.config.level;

    if (cliLogLevel) {
      const level = this.parseLogLevel(cliLogLevel);
      if (level !== null) logLevel = level;
    } else if (process.env.TMUX_MCP_LOG_LEVEL) {
      const level = this.parseLogLevel(process.env.TMUX_MCP_LOG_LEVEL);
      if (level !== null) logLevel = level;
    } else if (process.env.DEBUG === 'true') {
      logLevel = LogLevel.DEBUG;
    }

    // Determine log format
    let logFormat = this.config.format;

    if (cliLogFormat) {
      const format = this.parseLogFormat(cliLogFormat);
      if (format !== null) logFormat = format;
    } else if (process.env.TMUX_MCP_LOG_FORMAT) {
      const format = this.parseLogFormat(process.env.TMUX_MCP_LOG_FORMAT);
      if (format !== null) logFormat = format;
    }

    // Configure logger
    this.configure({
      level: logLevel,
      format: logFormat,
      enableColors: process.stdout.isTTY,
      enableTimestamps: logFormat === LogFormat.DETAILED,
      modulePrefixes: logFormat === LogFormat.DETAILED,
      mcpMode: false // Will be set when in MCP server mode
    });
  }

  public parseLogLevel(level: string): LogLevel | null {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR;
      case 'warn': case 'warning': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      default: return null;
    }
  }

  public parseLogFormat(format: string): LogFormat | null {
    switch (format.toLowerCase()) {
      case 'compact': return LogFormat.COMPACT;
      case 'detailed': return LogFormat.DETAILED;
      case 'json': return LogFormat.JSON;
      default: return null;
    }
  }
}

// Export singleton instance and convenience functions
export const logger = Logger.getInstance();

// Convenience functions for easy importing
export const logError = (message: string, ...args: any[]) => logger.error(message, ...args);
export const logWarn = (message: string, ...args: any[]) => logger.warn(message, ...args);
export const logInfo = (message: string, ...args: any[]) => logger.info(message, ...args);
export const logDebug = (message: string, ...args: any[]) => logger.debug(message, ...args);

// Module-specific logger factory
export function createLogger(moduleName: string): Logger {
  return {
    error: (message: string, ...args: any[]) => logger.setModule(moduleName).error(message, ...args),
    warn: (message: string, ...args: any[]) => logger.setModule(moduleName).warn(message, ...args),
    info: (message: string, ...args: any[]) => logger.setModule(moduleName).info(message, ...args),
    debug: (message: string, ...args: any[]) => logger.setModule(moduleName).debug(message, ...args),
    configure: (config: Partial<LoggerConfig>) => logger.configure(config),
    setLevel: (level: LogLevel) => logger.setLevel(level),
    setFormat: (format: LogFormat) => logger.setFormat(format),
    setModule: (name: string) => logger.setModule(name),
    initializeFromEnv: (cliLogLevel?: string, cliLogFormat?: string) => logger.initializeFromEnv(cliLogLevel, cliLogFormat),
    config: logger.config,
    moduleName: logger.moduleName,
    getDefaultConfig: logger.getDefaultConfig.bind(logger),
    shouldLog: logger.shouldLog.bind(logger),
    getLevelName: logger.getLevelName.bind(logger),
    getColorCode: logger.getColorCode.bind(logger),
    getResetCode: logger.getResetCode.bind(logger),
    formatMessage: logger.formatMessage.bind(logger),
    formatCompact: logger.formatCompact.bind(logger),
    formatDetailed: logger.formatDetailed.bind(logger),
    formatJson: logger.formatJson.bind(logger),
    log: logger.log.bind(logger),
    parseLogLevel: logger.parseLogLevel.bind(logger),
    parseLogFormat: logger.parseLogFormat.bind(logger)
  } as Logger;
}