import { config } from '../../src/config';

describe('Configuration', () => {
  describe('config object', () => {
    it('should have all required sections', () => {
      expect(config).toHaveProperty('telegram');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('security');
      expect(config).toHaveProperty('reminders');
    });

    it('should have telegram configuration', () => {
      expect(config.telegram).toHaveProperty('token');
      expect(config.telegram).toHaveProperty('adminId');
      expect(typeof config.telegram.token).toBe('string');
    });

    it('should have database configuration', () => {
      expect(config.database).toHaveProperty('url');
      expect(typeof config.database.url).toBe('string');
    });

    it('should have server configuration', () => {
      expect(config.server).toHaveProperty('port');
      expect(typeof config.server.port).toBe('number');
      expect(config.server.port).toBeGreaterThan(0);
    });

    it('should have security configuration', () => {
      expect(config.security).toHaveProperty('alertKeywords');
      expect(config.security).toHaveProperty('psychologistEmail');
      expect(config.security).toHaveProperty('adminPassword');
      
      expect(Array.isArray(config.security.alertKeywords)).toBe(true);
      expect(config.security.alertKeywords.length).toBeGreaterThan(0);
    });

    it('should have reminder times configuration', () => {
      expect(config.reminders).toHaveProperty('morning');
      expect(config.reminders).toHaveProperty('afternoon');
      expect(config.reminders).toHaveProperty('evening');
      
      // Check time format (HH:MM)
      expect(config.reminders.morning).toMatch(/^\d{2}:\d{2}$/);
      expect(config.reminders.afternoon).toMatch(/^\d{2}:\d{2}$/);
      expect(config.reminders.evening).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('alert keywords', () => {
    it('should contain keywords array', () => {
      const keywords = config.security.alertKeywords;
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(0);
    });

    it('should be in lowercase for consistency', () => {
      const keywords = config.security.alertKeywords;
      keywords.forEach(keyword => {
        expect(keyword).toBe(keyword.toLowerCase());
      });
    });
  });
});