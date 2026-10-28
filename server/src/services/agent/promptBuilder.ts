import { insforgeAdmin } from "../../lib/insforge.js";
import { AppError, ErrorCodes } from "../../utils/AppError.js";
import { fetchAgentPromptData, type AgentPromptData } from "./systemPrompt.js";

export { buildSystemPrompt, type AgentPromptData } from "./systemPrompt.js";

/** Datos del negocio para el agente real, leídos con el cliente admin del server. */
export async function loadAgentPromptData(organizationId: string, customerId: string | null): Promise<AgentPromptData> {
  const data = await fetchAgentPromptData(insforgeAdmin, organizationId, customerId);
  if (!data) {
    throw new AppError(ErrorCodes.ORGANIZATION_NOT_FOUND, "La organización no está completamente configurada.", 404);
  }
  return data;
}
