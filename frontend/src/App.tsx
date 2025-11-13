import React, { useState } from "react";
import Lobby from "./components/Lobby";
import AdminLobby from "./components/AdminLobby";

const App: React.FC = () => {
  const [player, setPlayer] = useState<string>("");
  const [gameId, setGameId] = useState<string>("");

  return (
    <div>
      {!gameId ? (
        <Lobby setPlayer={setPlayer} setGameId={setGameId} />
      ) : (
        <AdminLobby playerName={player} gameId={gameId} />
      )}
    </div>
  );
};

export default App;
