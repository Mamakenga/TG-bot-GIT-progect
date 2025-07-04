// Базовые типы для телеграм-бота заботы о себе

export interface User {
  id: number;
  telegram_id: number;
  name: string | null;
  current_day: number;
  personalization_type: string | null;
  notifications_enabled: boolean;
  preferred_time: string;
  course_completed: boolean;
  is_paused?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Response {
  id: number;
  user_id: number;
  day: number;
  question_type: string;
  response_text: string;
  response_type: 'text' | 'button' | 'emoji';
  created_at: Date;
}

export interface Alert {
  id: number;
  user_id: number;
  trigger_word: string;
  message: string;
  handled: boolean;
  created_at: Date;
}

export interface Stats {
  totalUsers: number;
  activeToday: number;
  completedCourse: number;
}

export interface CourseOption {
  text: string;
  callback_data: string;
  response: string;
}

export interface CourseDay {
  day: number;
  title: string;
  morningMessage: string;
  exerciseMessage: string;
  phraseOfDay: string;
  eveningMessage: string;
  options?: CourseOption[];
}

export type ReminderType = 'morning' | 'exercise' | 'phrase' | 'evening';
export type PersonalizationType = 'critical' | 'trying' | 'normal' | 'unsure';