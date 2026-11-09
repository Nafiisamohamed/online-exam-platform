"use client";

/**
 * Semester fee payment with the backend's simulated mobile money (docs/api.md
 * "Payments"): choose the amount (all or part of the outstanding balance; the server
 * checks it), the service and phone (POST /api/payments), confirm on the "phone"
 * (POST …/confirm), enter the PIN (POST …/pin, checked only on the server).
 * Three wrong PINs fail the payment; 5 minutes without finishing expire it.
 */
import { CheckCircle2, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/admin/admin-ui";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { checks, normalizeSomaliPhone } from "@/lib/admin/validation";
import { apiUrl } from "@/lib/api/client";
import { cancelPayment, confirmPayment, createPayment, enterPin, studentPaths } from "@/lib/api/student";
import { useI18n } from "@/lib/i18n/i18n";
import { newUuid } from "@/lib/student/exam-clock";
import { useSession } from "@/lib/session/session";
import { PAYMENT_PROVIDERS, type Payment, type PaymentProvider, type PayTarget } from "@/types/student";

export function PayDialog({ target, onClose }: { target: PayTarget; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { profile } = useSession();
  const [provider, setProvider] = useState<PaymentProvider>("EVC_PLUS");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [amount, setAmount] = useState(String(target.suggested ?? target.outstanding));
  const value = Number(amount);
  const amountOk = value > 0 && value <= target.outstanding + 0.005 && /^\d+(\.\d{1,2})?$/.test(amount.trim());
  const [pin, setPin] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [wrongPin, setWrongPin] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  // One key per payment attempt: a repeated click returns the same payment instead of a second one.
  const [key] = useState(newUuid);
  const phoneProblem = checks.phone(phone);

  const step = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const start = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (phoneProblem || !amountOk) return;
    void step(async () => setPayment((await createPayment(target.feeId, value, provider, normalizeSomaliPhone(phone) ?? phone.trim(), key)).payment));
  };
  const answer = (accept: boolean) => payment && void step(async () => setPayment(await confirmPayment(payment.id, accept)));
  const sendPin = (e: FormEvent) => {
    e.preventDefault();
    if (!payment || !/^\d{4,6}$/.test(pin)) return;
    void step(async () => {
      const r = await enterPin(payment.id, pin);
      setPin("");
      setPayment(r.payment);
      setWrongPin(r.result === "WRONG_PIN" ? r.payment.pinAttemptsLeft : null);
    });
  };
  const close = () => {
    // Leaving an unfinished payment cancels it, so it does not wait 5 minutes to expire.
    if (payment && (payment.status === "PENDING_CONFIRMATION" || payment.status === "PENDING_PIN")) void cancelPayment(payment.id).catch(() => undefined);
    onClose();
  };

  const status = payment?.status;
  return (
    <Modal open onOpenChange={(o) => !o && close()} title={t("student.payments.payTitle")} description={target.label} closeLabel={t("student.payments.close")} size="sm">
      <div className="space-y-4">
        <Alert tone="info">{t("student.payments.simulated")}</Alert>
        <p className="text-sm text-muted">{t("student.fees.outstanding")}: <span className="font-semibold text-foreground">{target.outstanding.toFixed(2)} {target.currency}</span></p>
        <FormError error={error} />

        {!payment && (
          <form onSubmit={start} className="space-y-4" noValidate>
            <Field label={t("student.fees.amountToPay", { currency: target.currency })} hint={t("student.fees.partialHint")} error={touched && !amountOk ? t("student.fees.amountInvalid", { max: target.outstanding.toFixed(2) }) : undefined} required>
              {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="sm:w-40" />}
            </Field>
            <Field label={t("student.payments.provider")}>
              {({ id }) => (
                <Select id={id} value={provider} onChange={(e) => setProvider(e.target.value as PaymentProvider)}>
                  {PAYMENT_PROVIDERS.map((p) => <option key={p} value={p}>{p === "EVC_PLUS" ? "EVC Plus" : p === "ZAAD" ? "Zaad" : "eDahab"}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t("student.payments.phone")} hint={t("student.payments.phoneHint")} error={touched && phoneProblem ? t(phoneProblem) : undefined} required>
              {({ id, describedBy, invalid }) => <Input id={id} type="tel" aria-describedby={describedBy} aria-invalid={invalid} value={phone} onChange={(e) => setPhone(e.target.value)} />}
            </Field>
            <Button type="submit" className="w-full" loading={busy}>{t("student.payments.continue")}</Button>
          </form>
        )}

        {status === "PENDING_CONFIRMATION" && payment && (
          <div className="space-y-4 rounded-xl border border-border bg-surface-muted p-4">
            <p className="flex items-center gap-2 font-semibold text-foreground"><Smartphone className="h-4 w-4" aria-hidden />{t("student.payments.confirmTitle")}</p>
            <p className="text-sm text-text">{t("student.payments.confirmBody", { amount: payment.amount ?? "", currency: payment.currency, merchant: payment.merchantName, number: payment.merchantNumber })}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => answer(false)} disabled={busy}>{t("student.payments.decline")}</Button>
              <Button className="flex-1" onClick={() => answer(true)} loading={busy}>{t("student.payments.accept")}</Button>
            </div>
          </div>
        )}

        {status === "PENDING_PIN" && (
          <form onSubmit={sendPin} className="space-y-4" noValidate>
            {wrongPin !== null && <Alert tone="warning">{t("student.payments.wrongPin", { left: wrongPin })}</Alert>}
            <Field label={t("student.payments.pin")} hint={t("student.payments.pinHint")} required>
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />}
            </Field>
            <Button type="submit" className="w-full" loading={busy} disabled={!/^\d{4,6}$/.test(pin)}>{t("student.payments.pinSubmit")}</Button>
          </form>
        )}

        {status === "SUCCESS" && payment && (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
            <p className="font-semibold text-foreground">{t("student.payments.success")}</p>
            <p className="text-sm text-muted">{t("student.payments.successBody", { receipt: payment.receiptNumber ?? "—" })}</p>
            <a href={apiUrl(studentPaths.receiptPdf(payment.id, locale))} download className={buttonClasses("outline")}>{t("student.payments.receipt")}</a>
          </div>
        )}
        {status === "FAILED" && payment && <Alert tone="danger">{t("student.payments.failed", { reason: payment.failureReason ?? "—" })}</Alert>}
        {status === "CANCELLED" && <Alert tone="info">{t("student.payments.cancelled")}</Alert>}
        {status === "EXPIRED" && <Alert tone="warning">{t("student.payments.expired")}</Alert>}
        {payment && status !== "PENDING_CONFIRMATION" && status !== "PENDING_PIN" && (
          <Button variant={status === "SUCCESS" ? "primary" : "outline"} className="w-full" onClick={onClose}>{t("student.payments.close")}</Button>
        )}
      </div>
    </Modal>
  );
}
