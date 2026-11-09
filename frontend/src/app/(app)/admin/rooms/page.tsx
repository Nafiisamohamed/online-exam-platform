"use client";

/**
 * Examination rooms (registrar): GET/POST/PATCH /api/rooms. A room has a name, a building, a
 * capacity (may be left empty when unknown) and an active flag. Inactive rooms cannot be chosen
 * for new schedules. No network addresses are used.
 */
import { DoorOpen, PencilLine, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { QueryError } from "@/components/admin/query-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { paths, saveRoom } from "@/lib/api/admin";
import { useApi } from "@/lib/api/use-api";
import { useI18n } from "@/lib/i18n/i18n";
import type { Room } from "@/types/lecturer";

function RoomModal({ room, onClose }: { room?: Room; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(room?.name ?? "");
  const [building, setBuilding] = useState(room?.building ?? "");
  const [capacity, setCapacity] = useState(room?.capacity ? String(room.capacity) : "");
  const [isActive, setIsActive] = useState(room?.isActive ?? true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const cap = capacity.trim() === "" ? null : Number(capacity);
  const capOk = cap === null || (Number.isInteger(cap) && cap >= 1 && cap <= 5000);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!capOk) return;
    setBusy(true);
    setError(null);
    try {
      await saveRoom(room?.id ?? null, { name: name.trim(), building: building.trim(), capacity: cap, isActive });
      toast(t("admin.saved"));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={room ? t("admin.rooms.editTitle", { name: room.name }) : t("admin.rooms.addTitle")}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="room-form" loading={busy} disabled={!name.trim() || !building.trim() || !capOk}>{t("common.save")}</Button>
        </>
      }
    >
      <form id="room-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormError error={error} />
        <Field label={t("admin.rooms.name")} required>
          {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off" />}
        </Field>
        <Field label={t("admin.rooms.building")} required>
          {({ id }) => <Input id={id} value={building} onChange={(e) => setBuilding(e.target.value)} maxLength={200} autoComplete="off" />}
        </Field>
        <Field label={t("admin.rooms.capacity")} hint={t("admin.rooms.capacityHint")} error={!capOk ? t("admin.rooms.capacityInvalid") : undefined}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} type="number" min={1} max={5000} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="sm:w-40" />}
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
          {t("admin.rooms.activeLabel")}
        </label>
      </form>
    </Modal>
  );
}

export default function RoomsPage() {
  const { t } = useI18n();
  const rooms = useApi<{ items: Room[] }>(paths.rooms);
  const [modal, setModal] = useState<{ room?: Room } | null>(null);

  const columns: Column<Room>[] = [
    { key: "name", header: t("admin.rooms.name"), primary: true, cell: (r) => <span className="font-semibold text-foreground">{r.name}</span> },
    { key: "building", header: t("admin.rooms.building"), cell: (r) => r.building },
    { key: "capacity", header: t("admin.rooms.capacity"), align: "right", cell: (r) => r.capacity ? <span className="tabular-nums">{r.capacity}</span> : <Badge tone="warning">{t("admin.rooms.capacityUnknown")}</Badge> },
    { key: "status", header: t("admin.status"), cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"} dot>{r.isActive ? t("admin.active") : t("admin.inactive")}</Badge> },
    { key: "actions", header: <span className="sr-only">{t("table.actions")}</span>, align: "right", cell: (r) => <Button variant="ghost" size="sm" leftIcon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setModal({ room: r })}>{t("common.edit")}</Button> },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("nav.rooms") }]} />}
        title={t("admin.rooms.title")}
        description={t("admin.rooms.subtitle")}
        actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({})}>{t("admin.rooms.add")}</Button>}
      />
      <Card className="overflow-hidden">
        {rooms.error && !rooms.data ? (
          <QueryError state={rooms} />
        ) : (
          <DataTable columns={columns} rows={rooms.data?.items ?? []} rowKey={(r) => r.id} loading={!rooms.data} emptyTitle={t("admin.rooms.empty")} caption={t("admin.rooms.title")} />
        )}
      </Card>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted"><DoorOpen className="h-3.5 w-3.5" aria-hidden />{t("admin.rooms.note")}</p>
      {modal && <RoomModal room={modal.room} onClose={() => setModal(null)} />}
    </>
  );
}
