import { vi } from "vitest";

type RawResponse = { data: unknown; error: unknown };
export type TableResponse = RawResponse | RawResponse[] | (() => RawResponse);

/**
 * Mock mínimo pero fiel del cliente @insforge/sdk (database module, con la
 * misma forma que postgrest-js): soporta el estilo fluido
 * `.from(table).select().eq().order()...` y resuelve según una tabla de
 * respuestas por nombre de tabla. Suficiente para tests unitarios de
 * servicios que no necesitan validar los filtros exactos aplicados, sólo el
 * resultado que "la base de datos" devolvería en cada escenario.
 */
export function createInsforgeMock(responses: Record<string, TableResponse>, rpcResponses: Record<string, TableResponse> = {}) {
  const cursors = new Map<string, number>();

  function resolveResponse(table: string): RawResponse {
    const entry = responses[table];
    if (!entry) return { data: null, error: { message: `no mock configured for table ${table}` } };
    if (typeof entry === "function") return entry();
    if (Array.isArray(entry)) {
      const idx = cursors.get(table) ?? 0;
      cursors.set(table, Math.min(idx + 1, entry.length - 1));
      return entry[Math.min(idx, entry.length - 1)];
    }
    return entry;
  }

  function buildQuery(table: string) {
    const query: Record<string, unknown> = {};
    const chainMethods = ["select", "eq", "neq", "in", "lt", "gt", "lte", "gte", "order", "limit", "is", "insert", "update", "upsert", "delete"];
    for (const method of chainMethods) {
      query[method] = vi.fn(() => query);
    }
    query.maybeSingle = vi.fn(async () => resolveResponse(table));
    query.single = vi.fn(async () => resolveResponse(table));
    query.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => resolve(resolveResponse(table));
    return query;
  }

  return {
    database: {
      from: vi.fn((table: string) => buildQuery(table)),
      rpc: vi.fn(async (fn: string) => {
        const entry = rpcResponses[fn];
        if (!entry) return { data: null, error: { message: `no mock configured for rpc ${fn}` } };
        return typeof entry === "function" ? entry() : entry;
      })
    },
    auth: {
      getCurrentUser: vi.fn(async () => ({ data: { user: null }, error: null }))
    }
  };
}
