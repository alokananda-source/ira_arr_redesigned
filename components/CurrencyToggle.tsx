import type { Currency } from "@/lib/types";

export function CurrencyToggle({ value, onChange }: { value: Currency; onChange: (currency: Currency) => void }) {
  return (
    <div className="inline-flex rounded-full border border-ink/15 bg-paper p-1 text-sm">
      {(["INR", "USD"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`rounded-full px-3 py-1.5 font-semibold transition-colors ${
            value === option ? "bg-ink text-paper" : "text-ink/50 hover:text-ink"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
