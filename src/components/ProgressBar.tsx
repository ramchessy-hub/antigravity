type ProgressBarProps = {
  value: number;
  max: number;
  color?: string;
  height?: string;
};

export function ProgressBar({ value, max, color = 'bg-emerald-500', height = 'h-2' }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`w-full ${height} bg-slate-700/50 rounded-full overflow-hidden`}>
      <div
        className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
