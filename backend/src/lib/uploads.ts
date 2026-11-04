/**
 * File uploads.
 *
 * - csvUpload: one CSV file (field "file", at most 2 MB), kept in memory and
 *   parsed immediately. Used by the question and enrolment imports.
 * - imageUpload: one question image (field "image": PNG, JPEG, GIF or WebP, at
 *   most 2 MB), saved under UPLOAD_DIR/questions with a random file name.
 *   The file type is checked from the file's first bytes, not just its name.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { env } from "../config/env.ts";
import { badRequest } from "./errors.ts";

const MAX_BYTES = 2 * 1024 * 1024;

export const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("file");

export const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("image");

/** Folder holding question images. */
export function questionImageDir(): string {
  const dir = path.resolve(env.UPLOAD_DIR, "questions");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const SIGNATURES: [string, number[]][] = [
  ["png", [0x89, 0x50, 0x4e, 0x47]],
  ["jpg", [0xff, 0xd8, 0xff]],
  ["gif", [0x47, 0x49, 0x46, 0x38]],
  ["webp", [0x52, 0x49, 0x46, 0x46]],
];

/**
 * Saves an uploaded image and returns its stored file name.
 * @throws 400 IMAGE_REQUIRED, 400 IMAGE_TYPE_NOT_ALLOWED
 */
export function saveQuestionImage(file: Express.Multer.File | undefined): string {
  if (!file) throw badRequest("IMAGE_REQUIRED", "Attach an image in the 'image' field");
  const match = SIGNATURES.find(([, sig]) => sig.every((b, i) => file.buffer[i] === b));
  if (!match || (match[0] === "webp" && file.buffer.subarray(8, 12).toString("ascii") !== "WEBP")) {
    throw badRequest("IMAGE_TYPE_NOT_ALLOWED", "Use a PNG, JPEG, GIF or WebP image");
  }
  const name = `${randomUUID()}.${match[0]}`;
  fs.writeFileSync(path.join(questionImageDir(), name), file.buffer);
  return name;
}

/**
 * Parses an uploaded CSV file into rows keyed by lower-case header names.
 * @throws 400 CSV_REQUIRED, 400 CSV_INVALID, 400 CSV_EMPTY, 400 CSV_MISSING_COLUMNS
 */
export function parseCsv(file: Express.Multer.File | undefined, requiredColumns: string[]): Record<string, string>[] {
  if (!file) throw badRequest("CSV_REQUIRED", "Attach a CSV file in the 'file' field");
  let rows: Record<string, string>[];
  try {
    rows = parse(file.buffer, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (error) {
    throw badRequest("CSV_INVALID", "The file is not valid CSV", { reason: (error as Error).message.slice(0, 200) });
  }
  if (rows.length === 0) throw badRequest("CSV_EMPTY", "The file has no data rows");
  if (rows.length > 2000) throw badRequest("CSV_TOO_MANY_ROWS", "At most 2000 rows per file", { max: 2000 });
  const missing = requiredColumns.filter((c) => !(c in rows[0]));
  if (missing.length) throw badRequest("CSV_MISSING_COLUMNS", "Required columns are missing", { missing });
  return rows;
}

/**
 * Quotes one CSV cell. Cells that a spreadsheet would run as a formula
 * (starting with =, @, or + / - not followed by a number) get a leading '.
 * Phone numbers such as +252615123401 and numbers stay unchanged.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^(=|@|\t|\r|[+-](?![\d.]))/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds CSV text (with a BOM so Excel shows Somali characters correctly). */
export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
