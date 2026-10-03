import { MessageCircle, Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Avisame por Telegram / WhatsApp": abre el chat del negocio con un código
 * que vincula el chat del cliente con su pedido o su reserva. Solo aparecen
 * los canales que el negocio tiene conectados.
 */
export function NotifyChannelsCard({
  telegramUrl,
  whatsappUrl,
  title,
  description
}: {
  telegramUrl: string | null | undefined;
  whatsappUrl: string | null | undefined;
  title: string;
  description: string;
}) {
  if (!telegramUrl && !whatsappUrl) return null;
  return (
    <div className="w-full space-y-3 rounded-2xl border border-border bg-card p-5">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      {telegramUrl && (
        <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          <Send className="h-4 w-4" /> Avisame por Telegram
        </a>
      )}
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "lg", variant: telegramUrl ? "outline" : "default" }), "w-full")}
        >
          <MessageCircle className="h-4 w-4" /> Avisame por WhatsApp
        </a>
      )}
    </div>
  );
}
