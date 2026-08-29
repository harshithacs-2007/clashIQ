"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JoinCodePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  useEffect(() => {
    sessionStorage.setItem("clashiq_room_code", String(code ?? ""));
    router.replace("/join");
  }, [code, router]);
  return <p className="p-8">Opening room…</p>;
}
