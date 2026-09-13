import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Step10Finish({ businessName, onFinish }: { businessName: string; onFinish: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
      <div>
        <h2 className="text-lg font-semibold">¡{businessName} está listo!</h2>
        <p className="text-sm text-muted-foreground">
          Tu negocio ya está configurado. Ahora podés ir a tu dashboard para revisar reservas, conectar integraciones y
          personalizar a tu agente.
        </p>
      </div>
      <Button className="w-full" onClick={onFinish}>
        Ir a mi dashboard
      </Button>
    </div>
  );
}
