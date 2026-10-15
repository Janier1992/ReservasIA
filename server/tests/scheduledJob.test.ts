import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsforgeMock, type TableResponse } from "./helpers/insforgeMock.js";

let insforgeMockInstance = createInsforgeMock({});

vi.mock("../src/lib/insforge.js", () => ({
  get insforgeAdmin() {
    return insforgeMockInstance;
  }
}));

const { createScheduledJob } = await import("../src/lib/scheduledJob.js");

function useLease(response: TableResponse) {
  insforgeMockInstance = createInsforgeMock({}, { acquire_scheduler_lease: response });
}

describe("createScheduledJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("corre la vuelta solo si esta instancia obtiene el turno", async () => {
    const run = vi.fn(async () => {});
    useLease({ data: true, error: null });
    await createScheduledJob("reminders", 600_000, run).tick();
    expect(run).toHaveBeenCalledTimes(1);

    useLease({ data: false, error: null });
    await createScheduledJob("reminders", 600_000, run).tick();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("pide un turno un poco más corto que el intervalo", async () => {
    useLease({ data: true, error: null });
    await createScheduledJob("surveys", 900_000, async () => {}).tick();
    expect(insforgeMockInstance.database.rpc).toHaveBeenCalledWith(
      "acquire_scheduler_lease",
      expect.objectContaining({ p_job: "surveys", p_ttl_seconds: 810 })
    );
  });

  it("si la base no puede dar turnos (migración pendiente), corre igual", async () => {
    const run = vi.fn(async () => {});
    useLease({ data: null, error: { message: "function acquire_scheduler_lease does not exist" } });
    await createScheduledJob("reminders", 600_000, run).tick();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("no se solapa consigo misma y un error no detiene las vueltas siguientes", async () => {
    useLease({ data: true, error: null });
    let release: () => void = () => {};
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockRejectedValueOnce(new Error("falló"))
      .mockResolvedValue(undefined);
    const job = createScheduledJob("order_ready_notifier", 10_000, run);
    const first = job.tick();
    await job.tick(); // la primera sigue corriendo: se salta
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    release();
    await first;
    await job.tick(); // falla
    await job.tick(); // y la siguiente igual corre
    expect(run).toHaveBeenCalledTimes(3);
  });
});
