import React from "react";
import { socket } from "../socket";

interface Submission {
  id: number;
  text: string;
}

interface VotePanelProps {
  roundId: number;
  submissions: Submission[];
}

const VotePanel: React.FC<VotePanelProps> = ({ roundId, submissions }) => {
  const vote = (submissionId: number) => {
    socket.emit("vote", { roundId, submissionId });
  };

  return (
    <div className="p-4 border rounded-lg shadow-md">
      <h3 className="font-semibold mb-2">Vote for the Best Answer</h3>
      <ul className="space-y-2">
        {submissions.map((s) => (
          <li key={s.id}>
            <button
              className="px-3 py-1 bg-green-500 text-white rounded"
              onClick={() => vote(s.id)}
            >
              {s.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VotePanel;
