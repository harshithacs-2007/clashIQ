import { cookies } from "next/headers";
import { readSession, csrfCookieOptions } from "@/lib/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { randomToken } from "@/lib/crypto";
import { CSRF_COOKIE } from "@/lib/constants";
import { databaseUrl } from "@/lib/db";

export async function GET() {
  try {
    const jar = await cookies();
    const setCsrf = !jar.get(CSRF_COOKIE)?.value;

    if (!databaseUrl()) {
      const res = jsonOk({ user: null });
      if (setCsrf) {
        const c = csrfCookieOptions();
        res.cookies.set(c.name, randomToken(24), c);
      }
      return res;
    }

    const user = await readSession();
    const res = jsonOk({
      user: user
        ? { id: user.id, email: user.email, displayName: user.displayName, role: user.role }
        : null,
    });
    if (setCsrf) {
      const c = csrfCookieOptions();
      res.cookies.set(c.name, randomToken(24), c);
    }
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
