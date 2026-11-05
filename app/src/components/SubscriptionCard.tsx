import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { functionsClient } from "@/lib/functionsClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { daysLeftLabel, subscriptionState } from "@/lib/subscription";
import { PAYMENT_OPTIONS, VAT_PERCENT_LABEL, formatCop, paymentOptionNote, withVat, type PaymentOption } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import type { SubscriptionPayment } from "@/types/domain";

const STATUS_LABELS: Record<SubscriptionPayment["status"], string> = {
  pending: "En revisión",
  confirmed: "Confirmado",
  rejected: "Rechazado"
};

const STATUS_VARIANTS: Record<SubscriptionPayment["status"], "warning" | "success" | "destructive"> = {
  pending: "warning",
  confirmed: "success",
  rejected: "destructive"
};

/**
 * Cobro manual mientras no hay pasarela de suscripción: el negocio paga por
 * Nequi y sube la captura del comprobante acá; soporte lo revisa desde
 * /soporte y, al confirmarlo, la reactivación (o extensión) del servicio y
 * el correo de confirmación salen solos — ver confirm-subscription-payment.
 */
export function SubscriptionCard({ organizationId }: { organizationId: string }) {
  const { memberships, currentRole } = useOrganization();
  const queryClient = useQueryClient();
  const readOnly = currentRole === "staff";
  const [optionId, setOptionId] = useState<PaymentOption["id"]>(PAYMENT_OPTIONS[0].id);
  const selectedOption = PAYMENT_OPTIONS.find((o) => o.id === optionId) ?? PAYMENT_OPTIONS[0];
  const [amount, setAmount] = useState(String(withVat(PAYMENT_OPTIONS[0].amount)));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const organization = memberships.find((m) => m.organization_id === organizationId)?.organizations ?? null;
  const cardRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // El aviso de prueba/vencimiento enlaza acá (#suscripcion).
  useEffect(() => {
    if (location.hash === "#suscripcion") cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  function chooseOption(option: PaymentOption) {
    setOptionId(option.id);
    setAmount(String(withVat(option.amount)));
  }

  const { data: payments = [] } = useQuery({
    queryKey: ["subscription-payments", organizationId],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("subscription_payments")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as SubscriptionPayment[];
    }
  });

  async function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hace falta reintentar
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("El comprobante debe ser una imagen (captura de pantalla del pago).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar 5 MB.");
      return;
    }

    setSubmitting(true);
    try {
      // El comprobante se manda en base64 y lo sube la función con la clave
      // admin: "subscription-receipts" es un bucket privado y no acepta
      // escrituras directas del navegador, aunque la cuenta esté suspendida.
      const buffer = await file.arrayBuffer();
      let binary = "";
      for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);

      await functionsClient.post("submit-subscription-payment", {
        organization_id: organizationId,
        receipt_base64: btoa(binary),
        receipt_mime_type: file.type,
        amount: amount ? Number(amount) : undefined,
        // La nota lleva el plan elegido: soporte la ve al confirmar y define cuántos meses se suman.
        note: [paymentOptionNote(selectedOption), note.trim()].filter(Boolean).join(" · ")
      });

      toast.success("Pago reportado. Te avisamos por correo apenas soporte lo confirme.");
      setAmount(String(withVat(selectedOption.amount)));
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["subscription-payments", organizationId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reportar el pago.");
    } finally {
      setSubmitting(false);
    }
  }

  async function viewReceipt(paymentId: string) {
    setViewingId(paymentId);
    try {
      const { url } = await functionsClient.get<{ url: string }>("get-subscription-receipt-url", { payment_id: paymentId });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo abrir el comprobante.");
    } finally {
      setViewingId(null);
    }
  }

  const expiresAt = organization?.subscription_expires_at ? new Date(organization.subscription_expires_at) : null;
  const isSuspended = organization?.status === "suspended";
  const state = organization ? subscriptionState(organization) : { kind: "ok" as const };

  return (
    <div ref={cardRef} id="suscripcion" className="scroll-mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Suscripción
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`rounded-md border p-3 text-sm ${
              isSuspended ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border"
            }`}
          >
            {isSuspended
              ? "Tu servicio está suspendido por falta de pago. Reportá tu pago acá abajo para reactivarlo."
              : state.kind === "trial"
                ? `Estás en la prueba gratis: ${daysLeftLabel(state.daysLeft)} (hasta el ${state.endsAt.toLocaleDateString("es-CO")}). Reportá tu pago cuando quieras: se suma al final de la prueba.`
                : expiresAt
                ? `Suscripción activa hasta el ${expiresAt.toLocaleDateString("es-CO")}.`
                : "Todavía no tenés una fecha de vencimiento registrada."}
          </div>

          {!readOnly && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <fieldset className="space-y-2" disabled={submitting}>
                <legend className="mb-2 text-sm font-medium">1. Elegí qué vas a pagar</legend>
                {PAYMENT_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 rounded-md border p-3 text-sm transition-colors",
                      option.id === optionId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="payment-option"
                        className="mt-1 accent-primary"
                        checked={option.id === optionId}
                        onChange={() => chooseOption(option)}
                      />
                      <span>
                        <span className="block font-medium">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">{option.detail}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold">{formatCop(withVat(option.amount))}</span>
                      <span className="block text-xs text-muted-foreground">{formatCop(option.amount)} + IVA</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">2.</span> Pagá {formatCop(withVat(selectedOption.amount))} (IVA del {VAT_PERCENT_LABEL} incluido) por Nequi
                {env.SUBSCRIPTION_NEQUI_NUMBER ? (
                  <>
                    {" "}al número <strong className="text-foreground">{env.SUBSCRIPTION_NEQUI_NUMBER}</strong>.
                  </>
                ) : (
                  " (si no tenés el número, escribile a soporte y te lo pasamos)."
                )}{" "}
                <span className="font-medium text-foreground">3.</span> Subí acá la captura del comprobante. Cuando soporte lo
                confirme, tu servicio se activa o se extiende {selectedOption.months === 12 ? "12 meses" : "1 mes"} y te llega un
                correo. No hay cobros automáticos.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Monto pagado</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={submitting}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nota (opcional)</Label>
                  <Input disabled={submitting} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-upload">Comprobante de pago</Label>
                <input
                  id="receipt-upload"
                  type="file"
                  accept="image/*"
                  disabled={submitting}
                  onChange={handleReceiptChange}
                  className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground file:hover:opacity-90 disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {payments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pagos reportados</p>
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-sm">
                  <div>
                    <span>{new Date(p.created_at).toLocaleDateString("es-CO")}</span>
                    {p.amount != null && <span className="text-muted-foreground"> — {formatCop(Number(p.amount))}</span>}
                    {p.note && <span className="block text-xs text-muted-foreground">{p.note}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                    <Button variant="ghost" size="sm" disabled={viewingId === p.id} onClick={() => viewReceipt(p.id)}>
                      Ver
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
