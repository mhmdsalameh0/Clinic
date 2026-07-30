import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";

const arabicFieldLabels: Record<string, string> = {
  fullName: "اسم الطبيب",
  specialty: "الاختصاص",
  phone: "الهاتف",
  email: "البريد الإلكتروني",
  appointmentDurationMinutes: "مدة الموعد"
};

function validationMessage(error: ZodError) {
  const issue = error.issues[0];
  const field = issue?.path.join(".");
  const label = field ? arabicFieldLabels[field] ?? field : "البيانات";

  if (issue?.code === "invalid_format" && field === "email") return "البريد الإلكتروني للطبيب غير صالح";
  if (issue?.code === "invalid_type" && field === "appointmentDurationMinutes") return "مدة الموعد يجب أن تكون رقماً";
  if (issue?.code === "too_small" && field === "appointmentDurationMinutes") return "مدة الموعد يجب ألا تقل عن 5 دقائق";
  if (issue?.code === "too_big" && field === "appointmentDurationMinutes") return "مدة الموعد يجب ألا تزيد عن 240 دقيقة";
  if (issue?.code === "too_small") return `${label} قصير جداً`;
  if (issue?.code === "too_big") return `${label} طويل جداً`;

  return `يرجى التحقق من ${label}`;
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error({ err: error }, "request failed");

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: validationMessage(error),
        issues: error.issues
      }
    });
  }

  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "حدث خطأ غير متوقع في الخادم. يرجى المحاولة مرة أخرى."
    }
  });
}
