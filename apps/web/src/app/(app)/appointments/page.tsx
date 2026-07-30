"use client";

import { FormEvent, useEffect, useState } from "react";
import type { UserRole } from "@clinic/shared";
import type { AppointmentDto, DoctorDto, PatientDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { formatDateInput, formatDateTime, formatTimeInput } from "@/lib/datetime";
import { canPermanentlyDelete } from "@/lib/roles";

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

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [doctors, setDoctors] = useState<DoctorDto[]>([]);
  const [patients, setPatients] = useState<PatientDto[]>([]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [role, setRole] = useState<UserRole | undefined>();
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [formState, setFormState] = useState<AppointmentFormState>(emptyForm);

  async function load() {
    const [appointmentResult, doctorResult, patientResult, me] = await Promise.all([
      apiClient.appointments(),
      apiClient.doctors(),
      apiClient.patients(),
      apiClient.me().catch(() => null)
    ]);
    setAppointments(appointmentResult.items);
    setDoctors(doctorResult.items.filter((item) => item.isActive));
    setPatients(patientResult.items.filter((item) => item.isActive));
    if (me) setRole(me.user.role);
  }

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
    setMessage("");
    try {
      await apiClient.cancelAppointment(appointment.id);
      setMessage("تم إلغاء الموعد");
      await load();
    } catch (caught) {
      setMessage(caught instanceof ApiClientError ? caught.message : "تعذر إلغاء الموعد");
    }
  }

  async function deleteAppointment(appointment: AppointmentDto) {
    if (!window.confirm("هل أنت متأكد من حذف الموعد نهائياً؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setMessage("");
    try {
      await apiClient.deleteAppointment(appointment.id);
      setMessage("تم حذف الموعد نهائياً");
      await load();
    } catch (caught) {
      setMessage(caught instanceof ApiClientError ? caught.message : "تعذر حذف الموعد");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const formElement = event.currentTarget;
    setMessage("");
    setIsSubmitting(true);
    try {
      if (editingAppointmentId) {
        await apiClient.updateAppointment(editingAppointmentId, formState);
        setMessage("تم حفظ التغييرات");
      } else {
        await apiClient.createAppointment(formState);
        setMessage("تم إنشاء الموعد");
      }
      formElement.reset();
      setEditingAppointmentId(null);
      setFormState(emptyForm);
      await load();
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "تعذر الاتصال بالخادم. تأكد من تشغيل الواجهة الخلفية ثم حاول مرة أخرى.");
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
          {appointments.length === 0 ? <p className="text-sm text-slate-500">لا توجد مواعيد بعد</p> : null}
          {appointments.map((appointment) => (
            <article key={appointment.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <p className="font-semibold text-slate-950">{appointment.patient.firstName} {appointment.patient.lastName}</p>
              <p className="mt-1 text-sm text-slate-600">مع الدكتور {appointment.doctor.fullName} - {formatDateTime(appointment.startAt)}</p>
              {appointment.reason ? <p className="mt-1 text-xs text-slate-500">{appointment.reason}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => startEditingAppointment(appointment)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">تغيير الموعد</button>
                {appointment.status !== "CANCELLED" ? (
                  <button onClick={() => void cancelAppointment(appointment)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">إلغاء الموعد</button>
                ) : null}
                {canPermanentlyDelete(role) ? (
                  <button onClick={() => void deleteAppointment(appointment)} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700">حذف نهائي</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
