// src/App.tsx
import React, { useState } from "react";
import Lobby from "./components/Lobby";

const App: React.FC = () => {
  const [player, setPlayer] = useState<string>("");
  const [gameId, setGameId] = useState<string>("");

  return (
    <>
      {!gameId ? (
        <Lobby setPlayer={setPlayer} setGameId={setGameId} />
      ) : (
        <div className="text-center mt-10">
          <h1 className="text-2xl font-bold">
            Player: {player}, Game ID: {gameId}
          </h1>
          <p>Game logic here...</p>
        </div>
      )}
    </>
  );
};

export default App;
