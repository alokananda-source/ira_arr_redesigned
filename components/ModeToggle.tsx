export type ChartMode = "day" | "time";

export function ModeToggle({ value, onChange }: { value: ChartMode; onChange: (mode: ChartMode) => void }) {
  return (
    <div className="inline-flex rounded-full border border-ink/15 bg-paper p-1 text-sm">
      {([
        { mode: "day", label: "day wise" },
        { mode: "time", label: "time wise" },
      ] as const).map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onChange(option.mode)}
          aria-pressed={value === option.mode}
          className={`rounded-full px-3 py-1.5 font-semibold transition-colors ${
            value === option.mode ? "bg-ink text-paper" : "text-ink/50 hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
