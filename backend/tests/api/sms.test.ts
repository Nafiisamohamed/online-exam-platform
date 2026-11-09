/** Phase 6: SMS Management (templates, group messages to chosen people, retry) — all simulated. */
import { describe, expect, it } from "vitest";
import { deliverQueuedSms } from "../../src/services/messaging.ts";
import { assignToFaculty, createUser, enrol, prisma, testAcademicYear, uid, userAgent } from "./helpers.ts";

describe("SMS templates", () => {
  it("are created and edited by the registrar in Somali and English, switched off instead of deleted", async () => {
    const [, admin] = await userAgent("ADMIN");
    const body = { name: `Exam reminder ${uid()}`, category: "UPCOMING_EXAM", bodySo: "Salaan {name}, imtixaankaagu waa berri.", bodyEn: "Hello {name}, your exam is tomorrow." };
    const created = await admin.post("/api/sms-templates").send(body);
    expect(created.status).toBe(201);
    expect(created.body.template).toMatchObject({ category: "UPCOMING_EXAM", isActive: true });
    expect((await admin.post("/api/sms-templates").send(body)).body.error.code).toBe("SMS_TEMPLATE_EXISTS");
    expect((await admin.post("/api/sms-templates").send({ ...body, name: `X ${uid()}`, bodyEn: "" })).status).toBe(400);
    expect((await admin.post("/api/sms-templates").send({ ...body, name: `Y ${uid()}`, bodyEn: "Your {password}" })).status).toBe(400); // the database refuses password placeholders
    const id = created.body.template.id;
    const off = await admin.patch(`/api/sms-templates/${id}`).send({ isActive: false, bodyEn: "Hello {name}, your exam is on Monday." });
    expect(off.body.template).toMatchObject({ isActive: false, bodyEn: "Hello {name}, your exam is on Monday." });
    const log = await prisma.auditLog.findFirst({ where: { entityId: id, actionCode: "SMS_TEMPLATE_UPDATED" } });
    expect(log?.details).toMatchObject({ previous: { isActive: true, bodyEn: body.bodyEn } });
    expect((await admin.get("/api/sms-templates").query({ active: "false" })).body.items.some((t: any) => t.id === id)).toBe(true);
    const [, lecturer] = await userAgent("LECTURER");
    expect((await lecturer.get("/api/sms-templates")).status).toBe(403);
    expect((await lecturer.post("/api/sms/send").send({ roles: ["STUDENT"], bodySo: "x", bodyEn: "x" })).status).toBe(403);
  });
});

describe("group messages", () => {
  it("reach the chosen roles of a course, in each person's language, as SMS and notification", async () => {
    const [, admin] = await userAgent("ADMIN");
    const lecturer = await createUser("LECTURER");
    const year = await testAcademicYear();
    const f = await admin.post("/api/faculties").send({ code: `SM${uid()}`.slice(0, 18), name: "Demo Faculty (test)" });
    await assignToFaculty(f.body.faculty.id, lecturer.id);
    const course = await admin.post("/api/courses").send({ facultyId: f.body.faculty.id, code: `SM${uid()}`.slice(0, 18), name: "Demo Course (test)", academicYearId: year.id, semesterNumber: 2, lecturerId: lecturer.id });
    const so = await createUser("STUDENT", { preferredLanguage: "so", fullName: "Hodan Test" });
    const en = await createUser("STUDENT", { preferredLanguage: "en", fullName: "Amina Test" });
    const outsider = await createUser("STUDENT");
    await enrol(course.body.course.id, so.id, en.id);

    const choice = { roles: ["STUDENT", "LECTURER"], courseId: course.body.course.id };
    const preview = await admin.post("/api/sms/recipients").send(choice);
    expect(preview.body).toMatchObject({ total: 3, byRole: { STUDENT: 2, LECTURER: 1 } });
    expect(preview.body.sample.map((p: any) => p.id)).not.toContain(outsider.id);

    const sent = await admin.post("/api/sms/send").send({ ...choice, bodySo: "Salaan {name}: imtixaanka waa Isniinta.", bodyEn: "Hello {name}: the exam is on Monday." });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ recipients: 3, sms: 3, notifications: 3, simulated: true });
    const smsSo = await prisma.smsOutbox.findFirstOrThrow({ where: { recipientId: so.id, templateKey: "CUSTOM_MESSAGE" } });
    const smsEn = await prisma.smsOutbox.findFirstOrThrow({ where: { recipientId: en.id, templateKey: "CUSTOM_MESSAGE" } });
    expect(smsSo.body).toBe("[DEMO] Salaan Hodan Test: imtixaanka waa Isniinta.");
    expect(smsEn.body).toBe("[DEMO] Hello Amina Test: the exam is on Monday.");
    expect(await prisma.smsOutbox.count({ where: { recipientId: outsider.id, templateKey: "CUSTOM_MESSAGE" } })).toBe(0);

    const studentAgent = (await import("./helpers.ts")).loginAs;
    const enAgent = await studentAgent(en);
    const notes = (await enAgent.get("/api/notifications")).body.items;
    expect(notes.find((n: any) => n.templateKey === "CUSTOM_MESSAGE")).toMatchObject({ title: "Message from the registrar", body: "Hello Amina Test: the exam is on Monday." });
    expect(await prisma.auditLog.count({ where: { actionCode: "SMS_GROUP_SENT", details: { path: ["people"], equals: 3 } } })).toBeGreaterThanOrEqual(1);

    expect((await admin.post("/api/sms/send").send({ roles: [], bodySo: "x", bodyEn: "x" })).body.error.code).toBe("NO_RECIPIENTS_CHOSEN");
    expect((await admin.post("/api/sms/send").send({ ...choice, bodySo: "x" })).body.error.code).toBe("SMS_TEXT_REQUIRED");
  });

  it("uses a template and lets a failed message be retried", async () => {
    const [, admin] = await userAgent("ADMIN");
    const bad = await createUser("INVIGILATOR", { phone: "+25261" });
    const t = (await admin.post("/api/sms-templates").send({ name: `Notice ${uid()}`, category: "GENERAL", bodySo: "Ogeysiis {username}", bodyEn: "Notice {username}" })).body.template;
    const sent = await admin.post("/api/sms/send").send({ roles: [], userIds: [bad.id], templateId: t.id, sendNotification: false });
    expect(sent.body).toMatchObject({ recipients: 1, sms: 1, notifications: 0 });
    const m = await prisma.smsOutbox.findFirstOrThrow({ where: { recipientId: bad.id, templateKey: "CUSTOM_MESSAGE" } });
    expect(m).toMatchObject({ relatedType: "sms_template", relatedId: t.id });
    expect((await admin.post(`/api/sms-outbox/${m.id}/retry`)).body.error.code).toBe("SMS_NOT_FAILED");
    await deliverQueuedSms(100_000);
    expect((await prisma.smsOutbox.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("FAILED");
    const retried = await admin.post(`/api/sms-outbox/${m.id}/retry`);
    expect(retried.body).toMatchObject({ status: "QUEUED" });
    expect((await prisma.smsOutbox.findUniqueOrThrow({ where: { id: m.id } })).failureReason).toBeNull();
    await prisma.smsTemplate.update({ where: { id: t.id }, data: { isActive: false } });
    expect((await admin.post("/api/sms/send").send({ roles: [], userIds: [bad.id], templateId: t.id })).body.error.code).toBe("SMS_TEMPLATE_NOT_FOUND");
  });
});
