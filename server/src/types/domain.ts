export type OrganizationRole = "owner" | "admin" | "staff";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  status: "active" | "suspended" | "cancelled";
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessProfile {
  id: string;
  organization_id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  business_type: string | null;
  category: string | null;
  currency: string;
  timezone: string;
  capacity_total: number | null;
  reservation_duration_minutes: number;
  slot_interval_minutes: number;
  advance_booking_hours: number;
  max_booking_days: number;
  cancellation_policy: string | null;
  special_instructions: string | null;
  nequi_phone: string | null;
  deposit_enabled: boolean;
  deposit_mandatory: boolean;
  deposit_percentage: number | null;
}

export interface BusinessHourPeriod {
  id: string;
  organization_id: string;
  day_of_week: number;
  is_closed: boolean;
  opening_time: string | null;
  closing_time: string | null;
}

export interface Resource {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  resource_type: string | null;
  capacity: number;
  is_active: boolean;
}

export interface Service {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  currency: string;
  is_active: boolean;
}

export interface Customer {
  id: string;
  organization_id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  notes: string | null;
}

export type ConversationChannel = "whatsapp" | "instagram" | "web" | "telegram" | "facebook";

export interface Conversation {
  id: string;
  organization_id: string;
  customer_id: string | null;
  channel: ConversationChannel;
  external_conversation_id: string | null;
  status: "active" | "closed" | "archived";
}

export type MessageRole = "user" | "assistant" | "system" | "tool" | "staff";

export interface Message {
  id: string;
  organization_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  message_type: string;
  external_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PaymentStatus = "not_required" | "awaiting_payment" | "awaiting_confirmation" | "paid";

export interface Reservation {
  id: string;
  organization_id: string;
  customer_id: string | null;
  service_id: string | null;
  resource_id: string | null;
  conversation_id: string | null;
  start_at: string;
  end_at: string;
  party_size: number | null;
  customer_name: string | null;
  special_requests: string | null;
  status: ReservationStatus;
  source: string;
  external_reference: string | null;
  google_event_id: string | null;
  internal_notes: string | null;
  payment_status: PaymentStatus;
  deposit_amount: number | null;
}

export interface AgentConfig {
  id: string;
  organization_id: string;
  name: string;
  enabled: boolean;
  language: string;
  tone: string;
  system_instructions: string | null;
  booking_enabled: boolean;
  cancellation_enabled: boolean;
  rescheduling_enabled: boolean;
}

export interface AgentRule {
  id: string;
  organization_id: string;
  name: string;
  instruction: string;
  priority: number;
  enabled: boolean;
}

export type IntegrationProvider = "twilio" | "google_calendar" | "telegram";
export type IntegrationStatus = "disconnected" | "connected" | "error";

export interface Integration {
  id: string;
  organization_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  credentials: Record<string, unknown>;
  metadata: Record<string, unknown>;
  connected_at: string | null;
}

export interface AuthenticatedRequestContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}
