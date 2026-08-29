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
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewChoice, setPreviewChoice] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ instructions: string; questions: Question[]; activity: { title: string; durationMs: number } }>(
        `/api/host/quiz/questions?activityId=${activityId}`,
      );
      setInstructions(data.instructions);
      setQuestions(data.questions);
      setQuizTitle(data.activity.title);
      setDuration(Math.round(data.activity.durationMs / 1000));
      setPreviewIndex((i) => Math.min(i, Math.max(0, data.questions.length - 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load quiz.");
    }
  }, [activityId]);

  useEffect(() => { void load(); }, [load]);

  function openPreview() {
    setPreview(true);
    setPreviewIndex(0);
    setPreviewChoice(null);
    setError("");
  }

  async function saveMeta() {
    setBusy(true);
    setError("");
    const cleanTitle = quizTitle.trim();
    const cleanDuration = Number.isFinite(duration) ? Math.floor(duration) : 0;
    if (!cleanTitle) {
      setError("Quiz title is required.");
      setBusy(false);
      return;
    }
    if (cleanDuration < 5) {
      setError("Duration must be at least 5 seconds.");
      setBusy(false);
      return;
    }
    try {
      await api("/api/host/activities", {
        method: "PATCH",
        body: JSON.stringify({
          roomId,
          activityId,
          action: "UPDATE",
          title: cleanTitle,
          durationMs: cleanDuration * 1000,
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
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("roomId", roomId);
      const res = await api<{ media: { id: string } }>("/api/uploads", { method: "POST", body: form });
      setDraft((d) => ({ ...d, imageId: res.media.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
  }

  async function saveQuestion() {
    setBusy(true);
    setError("");
    const prompt = draft.prompt.trim();
    const options = draft.options.filter((o) => o.label.trim()).map((o) => ({ ...o, label: o.label.trim() }));
    const points = Number.isFinite(draft.points) ? Math.floor(draft.points) : 0;
    const correctCount = options.filter((o) => o.isCorrect).length;
    if (!prompt) {
      setError("Question prompt is required.");
      setBusy(false);
      return;
    }
    if (options.length < 2) {
      setError("Add at least two answer options.");
      setBusy(false);
      return;
    }
    if (correctCount !== 1) {
      setError("Select exactly one correct answer.");
      setBusy(false);
      return;
    }
    if (points < 1) {
      setError("Points must be at least 1.");
      setBusy(false);
      return;
    }
    try {
      if (editingId) {
        await api("/api/host/quiz/questions", {
          method: "PATCH",
          body: JSON.stringify({
            questionId: editingId,
            prompt,
            explanation: draft.explanation.trim(),
            points,
            imageId: draft.imageId,
            options,
          }),
        });
      } else {
        await api("/api/host/quiz/questions", {
          method: "POST",
          body: JSON.stringify({
            activityId,
            prompt,
            explanation: draft.explanation.trim(),
            points,
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
    setBusy(true);
    setError("");
    try {
      await api("/api/host/quiz/questions", { method: "PATCH", body: JSON.stringify({ questionId: id, delete: true }) });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete question.");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    setBusy(true);
    setError("");
    try {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reorder questions.");
    } finally {
      setBusy(false);
    }
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
    setError("");
  }

  const previewQuestion = questions[previewIndex];

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
        <button onClick={openPreview} className={`px-2 py-1 text-xs ${preview ? "bg-[var(--lime)] text-black" : "border border-[var(--line)]"}`}>Player preview</button>
      </div>

      {preview ? (
        <div className="panel space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg">{quizTitle || "Untitled quiz"}</h3>
              {instructions && <p className="mt-1 text-sm text-[var(--mute)]">{instructions}</p>}
            </div>
            <span className="mono shrink-0 text-xs text-[var(--mute)]">{duration}s</span>
          </div>
          {previewQuestion ? (
            <article>
              <div className="flex items-center justify-between text-xs text-[var(--mute)]">
                <span>Question {previewIndex + 1} / {questions.length}</span>
                <span>{previewQuestion.points} pts</span>
              </div>
              <p className="mt-3 text-lg font-medium">{previewQuestion.prompt}</p>
              {previewQuestion.imageId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Question illustration" src={`/api/media/${previewQuestion.imageId}`} className="mt-3 max-h-56 max-w-full object-contain" />
              )}
              <div className="mt-4 grid gap-2">
                {previewQuestion.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPreviewChoice(o.id)}
                    className={`border px-3 py-2 text-left text-sm transition ${previewChoice === o.id ? "border-[var(--lime)] bg-[var(--panel-2)]" : "border-[var(--line)]"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  disabled={previewIndex === 0}
                  onClick={() => { setPreviewIndex((i) => i - 1); setPreviewChoice(null); }}
                  className="border border-[var(--line)] px-3 py-1 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-[var(--mute)]">Selection is preview-only and is not submitted.</span>
                <button
                  type="button"
                  disabled={previewIndex >= questions.length - 1}
                  onClick={() => { setPreviewIndex((i) => i + 1); setPreviewChoice(null); }}
                  className="bg-[var(--lime)] px-3 py-1 text-sm font-semibold text-black disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </article>
          ) : (
            <div className="py-8 text-center text-sm text-[var(--mute)]">Add a question to preview the player experience.</div>
          )}
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
                  <button disabled={busy || i === 0} onClick={() => void move(q.id, -1)}>Up</button>
                  <button disabled={busy || i === questions.length - 1} onClick={() => void move(q.id, 1)}>Down</button>
                  <button disabled={busy} onClick={() => startEdit(q)}>Edit</button>
                  <button disabled={busy} onClick={() => void removeQuestion(q.id)} className="text-[var(--danger)]">Delete</button>
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
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); }} />
            {draft.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name={`correct-${activityId}`} checked={o.isCorrect} onChange={() => setDraft({ ...draft, options: draft.options.map((opt, j) => ({ ...opt, isCorrect: j === i })) })} />
                <input className="flex-1 bg-[var(--panel)] px-2 py-1" placeholder={`Option ${i + 1}`} value={o.label} onChange={(e) => setDraft({ ...draft, options: draft.options.map((opt, j) => j === i ? { ...opt, label: e.target.value } : opt) })} />
              </div>
            ))}
            <button type="button" className="text-xs text-[var(--signal)]" onClick={() => setDraft({ ...draft, options: [...draft.options, { label: "", isCorrect: false }] })}>Add option</button>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => void saveQuestion()} className="bg-[var(--lime)] px-3 py-1 text-sm font-semibold text-black">{editingId ? "Update" : "Add question"}</button>
              {editingId && <button disabled={busy} onClick={() => { setEditingId(null); setDraft(emptyDraft()); }}>Cancel</button>}
            </div>
          </div>
        </>
      )}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
