import React, { useEffect } from "react";
import PlayersList from "./PlayersList";
import { socket } from "../socket";

interface GameRoomProps {
  roundId: number;
  question: string;
  gameId: string;
}

const GameRoom: React.FC<GameRoomProps> = ({ roundId, question, gameId }) => {
  useEffect(() => {
    socket.on("update", (data: any) => {
      console.log("Update received", data);
    });

    return () => {
      socket.off("update");
    };
  }, []);

  return (
    <div>
      <h2>Round {roundId}</h2>
      <p>{question}</p>
      <PlayersList players={[]} />
    </div>
  );
};

export default GameRoom;
