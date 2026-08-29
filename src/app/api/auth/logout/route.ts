import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/constants";
import { revokeSession } from "@/lib/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { assertCsrf } from "@/lib/csrf";

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(token);
    const res = jsonOk({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0), httpOnly: true });
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
