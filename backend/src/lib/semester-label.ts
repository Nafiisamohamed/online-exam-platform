/**
 * The text label of a course offering. Courses created since Phase 2 get "2026/2027 S1"
 * (academic year + semester 1-8) from the server; older courses keep labels such as "2026-Fall".
 * Filters and the enrolment import accept both.
 */
import { z } from "zod";

export const SEMESTER_LABEL_RE = /^(\d{4}-[A-Za-z]{3,10}|\d{4}\/\d{4} S[1-8])$/;
export const semesterLabel = z.string().trim().regex(SEMESTER_LABEL_RE, 'use "2026/2027 S1" (or an older label such as "2026-Fall")');

/** "2026/2027" + 3 -> "2026/2027 S3". */
export const offeringLabel = (yearName: string, semesterNumber: number) => `${yearName} S${semesterNumber}`;
