import { useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Botón de instalación propio de la app: en Android/Chrome dispara el
 * `beforeinstallprompt` capturado por useInstallPrompt (más confiable que
 * esperar el ícono/heurística automática del navegador, que en mobile no
 * siempre aparece). En iOS Safari, donde no existe ninguna API para esto,
 * muestra instrucciones paso a paso en vez de un botón inerte.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const { installed, canPrompt, showIosInstructions, promptInstall } = useInstallPrompt();
  const [iosDialogOpen, setIosDialogOpen] = useState(false);

  if (installed || (!canPrompt && !showIosInstructions)) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={canPrompt ? promptInstall : () => setIosDialogOpen(true)}
      >
        <Download className="h-4 w-4" /> Instalar app
      </Button>

      <Dialog open={iosDialogOpen} onOpenChange={setIosDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar en iPhone/iPad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Safari no tiene un botón de instalar — hay que agregarla a la pantalla de inicio manualmente, son 2 pasos:
            </p>
            <div className="flex items-center gap-3 rounded-md border border-border p-3">
              <Share className="h-5 w-5 shrink-0 text-primary" />
              <p>
                1. Tocá el ícono de <strong>Compartir</strong> en la barra de Safari (el cuadrado con la flecha hacia
                arriba).
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border p-3">
              <SquarePlus className="h-5 w-5 shrink-0 text-primary" />
              <p>
                2. Elegí <strong>"Agregar a pantalla de inicio"</strong>.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
