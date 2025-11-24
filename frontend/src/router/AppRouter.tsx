// src/router/AppRouter.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Lobby from "../components/Lobby";
import GameRoom from "../components/GameRoom";
import AdminLobby from "../components/AdminLobby";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/game/:id" element={<GameRoom />} />
        <Route path="/admin" element={<AdminLobby />} />
      </Routes>
    </BrowserRouter>
  );
}
