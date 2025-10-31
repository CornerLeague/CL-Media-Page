import { describe, it, expect, vi } from "vitest";
import * as queuesMod from "../../jobs/queues";
import * as workers from "../../jobs/workers";
import * as storageMod from "../../storage";

describe("maintenance reconcile repeatables", () => {
  it("removes obsolete repeatable jobs not in desired set", async () => {
    vi.spyOn(storageMod, "storage", "get").mockReturnValue({
      getTeamsByLeague: async (league: string) => {
        if (league === "NBA") return [{ id: "nba_bos" }, { id: "nba_lal" }];
        if (league === "NFL") return [{ id: "nfl_ne" }];
        if (league === "MLB") return [{ id: "mlb_nyy" }];
        if (league === "NHL") return [{ id: "nhl_bos" }];
        return [];
      },
    } as any);

    const getRepeatableJobs = vi.fn().mockResolvedValue([
      { id: "scores_ingest:nba_bos", key: "rep1" },
      { id: "scores_ingest:featured:NBA", key: "rep2" },
      { id: "scores_ingest:obsolete_team", key: "rep3" },
      { id: "scores_ingest:featured:SOCCER", key: "rep4" },
    ]);
    const removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(queuesMod, "queues", "get").mockReturnValue({
      scoresIngest: { getRepeatableJobs, removeRepeatableByKey } as any,
    } as any);

    const removed = await workers.reconcileRepeatableScoresJobs();
    expect(removed).toBe(2);
    expect(removeRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(removeRepeatableByKey).toHaveBeenCalledWith("rep3");
    expect(removeRepeatableByKey).toHaveBeenCalledWith("rep4");
  });
});