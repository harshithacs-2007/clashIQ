import { NextResponse } from "next/server";
import { log } from "./logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
  const message =
    error instanceof Error && (status === 401 || status === 403 || status === 400 || status === 409 || status === 429)
      ? publicMessage(error.message)
      : "Request failed.";
  if (status >= 500) {
    log.error("api_error", { err: error instanceof Error ? error.message : "unknown" });
  }
  return NextResponse.json({ error: message }, { status: Number.isFinite(status) && status >= 400 ? status : 500 });
}

function publicMessage(code: string): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "Sign in to continue.";
    case "FORBIDDEN":
      return "You do not have access to this resource.";
    case "CSRF_ORIGIN":
    case "CSRF_TOKEN":
      return "This request could not be verified.";
    default:
      return code.length < 80 ? code : "Request failed.";
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
