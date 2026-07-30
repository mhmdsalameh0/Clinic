import type { UserRole } from "@clinic/shared";

export const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "مدير عام",
  CLINIC_ADMIN: "مديرة",
  DOCTOR: "طبيب",
  RECEPTIONIST: "استقبال"
};

export function canManageUsers(role?: UserRole) {
  return role === "CLINIC_ADMIN";
}

export function canPermanentlyDelete(role?: UserRole) {
  return role === "CLINIC_ADMIN";
}
