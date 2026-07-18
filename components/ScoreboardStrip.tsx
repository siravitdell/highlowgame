interface ScoreEntry {
  playerId: string;
  username: string;
  score: number;
}

interface ScoreboardStripProps {
  scores: ScoreEntry[];
}

export function ScoreboardStrip({ scores }: ScoreboardStripProps) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {sorted.map((entry) => (
        <div
          key={entry.playerId}
          className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm"
        >
          <span className="text-sm font-medium">{entry.username}</span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
            {entry.score}
          </span>
        </div>
      ))}
    </div>
  );
}
