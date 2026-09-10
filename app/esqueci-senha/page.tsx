import { PasswordResetRequestScreen } from "../ui/email-security";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string | string[] }> }) {
  const params = await searchParams;
  const initialEmail = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  return <PasswordResetRequestScreen initialEmail={initialEmail} />;
}
