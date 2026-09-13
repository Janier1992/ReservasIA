import { Router } from "express";
import { healthRouter } from "./health.js";
import { webhooksRouter } from "./webhooks.js";
import { integrationsRouter } from "./integrations.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/webhooks", webhooksRouter);
apiRouter.use("/integrations", integrationsRouter);
