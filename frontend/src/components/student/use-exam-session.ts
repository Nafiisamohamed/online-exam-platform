"use client";

/**
 * The running exam, kept in step with the server:
 * - load: GET /api/attempts/:id returns the same questions and saved answers
 *   after a refresh or reconnection (the server never generates a second set);
 * - answers: each question has its own save queue. Choices save at once,
 *   typed text after a short pause or when the field loses focus. A question
 *   only shows "saved" after the server accepted it; network failures are
 *   retried, refusals are shown, and 409 ATTEMPT_DEADLINE_PASSED /
 *   ATTEMPT_ALREADY_SUBMITTED end the exam on screen;
 * - time: every response's remainingSeconds becomes the new sync point of the
 *   countdown (lib/student/exam-clock.ts); a heartbeat every 5 seconds keeps it
 *   in step, brings invigilator extensions, and notices when the server has
 *   submitted the attempt;
 * - focus: leaving and returning to the page are reported with a retry-safe
 *   event id; the server measures, counts (1 second or more) and warns (after
 *   3). Nothing is penalised here;
 * - submit: pending answers are sent first, then POST /submit (safe to repeat).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { heartbeat, loadAttempt, reportFocus, saveAnswer, setFlag, submitAttempt } from "@/lib/api/student";
import { newUuid, remainingAt, syncPoint, type SyncPoint } from "@/lib/student/exam-clock";
import type { Attempt, AttemptQuestion } from "@/types/student";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "rejected";

export interface LocalAnswer {
  selectedOptionId: string | null;
  textAnswer: string;
  status: SaveStatus;
  savedAt: string | null;
}

const HEARTBEAT_MS = 5000;
const TEXT_DEBOUNCE_MS = 900;
const RETRY_MS = 3000;
/** Server answers that mean the attempt is over (submitted, timed out, or terminated after the tab-switch limit). */
const ENDED = new Set(["ATTEMPT_DEADLINE_PASSED", "ATTEMPT_ALREADY_SUBMITTED", "ATTEMPT_TERMINATED"]);

const isChoice = (q: AttemptQuestion) => q.type === "MCQ" || q.type === "TRUE_FALSE";
const hasValue = (a: LocalAnswer | undefined) => !!a && (!!a.selectedOptionId || !!a.textAnswer.trim());

export function useExamSession(attemptId: string) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [finished, setFinished] = useState<Attempt | null>(null);
  const [focus, setFocus] = useState({ count: 0, warning: false });
  const [extensionMinutes, setExtensionMinutes] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const sync = useRef<SyncPoint | null>(null);
  const attemptRef = useRef<Attempt | null>(null);
  const finishedRef = useRef(false);
  const questionsRef = useRef<Map<string, AttemptQuestion>>(new Map());
  const answersRef = useRef<Record<string, LocalAnswer>>({});
  const version = useRef<Record<string, number>>({});
  const inflight = useRef<Set<string>>(new Set());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const focusChain = useRef<Promise<void>>(Promise.resolve());
  const lost = useRef<string | null>(null);
  const deadlineCheck = useRef(false);
  /** save() calls itself (resend a newer value, retry); it does so through this ref. */
  const saveRef = useRef<(qid: string) => Promise<void>>(async () => {});

  const setAnswer = useCallback((qid: string, patch: Partial<LocalAnswer>) => {
    answersRef.current = { ...answersRef.current, [qid]: { ...answersRef.current[qid], ...patch } };
    setAnswers(answersRef.current);
  }, []);

  const resync = useCallback((remainingSeconds: number) => {
    sync.current = syncPoint(remainingSeconds, performance.now());
    setRemaining(remainingAt(sync.current, performance.now()));
  }, []);

  /** The server says the exam is over: show the submitted attempt. */
  const finish = useCallback(async (endedAs: "SUBMITTED" | "TERMINATED" = "SUBMITTED") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    Object.values(timers.current).forEach(clearTimeout);
    try {
      setFinished(await loadAttempt(attemptId));
    } catch {
      // The server already ended the attempt; show what is known even if reloading failed.
      if (attemptRef.current) setFinished({ ...attemptRef.current, status: endedAs, questions: [] });
    }
  }, [attemptId]);

  const save = useCallback(
    async (qid: string): Promise<void> => {
      if (finishedRef.current) return;
      if (inflight.current.has(qid)) return; // the running save re-checks the version when it ends
      const q = questionsRef.current.get(qid);
      const a = answersRef.current[qid];
      if (!q || !a) return;
      const v = version.current[qid] ?? 0;
      inflight.current.add(qid);
      setAnswer(qid, { status: "saving" });
      try {
        const body = isChoice(q) ? { selectedOptionId: a.selectedOptionId } : { textAnswer: a.textAnswer.trim() ? a.textAnswer : null };
        const res = await saveAnswer(attemptId, qid, body);
        inflight.current.delete(qid);
        setOnline(true);
        resync(res.remainingSeconds);
        if ((version.current[qid] ?? 0) !== v) return saveRef.current(qid); // changed while saving: send the newer value
        setAnswer(qid, { status: "saved", savedAt: res.savedAt });
      } catch (error) {
        inflight.current.delete(qid);
        if (error instanceof ApiError && ENDED.has(error.code)) return void finish(error.code === "ATTEMPT_TERMINATED" ? "TERMINATED" : "SUBMITTED");
        const transient = !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 429;
        if (transient) {
          if (!(error instanceof ApiError) || error.status === 0) setOnline(false);
          setAnswer(qid, { status: "error" });
          clearTimeout(timers.current[qid]);
          timers.current[qid] = setTimeout(() => void saveRef.current(qid), RETRY_MS);
        } else {
          setAnswer(qid, { status: "rejected" });
        }
      }
    },
    [attemptId, finish, resync, setAnswer],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /** A change from the student: kept on screen at once, sent to the server now (choices) or after a pause (text). */
  const change = useCallback(
    (qid: string, patch: { selectedOptionId?: string | null; textAnswer?: string }, immediate: boolean) => {
      if (finishedRef.current) return;
      version.current[qid] = (version.current[qid] ?? 0) + 1;
      setAnswer(qid, { ...patch, status: "dirty" });
      clearTimeout(timers.current[qid]);
      timers.current[qid] = setTimeout(() => void save(qid), immediate ? 0 : TEXT_DEBOUNCE_MS);
    },
    [save, setAnswer],
  );

  /** Sends a pending text answer now (e.g. when its field loses focus). */
  const flush = useCallback(
    (qid: string) => {
      const a = answersRef.current[qid];
      if (a && (a.status === "dirty" || a.status === "error")) {
        clearTimeout(timers.current[qid]);
        void save(qid);
      }
    },
    [save],
  );

  const toggleFlag = useCallback(
    async (qid: string) => {
      const next = !flags[qid];
      setFlags((f) => ({ ...f, [qid]: next }));
      try {
        await setFlag(attemptId, qid, next);
      } catch (error) {
        setFlags((f) => ({ ...f, [qid]: !next }));
        if (error instanceof ApiError && ENDED.has(error.code)) void finish(error.code === "ATTEMPT_TERMINATED" ? "TERMINATED" : "SUBMITTED");
      }
    },
    [attemptId, flags, finish],
  );

  const pulse = useCallback(async () => {
    if (finishedRef.current) return;
    try {
      const hb = await heartbeat(attemptId);
      setOnline(true);
      if (hb.status === "SUBMITTED" || hb.status === "TERMINATED") return void finish(hb.status);
      resync(hb.remainingSeconds);
      setExtensionMinutes(hb.extensionMinutes);
      if (hb.countedFocusLosses !== undefined) setFocus({ count: hb.countedFocusLosses, warning: !!hb.focusWarning });
      // Back online: send answers that failed while offline.
      for (const [qid, a] of Object.entries(answersRef.current)) if (a.status === "error") void save(qid);
    } catch (error) {
      if (error instanceof ApiError && ENDED.has(error.code)) return void finish(error.code === "ATTEMPT_TERMINATED" ? "TERMINATED" : "SUBMITTED");
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) setOnline(false);
    }
  }, [attemptId, finish, resync, save]);

  // Load (and reload) the attempt.
  useEffect(() => {
    let live = true;
    loadAttempt(attemptId).then(
      (a) => {
        if (!live) return;
        if (a.status !== "IN_PROGRESS") {
          finishedRef.current = true;
          setFinished(a);
          return;
        }
        questionsRef.current = new Map(a.questions.map((q) => [q.id, q]));
        answersRef.current = Object.fromEntries(
          a.questions.map((q) => [q.id, { selectedOptionId: q.answer?.selectedOptionId ?? null, textAnswer: q.answer?.textAnswer ?? "", status: "saved" as SaveStatus, savedAt: q.answer?.savedAt ?? null }]),
        );
        setAnswers(answersRef.current);
        setFlags(Object.fromEntries(a.questions.map((q) => [q.id, q.isFlagged])));
        setFocus({ count: a.countedFocusLosses, warning: a.focusWarning });
        setExtensionMinutes(a.extensionMinutes);
        resync(a.remainingSeconds);
        attemptRef.current = a;
        setAttempt(a);
      },
      (error: unknown) => live && setLoadError(error),
    );
    return () => {
      live = false;
    };
  }, [attemptId, resync]);

  // Countdown display and heartbeat.
  useEffect(() => {
    if (!attempt || finished) return;
    const tick = setInterval(() => {
      if (!sync.current) return;
      const left = remainingAt(sync.current, performance.now());
      setRemaining(left);
      // At zero, ask the server at once: it submits the attempt at its own deadline.
      if (left === 0 && !deadlineCheck.current) {
        deadlineCheck.current = true;
        void pulse().finally(() => setTimeout(() => (deadlineCheck.current = false), 2000));
      }
    }, 250);
    const beat = setInterval(() => void pulse(), HEARTBEAT_MS);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [attempt, finished, pulse]);

  // Focus reporting.
  useEffect(() => {
    if (!attempt || finished) return;
    const send = (id: string, type: "LOST" | "RETURNED") => {
      focusChain.current = focusChain.current.then(async () => {
        for (let tries = 0; tries < 5 && !finishedRef.current; tries++) {
          try {
            const r = await reportFocus(attemptId, id, type);
            setFocus({ count: r.countedFocusLosses, warning: r.focusWarning });
            // The server terminated the attempt at the third counted switch: close the exam screen now.
            if (r.terminated) return void finish("TERMINATED");
            return;
          } catch (error) {
            if (error instanceof ApiError && ENDED.has(error.code)) return void finish(error.code === "ATTEMPT_TERMINATED" ? "TERMINATED" : "SUBMITTED");
            if (error instanceof ApiError && error.status > 0 && error.status < 500) return; // e.g. unknown event: nothing to retry
            await new Promise((r) => setTimeout(r, RETRY_MS));
          }
        }
      });
    };
    const onLost = () => {
      if (lost.current) return;
      lost.current = newUuid();
      send(lost.current, "LOST");
    };
    const onBack = () => {
      if (!lost.current || document.visibilityState === "hidden") return;
      const id = lost.current;
      lost.current = null;
      send(id, "RETURNED");
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? onLost() : onBack());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onLost);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onLost);
      window.removeEventListener("focus", onBack);
    };
  }, [attempt, attemptId, finished, finish]);

  // Connection changes and the leave-page warning while answers are unsaved.
  useEffect(() => {
    const goOnline = () => void pulse();
    const goOffline = () => setOnline(false);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (finishedRef.current) return;
      if (Object.values(answersRef.current).some((a) => a.status !== "saved" && a.status !== "rejected")) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [pulse]);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const submit = useCallback(async () => {
    if (finishedRef.current || submitting) return;
    setSubmitting(true);
    // Send what is still pending, then submit (the server keeps only saved answers).
    const pending = Object.entries(answersRef.current).filter(([, a]) => a.status === "dirty" || a.status === "error").map(([qid]) => qid);
    for (const qid of pending) clearTimeout(timers.current[qid]);
    await Promise.all(pending.map((qid) => save(qid)));
    try {
      const done = await submitAttempt(attemptId);
      finishedRef.current = true;
      setFinished(done);
    } catch (error) {
      if (error instanceof ApiError && ENDED.has(error.code)) await finish(error.code === "ATTEMPT_TERMINATED" ? "TERMINATED" : "SUBMITTED");
      else setSubmitting(false);
      throw error;
    }
  }, [attemptId, finish, save, submitting]);

  const questions = attempt?.questions ?? [];
  const answeredCount = questions.filter((q) => hasValue(answers[q.id])).length;
  const unsavedCount = Object.values(answers).filter((a) => a.status === "dirty" || a.status === "saving" || a.status === "error").length;

  return {
    attempt, loadError, finished, questions, answers, flags, remaining, online, focus, extensionMinutes, submitting,
    answeredCount, unsavedCount, change, flush, toggleFlag, submit,
    isAnswered: (qid: string) => hasValue(answers[qid]),
  };
}
