export interface JournalEntry {
  date: string;
  text: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  currentDay: number;
  courseCompleted: boolean;
  journals: JournalEntry[];
  sentimentHistory: { day: number; score: number }[];
}

export interface CourseOption {
  text: string;
  response: string;
}

export interface CourseDay {
  day: number;
  title: string;
  baseContent: string;
  options?: CourseOption[];
}
