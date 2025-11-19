import React from "react";

interface Player {
  id: number;
  name: string;
}

interface PlayersListProps {
  players: Player[];
}

const PlayersList: React.FC<PlayersListProps> = ({ players }) => (
  <ul>
    {players.map((p) => (
      <li key={p.id}>{p.name}</li>
    ))}
  </ul>
);

export default PlayersList;
