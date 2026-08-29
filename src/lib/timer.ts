export function remainingMs(
  activity: {
    status: string;
    durationMs: number;
    startedAt: Date | null;
    pausedAt: Date | null;
    extraMs: number;
    endsAt: Date | null;
  },
  now = Date.now(),
): number {
  if (activity.status === "ENDED") return 0;
  if (!activity.startedAt) return activity.durationMs + activity.extraMs;
  if (activity.status === "PAUSED" && activity.pausedAt) {
    const elapsed = activity.pausedAt.getTime() - activity.startedAt.getTime();
    return Math.max(0, activity.durationMs + activity.extraMs - elapsed);
  }
  if (activity.endsAt) {
    return Math.max(0, activity.endsAt.getTime() - now);
  }
  const elapsed = now - activity.startedAt.getTime();
  return Math.max(0, activity.durationMs + activity.extraMs - elapsed);
}

export function computeEndsAt(startedAt: Date, durationMs: number, extraMs: number, pausedTotalMs = 0) {
  return new Date(startedAt.getTime() + durationMs + extraMs + pausedTotalMs);
}
