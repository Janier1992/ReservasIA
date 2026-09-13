import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { insforge } from "@/lib/insforgeClient";
import { slugify } from "@/lib/slug";
import { useOrganization } from "@/hooks/useOrganization";
import { Step1Name } from "./steps/Step1Name";
import { Step2BusinessType } from "./steps/Step2BusinessType";
import { Step3Timezone } from "./steps/Step3Timezone";
import { Step4BasicInfo } from "./steps/Step4BasicInfo";
import { Step5Hours } from "./steps/Step5Hours";
import { Step6Services } from "./steps/Step6Services";
import { Step7Resources } from "./steps/Step7Resources";
import { Step8Agent } from "./steps/Step8Agent";
import { Step9Integrations } from "./steps/Step9Integrations";
import { Step10Finish } from "./steps/Step10Finish";
import { DEFAULT_HOURS, TOTAL_STEPS, type WizardData } from "./wizardTypes";

const initialData: WizardData = {
  organizationId: null,
  name: "",
  businessType: "restaurant",
  timezone: "America/Bogota",
  address: "",
  phone: "",
  email: "",
  website: "",
  description: "",
  hours: DEFAULT_HOURS,
  services: [],
  resources: [],
  agentName: "Valentina",
  agentTone: "friendly",
  agentLanguage: "es"
};

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(initialData);
  const [saving, setSaving] = useState(false);
  const { refetch: refetchOrganizations, setCurrentOrganizationId } = useOrganization();
  const navigate = useNavigate();

  const progress = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);

  async function createOrganization(name: string, businessType: string, timezone: string) {
    setSaving(true);
    try {
      const { data: org, error } = await insforge.database.rpc("create_organization_with_owner", {
        p_name: name,
        p_slug: slugify(name),
        p_business_type: businessType,
        p_timezone: timezone
      });
      if (error) throw error;
      setData((prev) => ({ ...prev, organizationId: org.id, name, businessType, timezone }));
      await refetchOrganizations();
      setCurrentOrganizationId(org.id);
      setStep(4);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la organización.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBasicInfo(info: { address: string; phone: string; email: string; website: string; description: string }) {
    if (!data.organizationId) return;
    setSaving(true);
    try {
      const { error } = await insforge.database
        .from("business_profiles")
        .update(info)
        .eq("organization_id", data.organizationId);
      if (error) throw error;
      setData((prev) => ({ ...prev, ...info }));
      setStep(5);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la información básica.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHours(hours: WizardData["hours"]) {
    if (!data.organizationId) return;
    setSaving(true);
    try {
      await insforge.database.from("business_hour_periods").delete().eq("organization_id", data.organizationId);
      const { error } = await insforge.database.from("business_hour_periods").insert(
        hours.map((h) => ({
          organization_id: data.organizationId,
          day_of_week: h.day_of_week,
          is_closed: h.is_closed,
          opening_time: h.is_closed ? null : h.opening_time,
          closing_time: h.is_closed ? null : h.closing_time
        }))
      );
      if (error) throw error;
      setData((prev) => ({ ...prev, hours }));
      setStep(6);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron guardar los horarios.");
    } finally {
      setSaving(false);
    }
  }

  async function saveServices(services: WizardData["services"]) {
    if (!data.organizationId) return;
    setSaving(true);
    try {
      if (services.length > 0) {
        const { error } = await insforge.database
          .from("services")
          .insert(services.map((s) => ({ organization_id: data.organizationId, ...s })));
        if (error) throw error;
      }
      setData((prev) => ({ ...prev, services }));
      setStep(7);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron guardar los servicios.");
    } finally {
      setSaving(false);
    }
  }

  async function saveResources(resources: WizardData["resources"]) {
    if (!data.organizationId) return;
    setSaving(true);
    try {
      if (resources.length > 0) {
        const { error } = await insforge.database
          .from("resources")
          .insert(resources.map((r) => ({ organization_id: data.organizationId, ...r })));
        if (error) throw error;
      }
      setData((prev) => ({ ...prev, resources }));
      setStep(8);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron guardar los recursos.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAgent(agent: { agentName: string; agentTone: string; agentLanguage: string }) {
    if (!data.organizationId) return;
    setSaving(true);
    try {
      const { error } = await insforge.database
        .from("agents")
        .update({ name: agent.agentName, tone: agent.agentTone, language: agent.agentLanguage })
        .eq("organization_id", data.organizationId);
      if (error) throw error;
      setData((prev) => ({ ...prev, ...agent }));
      setStep(9);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la configuración del agente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Paso {Math.min(step, TOTAL_STEPS)} de {TOTAL_STEPS}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {step === 1 && (
            <Step1Name
              value={data.name}
              onNext={(name) => {
                setData((p) => ({ ...p, name }));
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <Step2BusinessType
              value={data.businessType}
              onBack={() => setStep(1)}
              onNext={(businessType) => {
                setData((p) => ({ ...p, businessType }));
                setStep(3);
              }}
            />
          )}
          {step === 3 && (
            <Step3Timezone
              value={data.timezone}
              onBack={() => setStep(2)}
              onNext={(timezone) => createOrganization(data.name, data.businessType, timezone)}
            />
          )}
          {step === 4 && (
            <Step4BasicInfo
              value={{ address: data.address, phone: data.phone, email: data.email, website: data.website, description: data.description }}
              onBack={() => setStep(3)}
              onNext={saveBasicInfo}
            />
          )}
          {step === 5 && <Step5Hours value={data.hours} onBack={() => setStep(4)} onNext={saveHours} />}
          {step === 6 && <Step6Services value={data.services} onBack={() => setStep(5)} onNext={saveServices} />}
          {step === 7 && <Step7Resources value={data.resources} onBack={() => setStep(6)} onNext={saveResources} />}
          {step === 8 && (
            <Step8Agent
              value={{ agentName: data.agentName, agentTone: data.agentTone, agentLanguage: data.agentLanguage }}
              onBack={() => setStep(7)}
              onNext={saveAgent}
            />
          )}
          {step === 9 && <Step9Integrations onBack={() => setStep(8)} onNext={() => setStep(10)} />}
          {step === 10 && <Step10Finish businessName={data.name} onFinish={() => navigate("/dashboard", { replace: true })} />}
        </div>
        {saving && <p className="text-center text-xs text-muted-foreground">Guardando...</p>}
      </div>
    </div>
  );
}
