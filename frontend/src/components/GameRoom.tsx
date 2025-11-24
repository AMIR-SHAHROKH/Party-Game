// src/components/GameRoom.tsx
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getGame } from "../api/gameApi";

export default function GameRoom() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get("name") || "Player";

  const [game, setGame] = useState<any>(null);

  useEffect(() => {
    const loadGame = async () => {
      try {
        const res = await getGame(id!);
        setGame(res.data);
      } catch (e) {
        console.error(e);
        alert("Could not load game data");
      }
    };
    loadGame();
  }, [id]);

  return (
    <div style={{ textAlign: "center", padding: 20 }}>
      <h1>Game Room #{id}</h1>
      <p>Welcome, {playerName}!</p>
      {game && <p>Created at: {new Date(game.created_at).toLocaleString()}</p>}
    </div>
  );
}
