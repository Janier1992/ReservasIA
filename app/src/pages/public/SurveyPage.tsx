import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Star } from "lucide-react";
import { insforge } from "@/lib/insforgeClient";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getBusinessTheme } from "@/lib/businessThemes";
import { useApplyTheme } from "@/hooks/useBusinessTheme";

interface PublicSurvey {
  business_name: string;
  logo_url: string | null;
  business_type: string | null;
  customer_first_name: string | null;
  service_name: string | null;
  visited_at: string | null;
  answered: boolean;
  rating: number | null;
  review_url: string | null;
}

const RATING_LABELS = ["", "Muy mal", "Mal", "Regular", "Bien", "Excelente"];

/** Encuesta de satisfacción que el cliente abre desde el enlace que le mandó el negocio. Sin cuenta. */
export function SurveyPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rating: number; reviewUrl: string | null } | null>(null);

  const surveyQuery = useQuery({
    queryKey: ["public-survey", token],
    retry: false,
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc("get_public_survey", { p_token: token });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : data ? [data] : []) as PublicSurvey[];
      return rows[0] ?? null;
    }
  });
  const survey = surveyQuery.data;
  const theme = getBusinessTheme(survey?.business_type);
  useApplyTheme(theme);
  const Icon = theme.icon;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return;
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await insforge.database.rpc("submit_public_survey", {
      p_token: token,
      p_rating: rating,
      p_comment: comment
    });
    setSubmitting(false);
    if (rpcError) {
      setError(
        rpcError.message?.includes("SURVEY_ALREADY_ANSWERED")
          ? "Esta encuesta ya fue respondida. ¡Gracias!"
          : "No pudimos guardar tu respuesta. Probá de nuevo en un momento."
      );
      return;
    }
    setDone({ rating, reviewUrl: typeof data === "string" && data ? data : null });
  }

  const shown = hover || rating;

  return (
    <div className="flex min-h-dvh items-start justify-center bg-background px-4 py-10 text-foreground sm:items-center">
      <main className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 sm:p-8">
        {surveyQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !survey ? (
          <div className="space-y-2 text-center">
            <h1 className="font-display text-xl font-semibold">Encuesta no disponible</h1>
            <p className="text-sm text-muted-foreground">El enlace no es válido o ya venció.</p>
          </div>
        ) : done || survey.answered ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="h-6 w-6" />
            </div>
            <h1 className="font-display text-xl font-semibold">¡Gracias por tu opinión!</h1>
            {(done?.reviewUrl ?? survey.review_url) ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Nos alegra que te haya gustado. ¿Nos ayudás contándolo en Google? Le sirve mucho a {survey.business_name}.
                </p>
                <a
                  href={done?.reviewUrl ?? survey.review_url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants(), "w-full")}
                >
                  Dejar reseña en Google <ExternalLink className="h-4 w-4" />
                </a>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Tu respuesta le llega directo a {survey.business_name} para seguir mejorando.</p>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <header className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
                {survey.logo_url ? <img src={survey.logo_url} alt="" className="h-full w-full object-cover" /> : <Icon className="h-6 w-6" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold">{survey.business_name}</p>
                {survey.service_name && <p className="truncate text-sm text-muted-foreground">{survey.service_name}</p>}
              </div>
            </header>

            <div className="space-y-3 text-center">
              <h1 className="font-display text-xl font-semibold">
                {survey.customer_first_name ? `${survey.customer_first_name}, ¿cómo` : "¿Cómo"} te fue en tu visita?
              </h1>
              <div className="flex justify-center gap-1" role="radiogroup" aria-label="Calificación" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value} de 5: ${RATING_LABELS[value]}`}
                    className="rounded-md p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onMouseEnter={() => setHover(value)}
                    onClick={() => setRating(value)}
                  >
                    <Star className={cn("h-10 w-10", value <= shown ? "fill-primary text-primary" : "text-border")} />
                  </button>
                ))}
              </div>
              <p className="h-5 text-sm text-muted-foreground">{RATING_LABELS[shown]}</p>
            </div>

            {rating > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="survey-comment" className="text-sm font-medium">
                  {rating <= 3 ? "¿Qué podemos mejorar?" : "¿Algo que quieras contarnos? (opcional)"}
                </label>
                <Textarea id="survey-comment" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!rating || submitting}>
              Enviar
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
