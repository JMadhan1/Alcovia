import { AppDB } from '../db/database';

export function grantReward(db: AppDB, sessionId: string, studentId: string): void {
  const session = db.getSession(sessionId);
  if (!session || session.reward_granted === 1) return;

  const state = db.getStudentState(studentId);
  if (!state) return;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let newStreak = state.streak_days;
  if (state.last_focus_date === yesterday) {
    newStreak += 1;
  } else if (state.last_focus_date !== today) {
    newStreak = 1;
  }

  const newCoins = state.coins + 50;
  const newMinutes = state.last_focus_date === today
    ? state.focus_minutes_today + session.target_minutes
    : session.target_minutes;

  db.upsertStudentState({ ...state, coins: newCoins, streak_days: newStreak, focus_minutes_today: newMinutes, last_focus_date: today });
  db.updateSessionRewardGranted(sessionId);
}
