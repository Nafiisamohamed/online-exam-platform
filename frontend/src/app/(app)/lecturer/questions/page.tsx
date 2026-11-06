"use client";

/**
 * Question bank of one of the lecturer's courses: GET /api/courses/:id/questions
 * with type, difficulty, topic, text search and archived filters, paged on the
 * server; plus the CSV import. Only the course's own lecturer can open it (the
 * API answers 404 for anyone else).
 */
import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FilterBar } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { CourseSelect, useChosenCourse, WithMyCourses } from "@/components/lecturer/course-picker";
import { QuestionEditor } from "@/components/lecturer/question-editor";
import { QuestionImport } from "@/components/lecturer/question-import";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, SearchInput, Select } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Pagination } from "@/components/ui/pagination";
import { useDebounced } from "@/hooks/use-debounced";
import { lecturerPaths } from "@/lib/api/lecturer";
import { useApi } from "@/lib/api/use-api";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import type { Paged } from "@/types/admin";
import type { Course } from "@/types/admin";
import { DIFFICULTIES, QUESTION_TYPES, type BankSummaryRow, type Difficulty, type QuestionListItem, type QuestionType, type Topic } from "@/types/lecturer";

const PAGE_SIZE = 20;

function Bank({ courseId }: { courseId: string }) {
  const { t, locale } = useI18n();
  const [type, setType] = useState<QuestionType | "">("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [topicId, setTopicId] = useState("");
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const term = useDebounced(search.trim());
  const topics = useApi<{ items: Topic[] }>(lecturerPaths.topics(courseId));
  const summary = useApi<{ items: BankSummaryRow[] }>(lecturerPaths.bankSummary(courseId));
  const questions = useApi<Paged<QuestionListItem>>(
    lecturerPaths.questions(courseId, { type: type || undefined, difficulty: difficulty || undefined, topicId: topicId || undefined, search: term || undefined, archived: archived || undefined, page, pageSize: PAGE_SIZE }),
    { keepPrevious: true },
  );
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const activeCount = summary.data?.items.reduce((s, r) => s + r.count, 0);

  const columns: Column<QuestionListItem>[] = [
    {
      key: "text",
      header: t("lecturer.questions.question"),
      primary: true,
      cell: (q) => (
        <Link href={`/lecturer/questions/${q.id}`} className="group block min-w-0">
          <span className="line-clamp-2 font-medium text-foreground group-hover:text-accent-strong">{q.current?.text ?? "—"}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {q.current?.topic.name}
            {q.current?.isLocked && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden />{t("lecturer.common.locked")}</span>}
            {q.isArchived && <Badge tone="neutral">{t("lecturer.questions.archived")}</Badge>}
          </span>
        </Link>
      ),
    },
    { key: "type", header: t("lecturer.common.type"), cell: (q) => (q.current ? <span className="whitespace-nowrap">{t(`admin.exams.questionTypes.${q.current.type}`)}</span> : "—") },
    { key: "difficulty", header: t("lecturer.common.difficulty"), cell: (q) => (q.current ? t(`admin.exams.difficulty.${q.current.difficulty}`) : "—") },
    { key: "marks", header: t("lecturer.common.marks"), align: "right", cell: (q) => <span className="tabular-nums">{formatNumber(q.current?.marks, locale, 2)}</span> },
    { key: "version", header: t("lecturer.questions.versions"), align: "right", cell: (q) => <span className="tabular-nums text-muted">v{q.current?.versionNumber ?? "—"}</span>, className: "hidden lg:table-cell" },
  ];

  return (
    <>
      <FilterBar actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>{t("lecturer.questions.add")}</Button>}>
        <Field label={t("common.search")}>
          {({ id }) => <SearchInput id={id} value={search} onChange={(e) => filter(setSearch)(e.target.value)} placeholder={t("lecturer.questions.search")} />}
        </Field>
        <Field label={t("lecturer.common.type")}>
          {({ id }) => (
            <Select id={id} value={type} onChange={(e) => filter(setType)(e.target.value as QuestionType | "")}>
              <option value="">{t("lecturer.common.allTypes")}</option>
              {QUESTION_TYPES.map((qt) => <option key={qt} value={qt}>{t(`admin.exams.questionTypes.${qt}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("lecturer.common.difficulty")}>
          {({ id }) => (
            <Select id={id} value={difficulty} onChange={(e) => filter(setDifficulty)(e.target.value as Difficulty | "")}>
              <option value="">{t("lecturer.common.allDifficulties")}</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{t(`admin.exams.difficulty.${d}`)}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t("lecturer.common.topic")}>
          {({ id }) => (
            <Select id={id} value={topicId} onChange={(e) => filter(setTopicId)(e.target.value)}>
              <option value="">{t("lecturer.common.allTopics")}</option>
              {topics.data?.items.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </Select>
          )}
        </Field>
      </FilterBar>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">{activeCount !== undefined ? t("lecturer.questions.summary", { count: activeCount }) : ""}</span>
        <label className="inline-flex items-center gap-2 text-text">
          <input type="checkbox" checked={archived} onChange={(e) => filter(setArchived)(e.target.checked)} className="h-4 w-4 accent-[var(--accent-strong)]" />
          {t("lecturer.questions.showArchived")}
        </label>
      </div>
      <Card className="overflow-hidden">
        {questions.error && !questions.data ? (
          <QueryError state={questions} />
        ) : (
          <div aria-busy={questions.loading || undefined} className={questions.loading && questions.data ? "opacity-60 transition-opacity" : undefined}>
            <DataTable columns={columns} rows={questions.data?.items ?? []} rowKey={(q) => q.id} loading={!questions.data} emptyTitle={t("table.noRows")} caption={t("lecturer.questions.title")} />
          </div>
        )}
        {questions.data && questions.data.total > 0 && (
          <div className="border-t border-border px-5 py-4">
            <Pagination page={questions.data.page} pageSize={questions.data.pageSize} total={questions.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>
      {adding && <QuestionEditor courseId={courseId} open onOpenChange={setAdding} />}
    </>
  );
}

function QuestionsForCourses({ courses }: { courses: Course[] }) {
  const { t } = useI18n();
  const [courseId, setCourseId] = useChosenCourse(courses);
  return (
    <>
      <Card className="mb-4 p-4">
        <CourseSelect courses={courses} value={courseId} onChange={setCourseId} className="max-w-xl" />
      </Card>
      <Tabs defaultValue="bank">
        <TabsList className="mb-4">
          <TabsTrigger value="bank">{t("lecturer.questions.tabBank")}</TabsTrigger>
          <TabsTrigger value="import">{t("lecturer.questions.tabImport")}</TabsTrigger>
        </TabsList>
        <TabsContent value="bank" className="outline-none"><Bank key={courseId} courseId={courseId} /></TabsContent>
        <TabsContent value="import" className="outline-none"><QuestionImport key={courseId} courseId={courseId} /></TabsContent>
      </Tabs>
    </>
  );
}

export default function QuestionBankPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.questionBank") }]} />}
        title={t("lecturer.questions.title")}
        description={t("lecturer.questions.subtitle")}
      />
      <WithMyCourses>{(courses) => <QuestionsForCourses courses={courses} />}</WithMyCourses>
    </>
  );
}
