import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { publicApiRateLimiter } from "../middleware/rateLimit.js";
import { ErrorCodes } from "../utils/AppError.js";
import { createPublicReservation, getPublicAvailability, getPublicBusiness } from "../services/publicBooking/publicBookingService.js";
import { createPublicOrder } from "../services/publicOrders/publicOrderService.js";

/**
 * API de la página pública de reservas (/r/:slug en el frontend). Sin
 * autenticación: ver publicBookingService para qué expone y qué no.
 */
export const publicRouter = Router();

// Crear reservas sin cuenta es lo que un bot abusaría: límite estricto por IP.
const bookingRateLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: ErrorCodes.RATE_LIMITED, message: "Demasiadas reservas desde esta conexión. Intentá de nuevo en unos minutos." }
    });
  }
});

// Pedidos desde el QR del local: muchos clientes comparten el wifi (misma IP),
// así que el límite es más amplio que el de reservas.
const orderRateLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: ErrorCodes.RATE_LIMITED, message: "Demasiados pedidos desde esta conexión. Pedí en el mostrador o intentá en unos minutos." }
    });
  }
});

const slugSchema =z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  date: dateSchema
});

const bookingBodySchema = z.object({
  serviceId: z.string().uuid(),
  date: dateSchema,
  start: z.string().datetime(),
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v.replace(/\D/g, "").length >= 7, "Teléfono inválido"),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional(),
  healthDataConsent: z.boolean().optional(),
  // Campo trampa: invisible para personas, los bots lo llenan.
  website: z.string().max(0).optional()
});

const orderBodySchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || v.replace(/\D/g, "").length >= 7, "Teléfono inválido")
    .optional(),
  notes: z.string().trim().max(300).optional(),
  website: z.string().max(0).optional()
});

type Handler =(req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

publicRouter.get(
  "/businesses/:slug",
  publicApiRateLimiter,
  wrap(async (req, res) => {
    const business = await getPublicBusiness(slugSchema.parse(req.params.slug));
    // organizationId no hace falta en el navegador.
    res.json({ ...business, organizationId: undefined });
  })
);

publicRouter.get(
  "/businesses/:slug/availability",
  publicApiRateLimiter,
  wrap(async (req, res) => {
    const { serviceId, date } = availabilityQuerySchema.parse(req.query);
    res.json(await getPublicAvailability(slugSchema.parse(req.params.slug), serviceId, date));
  })
);

publicRouter.post(
  "/businesses/:slug/reservations",
  bookingRateLimiter,
  wrap(async (req, res) => {
    const body = bookingBodySchema.parse(req.body);
    const reservation = await createPublicReservation(slugSchema.parse(req.params.slug), {
      serviceId: body.serviceId,
      date: body.date,
      start: body.start,
      name: body.name,
      phone: body.phone,
      email: body.email || undefined,
      notes: body.notes,
      healthDataConsent: body.healthDataConsent
    });
    res.status(201).json(reservation);
  })
);

publicRouter.post(
  "/businesses/:slug/orders",
  orderRateLimiter,
  wrap(async (req, res) => {
    const body = orderBodySchema.parse(req.body);
    const order = await createPublicOrder(slugSchema.parse(req.params.slug), {
      serviceId: body.serviceId,
      name: body.name,
      phone: body.phone || undefined,
      notes: body.notes
    });
    res.status(201).json(order);
  })
);
