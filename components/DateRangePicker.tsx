import { RANGE_PRESETS } from "@/lib/constants";
import type { DateRange } from "@/lib/rangeUtils";

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const resolved = value.type === "custom" ? value : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGE_PRESETS.map((preset) => {
        const isActive = value.type === "preset" && value.days === preset.days;
        return (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange({ type: "preset", days: preset.days })}
            aria-pressed={isActive}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              isActive ? "border-ink bg-ink text-paper" : "border-ink/15 bg-paper-surface text-ink/60 hover:text-ink"
            }`}
          >
            {preset.label}
          </button>
        );
      })}
      <div className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper-surface px-3 py-1.5">
        <input
          type="date"
          aria-label="custom range start"
          value={resolved?.start ?? ""}
          onChange={(event) =>
            onChange({ type: "custom", start: event.target.value, end: resolved?.end ?? event.target.value })
          }
          className="bg-transparent text-sm text-ink outline-none"
        />
        <span className="text-ink/30">–</span>
        <input
          type="date"
          aria-label="custom range end"
          value={resolved?.end ?? ""}
          onChange={(event) =>
            onChange({ type: "custom", start: resolved?.start ?? event.target.value, end: event.target.value })
          }
          className="bg-transparent text-sm text-ink outline-none"
        />
      </div>
    </div>
  );
}
