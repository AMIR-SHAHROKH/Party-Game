import type { AxiosResponse } from "axios";
import { api } from "./apiInstance"; // make sure the path is correct

export interface Question { id: number; text: string; options: string[]; answer: string }
export interface GameResponse { game_id: string }
export interface GameInfo { game_id: string; host_name: string; players_count: number }
export interface Score { player: string; points: number }
export interface Player { id: number; name: string }

// Admin API
export const importQuestions = (questions: Question[]): Promise<AxiosResponse> =>
  api.post("/admin/questions/import", { questions });

// Game API
export const createGame = (hostName: string): Promise<AxiosResponse<GameResponse>> =>
  api.post("/games", { host_name: hostName });

export const getGames = (): Promise<AxiosResponse<{ games: GameInfo[] }>> =>
  api.get("/games");

export const joinGame = (gameId: string | number, playerName: string) =>
  api.post(`/games/${gameId}/join`, { player_name: playerName });

export const getScores = (gameId: string | number): Promise<AxiosResponse<Score[]>> =>
  api.get(`/games/${gameId}/scores`);

export const getPlayers = (gameId: string | number): Promise<AxiosResponse<Player[]>> =>
  api.get(`/games/${gameId}/players`);
