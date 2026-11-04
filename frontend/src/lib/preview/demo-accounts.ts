/**
 * PREVIEW ONLY. Until the sign-in phase, the shell shows one of the seeded
 * demo accounts (backend/scripts/seed-demo-data.mjs, docs/demo-data.md) so the
 * layout can be reviewed for every role. These are fictional demo people
 * already in the database, not real users. Remove this file when sign-in is
 * built; the shell then shows the profile from GET /api/auth/me.
 */
import type { Profile, Role } from "@/types/account";

export const PREVIEW_ACCOUNTS: Record<Role, Profile> = {
  ADMIN: {
    id: "preview-admin",
    role: "ADMIN",
    fullName: "Sahra Cabdirashiid Mire",
    email: "registrar@uni-demo.test",
    studentNumber: null,
    phone: "+252615100201",
    preferredLanguage: "so",
    mustChangePassword: false,
    faculty: "Registrar's Office",
  },
  LECTURER: {
    id: "preview-lecturer",
    role: "LECTURER",
    fullName: "Dr. Axmed Xirsi Samatar",
    email: "axmed.samatar@uni-demo.test",
    studentNumber: null,
    phone: "+252615100302",
    preferredLanguage: "so",
    mustChangePassword: false,
    faculty: "Faculty of Computing",
  },
  INVIGILATOR: {
    id: "preview-invigilator",
    role: "INVIGILATOR",
    fullName: "Cabdiraxmaan Nuur Faarax",
    email: "cabdiraxmaan.faarax@uni-demo.test",
    studentNumber: null,
    phone: "+252615100405",
    preferredLanguage: "so",
    mustChangePassword: false,
    faculty: "Examinations Office",
  },
  STUDENT: {
    id: "preview-student",
    role: "STUDENT",
    fullName: "Hodan Maxamed Cali",
    email: null,
    studentNumber: "DEMO-2026-0001",
    phone: "+252615123401",
    preferredLanguage: "so",
    mustChangePassword: false,
    faculty: "Faculty of Computing",
  },
};
