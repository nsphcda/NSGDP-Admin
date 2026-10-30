"use client";

import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LEARNING_AUDIENCES, type LearningAudience } from "@/lib/api/learning";

export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Native select: predictable value handling for plain string enums. */
export function NativeSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  "aria-label"?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function AudiencePicker({
  value,
  onChange,
}: {
  value: LearningAudience[];
  onChange: (value: LearningAudience[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label="Audience">
      {LEARNING_AUDIENCES.map((a) => {
        const checked = value.includes(a.id);
        return (
          <label key={a.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={checked}
              onChange={() =>
                onChange(checked ? value.filter((v) => v !== a.id) : [...value, a.id])
              }
            />
            {a.label}
          </label>
        );
      })}
    </div>
  );
}

/** Editable list of short strings (outcomes, etc.). */
export function StringListEditor({
  value,
  onChange,
  placeholder,
  addLabel,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item}
            placeholder={placeholder}
            aria-label={`${addLabel} ${i + 1}`}
            onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => onChange([...value, ""])}
      >
        <Plus className="size-3.5" aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

/** Drops empty strings before saving. */
export const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);
