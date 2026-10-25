import { redirect } from "next/navigation";
import { getSession, getRoleRedirectPath } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    redirect(getRoleRedirectPath(session.role));
  }
  redirect("/login");
}
