import type { Game, Team } from '@shared/schema';
import type { 
  UserTeamScoreUpdate, 
  UserTeamStatusChange 
} from '../../types/websocket';

type GameStatus = Game['status'];

export function flipGameState(
  game: Game,
  nextStatus: GameStatus,
  opts?: { period?: string | null; timeRemaining?: string | null }
): Game {
  const prev = game.status;
  const period = opts?.period === undefined ? game.period : opts?.period ?? null;
  const timeRemaining =
    opts?.timeRemaining === undefined ? game.timeRemaining : opts?.timeRemaining ?? null;

  return {
    ...game,
    status: nextStatus,
    period,
    timeRemaining,
    cachedAt: new Date(),
  };
}

export function simulateScoreTick(
  game: Game,
  change: { homeDelta?: number; awayDelta?: number },
  opts?: { period?: string; timeRemaining?: string }
): Game {
  const homeDelta = change.homeDelta ?? 0;
  const awayDelta = change.awayDelta ?? 0;

  return {
    ...game,
    homePts: (game.homePts ?? 0) + homeDelta,
    awayPts: (game.awayPts ?? 0) + awayDelta,
    status: game.status === 'scheduled' ? 'in_progress' : game.status,
    period: opts?.period ?? game.period ?? null,
    timeRemaining: opts?.timeRemaining ?? game.timeRemaining ?? null,
    cachedAt: new Date(),
  };
}

export function makeScoreUpdate(
  userId: string,
  team: Team,
  game: Game,
  isUserTeam: boolean = true
): UserTeamScoreUpdate {
  const isHome = game.homeTeamId === team.id;
  const homeName = team.name;
  const awayName = isHome ? team.name : team.name; // Placeholder: consumer can override names if needed

  return {
    type: 'user-team-score-update',
    payload: {
      userId,
      teamId: team.id,
      teamName: team.name,
      sport: team.league,
      gameData: {
        gameId: game.id,
        homeTeam: game.homeTeamId,
        awayTeam: game.awayTeamId,
        homeScore: game.homePts ?? 0,
        awayScore: game.awayPts ?? 0,
        status: game.status,
        quarter: game.period ?? undefined,
        timeRemaining: game.timeRemaining ?? undefined,
      },
      timestamp: new Date().toISOString(),
      isUserTeam,
    },
  };
}

export function makeStatusChange(
  userId: string,
  teamId: string,
  gameId: string,
  oldStatus: string,
  newStatus: string
): UserTeamStatusChange {
  return {
    type: 'user-team-status-change',
    payload: {
      userId,
      teamId,
      gameId,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    },
  };
}

export function applyScoreChangeWithEvents(
  userId: string,
  team: Team,
  game: Game,
  change: { homeDelta?: number; awayDelta?: number },
  opts?: { period?: string; timeRemaining?: string }
): { updated: Game; scoreUpdate: UserTeamScoreUpdate } {
  const updated = simulateScoreTick(game, change, opts);
  const scoreUpdate = makeScoreUpdate(userId, team, updated, true);
  return { updated, scoreUpdate };
}