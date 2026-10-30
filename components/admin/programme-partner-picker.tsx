"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PartnerOption {
  id: string;
  name: string;
}

/**
 * Picks the development partners that run a programme. Users of a selected
 * partner can update progress and upload reports on it; they cannot create or
 * archive programmes or change this list.
 */
export function ProgrammePartnerPicker({
  options,
  value,
  onChange,
  disabled,
  loading,
}: {
  options: PartnerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(
    () => options.filter((o) => value.includes(o.id)),
    [options, value],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => !q || o.name.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <Label htmlFor="partner-search">Development partners</Label>
      <p className="text-xs text-muted-foreground">
        Partners you select can update progress and upload reports on this programme. They cannot
        create or archive programmes, or change this list.
      </p>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected partners">
          {selected.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full border bg-primary/5 py-0.5 pl-2.5 pr-1 text-xs"
            >
              {p.name}
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(p.id)}
                aria-label={`Remove ${p.name}`}
                className="flex size-5 items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No partners selected.</p>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="partner-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search development partners"
          className="pl-9"
          disabled={disabled}
        />
      </div>

      <div className="max-h-44 overflow-y-auto rounded-lg border" role="group" aria-label="Development partners">
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading partners…</p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No partners match.</p>
        ) : (
          visible.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={value.includes(p.id)}
                disabled={disabled}
                onChange={() => toggle(p.id)}
              />
              <span className="min-w-0 truncate">{p.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
