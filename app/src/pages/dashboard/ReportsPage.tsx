import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { insforge } from "@/lib/insforgeClient";
import { useOrganization } from "@/hooks/useOrganization";
import { useCurrentBusinessTheme } from "@/hooks/useBusinessTheme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryErrorState } from "@/components/QueryErrorState";
import { formatCurrency } from "@/lib/currency";
import { reservationStatusLabel } from "@/lib/reservationStatus";
import { breakdownBy, countByDay, reportToCsv, sourceLabel, summarize, type Breakdown, type ReportRow } from "@/lib/reports";

const PERIODS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" }
];

// Tope de filas por consulta: suficiente para 90 días de un negocio chico;
// si se alcanza, se avisa en pantalla en vez de mostrar totales incompletos en silencio.
const MAX_ROWS = 5000;

function formatMoneyMap(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) return "—";
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" · ");
}

function BreakdownList({ title, items, total }: { title: string; items: Breakdown[]; total: number }) {
  const max = items[0]?.count ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos en este período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Nombre</th>
                <th>Cantidad</th>
                <th>Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 8).map((item) => (
                <tr key={item.label} className="align-top">
                  <td className="w-full py-1.5 pr-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{item.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatMoneyMap(item.revenueByCurrency)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden="true">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${max ? (item.count / max) * 100 : 0}%` }} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                    {item.count}
                    <span className="ml-1 text-xs text-muted-foreground">({total ? Math.round((item.count / total) * 100) : 0}%)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const { currentOrganizationId, memberships } = useOrganization();
  const { vocabulary } = useCurrentBusinessTheme();
  const timezone = memberships.find((m) => m.organization_id === currentOrganizationId)?.organizations.timezone ?? "UTC";
  const [periodDays, setPeriodDays] = useState("30");
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(periodDays) * 24 * 60 * 60 * 1000);
    return { from, to };
  }, [periodDays]);

  const {
    data: rows = [],
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["reports", currentOrganizationId, periodDays],
    enabled: !!currentOrganizationId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("reservations")
        .select("id, status, start_at, source, customer_name, services(name, price, currency), resources(name)")
        .eq("organization_id", currentOrganizationId)
        .gte("start_at", range.from.toISOString())
        .lte("start_at", range.to.toISOString())
        .order("start_at", { ascending: true })
        .limit(MAX_ROWS);
      if (error) throw error;
      return data as unknown as ReportRow[];
    }
  });

  const summary = summarize(rows);
  const byService = breakdownBy(rows, (r) => r.services?.name ?? null);
  const byResource = breakdownBy(rows, (r) => r.resources?.name ?? null);
  const bySource = breakdownBy(rows, (r) => sourceLabel(r.source));
  const occupied = rows.filter((r) => r.status !== "cancelled").length;
  const days = countByDay(rows, range.from, range.to, timezone);
  const maxDay = Math.max(1, ...days.map((d) => d.count));
  const noShowRate = summary.completed + summary.noShow > 0 ? Math.round((summary.noShow / (summary.completed + summary.noShow)) * 100) : 0;

  function downloadCsv() {
    // BOM para que Excel abra bien las tildes.
    const csv = "﻿" + reportToCsv(rows, timezone, reservationStatusLabel);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-${formatInTimeZone(range.from, timezone, "yyyy-MM-dd")}-a-${formatInTimeZone(range.to, timezone, "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const kpis = [
    { label: "Atenciones completadas", value: String(summary.completed) },
    { label: "Ingresos (completadas)", value: formatMoneyMap(summary.revenueByCurrency) },
    { label: "Ticket promedio", value: formatMoneyMap(summary.averageTicketByCurrency) },
    { label: "Cancelaciones", value: String(summary.cancelled) },
    { label: "No asistieron", value: `${noShowRate}%` }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            {vocabulary.reservations}, ingresos y canales del período. Los ingresos suman el precio del servicio de las atenciones completadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={periodDays} onValueChange={setPeriodDays}>
            <TabsList>
              {PERIODS.map((p) => (
                <TabsTrigger key={p.value} value={p.value}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} message="No se pudo cargar el reporte." />
      ) : (
        <>
          {rows.length >= MAX_ROWS && (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              El período tiene más de {MAX_ROWS} registros: los totales muestran solo los primeros. Elegí un período más corto.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <Card key={k.label}>
                <CardContent className="space-y-1 p-4">
                  {isLoading ? <Skeleton className="h-7 w-16" /> : <p className="font-display text-xl font-semibold">{k.value}</p>}
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-baseline justify-between space-y-0">
              <CardTitle>{vocabulary.reservations} por día</CardTitle>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {hoveredDay
                  ? `${formatInTimeZone(new Date(`${hoveredDay}T12:00:00Z`), "UTC", "dd/MM")}: ${days.find((d) => d.date === hoveredDay)?.count ?? 0}`
                  : `${occupied} en total`}
              </span>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-end gap-0.5" role="img" aria-label={`${vocabulary.reservations} por día en los últimos ${periodDays} días`}>
                {days.map((d) => (
                  <div
                    key={d.date}
                    className="flex h-full flex-1 cursor-default items-end"
                    onMouseEnter={() => setHoveredDay(d.date)}
                    onMouseLeave={() => setHoveredDay(null)}
                    title={`${d.date}: ${d.count}`}
                  >
                    <div
                      className={`w-full rounded-t ${hoveredDay === d.date ? "bg-primary" : "bg-primary/70"}`}
                      style={{ height: d.count ? `${Math.max(4, (d.count / maxDay) * 100)}%` : "2px" }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{days[0] ? formatInTimeZone(new Date(`${days[0].date}T12:00:00Z`), "UTC", "dd/MM") : ""}</span>
                <span>{days.at(-1) ? formatInTimeZone(new Date(`${days.at(-1)!.date}T12:00:00Z`), "UTC", "dd/MM") : ""}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BreakdownList title={vocabulary.services} items={byService} total={occupied} />
            <BreakdownList title={vocabulary.resources} items={byResource} total={occupied} />
            <BreakdownList title="Canal" items={bySource} total={occupied} />
          </div>
        </>
      )}
    </div>
  );
}
