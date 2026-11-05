import { whatsappLink } from "./engagement";

/**
 * Contacto comercial de ReservasIA (no es el de ningún negocio cliente): el
 * botón "Hablá con nosotros" de la página de presentación abre un chat de
 * WhatsApp con este número y un mensaje ya escrito. Es público a propósito.
 */
export const SALES_WHATSAPP_PHONE = "3044769593";
export const SALES_WHATSAPP_DISPLAY = "+57 304 4769593";
export const SALES_WHATSAPP_MESSAGE = "Hola, quiero saber más de ReservasIA para mi negocio.";

export const salesWhatsappUrl = whatsappLink(SALES_WHATSAPP_PHONE, SALES_WHATSAPP_MESSAGE) as string;
