// src/components/Lobby.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGame, getGames, joinGame } from "../api/gameApi";

export default function Lobby() {
  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const res = await getGames();
      setGames(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async () => {
    if (!hostName.trim()) return alert("Enter your name!");
    setLoading(true);
    try {
      const res = await createGame(hostName);
      navigate(`/game/${res.data.game_id}`);
    } catch (e) {
      console.error(e);
      alert("Could not create game");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinId.trim() || !joinName.trim()) return alert("Enter game ID and name!");
    try {
      await joinGame(joinId, joinName);
      navigate(`/game/${joinId}?name=${joinName}`);
    } catch (e) {
      console.error(e);
      alert("Could not join game");
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Lobby</h1>

      <div style={styles.card}>
        <h2>Create Game</h2>
        <input
          placeholder="Your Name"
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleCreate} style={styles.button}>
          {loading ? "Creating..." : "Create Game"}
        </button>
      </div>

      <div style={styles.card}>
        <h2>Join Game</h2>
        <input
          placeholder="Game ID"
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          style={styles.input}
        />
        <input
          placeholder="Your Name"
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleJoin} style={styles.button}>
          Join
        </button>
      </div>

      <div style={styles.card}>
        <h2>Active Games</h2>
        {games.length === 0 && <p>No active games yet.</p>}
        {games.map((g) => (
          <div key={g.id} style={styles.gameRow}>
            <span>Game #{g.id}</span>
            <button
              style={styles.smallButton}
              onClick={() => navigate(`/game/${g.id}`)}
            >
              Join
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: any = {
  container: { maxWidth: 600, margin: "0 auto", padding: 20, fontFamily: "Arial", textAlign: "center" },
  title: { fontSize: 36, marginBottom: 20 },
  card: { background: "#f4f4f4", padding: 20, borderRadius: 12, marginBottom: 20 },
  input: { width: "90%", padding: 10, borderRadius: 8, margin: "8px 0", border: "1px solid #ccc" },
  button: { width: "95%", padding: 12, background: "#4a90e2", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" },
  gameRow: { display: "flex", justifyContent: "space-between", padding: 10, background: "#fff", marginTop: 10, borderRadius: 8 },
  smallButton: { padding: "6px 12px", background: "#5c7aea", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" },
};
