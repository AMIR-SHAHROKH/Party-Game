import React from "react";

interface Score {
  player: string;
  points: number;
}

interface ScoreboardProps {
  scores: Score[];
}

const Scoreboard: React.FC<ScoreboardProps> = ({ scores }) => {
  return (
    <div className="p-4 border rounded-lg shadow-md">
      <h3 className="font-semibold mb-2">Scoreboard</h3>
      <ul>
        {scores.map((s) => (
          <li key={s.player}>
            {s.player}: {s.points}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Scoreboard;
