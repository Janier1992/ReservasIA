export interface OnboardingHoursDraft {
  day_of_week: number;
  is_closed: boolean;
  opening_time: string;
  closing_time: string;
}

export interface OnboardingServiceDraft {
  name: string;
  duration_minutes: number;
  price: number | null;
  currency: string;
}

export interface OnboardingResourceDraft {
  name: string;
  resource_type: string;
  capacity: number;
}

export interface WizardData {
  organizationId: string | null;
  name: string;
  businessType: string;
  timezone: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  hours: OnboardingHoursDraft[];
  services: OnboardingServiceDraft[];
  resources: OnboardingResourceDraft[];
  capacityTotal: number | null;
  agentName: string;
  agentTone: string;
  agentLanguage: string;
}

export const DEFAULT_HOURS: OnboardingHoursDraft[] = Array.from({ length: 7 }, (_, day_of_week) => ({
  day_of_week,
  is_closed: day_of_week === 0,
  opening_time: "09:00",
  closing_time: "18:00"
}));

export const TOTAL_STEPS = 10;
