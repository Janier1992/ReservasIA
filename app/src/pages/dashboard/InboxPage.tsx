import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, ArrowLeft, Info } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { functionsClient } from "@/lib/functionsClient";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Conversation, Message, Reservation } from "@/types/domain";

export function InboxPage() {
  const { currentOrganizationId } = useOrganization();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", currentOrganizationId],
    enabled: !!currentOrganizationId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("conversations")
        .select("*, customers(*)")
        .eq("organization_id", currentOrganizationId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Conversation[];
    }
  });

  const activeConversation = conversations.find((c) => c.id === selectedId) ?? conversations[0] ?? null;

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeConversation?.id],
    enabled: !!activeConversation,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("messages")
        .select("*")
        .eq("conversation_id", activeConversation!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    }
  });

  const { data: customerReservations = [] } = useQuery({
    queryKey: ["customer-reservations", activeConversation?.customer_id],
    enabled: !!activeConversation?.customer_id,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("reservations")
        .select("*, services(*), resources(*)")
        .eq("customer_id", activeConversation!.customer_id!)
        .order("start_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Reservation[];
    }
  });

  async function sendReply() {
    if (!activeConversation || !draft.trim() || !currentOrganizationId) return;
    const content = draft.trim();
    setDraft("");
    try {
      await functionsClient.post("conversations-reply", {
        organization_id: currentOrganizationId,
        conversation_id: activeConversation.id,
        content
      });
      queryClient.invalidateQueries({ queryKey: ["messages", activeConversation.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el mensaje.");
    }
  }

  const clientDetails = (
    <>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Cliente</h3>
        <p className="text-sm">{activeConversation?.customers?.name || "Sin nombre"}</p>
        <p className="text-xs text-muted-foreground">{activeConversation?.customers?.phone}</p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Reservas</h3>
        <div className="space-y-2">
          {customerReservations.map((r) => (
            <div key={r.id} className="rounded-md border border-border p-2 text-xs">
              <div className="flex items-center justify-between">
                <span>{new Date(r.start_at).toLocaleString()}</span>
                <Badge variant={r.status === "confirmed" ? "success" : r.status === "cancelled" ? "destructive" : "muted"}>
                  {r.status}
                </Badge>
              </div>
              {r.services?.name && <p className="text-muted-foreground">{r.services.name}</p>}
            </div>
          ))}
          {customerReservations.length === 0 && <p className="text-xs text-muted-foreground">Sin reservas.</p>}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-4.5rem)] gap-4 lg:h-[calc(100vh-3rem)]">
      {/* Lista de conversaciones: panel propio en mobile (se oculta al abrir un hilo), columna fija en desktop */}
      <div
        className={cn(
          "w-full shrink-0 overflow-y-auto rounded-lg border border-border bg-card lg:block lg:w-72",
          mobilePane === "thread" ? "hidden lg:block" : "block"
        )}
      >
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSelectedId(c.id);
              setMobilePane("thread");
            }}
            className={cn(
              "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-muted",
              activeConversation?.id === c.id && "bg-primary/10"
            )}
          >
            <span className="text-sm font-medium">{c.customers?.name || c.customers?.phone || "Cliente"}</span>
            <span className="text-xs capitalize text-muted-foreground">{c.channel}</span>
          </button>
        ))}
        {conversations.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin conversaciones todavía.</p>}
      </div>

      {/* Hilo activo: panel propio en mobile (con volver/info), columna central en desktop */}
      <div
        className={cn(
          "flex-1 flex-col rounded-lg border border-border bg-card lg:flex",
          mobilePane === "thread" ? "flex" : "hidden"
        )}
      >
        {activeConversation ? (
          <>
            <div className="flex items-center gap-2 border-b border-border p-3 lg:hidden">
              <button
                className="rounded-md p-1.5 text-foreground/70 hover:bg-muted"
                onClick={() => setMobilePane("list")}
                aria-label="Volver a la lista"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="flex-1 truncate text-sm font-medium">
                {activeConversation.customers?.name || activeConversation.customers?.phone || "Cliente"}
              </span>
              <button
                className="rounded-md p-1.5 text-foreground/70 hover:bg-muted"
                onClick={() => setDetailsOpen(true)}
                aria-label="Ver info del cliente"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages
                .filter((m) => m.role !== "tool")
                .map((m) => (
                  <div key={m.id} className={cn("flex", m.role === "user" ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm sm:max-w-[70%]",
                        m.role === "user" ? "bg-muted" : "bg-primary text-primary-foreground"
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
            </div>
            <div className="flex gap-2 border-t border-border p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribí una respuesta manual..."
                onKeyDown={(e) => e.key === "Enter" && sendReply()}
              />
              <Button onClick={sendReply}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Seleccioná una conversación
          </div>
        )}
      </div>

      {/* Info del cliente: tercera columna fija sólo en desktop; en mobile se ve en el diálogo de abajo */}
      <div className="hidden w-72 shrink-0 space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-4 lg:block">
        {clientDetails}
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Información del cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">{clientDetails}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
