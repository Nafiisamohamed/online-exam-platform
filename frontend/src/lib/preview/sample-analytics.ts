/**
 * SAMPLE DATA FOR THE DESIGN PREVIEW ONLY. These numbers are illustrative and
 * exist so the chart components can be reviewed before the analytics module
 * is connected. Every chart that uses them shows a "Sample data" badge.
 * Real dashboards read GET /api/analytics/dashboard and
 * GET /api/exams/:id/analytics instead; delete this file when they do.
 */
export const SAMPLE_STATS = { activeExams: 4, students: 40, averageScore: "71%", pendingGrading: 6 };

export const SAMPLE_SCORE_BANDS = [
  { band: "0–9", students: 0 },
  { band: "10–19", students: 0 },
  { band: "20–29", students: 1 },
  { band: "30–39", students: 4 },
  { band: "40–49", students: 3 },
  { band: "50–59", students: 3 },
  { band: "60–69", students: 7 },
  { band: "70–79", students: 8 },
  { band: "80–89", students: 9 },
  { band: "90–100", students: 5 },
];

export const SAMPLE_TREND = [
  { exam: "Quiz 1", average: 64, highest: 88 },
  { exam: "Quiz 2", average: 68, highest: 91 },
  { exam: "Midterm", average: 72, highest: 94 },
  { exam: "Quiz 3", average: 70, highest: 96 },
  { exam: "Practice", average: 74, highest: 100 },
];

export const SAMPLE_GRADES = [
  { grade: "A", students: 7 },
  { grade: "B", students: 10 },
  { grade: "C", students: 9 },
  { grade: "D", students: 6 },
  { grade: "F", students: 8 },
];

export const SAMPLE_DIFFICULTY = [
  { question: "Q1", correct: 96 },
  { question: "Q2", correct: 84 },
  { question: "Q3", correct: 71 },
  { question: "Q4", correct: 63 },
  { question: "Q5", correct: 52 },
  { question: "Q6", correct: 38 },
  { question: "Q7", correct: 11 },
];
