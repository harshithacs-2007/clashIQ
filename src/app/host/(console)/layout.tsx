import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";

export default async function HostConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/host/login");
  if (user.role !== "HOST") redirect("/join");
  return children;
}
