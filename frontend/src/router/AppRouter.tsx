// src/router/AppRouter.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Lobby from "../components/Lobby";
import GameRoom from "../components/GameRoom";
import AdminLobby from "../components/AdminLobby";
import PlayGame from "../components/PlayGame";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main Lobby */}
        <Route path="/" element={<Lobby />} />

        {/* Pre-game lobby (waiting room) */}
        <Route path="/game/:id" element={<GameRoom />} />

        {/* Actual gameplay page */}
        <Route path="/play/:id" element={<PlayGame />} />

        {/* Admin panel */}
        <Route path="/admin" element={<AdminLobby />} />
      </Routes>
    </BrowserRouter>
  );
}
