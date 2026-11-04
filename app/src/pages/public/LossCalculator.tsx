import { useId, useState } from "react";
import { MONTHLY_PRICE_COP, formatCop, withVat } from "@/lib/pricing";

/**
 * Calculadora de la página de presentación: cuánta plata se le puede ir a un
 * negocio por no contestar a tiempo. Todos los números los pone el visitante
 * (con valores de partida razonables); la página no inventa estadísticas, y
 * el resultado se presenta como una estimación.
 */

const DAYS_PER_MONTH = 30;
const MONTHLY_TOTAL_COP = withVat(MONTHLY_PRICE_COP);

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-muted-foreground">
          {label}
        </label>
        <span className="shrink-0 whitespace-nowrap font-display text-lg font-semibold tabular-nums">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </div>
  );
}

/** Pérdida estimada al mes, en pesos. */
export function estimateMonthlyLoss(inquiriesPerDay: number, lostPercent: number, averageTicket: number): number {
  return Math.round(inquiriesPerDay * DAYS_PER_MONTH * (lostPercent / 100) * averageTicket);
}

/** Cuántas ventas recuperadas al mes alcanzan para pagar la mensualidad con IVA. */
export function salesToCoverPlan(averageTicket: number): number {
  return Math.max(1, Math.ceil(MONTHLY_TOTAL_COP / averageTicket));
}

export function LossCalculator() {
  const [inquiries, setInquiries] = useState(15);
  const [lostPercent, setLostPercent] = useState(20);
  const [ticket, setTicket] = useState(35_000);

  const loss = estimateMonthlyLoss(inquiries, lostPercent, ticket);
  const lostSales = Math.round(inquiries * DAYS_PER_MONTH * (lostPercent / 100));
  const toCover = salesToCoverPlan(ticket);

  return (
    <div className="grid gap-6 rounded-3xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
      <div className="space-y-6">
        <Slider
          label="Mensajes de clientes por día"
          value={inquiries}
          min={1}
          max={100}
          step={1}
          display={String(inquiries)}
          onChange={setInquiries}
        />
        <Slider
          label="De esos, cuántos no alcanzás a responder a tiempo"
          value={lostPercent}
          min={5}
          max={60}
          step={5}
          display={`${lostPercent} %`}
          onChange={setLostPercent}
        />
        <Slider
          label="Valor promedio de una cita o pedido"
          value={ticket}
          min={5_000}
          max={300_000}
          step={5_000}
          display={formatCop(ticket)}
          onChange={setTicket}
        />
        <p className="text-xs text-muted-foreground">
          Mové los valores según tu negocio. Es una estimación: no todos los mensajes sin respuesta son ventas perdidas.
        </p>
      </div>

      <div className="flex flex-col justify-center rounded-2xl bg-[#120c0a] p-6 text-white" aria-live="polite">
        <p className="text-sm text-white/70">Lo que se te puede estar yendo cada mes</p>
        <p className="mt-2 font-display text-4xl font-semibold tabular-nums sm:text-5xl">{formatCop(loss)}</p>
        <p className="mt-1 text-sm text-white/60">
          ≈ {lostSales} {lostSales === 1 ? "cliente" : "clientes"} que escriben y no reciben respuesta a tiempo
        </p>
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="text-sm text-white/80">
            ReservasIA cuesta {formatCop(MONTHLY_TOTAL_COP)} al mes con IVA. Con recuperar{" "}
            <strong className="text-white">
              {toCover} {toCover === 1 ? "venta" : "ventas"}
            </strong>{" "}
            al mes, ya se paga solo.
          </p>
        </div>
      </div>
    </div>
  );
}
