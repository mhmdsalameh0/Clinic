import type { Appointment, Doctor, Patient } from "@prisma/client";

export type AppointmentWithPeople = Appointment & {
  doctor: Doctor;
  patient: Patient;
};

export function appointmentDto(appointment: AppointmentWithPeople) {
  return {
    id: appointment.id,
    clinicId: appointment.clinicId,
    doctorId: appointment.doctorId,
    patientId: appointment.patientId,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    reason: appointment.reason,
    internalNotes: appointment.internalNotes,
    doctor: {
      id: appointment.doctor.id,
      fullName: appointment.doctor.fullName,
      specialty: appointment.doctor.specialty
    },
    patient: {
      id: appointment.patient.id,
      firstName: appointment.patient.firstName,
      lastName: appointment.patient.lastName,
      phone: appointment.patient.phone
    }
  };
}

