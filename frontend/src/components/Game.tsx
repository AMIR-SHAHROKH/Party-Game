import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface GameProps {
  gameId: string;
  playerName: string;
}

interface Round {
  id: string;
  text: string;
}

interface Player {
  id: string;
  player_name: string;
  score: number;
}

export default function Game({ gameId, playerName }: GameProps) {
  const [socket, _setSocket] = useState<Socket<any> | null>(null);
  const [round, _setRound] = useState<Round | null>(null);
  const [players, _setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const newSocket = io("http://localhost:5000");
    _setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Game ID: {gameId}</h1>
      <h2>Player: {playerName}</h2>

      <div>
        <p>Round ID: {round?.id}</p>
        <p>Round Text: {round?.text}</p>
      </div>

      <div>
        <h3>Players:</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              {p.player_name}: {p.score}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
