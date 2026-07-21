export interface Category {
  id: string;
  group: string;
  metric: string;
  unit: string;
  label: string;
}

export interface Item {
  id: string;
  name: string;
  value: number;
  metric: string;
  unit: string;
  imageUrl: string | null;
  categoryId: string;
}

export interface Score {
  id: string;
  playerName: string;
  score: number;
  categoryId: string;
  createdAt: string;
}

export interface Player {
  id: string;
  username: string;
  lobbyId: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  finishedAt: string | null;
}

export interface Lobby {
  id: string;
  roomCode: string;
  hostId: string;
  status: "waiting" | "playing" | "finished";
  categoryId: string | null;
  category: Category | null;
  tiebreakerWinnerId: string | null;
  players: Player[];
}

export interface StoredSession {
  username: string;
  playerId: string;
  roomCode: string;
}

export interface PlayerJoinedEvent {
  username: string;
  playerCount: number;
}

export interface CategorySelectedEvent {
  categoryId: string;
  label: string;
  metric: string;
  unit: string;
}

export interface ScoreUpdateEvent {
  playerId: string;
  username: string;
  score: number;
}

export interface TiebreakerQuestion {
  itemA: Item;
  itemB: Item;
}

export interface TiebreakerStartEvent {
  tiedPlayerIds: string[];
  question: TiebreakerQuestion;
}

export type TiebreakerResultEvent =
  | { winnerId: string; username: string; stillTied?: false }
  | { stillTied: true };

export interface TiebreakerAnswerEvent {
  playerId: string;
  correct: boolean;
}

export interface PlayerFinishedEvent {
  playerId: string;
}

export interface PlayAgainEvent {
  roomCode: string;
}
