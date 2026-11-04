/**
 * SMS adapter (section 7: SMS messages go to an in-app outbox through a clean
 * adapter interface).
 *
 * The messaging service writes every message to the sms_outbox table with
 * status QUEUED. A background job then hands queued messages to the gateway.
 * The only gateway is simulated: it never contacts a real network. It moves a
 * message QUEUED -> SENT -> DELIVERED, or to FAILED when the phone number is
 * not a valid Somali mobile number, so the outbox looks like a real one.
 */
import { isSomaliMobile } from "../lib/phone.ts";

export interface SmsSendResult {
  status: "SENT" | "FAILED";
  failureReason?: string;
}

export interface SmsGateway {
  /** Accepts one message for delivery. */
  send(message: { phone: string; body: string }): Promise<SmsSendResult>;
  /** Simulated delivery report: true when a SENT message is now DELIVERED. */
  delivered(message: { phone: string }): Promise<boolean>;
}

export class SimulatedSmsGateway implements SmsGateway {
  async send(message: { phone: string; body: string }): Promise<SmsSendResult> {
    if (!isSomaliMobile(message.phone)) return { status: "FAILED", failureReason: "INVALID_PHONE_NUMBER" };
    return { status: "SENT" };
  }

  async delivered(): Promise<boolean> {
    return true;
  }
}

/** The gateway in use. SMS_MODE is always "simulated" (checked at startup). */
export const smsGateway: SmsGateway = new SimulatedSmsGateway();
