import { PasswordResetScreen } from "../../ui/email-security";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PasswordResetScreen token={token} />;
}
