import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/hooks/useTheme";
import { AuthProvider } from "@/hooks/useAuth";
import { OrganizationProvider } from "@/hooks/useOrganization";
import { InstallPromptProvider } from "@/hooks/useInstallPrompt";
import { RequireAuth, FullscreenLoader } from "@/components/RequireAuth";
import { RequireModule } from "@/components/RequireModule";
import { RequireOrganization } from "@/components/RequireOrganization";
import { RequireSupportStaff } from "@/components/RequireSupportStaff";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SupportLayout } from "@/components/layout/SupportLayout";

// Cada página se carga en su propio chunk: la primera visita (login) no paga
// el costo de JS de las ~15 pantallas del dashboard que todavía no visitó.
const LoginPage = lazy(() => import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const OnboardingWizard = lazy(() => import("@/pages/onboarding/OnboardingWizard").then((m) => ({ default: m.OnboardingWizard })));
const DashboardHome = lazy(() => import("@/pages/dashboard/DashboardHome").then((m) => ({ default: m.DashboardHome })));
const InboxPage = lazy(() => import("@/pages/dashboard/InboxPage").then((m) => ({ default: m.InboxPage })));
const ReservationsPage = lazy(() => import("@/pages/dashboard/ReservationsPage").then((m) => ({ default: m.ReservationsPage })));
const CustomersPage = lazy(() => import("@/pages/dashboard/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const ServicesPage = lazy(() => import("@/pages/dashboard/ServicesPage").then((m) => ({ default: m.ServicesPage })));
const ResourcesPage = lazy(() => import("@/pages/dashboard/ResourcesPage").then((m) => ({ default: m.ResourcesPage })));
const AgentPage = lazy(() => import("@/pages/dashboard/AgentPage").then((m) => ({ default: m.AgentPage })));
const IntegrationsPage = lazy(() => import("@/pages/dashboard/IntegrationsPage").then((m) => ({ default: m.IntegrationsPage })));
const WalkInsPage = lazy(() => import("@/pages/dashboard/WalkInsPage").then((m) => ({ default: m.WalkInsPage })));
const ReportsPage = lazy(() => import("@/pages/dashboard/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const TeamPage = lazy(() => import("@/pages/dashboard/TeamPage").then((m) => ({ default: m.TeamPage })));
const SettingsPage = lazy(() => import("@/pages/dashboard/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const SupportBusinessesListPage = lazy(() =>
  import("@/pages/support/SupportBusinessesListPage").then((m) => ({ default: m.SupportBusinessesListPage }))
);
const SupportBusinessDetailPage = lazy(() =>
  import("@/pages/support/SupportBusinessDetailPage").then((m) => ({ default: m.SupportBusinessDetailPage }))
);

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <InstallPromptProvider>
          <BrowserRouter>
            <AuthProvider>
              <OrganizationProvider>
                <Toaster richColors position="top-right" />
                <ErrorBoundary title="La aplicación no pudo cargar esta pantalla.">
                  <Suspense fallback={<FullscreenLoader />}>
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

                      <Route element={<RequireAuth />}>
                        <Route path="/onboarding" element={<OnboardingWizard />} />

                        <Route element={<RequireSupportStaff />}>
                          <Route path="/soporte" element={<SupportLayout />}>
                            <Route index element={<SupportBusinessesListPage />} />
                            <Route path="negocios/:orgId" element={<SupportBusinessDetailPage />} />
                          </Route>
                        </Route>

                        <Route element={<RequireOrganization />}>
                          <Route path="/dashboard" element={<DashboardLayout />}>
                            <Route index element={<DashboardHome />} />
                            <Route element={<RequireModule module="inbox" />}>
                              <Route path="inbox" element={<InboxPage />} />
                            </Route>
                            <Route path="reservations" element={<ReservationsPage />} />
                            <Route element={<RequireModule module="walk_ins" />}>
                              <Route path="walk-ins" element={<WalkInsPage />} />
                            </Route>
                            <Route element={<RequireModule module="customers" />}>
                              <Route path="customers" element={<CustomersPage />} />
                            </Route>
                            <Route element={<RequireModule module="services" />}>
                              <Route path="services" element={<ServicesPage />} />
                            </Route>
                            <Route element={<RequireModule module="resources" />}>
                              <Route path="resources" element={<ResourcesPage />} />
                            </Route>
                            <Route element={<RequireModule module="agent" />}>
                              <Route path="agent" element={<AgentPage />} />
                            </Route>
                            <Route element={<RequireModule module="integrations" />}>
                              <Route path="integrations" element={<IntegrationsPage />} />
                            </Route>
                            <Route element={<RequireModule module="reports" />}>
                              <Route path="reports" element={<ReportsPage />} />
                            </Route>
                            <Route element={<RequireModule module="team" />}>
                              <Route path="team" element={<TeamPage />} />
                            </Route>
                            <Route path="settings" element={<SettingsPage />} />
                          </Route>
                        </Route>
                      </Route>

                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </OrganizationProvider>
            </AuthProvider>
          </BrowserRouter>
        </InstallPromptProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
