// src/components/AdminLobby.tsx
import { useState } from "react";
import { importQuestions } from "../api/adminApi";

export default function AdminLobby() {
  const [questions, setQuestions] = useState("");
  const handleImport = async () => {
    try {
      const list = questions.split("\n").map(q => q.trim()).filter(Boolean);
      await importQuestions(list);
      alert("Questions imported!");
      setQuestions("");
    } catch (e) {
      console.error(e);
      alert("Failed to import questions");
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h1>Admin Lobby</h1>
      <textarea
        placeholder="Enter one question per line"
        value={questions}
        onChange={e => setQuestions(e.target.value)}
        style={{ width: "100%", height: 200, padding: 10, marginBottom: 10 }}
      />
      <button onClick={handleImport} style={{ padding: 12, width: "100%", background: "#4a90e2", color: "#fff", border: "none", borderRadius: 8 }}>
        Import Questions
      </button>
    </div>
  );
}
