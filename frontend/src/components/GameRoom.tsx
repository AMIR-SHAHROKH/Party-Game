// src/components/GameRoom.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import axios from "axios";

interface Player {
  id: number;
  name: string;
  ready: boolean;
}

interface Game {
  id: number;
  host_player_id: number;
  players: Player[];
  rounds?: number;
}

const API_BASE = "http://localhost:8000";
const SOCKET_URL = "http://localhost:8000";
let socket: Socket;

export default function GameRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game>({
    id: Number(id),
    host_player_id: 0,
    players: [],
  });
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const isHost = playerId === game.host_player_id;

  // Fetch initial game metadata so UI renders right away
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/games/${id}`);
        if (!mounted) return;
        const data = res.data;
        setGame((prev) => ({
          ...prev,
          host_player_id: data.host_player_id ?? prev.host_player_id,
          players: data.players ?? prev.players,
          rounds: data.rounds ?? prev.rounds,
        }));
      } catch (err) {
        console.warn("Could not load game metadata", err);
        // don't block — socket join will still work
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // Socket connection (join, listen for player_list, game_started)
  useEffect(() => {
    socket = io(SOCKET_URL, { transports: ["websocket"] });

    socket.on("connect", () => {
      console.log("Connected", socket.id);
      const storedName = localStorage.getItem("player_name") || `Player`;
      socket.emit("join_game", { game_id: Number(id), name: storedName });
    });

    socket.on("joined", (data: any) => {
      if (data?.player_id) {
        setPlayerId(data.player_id);
        localStorage.setItem(`player_id_${id}`, String(data.player_id));
      }
    });

    socket.on("player_list", (data: { players: Player[] }) => {
      setGame((prev) => ({ ...prev, players: data.players }));
    });

    socket.on("game_started", (data: any) => {
      // navigate to play route that handles rounds/questions
      navigate(`/game/${id}/play`);
    });

    // Helpful logging for debugging
    socket.on("error", (d: any) => console.warn("socket error", d));
    socket.on("disconnect", () => console.log("socket disconnected"));

    return () => socket.disconnect();
  }, [id, navigate]);

  const toggleReady = () => {
    socket.emit("toggle_ready", { game_id: Number(id), ready: !isReady });
    setIsReady(!isReady);
  };

  const startGame = () => {
    // host triggers start_game (server emits game_started to room)
    socket.emit("start_game", { game_id: Number(id) });
  };

  // UI helpers
  const allReady = game.players.length > 0 && game.players.every((p) => p.ready);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-800 to-indigo-800 p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* MAIN GAME AREA */}
        <div className="md:col-span-2 bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">🎉 Game Room #{game.id}</h1>
          <p className="text-sm text-gray-500 mb-6">Rounds: {game.rounds ?? "—"}</p>

          <div className="w-full max-w-xl">
            {!isHost && (
              <button
                onClick={toggleReady}
                className={`w-full py-3 rounded-full font-semibold text-white transition ${
                  isReady ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 hover:bg-gray-700"
                }`}
              >
                {isReady ? "Cancel Ready" : "Ready Up"}
              </button>
            )}

            {isHost && (
              <button
                onClick={startGame}
                disabled={!allReady}
                className={`w-full py-3 rounded-full font-semibold text-white mt-2 transition ${
                  allReady ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {allReady ? "Start Game" : "Waiting for players..."}
              </button>
            )}

            {/* helpful status */}
            <div className="mt-4 text-center text-sm text-gray-500">
              {isHost ? "You are the host" : "Waiting in lobby — press Ready when ready"}
            </div>
          </div>
        </div>

        {/* PLAYERS PANEL (right column) */}
        <aside className="bg-white/90 rounded-2xl shadow-lg p-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Players</h2>

          <ul className="space-y-3 max-h-[60vh] overflow-auto pr-2">
            {game.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between bg-gray-50 rounded-lg p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  {/* status icon */}
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${p.ready ? "bg-green-500" : "bg-red-500"}`}
                    title={p.ready ? "Ready" : "Not ready"}
                  />
                  <div>
                    <div className="font-semibold text-gray-800">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      {p.id === game.host_player_id ? "Host" : `Player #${p.id}`}
                    </div>
                  </div>
                </div>

                <div className="text-sm font-medium">
                  <span className={`${p.ready ? "text-green-600" : "text-gray-400"}`}>
                    {p.ready ? "Ready ✅" : "Not Ready ❌"}
                  </span>
                </div>
              </li>
            ))}

            {game.players.length === 0 && (
              <li className="text-center text-sm text-gray-500">No players yet</li>
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}
