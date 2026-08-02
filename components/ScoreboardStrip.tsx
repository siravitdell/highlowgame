"use client";

import { motion } from "framer-motion";

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
          <motion.span
            key={entry.score}
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700"
          >
            {entry.score}
          </motion.span>
        </div>
      ))}
    </div>
  );
}
