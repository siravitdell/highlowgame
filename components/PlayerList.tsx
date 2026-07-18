import type { Player } from "@/types";

interface PlayerListProps {
  players: Player[];
}

export function PlayerList({ players }: PlayerListProps) {
  return (
    <ul className="space-y-2">
      {players.map((player) => (
        <li
          key={player.id}
          className="flex items-center justify-between rounded-lg bg-gray-100 px-4 py-2"
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-sm text-white">
              {player.username.slice(0, 1).toUpperCase()}
            </span>
            {player.username}
          </span>
          {player.isHost && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Host
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
