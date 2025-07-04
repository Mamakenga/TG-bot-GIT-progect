import { 
  checkForAlerts, 
  validateText, 
  randomChoice, 
  formatTime, 
  truncateText,
  isValidTelegramId,
  stripHtml,
  safeJsonParse
} from '../../src/utils';

describe('Utils Functions', () => {
  describe('checkForAlerts', () => {
    beforeEach(() => {
      // Mock config for tests
      jest.doMock('../../src/config', () => ({
        config: {
          security: {
            alertKeywords: ['суицид', 'не хочу жить', 'покончить с собой']
          }
        }
      }));
    });

    it('should return null for empty text', () => {
      expect(checkForAlerts('')).toBeNull();
      expect(checkForAlerts(null as any)).toBeNull();
    });

    it('should detect alert keywords from test env', () => {
      expect(checkForAlerts('это тест сообщение')).toBe('тест');
      expect(checkForAlerts('ПРОВЕРКА системы')).toBe('проверка');
    });

    it('should return null for safe text', () => {
      expect(checkForAlerts('привет как дела')).toBeNull();
      expect(checkForAlerts('сегодня хорошая погода')).toBeNull();
    });
  });

  describe('validateText', () => {
    it('should validate correct text', () => {
      expect(validateText('hello')).toBe(true);
      expect(validateText('a'.repeat(100))).toBe(true);
    });

    it('should reject invalid text', () => {
      expect(validateText('')).toBe(false);
      expect(validateText(null as any)).toBe(false);
      expect(validateText('a'.repeat(5000))).toBe(false);
      expect(validateText(123 as any)).toBe(false);
    });
  });

  describe('randomChoice', () => {
    it('should return element from array', () => {
      const array = ['a', 'b', 'c'];
      const result = randomChoice(array);
      expect(array).toContain(result);
    });

    it('should work with single element', () => {
      const array = ['only'];
      expect(randomChoice(array)).toBe('only');
    });
  });

  describe('formatTime', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-01-15T10:30:00');
      const formatted = formatTime(date);
      expect(formatted).toMatch(/15\.01\.2024/);
      expect(formatted).toMatch(/10:30/);
    });
  });

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const longText = 'a'.repeat(100);
      const result = truncateText(longText, 10);
      expect(result).toBe('aaaaaaa...');
      expect(result.length).toBe(10);
    });

    it('should not truncate short text', () => {
      const shortText = 'hello';
      expect(truncateText(shortText, 10)).toBe('hello');
    });
  });

  describe('isValidTelegramId', () => {
    it('should validate correct Telegram IDs', () => {
      expect(isValidTelegramId(123456789)).toBe(true);
      expect(isValidTelegramId(1)).toBe(true);
    });

    it('should reject invalid Telegram IDs', () => {
      expect(isValidTelegramId(0)).toBe(false);
      expect(isValidTelegramId(-1)).toBe(false);
      expect(isValidTelegramId(1.5)).toBe(false);
      expect(isValidTelegramId(NaN)).toBe(false);
    });
  });

  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<b>hello</b>')).toBe('hello');
      expect(stripHtml('<div><p>text</p></div>')).toBe('text');
      expect(stripHtml('no tags')).toBe('no tags');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const json = '{"name": "test"}';
      const result = safeJsonParse(json, {});
      expect(result).toEqual({ name: 'test' });
    });

    it('should return fallback for invalid JSON', () => {
      const fallback = { error: true };
      const result = safeJsonParse('invalid json', fallback);
      expect(result).toBe(fallback);
    });
  });
});
