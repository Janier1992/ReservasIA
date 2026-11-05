import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/** Request con el cuerpo JSON sin parsear (lo usan los webhooks firmados). */
export type RawBodyRequest = express.Request & { rawBody?: string };

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_URL,
      credentials: true
    })
  );
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== "test" }));

  // application/json global. Se guarda también el cuerpo crudo: la firma de
  // YCloud se calcula sobre esos bytes exactos, no sobre el JSON ya parseado.
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf.toString("utf8");
      }
    })
  );

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
