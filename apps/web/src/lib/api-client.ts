import type {
  AuthenticatedUser,
  BootstrapInput,
  ChangePasswordInput,
  ClinicSettings,
  CreateUserInput,
  CreateAppointmentInput,
  CreateDoctorInput,
  CreatePatientInput,
  LoginInput,
  Paginated,
  ResetPasswordInput,
  UpdateAppointmentInput,
  UpdateDoctorInput,
  UpdatePatientInput,
  UpdateUserInput
} from "@clinic/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

type ApiEnvelope<T> = {
  data: T;
  error: null;
};

type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
  };
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type DoctorDto = {
  id: string;
  fullName: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  appointmentDurationMinutes: number | null;
  isActive: boolean;
};

export type PatientDto = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  isActive: boolean;
};

export type AppointmentDto = {
  id: string;
  patientId: string;
  doctorId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number | null;
  status: string;
  reason: string | null;
  doctor: { id: string; fullName: string; specialty: string | null };
  patient: { id: string; firstName: string; lastName: string; phone: string };
};

export type NotificationDto = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type ReminderDto = {
  id: string;
  appointmentId: string | null;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  appointment: {
    startAt: string;
    doctor: { fullName: string };
    patient: { firstName: string; lastName: string };
  } | null;
};

export type DemoCleanupResult = {
  notifications: number;
  reminders: number;
  appointments: number;
  patients: number;
  doctors: number;
};

async function request<T>(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init.headers
      }
    });
  } catch {
    throw new ApiClientError("تعذر الاتصال بالخادم", 0, "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;

  if (!response.ok) {
    const error = payload && "error" in payload ? payload.error : null;
    throw new ApiClientError(error?.message ?? "تعذر تنفيذ الطلب", response.status, error?.code ?? "REQUEST_FAILED");
  }

  if (!payload || !("data" in payload)) {
    throw new ApiClientError("استجابة غير متوقعة من الخادم", response.status, "INVALID_RESPONSE");
  }

  return payload.data;
}

export const apiClient = {
  bootstrapStatus: () => request<{ initialized: boolean }>("/auth/bootstrap-status"),
  bootstrap: (body: BootstrapInput) =>
    request<{ user: AuthenticatedUser; clinic: ClinicSettings }>("/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  login: (body: LoginInput) =>
    request<{ user: AuthenticatedUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: AuthenticatedUser }>("/auth/me"),
  changePassword: (body: ChangePasswordInput) =>
    request<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  clinic: () => request<{ clinic: ClinicSettings }>("/clinic"),
  updateClinic: (body: Partial<ClinicSettings>) =>
    request<{ clinic: ClinicSettings }>("/clinic", {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  users: (query = "") => request<Paginated<AuthenticatedUser>>(`/users${query}`),
  createUser: (body: CreateUserInput) =>
    request<{ user: AuthenticatedUser }>("/users", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateUser: (id: string, body: UpdateUserInput) =>
    request<{ user: AuthenticatedUser }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  activateUser: (id: string) => request<{ user: AuthenticatedUser }>(`/users/${id}/activate`, { method: "POST" }),
  deactivateUser: (id: string) => request<{ user: AuthenticatedUser }>(`/users/${id}/deactivate`, { method: "POST" }),
  resetPassword: (id: string, body: ResetPasswordInput) =>
    request<{ user: AuthenticatedUser }>(`/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  doctors: (query = "") => request<Paginated<DoctorDto>>(`/doctors${query}`),
  createDoctor: (body: CreateDoctorInput) =>
    request<{ doctor: DoctorDto }>("/doctors", { method: "POST", body: JSON.stringify(body) }),
  updateDoctor: (id: string, body: UpdateDoctorInput) =>
    request<{ doctor: DoctorDto }>(`/doctors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  activateDoctor: (id: string) => request<{ doctor: DoctorDto }>(`/doctors/${id}/activate`, { method: "POST" }),
  deactivateDoctor: (id: string) => request<{ doctor: DoctorDto }>(`/doctors/${id}/deactivate`, { method: "POST" }),
  deleteDoctor: (id: string) => request<{ ok: boolean }>(`/doctors/${id}`, { method: "DELETE" }),
  patients: (query = "") => request<Paginated<PatientDto>>(`/patients${query}`),
  createPatient: (body: CreatePatientInput) =>
    request<{ patient: PatientDto }>("/patients", { method: "POST", body: JSON.stringify(body) }),
  updatePatient: (id: string, body: UpdatePatientInput) =>
    request<{ patient: PatientDto }>(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  activatePatient: (id: string) => request<{ patient: PatientDto }>(`/patients/${id}/activate`, { method: "POST" }),
  deactivatePatient: (id: string) => request<{ patient: PatientDto }>(`/patients/${id}/deactivate`, { method: "POST" }),
  deletePatient: (id: string) => request<{ ok: boolean }>(`/patients/${id}`, { method: "DELETE" }),
  appointments: (query = "") => request<Paginated<AppointmentDto>>(`/appointments${query}`),
  todayAppointments: () => request<{ items: AppointmentDto[] }>("/appointments/today"),
  tomorrowAppointments: () => request<{ items: AppointmentDto[] }>("/appointments/tomorrow"),
  nextAppointment: () => request<{ appointment: AppointmentDto | null }>("/appointments/next"),
  createAppointment: (body: CreateAppointmentInput) =>
    request<{ appointment: AppointmentDto }>("/appointments", { method: "POST", body: JSON.stringify(body) }),
  updateAppointment: (id: string, body: UpdateAppointmentInput) =>
    request<{ appointment: AppointmentDto }>(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  cancelAppointment: (id: string) => request<{ appointment: AppointmentDto }>(`/appointments/${id}/cancel`, { method: "POST" }),
  deleteAppointment: (id: string) => request<{ ok: boolean }>(`/appointments/${id}`, { method: "DELETE" }),
  notifications: () => request<Paginated<NotificationDto>>("/notifications"),
  unreadCount: () => request<{ count: number }>("/notifications/unread-count"),
  markNotificationRead: (id: string) => request<{ notification: NotificationDto }>(`/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () => request<{ count: number }>("/notifications/read-all", { method: "POST" }),
  deleteNotification: (id: string) => request<{ ok: boolean }>(`/notifications/${id}`, { method: "DELETE" }),
  deleteReadNotifications: () => request<{ count: number }>("/notifications/read", { method: "DELETE" }),
  reminders: () => request<{ items: ReminderDto[] }>("/reminders"),
  deleteReminder: (id: string) => request<{ ok: boolean }>(`/reminders/${id}`, { method: "DELETE" }),
  cleanupDemoData: (confirmation: string) =>
    request<DemoCleanupResult>("/clinic/demo-cleanup", { method: "POST", body: JSON.stringify({ confirmation }) })
};
