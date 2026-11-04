"use client";

/** Top-bar controls: language switch (always visible) and light/dark/system theme. */
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n, type Locale } from "@/lib/i18n/i18n";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { Dropdown, DropdownContent, DropdownLabel, DropdownRadioGroup, DropdownRadioItem, DropdownTrigger, Tooltip } from "@/components/ui/overlays";

export const iconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-sunken hover:text-foreground data-[state=open]:bg-surface-sunken data-[state=open]:text-foreground";

/** Segmented SO | EN switch: both languages are always one click away. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const options: Locale[] = ["so", "en"];
  return (
    <div role="radiogroup" aria-label={t("language.switch")} className={cn("inline-flex items-center rounded-xl border border-border bg-surface-muted p-1", className)}>
      <Languages className="mx-1.5 hidden h-4 w-4 text-subtle sm:block" aria-hidden />
      {options.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          onClick={() => setLocale(l)}
          title={t(`language.${l}`)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide uppercase transition-all",
            locale === l ? "bg-primary text-primary-foreground shadow-card" : "text-muted hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function ThemeMenu() {
  const { t } = useI18n();
  const { choice, setChoice } = useTheme();
  const options: { value: ThemeChoice; icon: typeof Sun }[] = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "system", icon: Monitor },
  ];
  return (
    <Dropdown>
      <Tooltip content={t("theme.toggle")}>
        <DropdownTrigger className={iconButton} aria-label={t("theme.toggle")}>
          {/* The icon follows the applied theme through CSS, so it is right before React hydrates. */}
          <Sun className="h-[18px] w-[18px] dark:hidden" aria-hidden />
          <Moon className="hidden h-[18px] w-[18px] dark:block" aria-hidden />
        </DropdownTrigger>
      </Tooltip>
      <DropdownContent className="min-w-44">
        <DropdownLabel>{t("topbar.theme")}</DropdownLabel>
        <DropdownRadioGroup value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
          {options.map(({ value, icon: Icon }) => (
            <DropdownRadioItem key={value} value={value} icon={<Icon className="h-4 w-4" />}>
              {t(`theme.${value}`)}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

