export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

class ConsoleLogger implements Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = "", level: LogLevel = "info") {
    this.prefix = prefix;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error", "silent"];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);

    return currentLevelIndex <= messageLevelIndex && this.level !== "silent";
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.log(`${this.prefix}${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog("info")) {
      console.log(`${this.prefix}${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog("warn")) {
      console.warn(`${this.prefix}${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error(`${this.prefix}${message}`, ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Factory function para crear loggers
export function createLogger(prefix: string = "", level?: LogLevel): Logger {
  const logLevel = level ||
    (process.env['NODE_ENV'] === "test" ? "silent" : "info") ||
    (process.env['LOG_LEVEL'] as LogLevel) ||
    "info";

  return new ConsoleLogger(prefix, logLevel);
}

// Logger global para uso directo
export const logger = createLogger("[App] "); 