export interface User {
  id: number;
  telegram_id: number;
  name?: string;
  current_day: number;  // Исправлено: используем current_day как в базе
  personalization_type?: string;
  notifications_enabled: boolean;
  preferred_time: string;
  course_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CourseDay {
  day: number;
  title: string;
  baseContent: string;
  options?: CourseOption[];
  followUp?: string;
}

export interface CourseOption {
  text: string;
  response: string;
  callback?: string;
}

export interface AlertResponse {
  trigger_word: string;
  message: string;
  handled: boolean;
  created_at: Date;
}