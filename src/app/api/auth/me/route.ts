import { cookies } from "next/headers";
import { readSession, csrfCookieOptions } from "@/lib/auth";
import { jsonOk } from "@/lib/http";
import { randomToken } from "@/lib/crypto";
import { CSRF_COOKIE } from "@/lib/constants";

export async function GET() {
  const user = await readSession();
  const jar = await cookies();
  if (!jar.get(CSRF_COOKIE)?.value) {
    const res = jsonOk({ user });
    const c = csrfCookieOptions();
    res.cookies.set(c.name, randomToken(24), c);
    return res;
  }
  return jsonOk({ user });
}
