/**
 * Background jobs, run inside the API process with a simple timer (design
 * assumption 8: one campus server, no queue software needed).
 *
 * Each tick (every JOB_INTERVAL_MS, default 5 seconds):
 * - auto-submits attempts whose server deadline has passed (P6), so
 *   disconnected students are submitted too;
 * - marks unfinished payments EXPIRED once their 5 minutes are over;
 * - moves simulated SMS messages along QUEUED -> SENT -> DELIVERED;
 * - re-measures the database clock once a minute.
 * The first tick runs at startup, catching anything that expired while the
 * server was down. A tick never overlaps the previous one.
 */
import { syncClock } from "../db/clock.ts";
import { logger } from "../lib/logger.ts";
import { deliverQueuedSms } from "../services/messaging.ts";

/** One job step, registered by the modules that own the rule. */
export type JobStep = { name: string; run: () => Promise<number> };

const steps: JobStep[] = [{ name: "sms-delivery", run: () => deliverQueuedSms() }];

/** Adds a step (used by the attempts and payments modules). */
export function registerJob(step: JobStep) {
  steps.push(step);
}

/** Runs every step once. Errors are logged and never stop the other steps. */
export async function runJobsOnce(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  for (const step of steps) {
    try {
      results[step.name] = await step.run();
    } catch (error) {
      logger.error("job failed", { job: step.name, error: (error as Error).message });
    }
  }
  return results;
}

/** Starts the timer. Returns a function that stops it. */
export function startJobs(intervalMs: number): () => void {
  let running = false;
  let ticks = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (ticks++ % Math.max(1, Math.round(60_000 / intervalMs)) === 0) await syncClock();
      const results = await runJobsOnce();
      const changed = Object.entries(results).filter(([, n]) => n > 0);
      if (changed.length) logger.info("jobs", Object.fromEntries(changed));
    } catch (error) {
      logger.error("job tick failed", { error: (error as Error).message });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
