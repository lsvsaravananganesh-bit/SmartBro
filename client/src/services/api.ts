import { User, StudentDashboardData, SubjectSummary, StreakOverviewData, AiChatMessageItem } from '../types';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('smartbro_token') || localStorage.getItem('eduwatch_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.message || `Request failed with status ${response.status}`,
      data
    );
  }

  return data;
}

export const api = {
  // Auth
  auth: {
    login: (credentials: { email: string; password: string; role?: string }) =>
      request<{ success: boolean; token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    signup: (data: { fullName: string; email: string; password: string; role?: string }) =>
      request<{ success: boolean; token: string; user: User }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ success: boolean }>('/auth/logout', {
        method: 'POST',
      }),
    me: () =>
      request<{ success: boolean; user: User }>('/auth/me'),
    forgotPassword: (email: string) =>
      request<{ success: boolean; message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },

  // Student
  student: {
    getDashboard: () =>
      request<{ success: boolean; data: StudentDashboardData }>('/student/dashboard'),
    getSubjects: () =>
      request<{ success: boolean; data: SubjectSummary[] }>('/student/subjects'),
    getSubjectPerformance: (subjectId: string) =>
      request<{ success: boolean; data: any }>(`/student/subjects/${subjectId}/performance`),
    getAttendance: () =>
      request<{ success: boolean; data: any }>('/student/attendance'),
    getProfile: () =>
      request<{ success: boolean; data: any }>('/student/profile'),
  },

  // Streak Journey (SmartBro signature feature)
  streak: {
    getOverview: () =>
      request<{ success: boolean; data: StreakOverviewData }>('/streak/overview'),
    checkIn: () =>
      request<{
        success: boolean;
        message: string;
        alreadyCheckedIn?: boolean;
        streak: any;
        unlockedMilestones?: string[];
      }>('/streak/check-in', {
        method: 'POST',
      }),
    logSession: (session: {
      durationMinutes: number;
      subjectId?: string;
      activityType: string;
      topic?: string;
      notes?: string;
    }) =>
      request<{ success: boolean; message: string; data: any; streak: any }>('/streak/session', {
        method: 'POST',
        body: JSON.stringify(session),
      }),
    updateGoal: (goal: { weeklyGoalMinutes?: number; remindersPaused?: boolean }) =>
      request<{ success: boolean; message: string; data: any }>('/streak/goal', {
        method: 'PATCH',
        body: JSON.stringify(goal),
      }),
  },

  // SmartBro AI Companion
  ai: {
    chat: (message: string) =>
      request<{
        success: boolean;
        message: string;
        suggestedActions: string[];
        replyId: string;
        timestamp: string;
      }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    getHistory: () =>
      request<{ success: boolean; data: AiChatMessageItem[] }>('/ai/history'),
    generatePlan: (availableHoursPerWeek: number) =>
      request<{ success: boolean; data: any }>('/ai/generate-plan', {
        method: 'POST',
        body: JSON.stringify({ availableHoursPerWeek }),
      }),
  },

  // Subject Teacher
  subjectTeacher: {
    getDashboard: () =>
      request<{ success: boolean; data: any }>('/subject-teacher/dashboard'),
    getAssignments: () =>
      request<{ success: boolean; data: any[] }>('/subject-teacher/assignments'),
    getStudents: (classId: string, subjectId: string) =>
      request<{ success: boolean; data: any[] }>(
        `/subject-teacher/classes/${classId}/subjects/${subjectId}/students`
      ),
    getStudentSubjectProfile: (studentId: string, subjectId: string) =>
      request<{ success: boolean; data: any }>(
        `/subject-teacher/students/${studentId}/subjects/${subjectId}`
      ),
    createAssessment: (payload: any) =>
      request<{ success: boolean; data: any }>('/subject-teacher/assessments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getAssessment: (assessmentId: string) =>
      request<{ success: boolean; data: any }>(`/subject-teacher/assessments/${assessmentId}`),
    enterMarks: (assessmentId: string, results: any[]) =>
      request<{ success: boolean; message: string }>(
        `/subject-teacher/assessments/${assessmentId}/results`,
        {
          method: 'POST',
          body: JSON.stringify({ results }),
        }
      ),
    addFeedback: (studentId: string, payload: any) =>
      request<{ success: boolean; data: any }>(
        `/subject-teacher/students/${studentId}/feedback`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    createImprovementPlan: (studentId: string, payload: any) =>
      request<{ success: boolean; data: any }>(
        `/subject-teacher/students/${studentId}/improvement-plans`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    updateTaskStatus: (planId: string, taskId: string, status: string) =>
      request<{ success: boolean; data: any }>(
        `/subject-teacher/improvement-plans/${planId}/tasks/${taskId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }
      ),
  },

  // Class Teacher
  classTeacher: {
    getDashboard: () =>
      request<{ success: boolean; data: any }>('/class-teacher/dashboard'),
    getClasses: () =>
      request<{ success: boolean; data: any[] }>('/class-teacher/classes'),
    getClassStudents: (classId: string) =>
      request<{ success: boolean; data: any[] }>(`/class-teacher/classes/${classId}/students`),
    getSubjectAnalysis: (classId: string) =>
      request<{ success: boolean; data: any }>(
        `/class-teacher/classes/${classId}/subject-analysis`
      ),
    getStudentDetail: (studentId: string) =>
      request<{ success: boolean; data: any }>(`/class-teacher/students/${studentId}`),
    createIntervention: (payload: any) =>
      request<{ success: boolean; data: any }>('/class-teacher/interventions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateIntervention: (interventionId: string, payload: any) =>
      request<{ success: boolean; data: any }>(
        `/class-teacher/interventions/${interventionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      ),
    addInterventionNote: (interventionId: string, note: string) =>
      request<{ success: boolean; data: any }>(
        `/class-teacher/interventions/${interventionId}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ note }),
        }
      ),
    getInterventions: (params?: { classId?: string; status?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return request<{ success: boolean; data: any[] }>(
        `/class-teacher/interventions${query ? `?${query}` : ''}`
      );
    },
  },

  // Admin Portal & Dataset Ingestion
  admin: {
    getStats: () =>
      request<{ success: boolean; data: any }>('/admin/stats'),
    getUsers: () =>
      request<{ success: boolean; data: any[] }>('/admin/users'),
    toggleUserStatus: (userId: string, isActive: boolean) =>
      request<{ success: boolean; data: any }>(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    getThresholds: () =>
      request<{ success: boolean; data: any }>('/admin/config/thresholds'),
    updateThresholds: (thresholds: any) =>
      request<{ success: boolean; message: string }>('/admin/config/thresholds', {
        method: 'PATCH',
        body: JSON.stringify(thresholds),
      }),
    previewDataset: (csvData: string, fileName?: string) =>
      request<{ success: boolean; data: any }>('/admin/datasets/preview', {
        method: 'POST',
        body: JSON.stringify({ csvData, fileName }),
      }),
    importDataset: (payload: any) =>
      request<{ success: boolean; message: string; data: any }>('/admin/datasets/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listDatasets: () =>
      request<{ success: boolean; data: any[] }>('/admin/datasets'),
    exportStudentsUrl: '/api/admin/datasets/export/students',
    exportInterventionsUrl: '/api/admin/datasets/export/interventions',
  },

  // Notifications
  notifications: {
    getAll: () =>
      request<{ success: boolean; data: any[] }>('/notifications'),
    markRead: (id: string) =>
      request<{ success: boolean; data: any }>(`/notifications/${id}/read`, {
        method: 'PATCH',
      }),
  },
};
