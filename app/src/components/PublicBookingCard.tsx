import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, ExternalLink, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { publicBookingUrl } from "@/lib/publicBookingUtils";

const COPY = {
  booking: {
    title: "Tu página de reservas",
    text: "Compartilo en redes, WhatsApp o imprimí el QR para el mostrador: tus clientes reservan sin escribirte."
  },
  order: {
    title: "Tu QR para pedir",
    text: "Imprimilo para las mesas o el mostrador: el cliente pide desde su celular, entra a Atención en sitio y le avisamos por Telegram o WhatsApp cuando esté listo."
  }
};

/** Enlace y QR de la página pública del negocio (reservas o pedidos), para compartir o imprimir. */
export function PublicBookingCard({ slug, businessName, mode = "booking" }: { slug: string; businessName: string; mode?: "order" | "booking" }) {
  const texts = COPY[mode];
  const url = publicBookingUrl(slug);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then(({ toDataURL }) => toDataURL(url, { width: 512, margin: 2 }))
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => setQr(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el enlace y copialo a mano.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-4 w-4" /> {texts.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {qr && (
          <img
            src={qr}
            alt={`Código QR para ${mode === "order" ? "pedir" : "reservar"} en ${businessName}`}
            className="h-28 w-28 shrink-0 rounded-lg border border-border"
          />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-muted-foreground">{texts.text}</p>
          <p className="truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-4 w-4" /> Copiar enlace
            </Button>
            {qr && (
              <a href={qr} download={`qr-reservas-${slug}.png`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                <Download className="h-4 w-4" /> Descargar QR
              </a>
            )}
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <ExternalLink className="h-4 w-4" /> Ver página
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
