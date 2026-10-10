import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

export const streakRouter = Router();

streakRouter.use(authenticateToken);
streakRouter.use(requireRole(['STUDENT']));

function getStudentId(req: AuthenticatedRequest): string {
  if (!req.user?.studentId) {
    throw new Error('Student profile not associated with this account');
  }
  return req.user.studentId;
}

// 1. Get Streak Journey Overview
streakRouter.get('/overview', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = getStudentId(req);

    // Find or create StreakData
    let streak = await prisma.streakData.findUnique({
      where: { studentId },
    });

    if (!streak) {
      streak = await prisma.streakData.create({
        data: {
          studentId,
          currentStreak: 1,
          longestStreak: 1,
          lastCheckInDate: new Date(),
          weeklyGoalMinutes: 120,
          rewardPoints: 20,
          totalMinutesStudied: 45,
        },
      });
    }

    // Milestones
    const milestones = await prisma.streakMilestone.findMany({
      where: { studentId },
      orderBy: { unlockedAt: 'asc' },
    });

    // Recent study sessions (past 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const studySessions = await prisma.studySession.findMany({
      where: {
        studentId,
        sessionDate: { gte: thirtyDaysAgo },
      },
      include: { subject: true },
      orderBy: { sessionDate: 'desc' },
    });

    // Check if student checked in today
    const now = new Date();
    const todayString = now.toISOString().split('T')[0];
    const lastCheckInString = streak.lastCheckInDate
      ? streak.lastCheckInDate.toISOString().split('T')[0]
      : null;
    const checkedInToday = todayString === lastCheckInString;

    // Checkpoints on the Journey Map
    const journeyCheckpoints = [
      {
        id: 'cp-1',
        day: 1,
        title: 'First Step',
        description: 'Began the learning journey',
        achieved: streak.longestStreak >= 1,
        current: streak.currentStreak === 1,
        badge: 'FIRST_STEP',
      },
      {
        id: 'cp-2',
        day: 3,
        title: '3-Day Explorer',
        description: 'Building routine momentum',
        achieved: streak.longestStreak >= 3,
        current: streak.currentStreak >= 2 && streak.currentStreak <= 4,
        badge: 'THREE_DAY_EXPLORER',
      },
      {
        id: 'cp-3',
        day: 7,
        title: '7-Day Builder',
        description: 'One full week of consistent study',
        achieved: streak.longestStreak >= 7,
        current: streak.currentStreak >= 5 && streak.currentStreak <= 8,
        badge: 'SEVEN_DAY_BUILDER',
      },
      {
        id: 'cp-4',
        day: 14,
        title: 'Consistency Champion',
        description: 'Two weeks of sustained habit formation',
        achieved: streak.longestStreak >= 14,
        current: streak.currentStreak >= 9 && streak.currentStreak <= 15,
        badge: 'CONSISTENCY_CHAMPION',
      },
      {
        id: 'cp-5',
        day: 30,
        title: 'Master of Consistency',
        description: 'A month of dedication and growth',
        achieved: streak.longestStreak >= 30,
        current: streak.currentStreak >= 16,
        badge: 'MASTER_OF_CONSISTENCY',
      },
    ];

    // Compute weekly progress (minutes this week)
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weekSessions = studySessions.filter((s) => s.sessionDate >= startOfWeek);
    const minutesThisWeek = weekSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

    // Next small recommended action
    const nextSmallAction = {
      title: 'Quick 15-Minute Topic Practice',
      description: 'Spend 15 focused minutes reviewing one challenging concept or practice problem.',
      estimatedMinutes: 15,
    };

    res.json({
      success: true,
      data: {
        streak: {
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastCheckInDate: streak.lastCheckInDate,
          weeklyGoalMinutes: streak.weeklyGoalMinutes,
          rewardPoints: streak.rewardPoints,
          totalMinutesStudied: streak.totalMinutesStudied,
          remindersPaused: streak.remindersPaused,
          checkedInToday,
          minutesThisWeek,
          goalProgressPercent: Math.min(
            100,
            Math.round((minutesThisWeek / Math.max(1, streak.weeklyGoalMinutes)) * 100)
          ),
        },
        milestones,
        journeyCheckpoints,
        nextSmallAction,
        recentSessions: studySessions.slice(0, 10).map((s) => ({
          id: s.id,
          date: s.sessionDate.toISOString().split('T')[0],
          durationMinutes: s.durationMinutes,
          activityType: s.activityType,
          topic: s.topic,
          subjectName: s.subject?.name || 'General Study',
          notes: s.notes,
        })),
        calendarHeatmap: studySessions.map((s) => ({
          date: s.sessionDate.toISOString().split('T')[0],
          durationMinutes: s.durationMinutes,
          activityType: s.activityType,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error fetching streak data' });
  }
});

// 2. Daily Study Check-in
streakRouter.post('/check-in', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = getStudentId(req);

    let streak = await prisma.streakData.findUnique({ where: { studentId } });
    if (!streak) {
      streak = await prisma.streakData.create({
        data: {
          studentId,
          currentStreak: 0,
          longestStreak: 0,
          rewardPoints: 0,
          totalMinutesStudied: 0,
        },
      });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const lastCheckInStr = streak.lastCheckInDate
      ? streak.lastCheckInDate.toISOString().split('T')[0]
      : null;

    if (todayStr === lastCheckInStr) {
      res.json({
        success: true,
        message: "You've already checked in for today, bro! Great consistency.",
        alreadyCheckedIn: true,
        streak,
        data: { streak },
      });
      return;
    }

    // Determine streak increment or recovery
    let newCurrentStreak = 1;
    let unlockedMilestones: string[] = [];
    let isComeback = false;

    if (streak.lastCheckInDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastCheckInStr === yesterdayStr) {
        newCurrentStreak = streak.currentStreak + 1;
      } else {
        // Missed one or more days - friendly recovery path!
        newCurrentStreak = 1;
        isComeback = true;
      }
    }

    const newLongest = Math.max(streak.longestStreak, newCurrentStreak);
    const newPoints = streak.rewardPoints + 15;

    // Update streak
    const updated = await prisma.streakData.update({
      where: { studentId },
      data: {
        currentStreak: newCurrentStreak,
        longestStreak: newLongest,
        lastCheckInDate: now,
        rewardPoints: newPoints,
      },
    });

    // Milestone evaluations
    const awardMilestone = async (key: string, title: string, description: string) => {
      try {
        const existing = await prisma.streakMilestone.findUnique({
          where: {
            studentId_milestoneKey: { studentId, milestoneKey: key },
          },
        });
        if (!existing) {
          await prisma.streakMilestone.create({
            data: { studentId, milestoneKey: key, title, description },
          });
          unlockedMilestones.push(title);
        }
      } catch (e) {
        // Handled cleanly
      }
    };

    if (newCurrentStreak >= 1) {
      await awardMilestone('FIRST_STEP', 'First Step', 'Initiated your dedicated learning journey.');
    }
    if (newCurrentStreak >= 3) {
      await awardMilestone('THREE_DAY_EXPLORER', '3-Day Explorer', 'Checked in 3 consecutive study days.');
    }
    if (newCurrentStreak >= 7) {
      await awardMilestone('SEVEN_DAY_BUILDER', '7-Day Builder', 'Full week of consistent academic effort.');
    }
    if (newCurrentStreak >= 14) {
      await awardMilestone('CONSISTENCY_CHAMPION', 'Consistency Champion', 'Maintained a 14-day study habit.');
    }
    if (isComeback) {
      await awardMilestone('COMEBACK_HERO', 'Comeback Hero', 'Returned smoothly to study after a break without giving up.');
    }

    res.json({
      success: true,
      message: isComeback
        ? 'Welcome back, bro! Every fresh start counts. Check-in recorded.'
        : `Awesome job! You're on a ${newCurrentStreak}-day streak! 🔥`,
      streak: updated,
      data: { streak: updated },
      unlockedMilestones,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error processing check-in' });
  }
});

// 3. Log a Study Session
const logSessionSchema = z.object({
  durationMinutes: z.number().min(5).max(480),
  subjectId: z.string().optional(),
  activityType: z.enum([
    'REVISE_TOPIC',
    'SOLVE_QUESTIONS',
    'REVIEW_MISTAKES',
    'CLASS_ATTENDANCE',
    'ASSIGNMENT',
  ]),
  topic: z.string().optional(),
  notes: z.string().optional(),
});

streakRouter.post('/session', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = getStudentId(req);
    const parsed = logSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.errors });
      return;
    }

    const { durationMinutes, subjectId, activityType, topic, notes } = parsed.data;

    // Create session record
    const session = await prisma.studySession.create({
      data: {
        studentId,
        subjectId: subjectId || null,
        durationMinutes,
        activityType,
        topic: topic || null,
        notes: notes || null,
        sessionDate: new Date(),
      },
    });

    // Update streak data & total minutes
    let streak = await prisma.streakData.findUnique({ where: { studentId } });
    if (!streak) {
      streak = await prisma.streakData.create({
        data: { studentId, currentStreak: 1, longestStreak: 1 },
      });
    }

    const pointsEarned = Math.round(durationMinutes / 3);

    const updatedStreak = await prisma.streakData.update({
      where: { studentId },
      data: {
        totalMinutesStudied: streak.totalMinutesStudied + durationMinutes,
        rewardPoints: streak.rewardPoints + pointsEarned,
        lastCheckInDate: new Date(),
        currentStreak: streak.currentStreak === 0 ? 1 : streak.currentStreak,
      },
    });

    res.status(201).json({
      success: true,
      message: `Great focus! Logged ${durationMinutes} minutes of ${activityType.replace('_', ' ').toLowerCase()}. (+${pointsEarned} points)`,
      data: session,
      streak: updatedStreak,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error logging session' });
  }
});

// 4. Update Weekly Study Goal or Preferences
streakRouter.patch('/goal', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = getStudentId(req);
    const { weeklyGoalMinutes, remindersPaused } = req.body;

    const updated = await prisma.streakData.update({
      where: { studentId },
      data: {
        weeklyGoalMinutes: typeof weeklyGoalMinutes === 'number' ? weeklyGoalMinutes : undefined,
        remindersPaused: typeof remindersPaused === 'boolean' ? remindersPaused : undefined,
      },
    });

    res.json({
      success: true,
      message: 'Weekly study goal and preference updated successfully.',
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error updating goal' });
  }
});
