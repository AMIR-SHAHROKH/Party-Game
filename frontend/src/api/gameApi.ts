// src/api/gameApi.ts
import axios from "axios";

const API_BASE = "http://localhost:8000"; // direct URL since you don't want env

export const getGames = () => axios.get(`${API_BASE}/games`);
export const createGame = (hostName: string) =>
  axios.post(`${API_BASE}/games`, { host_name: hostName });
export const joinGame = (gameId: string, playerName: string) =>
  axios.post(`${API_BASE}/games/${gameId}/join`, { player_name: playerName });
export const getGame = (gameId: string) =>
  axios.get(`${API_BASE}/games/${gameId}`);
