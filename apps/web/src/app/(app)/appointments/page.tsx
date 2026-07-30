"use client";

import { FormEvent, useState } from "react";
import type { AppointmentDto, DoctorDto, PatientDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatDateInput, formatDateTime, formatTimeInput } from "@/lib/datetime";
import { prependItem, removeItem, replaceItem } from "@/lib/optimistic-list";
import { canPermanentlyDelete } from "@/lib/roles";
import { useLiveRevalidation } from "@/lib/use-live-revalidation";

type AppointmentFormState = {
  patientId: string;
  doctorId: string;
  date: string;
  time: string;
  reason: string;
};

const emptyForm: AppointmentFormState = {
  patientId: "",
  doctorId: "",
  date: "",
  time: "",
  reason: ""
};

type AppointmentPageData = {
  appointments: AppointmentDto[];
  doctors: DoctorDto[];
  patients: PatientDto[];
};

export default function AppointmentsPage() {
  const user = useAuth();
  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [patients, setPatients] = useState<PatientDto[]>([]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [formState, setFormState] = useState<AppointmentFormState>(emptyForm);

  const { isInitialLoading, revalidate } = useLiveRevalidation<AppointmentPageData>({
    load: async () => {
      const [appointmentResult, doctorResult, patientResult] = await Promise.all([
        apiClient.appointments(),
        apiClient.doctors(),
        apiClient.patients()
      ]);
      return {
        appointments: appointmentResult.items,
        doctors: doctorResult.items.filter((item) => item.isActive),
        patients: patientResult.items.filter((item) => item.isActive)
      };
    },
    onData: (data) => {
      setAppointments(data.appointments);
      setDoctors(data.doctors);
      setPatients(data.patients);
    },
    onError: (caught) => setMessage(caught instanceof ApiClientError ? caught.message : "تعذر تحميل المواعيد"),
    deps: []
  });

  function updateField(name: keyof AppointmentFormState, value: string) {
    setFormState((current) => ({ ...current, [name]: value }));
  }

  function startEditingAppointment(appointment: AppointmentDto) {
    setMessage("");
    setEditingAppointmentId(appointment.id);
    setFormState({
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      date: formatDateInput(appointment.startAt),
      time: formatTimeInput(appointment.startAt),
      reason: appointment.reason ?? ""
    });
  }

  function cancelEditing() {
    setEditingAppointmentId(null);
    setFormState(emptyForm);
    setMessage("");
  }

  async function cancelAppointment(appointment: AppointmentDto) {
    if (!window.confirm("هل أنت متأكد من إلغاء الموعد؟")) return;
    const previous = appointments;
    setMessage("");
    setPendingId(appointment.id);
    setAppointments((current) => replaceItem(current, { ...appointment, status: "CANCELLED" }));
    try {
      const result = await apiClient.cancelAppointment(appointment.id);
      setAppointments((current) => replaceItem(current, result.appointment));
      setMessage("تم إلغاء الموعد");
      void revalidate();
    } catch (caught) {
      setAppointments(previous);
      setMessage(caught instanceof ApiClientError ? caught.message : "تعذر إلغاء الموعد");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteAppointment(appointment: AppointmentDto) {
    if (!window.confirm("هل أنت متأكد من حذف الموعد نهائياً؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    const previous = appointments;
    setMessage("");
    setPendingId(appointment.id);
    setAppointments((current) => removeItem(current, appointment.id));
    try {
      await apiClient.deleteAppointment(appointment.id);
      setMessage("تم حذف الموعد نهائياً");
      void revalidate();
    } catch (caught) {
      setAppointments(previous);
      setMessage(caught instanceof ApiClientError ? caught.message : "تعذر حذف الموعد");
    } finally {
      setPendingId(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setMessage("");
    setIsSubmitting(true);
    try {
      if (editingAppointmentId) {
        const result = await apiClient.updateAppointment(editingAppointmentId, formState);
        setAppointments((current) => replaceItem(current, result.appointment));
        setMessage("تم حفظ التغييرات");
      } else {
        const result = await apiClient.createAppointment(formState);
        setAppointments((current) => prependItem(current, result.appointment));
        setMessage("تم إنشاء الموعد");
      }
      setEditingAppointmentId(null);
      setFormState(emptyForm);
      void revalidate();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "تعذر حفظ الموعد");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">{editingAppointmentId ? "تغيير الموعد" : "إنشاء موعد"}</h2>
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
          <select name="patientId" required value={formState.patientId} onChange={(event) => updateField("patientId", event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
            <option value="">اختر المريض</option>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName}</option>)}
          </select>
          <select name="doctorId" required value={formState.doctorId} onChange={(event) => updateField("doctorId", event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
            <option value="">اختر الطبيب</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>الدكتور {doctor.fullName}</option>)}
          </select>
          <input name="date" required type="date" value={formState.date} onChange={(event) => updateField("date", event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="time" required type="time" value={formState.time} onChange={(event) => updateField("time", event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="reason" value={formState.reason} onChange={(event) => updateField("reason", event.target.value)} placeholder="سبب الموعد أو ملاحظة" className="rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
          {message ? <p className="md:col-span-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button disabled={isSubmitting} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              {isSubmitting ? "جار الحفظ..." : editingAppointmentId ? "حفظ التغييرات" : "حفظ الموعد"}
            </button>
            {editingAppointmentId ? (
              <button type="button" onClick={cancelEditing} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                إلغاء التعديل
              </button>
            ) : null}
          </div>
        </form>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">المواعيد</h2>
        <div className="mt-4 space-y-3">
          {isInitialLoading ? <p className="rounded-md bg-slate-100 p-4 text-sm text-slate-500">جار تحميل المواعيد...</p> : null}
          {!isInitialLoading && appointments.length === 0 ? <p className="text-sm text-slate-500">لا توجد مواعيد بعد</p> : null}
          {appointments.map((appointment) => (
            <article key={appointment.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <p className="font-semibold text-slate-950">{appointment.patient.firstName} {appointment.patient.lastName}</p>
              <p className="mt-1 text-sm text-slate-600">مع الدكتور {appointment.doctor.fullName} - {formatDateTime(appointment.startAt)}</p>
              {appointment.reason ? <p className="mt-1 text-xs text-slate-500">{appointment.reason}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={pendingId === appointment.id} onClick={() => startEditingAppointment(appointment)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50">تغيير الموعد</button>
                {appointment.status !== "CANCELLED" ? (
                  <button disabled={pendingId === appointment.id} onClick={() => void cancelAppointment(appointment)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50">إلغاء الموعد</button>
                ) : null}
                {canPermanentlyDelete(user.role) ? (
                  <button disabled={pendingId === appointment.id} onClick={() => void deleteAppointment(appointment)} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">حذف نهائي</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
