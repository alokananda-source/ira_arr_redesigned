export function SingleDatePicker({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (date: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper-surface px-3 py-1.5">
      <input
        type="date"
        aria-label="select date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="bg-transparent text-sm text-ink outline-none"
      />
    </div>
  );
}
