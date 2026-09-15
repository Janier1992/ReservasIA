export interface CalendarLayoutItem {
  id: string;
  start_at: string;
  end_at: string;
}

export interface LaidOutItem<T> {
  item: T;
  lane: number;
  lanes: number;
}

/**
 * Asigna cada item a un "carril" (columna dentro del día) para que dos
 * reservas que se superponen en horario no se dibujen una encima de la otra
 * en la vista de calendario. Greedy: cada reserva ocupa el primer carril
 * cuyo último evento ya haya terminado; si ninguno está libre, abre uno
 * nuevo. No es la partición óptima para casos con solapamientos complejos,
 * pero es correcta y suficiente para el volumen de un negocio chico.
 */
export function layoutOverlapping<T extends CalendarLayoutItem>(items: T[]): LaidOutItem<T>[] {
  const sorted = [...items].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const laneEndTimes: number[] = [];
  const placed: { item: T; lane: number }[] = [];

  for (const item of sorted) {
    const start = new Date(item.start_at).getTime();
    const end = new Date(item.end_at).getTime();
    let lane = laneEndTimes.findIndex((endTime) => endTime <= start);
    if (lane === -1) {
      lane = laneEndTimes.length;
      laneEndTimes.push(end);
    } else {
      laneEndTimes[lane] = end;
    }
    placed.push({ item, lane });
  }

  const lanes = laneEndTimes.length || 1;
  return placed.map((p) => ({ ...p, lanes }));
}
