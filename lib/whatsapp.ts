export function normalizeWhatsappPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  while (digits.startsWith("0")) digits = digits.slice(1);
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

export function whatsappReminderAt(date: string, time: string, hoursBefore: number, nowMs = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const hours = Math.round(Number(hoursBefore));
  if (!Number.isFinite(hours) || hours < 1 || hours > 72) return null;
  // Cortou Anotou opera hoje no fuso America/Sao_Paulo e os horários da agenda são locais.
  const appointment = new Date(`${date}T${time}:00-03:00`);
  if (!Number.isFinite(appointment.getTime())) return null;
  const reminder = new Date(appointment.getTime() - hours * 60 * 60 * 1000);
  return reminder.getTime() > nowMs + 60_000 ? reminder.toISOString() : null;
}
