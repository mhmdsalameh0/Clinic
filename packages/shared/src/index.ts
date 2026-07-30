import { z } from "zod";

export const userRoleSchema = z.enum([
  "SUPER_ADMIN",
  "CLINIC_ADMIN",
  "DOCTOR",
  "RECEPTIONIST"
]);

export const appointmentStatusSchema = z.enum([
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW"
]);

export const reminderStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "CANCELLED"
]);

export const reminderTypeSchema = z.enum([
  "APPOINTMENT_24_HOURS",
  "TOMORROW_APPOINTMENTS_SUMMARY"
]);

export const notificationTypeSchema = z.enum([
  "APPOINTMENT_REMINDER",
  "TOMORROW_SUMMARY",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_UPDATED",
  "APPOINTMENT_CANCELLED",
  "SYSTEM"
]);

export const notificationChannelSchema = z.enum(["IN_APP", "EMAIL", "SMS", "WHATSAPP"]);

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string()
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string().datetime(),
  environment: z.string(),
  database: z.enum(["connected", "disconnected"]).optional()
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

export const bootstrapSchema = z.object({
  clinicName: z.string().trim().min(2).max(120),
  clinicPhone: z.string().trim().min(3).max(40).optional().or(z.literal("")),
  clinicEmail: z.string().trim().email().optional().or(z.literal("")),
  clinicAddress: z.string().trim().max(300).optional().or(z.literal("")),
  adminFullName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().email(),
  adminPhone: z.string().trim().min(3).max(40).optional().or(z.literal("")),
  password: z.string().min(8).max(128)
});

export const clinicSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(3).max(40).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  timezone: z.string().trim().min(3).max(80).default("Asia/Beirut").optional(),
  appointmentDefaultDurationMinutes: z.number().int().min(5).max(240).optional()
});

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(3).max(40).optional().or(z.literal("")),
  role: userRoleSchema.exclude(["SUPER_ADMIN"]),
  password: z.string().min(8).max(128)
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(3).max(40).optional().nullable(),
  role: userRoleSchema.exclude(["SUPER_ADMIN"]).optional()
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
});

export const createDoctorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  specialty: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  appointmentDurationMinutes: z.coerce.number().int().min(5).max(240).optional().nullable()
});

export const updateDoctorSchema = createDoctorSchema.partial();

export const createPatientSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(3).max(40),
  alternatePhone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  dateOfBirth: z.string().trim().optional().or(z.literal("")),
  gender: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
});

export const updatePatientSchema = createPatientSchema.partial();

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().trim().max(500).optional().or(z.literal(""))
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: appointmentStatusSchema.optional()
});

export type AuthenticatedUser = {
  id: string;
  clinicId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
};

export type ClinicSettings = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  appointmentDefaultDurationMinutes: number;
  isActive: boolean;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type UserRole = z.infer<typeof userRoleSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;
export type ReminderType = z.infer<typeof reminderTypeSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type BootstrapInput = z.infer<typeof bootstrapSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export type ApiSuccess<T> = {
  data: T;
  error: null;
};

export type ApiFailure = {
  data: null;
  error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
