"use client";

/**
 * Profile photo, kept in this browser only (localStorage, one per account).
 * The platform's API has no photo storage, so the picture is not shared with
 * other devices or other users. Uploaded images are cropped to a square and
 * resized to 256 px before they are saved, so they stay small.
 */
import { useSyncExternalStore } from "react";

const PREFIX = "oe-photo-";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function read(userId: string): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(PREFIX + userId);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key?.startsWith(PREFIX) && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved photo (data URL) of this account on this device, or null. */
export function useProfilePhoto(userId: string): string | null {
  return useSyncExternalStore(subscribe, () => read(userId), () => null);
}

/** Checks, crops and saves a photo. Returns "invalid" for a wrong type or a file over 5 MB. */
export async function saveProfilePhoto(userId: string, file: File): Promise<"ok" | "invalid" | "failed"> {
  if (!TYPES.includes(file.type) || file.size > MAX_BYTES) return "invalid";
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "failed";
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    bitmap.close();
    localStorage.setItem(PREFIX + userId, canvas.toDataURL("image/jpeg", 0.88));
    notify();
    return "ok";
  } catch {
    return "failed";
  }
}

export function removeProfilePhoto(userId: string) {
  try {
    localStorage.removeItem(PREFIX + userId);
  } catch {
    /* storage unavailable: nothing to remove */
  }
  notify();
}
