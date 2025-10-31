import { describe, it, expect, vi, beforeEach } from "vitest";
import * as queuesMod from "../../jobs/queues";
import * as workers from "../../jobs/workers";
import * as configMod from "../../config";

describe("maintenance scheduling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(configMod, "config", "get").mockReturnValue({
      jobQueuePrefix: "test",
      liveScoresIntervalMs: 60000,
      nonliveScoresIntervalMs: 300000,
      cleanupRunAtCron: "0 3 * * *",
    } as any);
  });

  it("schedules maintenance with cron pattern and job id", async () => {
    const add = vi.fn().mockResolvedValue({ id: "maintenance:cleanup" });
    vi.spyOn(queuesMod, "queues", "get").mockReturnValue({
      maintenance: { add } as any,
    } as any);

    await workers.scheduleMaintenanceJob();

    expect(add).toHaveBeenCalledTimes(1);
    const call = add.mock.calls[0];
    expect(call[0]).toBe("cleanup");
    const opts = call[2];
    expect(opts.jobId).toBe("maintenance:cleanup");
    expect(opts.repeat.pattern).toBe("0 3 * * *");
  });
});