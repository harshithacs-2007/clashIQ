"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Option = { id?: string; label: string; isCorrect: boolean };
type Question = {
  id: string;
  prompt: string;
  explanation: string;
  points: number;
  timeLimitMs: number;
  imageId: string | null;
  sortOrder: number;
  options: { id: string; label: string; isCorrect: boolean; sortOrder: number }[];
};

type Draft = {
  prompt: string;
  explanation: string;
  points: number;
  options: Option[];
  imageId: string | null;
};

const emptyDraft = (): Draft => ({
  prompt: "",
  explanation: "",
  points: 100,
  imageId: null,
  options: [
    { label: "", isCorrect: true },
    { label: "", isCorrect: false },
    { label: "", isCorrect: false },
    { label: "", isCorrect: false },
  ],
});

export function QuizBuilder({
  roomId,
  activityId,
  title,
  durationMs,
  onChanged,
}: {
  roomId: string;
  activityId: string;
  title: string;
  durationMs: number;
  onChanged: () => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [quizTitle, setQuizTitle] = useState(title);
  const [duration, setDuration] = useState(Math.round(durationMs / 1000));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ instructions: string; questions: Question[]; activity: { title: string; durationMs: number } }>(
      `/api/host/quiz/questions?activityId=${activityId}`,
    );
    setInstructions(data.instructions);
    setQuestions(data.questions);
    setQuizTitle(data.activity.title);
    setDuration(Math.round(data.activity.durationMs / 1000));
  }, [activityId]);

  useEffect(() => { void load(); }, [load]);

  async function saveMeta() {
    setBusy(true);
    setError("");
    try {
      await api("/api/host/activities", {
        method: "PATCH",
        body: JSON.stringify({
          roomId,
          activityId,
          action: "UPDATE",
          title: quizTitle,
          durationMs: duration * 1000,
          instructions,
        }),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("roomId", roomId);
    const res = await api<{ media: { id: string } }>("/api/uploads", { method: "POST", body: form });
    setDraft((d) => ({ ...d, imageId: res.media.id }));
  }

  async function saveQuestion() {
    setBusy(true);
    setError("");
    const options = draft.options.filter((o) => o.label.trim());
    try {
      if (editingId) {
        await api("/api/host/quiz/questions", {
          method: "PATCH",
          body: JSON.stringify({
            questionId: editingId,
            prompt: draft.prompt,
            explanation: draft.explanation,
            points: draft.points,
            imageId: draft.imageId,
            options,
          }),
        });
      } else {
        await api("/api/host/quiz/questions", {
          method: "POST",
          body: JSON.stringify({
            activityId,
            prompt: draft.prompt,
            explanation: draft.explanation,
            points: draft.points,
            imageId: draft.imageId ?? undefined,
            options,
          }),
        });
      }
      setDraft(emptyDraft());
      setEditingId(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save question.");
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(id: string) {
    await api("/api/host/quiz/questions", { method: "PATCH", body: JSON.stringify({ questionId: id, delete: true }) });
    await load();
    onChanged();
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item!);
    await api("/api/host/quiz/questions", {
      method: "PATCH",
      body: JSON.stringify({ activityId, orderedIds: next }),
    });
    await load();
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setDraft({
      prompt: q.prompt,
      explanation: q.explanation,
      points: q.points,
      imageId: q.imageId,
      options: q.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })),
    });
    setPreview(false);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs">
          Title
          <input className="mt-1 w-full bg-[var(--panel-2)] px-2 py-1" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} />
        </label>
        <label className="text-xs">
          Duration (seconds)
          <input type="number" min={5} className="mt-1 w-full bg-[var(--panel-2)] px-2 py-1" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </label>
      </div>
      <label className="block text-xs">
        Instructions
        <textarea className="mt-1 w-full bg-[var(--panel-2)] px-2 py-2" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </label>
      <button disabled={busy} onClick={() => void saveMeta()} className="border border-[var(--line)] px-3 py-1 text-sm">Save quiz details</button>

      <div className="flex gap-2">
        <button onClick={() => setPreview(false)} className={`px-2 py-1 text-xs ${!preview ? "bg-[var(--lime)] text-black" : "border border-[var(--line)]"}`}>Edit</button>
        <button onClick={() => setPreview(true)} className={`px-2 py-1 text-xs ${preview ? "bg-[var(--lime)] text-black" : "border border-[var(--line)]"}`}>Preview</button>
      </div>

      {preview ? (
        <div className="panel space-y-4 p-4">
          <h3 className="text-lg">{quizTitle}</h3>
          {instructions && <p className="text-sm text-[var(--mute)]">{instructions}</p>}
          {questions.map((q, i) => (
            <article key={q.id}>
              <p className="font-medium">{i + 1}. {q.prompt}</p>
              {q.imageId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={`/api/media/${q.imageId}`} className="mt-2 max-h-40" />
              )}
              <ul className="mt-2 space-y-1 text-sm">
                {q.options.map((o) => (
                  <li key={o.id} className="border border-[var(--line)] px-2 py-1">{o.label}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <>
          <ol className="space-y-2 text-sm">
            {questions.map((q, i) => (
              <li key={q.id} className="flex items-start justify-between gap-2 bg-[var(--panel-2)] px-3 py-2">
                <div>
                  <div>{i + 1}. {q.prompt}</div>
                  <div className="text-xs text-[var(--mute)]">{q.points} pts · {q.options.length} options</div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => void move(q.id, -1)}>Up</button>
                  <button onClick={() => void move(q.id, 1)}>Down</button>
                  <button onClick={() => startEdit(q)}>Edit</button>
                  <button onClick={() => void removeQuestion(q.id)} className="text-[var(--danger)]">Delete</button>
                </div>
              </li>
            ))}
          </ol>

          <div className="panel space-y-2 p-3">
            <h4 className="text-sm font-semibold">{editingId ? "Edit question" : "New question"}</h4>
            <input className="w-full bg-[var(--panel)] px-2 py-1" placeholder="Prompt" value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
            <textarea className="w-full bg-[var(--panel)] px-2 py-1" placeholder="Explanation (host / results)" value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
            <label className="text-xs">Points
              <input type="number" min={1} className="ml-2 bg-[var(--panel)] px-2 py-1" value={draft.points} onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })} />
            </label>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f).catch((err) => setError(err instanceof Error ? err.message : "Upload failed")); }} />
            {draft.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name={`correct-${activityId}`} checked={o.isCorrect} onChange={() => setDraft({ ...draft, options: draft.options.map((opt, j) => ({ ...opt, isCorrect: j === i })) })} />
                <input className="flex-1 bg-[var(--panel)] px-2 py-1" placeholder={`Option ${i + 1}`} value={o.label} onChange={(e) => setDraft({ ...draft, options: draft.options.map((opt, j) => j === i ? { ...opt, label: e.target.value } : opt) })} />
              </div>
            ))}
            <button type="button" className="text-xs text-[var(--signal)]" onClick={() => setDraft({ ...draft, options: [...draft.options, { label: "", isCorrect: false }] })}>Add option</button>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => void saveQuestion()} className="bg-[var(--lime)] px-3 py-1 text-sm font-semibold text-black">{editingId ? "Update" : "Add question"}</button>
              {editingId && <button onClick={() => { setEditingId(null); setDraft(emptyDraft()); }}>Cancel</button>}
            </div>
          </div>
        </>
      )}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
