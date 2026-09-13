import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/useAuth";
import { OrganizationProvider } from "@/hooks/useOrganization";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireOrganization } from "@/components/RequireOrganization";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { OnboardingWizard } from "@/pages/onboarding/OnboardingWizard";
import { DashboardHome } from "@/pages/dashboard/DashboardHome";
import { InboxPage } from "@/pages/dashboard/InboxPage";
import { ReservationsPage } from "@/pages/dashboard/ReservationsPage";
import { CustomersPage } from "@/pages/dashboard/CustomersPage";
import { ServicesPage } from "@/pages/dashboard/ServicesPage";
import { ResourcesPage } from "@/pages/dashboard/ResourcesPage";
import { AgentPage } from "@/pages/dashboard/AgentPage";
import { IntegrationsPage } from "@/pages/dashboard/IntegrationsPage";
import { TeamPage } from "@/pages/dashboard/TeamPage";
import { SettingsPage } from "@/pages/dashboard/SettingsPage";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <Toaster richColors position="top-right" />
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />

              <Route element={<RequireAuth />}>
                <Route path="/onboarding" element={<OnboardingWizard />} />

                <Route element={<RequireOrganization />}>
                  <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<DashboardHome />} />
                    <Route path="inbox" element={<InboxPage />} />
                    <Route path="reservations" element={<ReservationsPage />} />
                    <Route path="customers" element={<CustomersPage />} />
                    <Route path="services" element={<ServicesPage />} />
                    <Route path="resources" element={<ResourcesPage />} />
                    <Route path="agent" element={<AgentPage />} />
                    <Route path="integrations" element={<IntegrationsPage />} />
                    <Route path="team" element={<TeamPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
