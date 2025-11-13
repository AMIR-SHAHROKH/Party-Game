import React, { useState, useEffect } from "react";
import { getPlayers, type Player } from "../api";

interface AdminLobbyProps {
  playerName: string;
  gameId: string;
}

const AdminLobby: React.FC<AdminLobbyProps> = ({ playerName, gameId }) => {
  const [rounds, setRounds] = useState<number>(5);
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);

  // Fetch joined players
  const fetchPlayers = async () => {
    try {
      const response = await getPlayers(gameId);
      setPlayers(response.data);
    } catch (err) {
      console.error("Failed to fetch players", err);
    }
  };

  // Poll every 2 seconds
  useEffect(() => {
    if (!gameStarted) {
      const interval = setInterval(fetchPlayers, 2000);
      return () => clearInterval(interval);
    }
  }, [gameStarted]);

  const handleStartGame = () => {
    if (players.length < 2) {
      alert("Need at least 2 players to start the game!");
      return;
    }
    setGameStarted(true);
    alert(`Game started with ${rounds} rounds and ${players.length} players!`);
    // TODO: call backend to officially start the game
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-green-400 to-blue-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Admin Lobby</h2>

        <p className="mb-2">
          <strong>Game ID:</strong> {gameId}
        </p>
        <p className="mb-6">
          <strong>Host:</strong> {playerName}
        </p>

        {!gameStarted && (
          <>
            {/* Rounds & Max Players */}
            <div className="mb-4 flex gap-4">
              <div className="flex-1">
                <label className="block mb-1 font-medium text-gray-700">
                  Rounds
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rounds}
                  onChange={(e) => setRounds(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex-1">
                <label className="block mb-1 font-medium text-gray-700">
                  Max Players
                </label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Player List */}
            <h3 className="font-semibold mb-2 text-gray-800">
              Players Joined ({players.length})
            </h3>
            <ul className="mb-4 max-h-48 overflow-y-auto space-y-2">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
                >
                  {p.name}
                </li>
              ))}
            </ul>

            {/* Start Game Button */}
            <button
              onClick={handleStartGame}
              disabled={players.length < 2 || loading}
              className="w-full py-3 bg-green-500 text-white font-semibold rounded-xl shadow hover:bg-green-600 transition"
            >
              Start Game
            </button>
          </>
        )}

        {gameStarted && (
          <div className="mt-6 text-center">
            <h3 className="text-xl font-bold mb-2 text-gray-800">
              Game Started!
            </h3>
            <p className="mb-2">Rounds: {rounds}</p>
            <h4 className="font-semibold mb-2">Players:</h4>
            <ul className="space-y-1">
              {players.map((p) => (
                <li key={p.id} className="p-1 bg-gray-100 rounded">
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLobby;
