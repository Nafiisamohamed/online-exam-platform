/** Phase 6: registrar SMS templates and the people a group message goes to. */
import type { Db } from "../db/prisma.ts";
import { prisma } from "../db/prisma.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { SmsTemplateCategory } from "../generated/prisma/enums.ts";

const editor = { select: { id: true, fullName: true } } as const;
const templateInclude = { createdBy: editor, updatedBy: editor } as const;

export function listTemplates(active: boolean | undefined, db: Db = prisma) {
  return db.smsTemplate.findMany({ where: active === undefined ? {} : { isActive: active }, orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }], include: templateInclude });
}

export function findTemplate(id: string, db: Db = prisma) {
  return db.smsTemplate.findUnique({ where: { id }, include: templateInclude });
}

export function findTemplateByName(name: string, db: Db = prisma) {
  return db.smsTemplate.findUnique({ where: { name } });
}

export function insertTemplate(data: { name: string; category: SmsTemplateCategory; bodySo: string; bodyEn: string; createdById: string; updatedById: string }, db: Db = prisma) {
  return db.smsTemplate.create({ data, include: templateInclude });
}

export function updateTemplate(id: string, data: Prisma.SmsTemplateUncheckedUpdateInput, db: Db = prisma) {
  return db.smsTemplate.update({ where: { id }, data, include: templateInclude });
}

export type RecipientRole = "STUDENT" | "LECTURER" | "INVIGILATOR";
export interface RecipientFilter {
  roles: RecipientRole[];
  facultyId?: string;
  academicYearId?: string;
  semesterNumber?: number;
  courseId?: string;
  userIds?: string[];
}

const recipientSelect = { id: true, fullName: true, username: true, phone: true, preferredLanguage: true, role: { select: { name: true } } } as const;

/**
 * Active users a group message goes to. Per role:
 * - students: of the course (active enrolment), else of the faculty / year / semester registrations, else all;
 * - lecturers: who teach the course, else who belong to the faculty, else all;
 * - invigilators: assigned to the course's exam schedules, else all (faculties and semesters do not apply).
 * Users picked one by one (userIds) are added to the group.
 */
export function findRecipients(f: RecipientFilter, take: number, db: Db = prisma) {
  const or: Prisma.UserWhereInput[] = [];
  const group = f.academicYearId || f.facultyId || f.semesterNumber;
  if (f.roles.includes("STUDENT")) {
    or.push({
      role: { name: "STUDENT" },
      ...(f.courseId
        ? { enrolments: { some: { courseId: f.courseId, status: "ACTIVE" } } }
        : group
          ? { registrations: { some: { ...(f.academicYearId ? { academicYearId: f.academicYearId } : {}), ...(f.facultyId ? { facultyId: f.facultyId } : {}), ...(f.semesterNumber ? { semesterNumber: f.semesterNumber } : {}) } } }
          : {}),
    });
  }
  if (f.roles.includes("LECTURER")) {
    or.push({
      role: { name: "LECTURER" },
      ...(f.courseId ? { coursesTaught: { some: { id: f.courseId } } } : f.facultyId ? { facultyAssignments: { some: { facultyId: f.facultyId } } } : {}),
    });
  }
  if (f.roles.includes("INVIGILATOR")) {
    or.push({ role: { name: "INVIGILATOR" }, ...(f.courseId ? { invigilatorAssignments: { some: { schedule: { exam: { courseId: f.courseId } } } } } : {}) });
  }
  if (f.userIds?.length) or.push({ id: { in: f.userIds }, role: { name: { in: ["STUDENT", "LECTURER", "INVIGILATOR"] } } });
  if (or.length === 0) return Promise.resolve([] as never[]);
  return db.user.findMany({ where: { isActive: true, OR: or }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take, select: recipientSelect });
}
