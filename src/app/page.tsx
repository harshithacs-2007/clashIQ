"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Brand } from "@/components/Brand";
import { AvatarRig, defaultAvatar } from "@/components/AvatarRig";

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Brand />
        <nav className="flex gap-3 text-sm">
          <Link className="px-3 py-2 text-[var(--mute)] hover:text-white" href="/login">Sign in</Link>
          <Link className="bg-[var(--lime)] px-3 py-2 font-semibold text-black" href="/signup">Create account</Link>
          <Link className="border border-[var(--line)] px-3 py-2" href="/host/login">Host</Link>
        </nav>
      </header>

      <section className="mt-20 grid items-center gap-12 md:grid-cols-2">
        <div>
          <p className="mono text-xs tracking-[0.22em] text-[var(--lime)]">COLLEGE EVENT RUNTIME</p>
          <h1 className="mt-3 text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Run the round.
            <span className="block text-[var(--mute)]">Not the slideshow.</span>
          </h1>
          <p className="mt-5 max-w-md text-[var(--mute)]">
            clashIQ is a server-authoritative competition OS for quizzes, judged coding, power cards,
            and live proctoring — built for 50–100 people in one room, not a marketing mock.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/join" className="bg-[var(--lime)] px-5 py-3 font-semibold text-black">Join a room</Link>
            <Link href="/host/login" className="border border-[var(--line)] px-5 py-3">Open host console</Link>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel relative overflow-hidden p-5"
        >
          <div className="mono mb-4 flex justify-between text-[11px] text-[var(--mute)]">
            <span>ROOM CX7K-Q2M9</span>
            <span className="text-[var(--lime)]">LIVE · QUIZ 02</span>
          </div>
          <div className="space-y-2">
            {[["NEON STACK", 840], ["BIT FORGE", 790], ["NULL SET", 640]].map(([name, score], i) => (
              <motion.div
                key={String(name)}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.15 * i }}
                className="flex items-center justify-between bg-[var(--panel-2)] px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="mono w-6 text-[var(--mute)]">{i + 1}</span>
                  <AvatarRig config={{ ...defaultAvatar(), hue: 90 + i * 40, style: i === 1 ? "robot" : "cyber" }} size={36} />
                  <span>{name}</span>
                </div>
                <span className="mono text-[var(--lime)]">{score}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="mt-24 grid gap-4 md:grid-cols-3">
        {[
          ["Host control", "Start, pause, lock, extend, and jump rounds from one console. Timers live on the server."],
          ["Judged coding", "Monaco in the browser. Isolated Judge0 workers. Hidden tests never leave the server."],
          ["Power economy", "Atomic inventory. If three cards exist, only three purchases succeed — even under a stampede."],
        ].map(([t, d]) => (
          <article key={t} className="panel p-5">
            <h2 className="text-lg font-semibold">{t}</h2>
            <p className="mt-2 text-sm text-[var(--mute)]">{d}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
