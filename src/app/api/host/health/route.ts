import { collectHealth } from "@/lib/health";
import { jsonError, jsonOk } from "@/lib/http";
import { requireHost } from "@/lib/request";

export async function GET(req: Request) {
  try {
    await requireHost(req);
    const health = await collectHealth();
    return jsonOk({ health, checkedAt: new Date().toISOString() });
  } catch (e) {
    return jsonError(e);
  }
}
