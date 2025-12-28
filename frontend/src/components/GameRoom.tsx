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
    rounds: 10,
  });
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState<string>("Player");
  const [isReady, setIsReady] = useState(false);

  const isHost = playerId === game.host_player_id;
  const allReady = game.players.length > 0 && game.players.every(p => p.ready);

  // --- Fetch game metadata ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/games/${id}`);
        if (!mounted) return;
        const data = res.data;
        setGame({
          id: data.id,
          host_player_id: data.host_player_id,
          players: data.players,
          rounds: data.rounds,
        });
      } catch (err) {
        console.warn("Could not load game metadata", err);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // --- Socket connection ---
  useEffect(() => {
    socket = io(SOCKET_URL, { transports: ["websocket"] });

    socket.on("connect", () => {
      let storedName = localStorage.getItem("player_name");
      if (!storedName || storedName === "undefined") {
        storedName = prompt("Enter your name") || "Player";
        localStorage.setItem("player_name", storedName);
      }
      const storedIdRaw = localStorage.getItem(`player_id_${id}`);
      const storedId = storedIdRaw ? Number(storedIdRaw) : undefined;

      setPlayerName(storedName);
      setPlayerId(storedId || null);

      socket.emit("join_game", {
        game_id: Number(id),
        name: storedName,
        player_id: storedId,
      });
    });

    socket.on("joined", (data: { player_id: number; name: string }) => {
      if (!data?.player_id) return;

      setPlayerId(data.player_id);
      setPlayerName(data.name);

      localStorage.setItem(`player_id_${id}`, String(data.player_id));
      localStorage.setItem("player_name", data.name);

      setGame(prev => {
        const filteredPlayers = prev.players.filter(p => p.id !== data.player_id && p.name !== data.name);
        return { ...prev, players: [...filteredPlayers, { id: data.player_id, name: data.name, ready: false }] };
      });
    });

    socket.on("player_list", (data: { players: Player[] }) => {
      setGame(prev => {
        const mergedPlayers = prev.players.map(p => {
          const updated = data.players.find(dp => dp.id === p.id);
          return updated ? { ...p, ready: updated.ready, name: updated.name } : p;
        });
        const newPlayers = data.players.filter(dp => !prev.players.some(p => p.id === dp.id));
        return { ...prev, players: [...mergedPlayers, ...newPlayers] };
      });

      if (playerId) {
        const me = data.players.find(p => p.id === playerId);
        if (me) {
          setIsReady(me.ready);
          setPlayerName(me.name);
        }
      }
    });

    // --- Start game redirects all players ---
    socket.on("game_started", () => {
      if (!playerId) return;
      navigate(`/game/${id}/play?player_id=${playerId}&name=${encodeURIComponent(playerName)}&host=${isHost}`);
    });

    socket.on("error", (err) => console.warn("Socket error:", err));
    socket.on("disconnect", () => console.log("Socket disconnected"));

    return () => socket.disconnect();
  }, [id, navigate, playerId, playerName, isHost]);

  // --- Toggle ready ---
  const toggleReady = () => {
    if (!playerId) return;

    setGame(prev => {
      const updatedPlayers = prev.players.map(p => 
        p.id === playerId ? { ...p, ready: !isReady } : p
      );
      return { ...prev, players: updatedPlayers };
    });

    setIsReady(!isReady);

    socket.emit("toggle_ready", { game_id: Number(id), player_id: playerId, ready: !isReady });
  };

  // --- Start game ---
  const startGame = () => {
    if (!playerId || !isHost) return;
    socket.emit("start_game", { game_id: Number(id) });
  };

  // --- Kick player ---
  const kickPlayer = (kickId: number) => {
    if (!isHost) return;
    socket.emit("remove_player", { game_id: Number(id), player_id: kickId });
  };

  // --- UI ---
  const styles: any = {
    container: { maxWidth: 800, margin: "0 auto", padding: 20, fontFamily: "Arial", textAlign: "center" },
    title: { fontSize: 36, marginBottom: 20, color: "#fff" },
    card: { background: "#f4f4f4", padding: 20, borderRadius: 12, marginBottom: 20 },
    button: { width: "95%", padding: 12, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 10 },
    playerList: { maxHeight: 400, overflowY: "auto", padding: 0, margin: 0, listStyle: "none" },
    playerItem: { display: "flex", justifyContent: "space-between", background: "#fff", borderRadius: 8, padding: 10, marginTop: 10, alignItems: "center" },
    readyIndicator: (ready: boolean) => ({ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: ready ? "#4caf50" : "#f44336", marginRight: 8 }),
    kickButton: { marginLeft: 10, padding: "2px 6px", border: "none", borderRadius: 4, backgroundColor: "#e53935", color: "#fff", cursor: "pointer" },
  };

  return (
    <div style={{ ...styles.container, background: "linear-gradient(135deg, #7e5bef, #5c7aea)", minHeight: "100vh" }}>
      <h1 style={styles.title}>🎉 Game Room #{game.id}</h1>
      <p style={{ color: "#ddd", marginBottom: 20 }}>Rounds: {game.rounds ?? "—"}</p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        {/* MAIN CARD */}
        <div style={{ ...styles.card, flex: 1, minWidth: 300 }}>
          <button
            onClick={toggleReady}
            style={{ ...styles.button, backgroundColor: isReady ? "#4caf50" : "#607d8b" }}
          >
            {isReady ? "Cancel Ready" : "Ready Up"}
          </button>

          {isHost && (
            <button
              onClick={startGame}
              disabled={!allReady}
              style={{ ...styles.button, backgroundColor: allReady ? "#2196f3" : "#ccc", cursor: allReady ? "pointer" : "not-allowed" }}
            >
              {allReady ? "Start Game" : "Waiting for players..."}
            </button>
          )}

          <div style={{ marginTop: 10, color: "#555", fontSize: 14 }}>
            {isHost ? "You are the host" : "Press Ready when you are ready"}
          </div>
        </div>

        {/* PLAYERS PANEL */}
        <div style={{ ...styles.card, flex: 1, minWidth: 250 }}>
          <h2 style={{ marginBottom: 10 }}>Players</h2>
          <ul style={styles.playerList}>
            {game.players.map(p => (
              <li key={p.id} style={styles.playerItem}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={styles.readyIndicator(p.ready)} title={p.ready ? "Ready" : "Not ready"} />
                  <span>{p.name}{p.id === game.host_player_id ? " (Host)" : ""}</span>
                  {isHost && p.id !== playerId && (
                    <button style={styles.kickButton} onClick={() => kickPlayer(p.id)}>X</button>
                  )}
                </div>
                <span style={{ color: p.ready ? "#4caf50" : "#888", fontWeight: 600 }}>
                  {p.ready ? "Ready ✅" : "Not Ready ❌"}
                </span>
              </li>
            ))}
            {game.players.length === 0 && <li>No players yet</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
