import { LoginClient } from "@/components/auth/login-client";
import { SignedOutOnly } from "@/components/auth/signed-out-only";

export default function LoginPage() {
  return (
    <SignedOutOnly>
      <LoginClient />
    </SignedOutOnly>
  );
}
