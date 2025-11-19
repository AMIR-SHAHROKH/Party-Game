import { io, Socket } from "socket.io-client";

// frontend/src/socket.ts or api.ts

export const BACKEND_URL = "http://localhost:8000"; // hardcoded backend URL and port

// If using Socket.IO

export const socket = io(BACKEND_URL, {
  transports: ["websocket"],
});

// Events interface
export interface JoinGamePayload {
  game_id: number;
  name: string;
  player_id?: number;
}

export interface StartRoundPayload {
  game_id: number;
}

export interface SubmitAnswerPayload {
  round_id: number;
  text: string;
}

export interface VotePayload {
  round_id: number;
  submission_id: number;
}

// Socket methods
export const connectSocket = () => {
  socket.connect();
};

export const disconnectSocket = () => {
  socket.disconnect();
};

export const joinGame = (payload: JoinGamePayload) => {
  socket.emit("join_game", payload);
};

export const startRound = (payload: StartRoundPayload) => {
  socket.emit("start_round", payload);
};

export const submitAnswer = (payload: SubmitAnswerPayload) => {
  socket.emit("submit_answer", payload);
};

export const voteSubmission = (payload: VotePayload) => {
  socket.emit("vote_submission", payload);
};

// Listeners
export const onPlayerListUpdate = (cb: (players: any[]) => void) => {
  socket.on("player_list", cb);
};

export const onRoundStarted = (cb: (data: any) => void) => {
  socket.on("round_started", cb);
};

export const onSubmissionReceived = (cb: (data: any) => void) => {
  socket.on("submission_received", cb);
};

export const onSubmissionsRevealed = (cb: (data: any) => void) => {
  socket.on("submissions_revealed", cb);
};

export const onVoteUpdate = (cb: (data: any) => void) => {
  socket.on("vote_update", cb);
};

export const onRoundFinished = (cb: (data: any) => void) => {
  socket.on("round_finished", cb);
};

export const onError = (cb: (data: any) => void) => {
  socket.on("error", cb);
};
