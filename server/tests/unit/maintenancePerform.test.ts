import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as queuesMod from "../../jobs/queues";
import * as workers from "../../jobs/workers";
import * as storageMod from "../../storage";

describe("maintenance performMaintenance", () => {
  let cleanMock: any;
  let fakeClient: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanMock = vi.fn().mockImplementation((_grace: number, _limit: number, type: string) => {
      if (type === "completed") return Promise.resolve(["c1", "c2"]);
      if (type === "failed") return Promise.resolve(["f1"]);
      return Promise.resolve([]);
    });

    const getRepeatableJobs = vi.fn().mockResolvedValue([
      { id: "scores_ingest:nba_bos", key: "rep1" },
      { id: "scores_ingest:featured:NBA", key: "rep2" },
      { id: "scores_ingest:obsolete_team", key: "rep3" },
      { id: "scores_ingest:featured:SOCCER", key: "rep4" },
    ]);
    const removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(queuesMod, "queues", "get").mockReturnValue({
      scoresIngest: { clean: cleanMock, getRepeatableJobs, removeRepeatableByKey } as any,
    } as any);

    vi.spyOn(storageMod, "storage", "get").mockReturnValue({
      getTeamsByLeague: async (league: string) => {
        if (league === "NBA") return [{ id: "nba_bos" }, { id: "nba_lal" }];
        if (league === "NFL") return [{ id: "nfl_ne" }];
        if (league === "MLB") return [{ id: "mlb_nyy" }];
        if (league === "NHL") return [{ id: "nhl_bos" }];
        return [];
      },
    } as any);

    // Fake Redis client with scan/del to simulate key deletion
    fakeClient = {
      scan: vi.fn().mockImplementation(async (_cursor: string, _matchKw: string, pattern: string, _countKw: string, _count: number) => {
        if (pattern === "scores:teams:*") {
          return ["0", ["scores:teams:NBA_LAL", "scores:teams:NBA_BOS"]];
        }
        if (pattern === "scores:sport:*:featured") {
          return ["0", ["scores:sport:NBA:featured", "scores:sport:NFL:featured", "scores:sport:MLB:featured"]];
        }
        return ["0", []];
      }),
      del: vi.fn().mockImplementation(async (...keys: string[]) => keys.length),
    };

    // Allow real reconcile logic with mocked queues/storage
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cleans old jobs, reconciles repeatables, and deletes scores caches", async () => {
    const summary = await workers.performMaintenance(fakeClient);
    // cleanedJobs: 2 completed + 1 failed
    expect(summary.cleanedJobs).toBe(3);
    // removedRepeatables: mocked to 2
    expect(summary.removedRepeatables).toBe(2);
    // deletedCacheKeys: 2 team keys + 3 featured keys
    expect(summary.deletedCacheKeys).toBe(5);

    // Validate that clean was called for completed and failed
    expect(cleanMock).toHaveBeenCalledTimes(2);
    const types = cleanMock.mock.calls.map(([, , t]: any[]) => t).sort();
    expect(types).toEqual(["completed", "failed"]);

    // Validate Redis deletion calls observed
    expect(fakeClient.del).toHaveBeenCalledTimes(2);
    const delCalls = fakeClient.del.mock.calls;
    // One call for team keys, one for featured keys
    expect(delCalls[0]).toEqual(["scores:teams:NBA_LAL", "scores:teams:NBA_BOS"]);
    expect(delCalls[1]).toEqual(["scores:sport:NBA:featured", "scores:sport:NFL:featured", "scores:sport:MLB:featured"]);
  });
});