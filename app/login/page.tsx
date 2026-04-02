import { redirect } from "next/navigation";

import { LoginForm } from "@/lib/components/login-form";
import { getSessionUser } from "@/lib/server/auth";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/budget");
  }

  return (
    <div className="login-wrap">
      <section className="card login-card">
        <h1>My Budget</h1>
        <p className="muted">Sign in with your seeded single-user account.</p>
        <LoginForm />
      </section>
    </div>
  );
}
