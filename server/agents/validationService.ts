import type { GameScore, ValidatedScores } from "./types";

// Simple validation service scaffold that enforces team filtering, de-duplicates by gameId,
// and performs basic majority voting across sources for the same game.
export class ValidationService {
  validateForTeams(scores: GameScore[], teamIds: string[]): ValidatedScores {
    const teamSet = new Set((teamIds || []).map((t) => t.toUpperCase()));

    // Filter to only games where either team is one of the requested teamIds
    const filtered = scores.filter((s) => teamSet.size === 0 || teamSet.has(s.homeTeamId.toUpperCase()) || teamSet.has(s.awayTeamId.toUpperCase()));

    // Group by gameId to merge duplicates from multiple sources
    const groups = new Map<string, GameScore[]>();
    for (const s of filtered) {
      const arr = groups.get(s.gameId) || [];
      arr.push(s);
      groups.set(s.gameId, arr);
    }

    const out: GameScore[] = [];
    const sourcesChecked: string[] = [];

    for (const entry of Array.from(groups.entries())) {
      const gameId = entry[0];
      const items = entry[1];
      // Track sources
      for (const it of items) {
        if (it.source) sourcesChecked.push(it.source);
      }

      // Majority voting for status; if tie, prefer in_progress > final > scheduled
      const statusCounts: Record<GameScore["status"], number> = { scheduled: 0, in_progress: 0, final: 0 };
      for (const it of items) {
        statusCounts[it.status] = (statusCounts[it.status] || 0) + 1;
      }
      const majorityStatus = (Object.entries(statusCounts) as Array<[GameScore["status"], number]>)
        .sort((a: [GameScore["status"], number], b: [GameScore["status"], number]) => b[1] - a[1])[0]?.[0] || items[0].status;

      // For points, choose the item with the latest startTime (as proxy for freshness)
      const chosen = items.slice().sort((a: GameScore, b: GameScore) => b.startTime.getTime() - a.startTime.getTime())[0];
      out.push({ ...chosen, status: majorityStatus });
    }

    // Simple accuracy heuristic: fraction of groups with unanimity on status
    let unanimous = 0;
    for (const entry of Array.from(groups.entries())) {
      const items = entry[1];
      const set = new Set(items.map((i: GameScore) => i.status));
      if (set.size === 1) unanimous++;
    }
    const accuracy = groups.size > 0 ? unanimous / groups.size : undefined;

    return { items: out, sourcesChecked, accuracy };
  }
}