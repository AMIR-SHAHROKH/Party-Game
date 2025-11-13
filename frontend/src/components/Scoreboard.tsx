import { useState } from "react";
import { Socket } from "socket.io-client";

interface PlayerScore {
  id: string;
  name: string;
  score: number;
}

interface ScoreboardProps {
  gameId: string;
  socket: Socket<any> | null;
}

export default function Scoreboard({ gameId, socket }: ScoreboardProps) {
  const [scores, _setScores] = useState<PlayerScore[]>([]); // ✅ only setter unused

  return (
    <div>
      <h2>Scoreboard</h2>
      <ul>
        {scores.map((p: PlayerScore) => (
          <li key={p.id}>
            {p.name}: {p.score}
          </li>
        ))}
      </ul>
    </div>
  );
}
