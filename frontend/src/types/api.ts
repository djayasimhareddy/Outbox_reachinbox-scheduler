// API types matching the backend schema

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  slackConnected: boolean;
}

export interface Email {
  id: string;
  toEmail: string;
  subject: string;
  scheduledAt: string;
  sentAt?: string;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';
  error?: string;
}

export interface EmailListResponse {
  data: Email[];
  total: number;
  page: number;
  limit: number;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  emails: string[];
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  scheduled: number;
  firstAt: string;
  lastAt: string;
}
