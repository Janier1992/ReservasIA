export type OrganizationRole = "owner" | "admin" | "staff";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  status: "active" | "suspended" | "cancelled";
  timezone: string;
  subscription_expires_at: string | null;
  // Módulos opcionales apagados por soporte (ver lib/modules.ts).
  disabled_modules: string[];
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPayment {
  id: string;
  organization_id: string;
  submitted_by: string;
  receipt_storage_path: string;
  amount: number | null;
  note: string | null;
  status: "pending" | "confirmed" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface OrganizationMembership {
  organization_id: string;
  role: OrganizationRole;
  organizations: Organization;
}

export interface BusinessProfile {
  id: string;
  organization_id: string;
  name: string;
  logo_url: string | null;
  /** Eslogan corto (máx. 90) que aparece en los correos de reserva. */
  tagline: string | null;
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
  reminder_hours_before: number;
  review_url?: string | null;
  survey_auto_send?: boolean;
  reactivation_days?: number;
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
  created_at: string;
  health_data_consent_at?: string | null;
  health_data_consent_source?: string | null;
}

export type ConversationChannel = "whatsapp" | "instagram" | "web" | "telegram" | "facebook";

export interface Conversation {
  id: string;
  organization_id: string;
  customer_id: string | null;
  channel: ConversationChannel;
  status: "active" | "closed" | "archived";
  updated_at: string;
  customers?: Customer | null;
}

export type MessageRole = "user" | "assistant" | "system" | "tool" | "staff";

export interface Message {
  id: string;
  organization_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  message_type: string;
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
  start_at: string;
  end_at: string;
  party_size: number | null;
  customer_name: string | null;
  special_requests: string | null;
  status: ReservationStatus;
  source: string;
  google_event_id: string | null;
  payment_status: PaymentStatus;
  deposit_amount: number | null;
  recurrence_group_id: string | null;
  asset_id?: string | null;
  stage?: string | null;
  stage_updated_at?: string | null;
  conversation_id?: string | null;
  customers?: Customer | null;
  services?: Service | null;
  resources?: Resource | null;
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

export interface SupportNote {
  id: string;
  organization_id: string;
  author_user_id: string;
  note: string;
  created_at: string;
}

export interface OrganizationInvite {
  id: string;
  organization_id: string;
  email: string;
  role: "admin" | "staff";
  status: "pending" | "accepted" | "revoked";
  invited_by: string;
}

export type WalkInStatus = "waiting" | "in_service" | "done" | "left";

/** Producto de un pedido por QR, tal como estaba en la carta al pedir. */
export interface OrderItem {
  service_id: string;
  name: string;
  quantity: number;
  unit_price: number | null;
  currency: string | null;
}

export interface WalkIn {
  id: string;
  organization_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  service_id: string | null;
  notes: string | null;
  status: WalkInStatus;
  reservation_id: string | null;
  party_size: number | null;
  arrived_at: string;
  served_at: string | null;
  finished_at: string | null;
  /** "qr": pedido del cliente desde la página pública; "staff": lo registró el equipo. */
  source: "staff" | "qr";
  notify_channel: "telegram" | "whatsapp" | null;
  notify_identity: string | null;
  ready_at: string | null;
  notified_at: string | null;
  notify_error: string | null;
  /** Productos del pedido por QR (puede haber varios); null en registros del equipo. */
  order_items: OrderItem[] | null;
  services?: Pick<Service, "name" | "duration_minutes" | "price" | "currency"> | null;
  reservations?: { resource_id: string | null; start_at: string; source: string; resources: Pick<Resource, "name"> | null } | null;
}

export interface CustomerAsset {
  id: string;
  organization_id: string;
  customer_id: string;
  asset_type: "vehicle" | "pet" | "preferences" | "student";
  label: string;
  attributes: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PlanKind = "sessions" | "membership" | "stamps";

export interface PackagePlan {
  id: string;
  organization_id: string;
  name: string;
  kind: PlanKind;
  sessions_total: number | null;
  validity_days: number | null;
  price: number | null;
  currency: string;
  service_ids: string[];
  reward_text: string | null;
  is_active: boolean;
}

export interface CustomerPlan {
  id: string;
  organization_id: string;
  customer_id: string;
  plan_id: string | null;
  name: string;
  kind: PlanKind;
  sessions_total: number | null;
  sessions_used: number;
  service_ids: string[];
  reward_text: string | null;
  starts_on: string;
  expires_on: string | null;
  status: "active" | "exhausted" | "reward_ready" | "redeemed" | "expired" | "cancelled";
  notes: string | null;
  created_at: string;
  customers?: Pick<Customer, "name" | "phone"> | null;
}

export type PaymentMethod = "cash" | "nequi" | "card" | "transfer" | "other";

export interface Payment {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  customer_id: string | null;
  customer_plan_id: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  concept: string | null;
  paid_at: string;
  service_id: string | null;
  quantity: number;
  customers?: Pick<Customer, "name"> | null;
  services?: Pick<Service, "name"> | null;
}

export interface ResourceHourPeriod {
  id: string;
  organization_id: string;
  resource_id: string;
  day_of_week: number;
  opening_time: string;
  closing_time: string;
}

export interface ScheduleBlock {
  id: string;
  organization_id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  resources?: { name: string } | null;
}

export interface SurveyRequest {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  customer_id: string | null;
  token: string;
  sent_via: string | null;
  sent_at: string | null;
  rating: number | null;
  comment: string | null;
  answered_at: string | null;
  created_at: string;
  customers?: Pick<Customer, "name" | "phone"> | null;
}

export interface ReactivationCandidate {
  customer_id: string;
  name: string | null;
  phone: string;
  conversation_id: string | null;
  last_visit_at: string;
  visits: number;
  last_service_name: string | null;
  last_contacted_at: string | null;
}
