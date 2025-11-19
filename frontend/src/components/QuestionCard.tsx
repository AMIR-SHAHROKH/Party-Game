import React from "react";
import { socket } from "../socket";

interface QuestionCardProps {
  roundId: number;
  question: string;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ roundId, question }) => {
  const submitAnswer = (answer: string) => {
    socket.emit("submit_answer", { roundId, answer });
  };

  return (
    <div className="p-4 border rounded-lg shadow-md">
      <h3 className="font-semibold mb-2">{question}</h3>
      <div className="space-x-2">
        <button
          className="px-3 py-1 bg-indigo-500 text-white rounded"
          onClick={() => submitAnswer("A")}
        >
          A
        </button>
        <button
          className="px-3 py-1 bg-indigo-500 text-white rounded"
          onClick={() => submitAnswer("B")}
        >
          B
        </button>
        <button
          className="px-3 py-1 bg-indigo-500 text-white rounded"
          onClick={() => submitAnswer("C")}
        >
          C
        </button>
        <button
          className="px-3 py-1 bg-indigo-500 text-white rounded"
          onClick={() => submitAnswer("D")}
        >
          D
        </button>
      </div>
    </div>
  );
};

export default QuestionCard;
