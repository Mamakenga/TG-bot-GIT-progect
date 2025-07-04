import { getDayContent, courseContent } from '../../src/course-logic';

describe('Course Logic', () => {
  describe('courseContent', () => {
    it('should have 7 days of content', () => {
      expect(courseContent).toHaveLength(7);
    });

    it('should have all required fields for each day', () => {
      courseContent.forEach((day, index) => {
        expect(day).toHaveProperty('day', index + 1);
        expect(day).toHaveProperty('title');
        expect(day).toHaveProperty('morningMessage');
        expect(day).toHaveProperty('exerciseMessage');
        expect(day).toHaveProperty('phraseOfDay');
        expect(day).toHaveProperty('eveningMessage');
        
        expect(typeof day.title).toBe('string');
        expect(day.title.length).toBeGreaterThan(0);
        expect(typeof day.morningMessage).toBe('string');
        expect(day.morningMessage.length).toBeGreaterThan(0);
      });
    });

    it('should have unique titles for each day', () => {
      const titles = courseContent.map(day => day.title);
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(titles.length);
    });
  });

  describe('getDayContent', () => {
    it('should return content for valid days', () => {
      for (let day = 1; day <= 7; day++) {
        const content = getDayContent(day);
        expect(content).toBeDefined();
        expect(content?.day).toBe(day);
      }
    });

    it('should return null for invalid days', () => {
      expect(getDayContent(0)).toBeNull();
      expect(getDayContent(8)).toBeNull();
      expect(getDayContent(-1)).toBeNull();
      expect(getDayContent(100)).toBeNull();
    });

    it('should return consistent content', () => {
      const day1First = getDayContent(1);
      const day1Second = getDayContent(1);
      expect(day1First).toEqual(day1Second);
    });
  });

  describe('Day Content Structure', () => {
    it('day 1 should be about pain awareness', () => {
      const day1 = getDayContent(1);
      expect(day1?.title).toContain('боли');
    });

    it('day 7 should be about gratitude', () => {
      const day7 = getDayContent(7);
      expect(day7?.title.toLowerCase()).toContain('благодарност');
    });

    it('should have evening options for reflection days', () => {
      const day3 = getDayContent(3);
      expect(day3?.options).toBeDefined();
      expect(day3?.options?.length).toBeGreaterThan(0);
    });
  });
});