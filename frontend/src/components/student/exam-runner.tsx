"use client";

import { use } from "react";
import { ExamInterface } from "./exam-interface";

/** Reads the attempt id from the URL and runs the exam (see ExamInterface). */
export function ExamRunner({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  return <ExamInterface key={attemptId} attemptId={attemptId} />;
}
