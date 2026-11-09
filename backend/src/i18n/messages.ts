/**
 * Somali and English text produced by the server (baseline 6.8, P10).
 *
 * Screens are translated by the frontend, using the error and status codes the
 * API returns. The server only writes text in three places, all covered here:
 * - SMS messages (stored already translated in the recipient's language);
 * - in-app notifications (stored as template + params, translated on read);
 * - PDF documents (payment receipt and result slip) and the grades CSV header.
 *
 * Somali (`so`) is the default language. A unit test checks that every key
 * exists in both languages.
 */
import type { Language } from "../generated/prisma/enums.ts";

type Params = Record<string, string | number>;
type Template = (p: Params) => string;

/** SMS bodies. Every body starts with "[DEMO]" (the database checks this). Never include passwords or PINs. */
export const SMS_TEMPLATES: Record<string, Record<Language, Template>> = {
  ACCOUNT_CREATED: {
    so: (p) => `[DEMO] Akoonkaaga waa diyaar. Lambarka ardayga: ${p.studentNumber}. Kala soo qaado erayga sirta ah ee ku meel gaarka ah xafiiska diiwaangelinta.`,
    en: (p) => `[DEMO] Your account is ready. Student number: ${p.studentNumber}. Collect your temporary password from the registrar's office.`,
  },
  SCHEDULE_APPROVED: {
    so: (p) => `[DEMO] Imtixaanka ${p.course} wuxuu dhacayaa ${p.date}, ${p.window}.`,
    en: (p) => `[DEMO] The ${p.course} exam takes place on ${p.date}, ${p.window}.`,
  },
  PAYMENT_SUCCESS: {
    so: (p) => `[DEMO] Waxaad ${p.amount} u dirtay ${p.merchant} (${p.merchantNumber}). Tixraac: ${p.receipt}. Lacag dhab ah lama dirin.`,
    en: (p) => `[DEMO] You sent ${p.amount} to ${p.merchant} (${p.merchantNumber}). Reference: ${p.receipt}. No real money was transferred.`,
  },
  RESULTS_PUBLISHED: {
    so: (p) => `[DEMO] Natiijada ${p.course} waa la daabacay. Gal nidaamka si aad u aragto.`,
    en: (p) => `[DEMO] Your ${p.course} results have been published. Log in to view them.`,
  },
  RESULTS_CHANGED: {
    so: (p) => `[DEMO] Natiijadaada ${p.course} waa la cusbooneysiiyay. Gal nidaamka.`,
    en: (p) => `[DEMO] Your ${p.course} result has been updated. Log in to view it.`,
  },
  PAYMENT_REMINDER: {
    so: (p) => `[DEMO] Xusuusin: khidmadda semestarka ${p.semester} (${p.year}) waxaa kaa harsan ${p.amount}. Ku bixi EVC Plus, Zaad ama eDahab nidaamka dhexdiisa.`,
    en: (p) => `[DEMO] Reminder: ${p.amount} of your Semester ${p.semester} fee (${p.year}) is still outstanding. Pay with EVC Plus, Zaad or eDahab in the system.`,
  },
};

/** In-app notification titles and bodies. */
export const NOTIFICATION_TEMPLATES: Record<string, Record<Language, { title: Template; body: Template }>> = {
  SCHEDULE_APPROVED: {
    so: { title: () => "Jadwalka imtixaanka", body: (p) => `${p.exam} wuxuu dhacayaa ${p.date}.` },
    en: { title: () => "Exam schedule", body: (p) => `${p.exam} takes place on ${p.date}.` },
  },
  PAYMENT_SUCCESS: {
    so: { title: () => "Lacag bixin guuleysatay (tijaabo)", body: (p) => p.purpose ? `${p.amount} loogu talagalay ${p.purpose}. Rasiidka: ${p.receipt}.` : `Rasiidka: ${p.receipt}. ${p.exam} hadda waa furan yahay.` },
    en: { title: () => "Payment successful (simulated)", body: (p) => p.purpose ? `${p.amount} towards ${p.purpose}. Receipt: ${p.receipt}.` : `Receipt: ${p.receipt}. ${p.exam} is now unlocked.` },
  },
  PAYMENT_REMINDER: {
    so: { title: () => "Xusuusin lacag bixin", body: (p) => `Khidmadda semestarka ${p.semester} (${p.year}) waxaa kaa harsan ${p.amount}.` },
    en: { title: () => "Payment reminder", body: (p) => `${p.amount} of your Semester ${p.semester} fee (${p.year}) is still outstanding.` },
  },
  FEE_NOT_CONFIGURED: {
    so: { title: () => "Khidmad semestar lama dejin", body: (p) => `Arday ayaa isku dayay imtixaan semestarka ${p.semester} laakiin khidmadda kulliyaddiisa iyo sannadkaas lama dejin. Ardayga lama joojin. Ku dar khidmadda bogga Lacagaha.` },
    en: { title: () => "Semester fee not set", body: (p) => `A student opened a Semester ${p.semester} exam, but no fee is set for their faculty and year. The student was not blocked. Add the fee on the Fees page.` },
  },
  RESULTS_PUBLISHED: {
    so: { title: () => "Natiijada waa la daabacay", body: (p) => `Natiijada ${p.exam} waa diyaar.` },
    en: { title: () => "Results published", body: (p) => `Your ${p.exam} results are ready.` },
  },
  RESULTS_CHANGED: {
    so: { title: () => "Natiijada waa la beddelay", body: (p) => `Natiijadaada ${p.exam} waa la cusbooneysiiyay.` },
    en: { title: () => "Result updated", body: (p) => `Your ${p.exam} result has been updated.` },
  },
  TIME_EXTENSION_GRANTED: {
    so: { title: () => "Waqti dheeraad ah", body: (p) => `Waxaa lagu siiyay ${p.minutes} daqiiqo oo dheeraad ah ${p.exam}.` },
    en: { title: () => "Extra time", body: (p) => `You were given ${p.minutes} extra minutes for ${p.exam}.` },
  },
};

/** Fixed labels for PDFs and the grades CSV. */
export const LABELS: Record<Language, Record<string, string>> = {
  so: {
    receiptTitle: "Rasiidka Lacag Bixinta",
    demoWatermark: "Lacag bixin tijaabo ah – lacag dhab ah lama wareejin.",
    semesterFee: "Khidmadda semestarka",
    semester: "Semestar",
    paidFor: "Loo bixiyay",
    receiptNumber: "Lambarka rasiidka",
    date: "Taariikhda",
    student: "Ardayga",
    studentNumber: "Lambarka ardayga",
    exam: "Imtixaanka",
    course: "Maadada",
    provider: "Adeeg bixiyaha",
    phone: "Taleefanka",
    amount: "Lacagta",
    merchant: "Qaataha",
    status: "Xaaladda",
    statusSuccess: "Guuleystay",
    resultSlipTitle: "Warqadda Natiijada",
    score: "Dhibcaha",
    percentage: "Boqolley",
    grade: "Darajada",
    publication: "Daabacaadda",
    publishedAt: "La daabacay",
    focusLosses: "Ka bixitaanka shaashadda (la tiriyay)",
    question: "Su'aal",
    marks: "Dhibcaha",
    generatedAt: "La sameeyay",
    absent: "Maqan",
    terminated: "La joojiyay (beddelka tabka)",
    submitted: "La gudbiyay",
    studentName: "Magaca ardayga",
    maxScore: "Dhibcaha ugu badan",
    submissionType: "Habka gudbinta",
  },
  en: {
    receiptTitle: "Payment Receipt",
    demoWatermark: "Simulated payment – no money was transferred.",
    semesterFee: "Semester fee",
    semester: "Semester",
    paidFor: "Paid for",
    receiptNumber: "Receipt number",
    date: "Date",
    student: "Student",
    studentNumber: "Student number",
    exam: "Exam",
    course: "Course",
    provider: "Provider",
    phone: "Phone",
    amount: "Amount",
    merchant: "Recipient",
    status: "Status",
    statusSuccess: "Successful",
    resultSlipTitle: "Result Slip",
    score: "Score",
    percentage: "Percentage",
    grade: "Grade",
    publication: "Publication",
    publishedAt: "Published",
    focusLosses: "Counted tab switches",
    question: "Question",
    marks: "Marks",
    generatedAt: "Generated",
    absent: "Absent",
    terminated: "Terminated (tab switches)",
    submitted: "Submitted",
    studentName: "Student name",
    maxScore: "Maximum score",
    submissionType: "Submission",
  },
};

export const PROVIDER_NAMES: Record<string, string> = { EVC_PLUS: "EVC Plus", ZAAD: "Zaad", EDAHAB: "eDahab" };

/** Renders an SMS body in the given language. Throws for an unknown template. */
export function renderSms(templateKey: string, language: Language, params: Params): string {
  const t = SMS_TEMPLATES[templateKey];
  if (!t) throw new Error(`Unknown SMS template ${templateKey}`);
  return t[language](params);
}

/** Renders a notification; unknown templates fall back to the key itself. */
export function renderNotification(templateKey: string, language: Language, params: Params) {
  const t = NOTIFICATION_TEMPLATES[templateKey]?.[language];
  if (!t) return { title: templateKey, body: "" };
  return { title: t.title(params), body: t.body(params) };
}

/** Formats a date and time in the campus time zone, e.g. "12/11/2026 09:00". */
export function formatDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
