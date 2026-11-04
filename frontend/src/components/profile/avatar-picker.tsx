"use client";

/**
 * Change-photo control for the profile header. It checks the file (PNG or
 * JPEG, at most 2 MB) and shows a local preview. Saving the photo needs an
 * upload endpoint, which comes with the profile module; until then `onSelect`
 * just receives the file.
 */
import { Camera } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg"];

export function AvatarPicker({
  name, src, label, onSelect, onError, className,
}: {
  name: string;
  src?: string | null;
  label: string;
  onSelect?: (file: File) => void;
  onError?: (reason: "type" | "size") => void;
  className?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return onError?.("type");
    if (file.size > MAX_BYTES) return onError?.("size");
    setPreview(URL.createObjectURL(file));
    onSelect?.(file);
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <span className="rounded-full bg-surface p-1.5 shadow-raised">
        <Avatar name={name} src={preview ?? src} size="xl" />
      </span>
      <label
        htmlFor={inputId}
        className="absolute right-1 bottom-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground shadow-raised transition-transform hover:scale-105"
        title={label}
      >
        <Camera className="h-4 w-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
