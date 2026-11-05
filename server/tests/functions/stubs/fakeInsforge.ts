/**
 * Doble de "npm:@insforge/sdk" para probar las Edge Functions de functions/
 * con Node: una base en memoria con filtros simples. El cliente de usuario
 * respeta lo mínimo de RLS que las funciones usan para decidir permisos
 * (solo ve las organizaciones de las que es miembro); el admin ve todo.
 */
type Row = Record<string, unknown>;

export const fakeDb = {
  tables: {} as Record<string, Row[]>,
  /** token de acceso → id de usuario */
  tokens: {} as Record<string, string>,
  writes: [] as { table: string; op: string; payload: unknown }[]
};

export function resetFakeDb(tables: Record<string, Row[]>, tokens: Record<string, string>) {
  fakeDb.tables = structuredClone(tables);
  fakeDb.tokens = { ...tokens };
  fakeDb.writes = [];
}

function query(table: string, userId: string | null) {
  const filters: ((row: Row) => boolean)[] = [];
  let write: { op: string; payload: unknown } | null = null;

  const visible = () => {
    let rows = fakeDb.tables[table] ?? [];
    if (userId && table === "organizations") {
      const mine = new Set((fakeDb.tables.organization_members ?? []).filter((m) => m.user_id === userId).map((m) => m.organization_id));
      rows = rows.filter((r) => mine.has(r.id));
    }
    return rows.filter((r) => filters.every((f) => f(r)));
  };
  const result = () => {
    if (write) {
      fakeDb.writes.push({ table, ...write });
      const rows = Array.isArray(write.payload) ? write.payload : [write.payload];
      return { data: rows.map((r, i) => ({ id: `new-${i}`, ...(r as Row) })), error: null };
    }
    return { data: visible(), error: null };
  };

  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["select", "order", "limit", "range", "gte", "lte", "lt", "gt", "not", "or", "neq", "ilike", "like", "contains"]) builder[m] = chain;
  builder.eq = (col: string, value: unknown) => {
    if (!col.includes("->")) filters.push((r) => r[col] === value);
    return builder;
  };
  builder.in = (col: string, values: unknown[]) => {
    filters.push((r) => values.includes(r[col]));
    return builder;
  };
  builder.is = (col: string, value: unknown) => {
    filters.push((r) => (r[col] ?? null) === value);
    return builder;
  };
  for (const op of ["insert", "update", "upsert", "delete"]) {
    builder[op] = (payload?: unknown) => {
      write = { op, payload: payload ?? null };
      return builder;
    };
  }
  builder.maybeSingle = async () => {
    const { data } = result();
    return { data: (data as Row[])[0] ?? null, error: null };
  };
  builder.single = async () => {
    const { data } = result();
    const row = (data as Row[])[0];
    return row ? { data: row, error: null } : { data: null, error: { message: "no rows" } };
  };
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return builder;
}

function client(userId: string | null) {
  return {
    auth: {
      getCurrentUser: async () => ({ data: { user: userId ? { id: userId, email: `${userId}@test.local` } : null }, error: null })
    },
    database: {
      from: (table: string) => query(table, userId),
      rpc: async () => ({ data: null, error: null })
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { key: "k" }, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed.test" }, error: null }),
        download: async () => ({ data: null, error: null })
      })
    },
    emails: { send: async () => ({ data: {}, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) }
  };
}

export function createClient(options: { accessToken?: string | null } = {}) {
  return client(options.accessToken ? (fakeDb.tokens[options.accessToken] ?? null) : null);
}

export function createAdminClient() {
  return client(null);
}
