export const SESSION_COOKIE = "clashiq_session";
export const CSRF_COOKIE = "clashiq_csrf";

export const realtimeChannels = {
  room: (roomId: string) => `room:${roomId}`,
  team: (teamId: string) => `team:${teamId}`,
  host: (roomId: string) => `host:${roomId}`,
};

export const RealtimeEvent = {
  ROOM_UPDATED: "ROOM_UPDATED",
  ACTIVITY_STARTED: "ACTIVITY_STARTED",
  ACTIVITY_PAUSED: "ACTIVITY_PAUSED",
  ACTIVITY_RESUMED: "ACTIVITY_RESUMED",
  ACTIVITY_LOCKED: "ACTIVITY_LOCKED",
  ACTIVITY_ENDED: "ACTIVITY_ENDED",
  TIMER_UPDATED: "TIMER_UPDATED",
  LEADERBOARD_UPDATED: "LEADERBOARD_UPDATED",
  SUBMISSION_RESULT: "SUBMISSION_RESULT",
  POWER_SHOP_OPENED: "POWER_SHOP_OPENED",
  POWER_SHOP_CLOSED: "POWER_SHOP_CLOSED",
  POWER_CARD_PURCHASED: "POWER_CARD_PURCHASED",
  POWER_SHOP_SOLD_OUT: "POWER_SHOP_SOLD_OUT",
  CHALLENGE_STARTED: "CHALLENGE_STARTED",
  CHALLENGE_FINISHED: "CHALLENGE_FINISHED",
  PROCTORING_STATUS_CHANGED: "PROCTORING_STATUS_CHANGED",
  QUESTION_CHANGED: "QUESTION_CHANGED",
  TEAM_UPDATED: "TEAM_UPDATED",
} as const;

export type RealtimeEventName = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export type RealtimeEnvelope = {
  event: RealtimeEventName | string;
  roomId: string;
  at: string;
  data: unknown;
};

export const AVATAR_STYLES = ["cyber", "arcade", "pixel", "futuristic", "robot", "tech"] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export type AvatarConfig = {
  style: AvatarStyle;
  hue: number;
  visor: number;
  crest: number;
  mark: number;
};
