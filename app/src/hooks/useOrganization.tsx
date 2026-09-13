import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/insforgeClient";
import { useAuth } from "./useAuth";
import type { OrganizationMembership, OrganizationRole } from "@/types/domain";

const STORAGE_KEY = "reservation-saas:current-org";

interface OrganizationContextValue {
  memberships: OrganizationMembership[];
  currentOrganizationId: string | null;
  currentRole: OrganizationRole | null;
  isLoading: boolean;
  setCurrentOrganizationId: (id: string) => void;
  refetch: () => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentOrganizationId, setCurrentOrganizationIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ["organization-memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("organization_members")
        .select("organization_id, role, organizations(*)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrganizationMembership[];
    }
  });

  useEffect(() => {
    if (memberships.length === 0) return;
    const stillValid = memberships.some((m) => m.organization_id === currentOrganizationId);
    if (!stillValid) {
      setCurrentOrganizationIdState(memberships[0].organization_id);
      localStorage.setItem(STORAGE_KEY, memberships[0].organization_id);
    }
  }, [memberships, currentOrganizationId]);

  const currentRole = useMemo(
    () => memberships.find((m) => m.organization_id === currentOrganizationId)?.role ?? null,
    [memberships, currentOrganizationId]
  );

  const value: OrganizationContextValue = {
    memberships,
    currentOrganizationId,
    currentRole,
    isLoading,
    setCurrentOrganizationId: (id) => {
      localStorage.setItem(STORAGE_KEY, id);
      setCurrentOrganizationIdState(id);
    },
    refetch: () => queryClient.invalidateQueries({ queryKey: ["organization-memberships", user?.id] })
  };

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error("useOrganization debe usarse dentro de <OrganizationProvider>");
  return ctx;
}
