import React, { useState, useEffect } from "react";
import { createGame, getGames, joinGame, type GameResponse, type GameInfo } from "../api";
import type { AxiosResponse } from "axios";

interface LobbyProps {
  setPlayer: React.Dispatch<React.SetStateAction<string>>;
  setGameId: React.Dispatch<React.SetStateAction<string>>;
}

const Lobby: React.FC<LobbyProps> = ({ setPlayer, setGameId }) => {
  const [nameInput, setNameInput] = useState<string>("");
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = async () => {
    try {
      const response: AxiosResponse<{ games?: GameInfo[] }> = await getGames();
      // fallback to empty array if backend returns undefined
      setGames(response.data.games ?? []);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch games");
      setGames([]); // ensure state is always an array
    }
  };

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const handleCreateGame = async () => {
    if (!nameInput.trim()) {
      setError("Enter your name to continue.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setPlayer(nameInput.trim());
      const response: AxiosResponse<GameResponse> = await createGame(nameInput.trim());
      setGameId(response.data.game_id?.toString() ?? ""); // fallback to empty string
    } catch (err) {
      console.error(err);
      setError("Failed to create game");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (gameIdParam: string | number) => {
    if (!nameInput.trim()) {
      setError("Enter your name to join a game.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await joinGame(gameIdParam, nameInput.trim());
      setPlayer(nameInput.trim());
      setGameId(res.data.game_id?.toString() ?? ""); // fallback
    } catch (err) {
      console.error(err);
      setError("Failed to join game");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-purple-600 to-indigo-600">
      <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Join the Game</h1>

        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-3 mb-4 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {error && <p className="text-red-500 mb-4">{error}</p>}

        <button
          onClick={handleCreateGame}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow hover:bg-indigo-700 transition duration-200 mb-6"
        >
          {loading ? "Creating Game..." : "Create Game"}
        </button>

        <h2 className="text-xl font-semibold mb-4 text-gray-700">Or Join Existing Game</h2>

        {games.length === 0 ? (
          <p className="text-gray-500">No games available.</p>
        ) : (
          <ul className="space-y-2">
            {games.map((game) => (
              <li key={game.game_id}>
                <button
                  onClick={() => handleJoinGame(game.game_id)}
                  className="w-full py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition duration-200"
                >
                  Join Game {game.game_id ?? "N/A"} ({game.players_count ?? 0} players)
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Lobby;
