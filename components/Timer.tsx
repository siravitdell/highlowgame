interface TimerProps {
  secondsLeft: number;
  totalSeconds: number;
}

export function Timer({ secondsLeft, totalSeconds }: TimerProps) {
  const pct = Math.max(0, (secondsLeft / totalSeconds) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div
        className="h-full bg-indigo-600 transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
