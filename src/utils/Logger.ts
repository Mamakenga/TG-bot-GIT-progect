export class Logger {
  static info(message: string): void {
    console.log(`📋 ${new Date().toISOString()} [INFO] ${message}`);
  }

  static error(message: string, error?: any): void {
    console.error(`❌ ${new Date().toISOString()} [ERROR] ${message}`);
    if (error) {
      console.error('Детали ошибки:', error);
    }
  }

  static success(message: string): void {
    console.log(`✅ ${new Date().toISOString()} [SUCCESS] ${message}`);
  }

  static warn(message: string): void {
    console.warn(`⚠️ ${new Date().toISOString()} [WARN] ${message}`);
  }
}

export const logger = Logger;
