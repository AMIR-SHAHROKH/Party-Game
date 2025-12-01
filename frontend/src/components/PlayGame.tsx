// src/components/PlayGame.tsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import axios from "axios";

const API_BASE = "http://localhost:8000";
const SOCKET_URL = "http://localhost:8000";

export default function PlayGame() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const playerName = searchParams.get("name") || "Player";
  const playerIdParam = searchParams.get("player_id");
  const isHost = searchParams.get("host") === "true";

  const [roundsTotal, setRoundsTotal] = useState<number>(10);
  const [roundIndex, setRoundIndex] = useState<number>(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<number | null>(null);

  const [answerText, setAnswerText] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<"waiting" | "collecting" | "voting" | "finished">(
    "waiting"
  );

  const socketRef = useRef<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE}/games/${id}`);
        setRoundsTotal(res.data.rounds || 10);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = s;

    s.on("connect", () => {
      s.emit("join_game", {
        game_id: Number(id),
        name: playerName,
        player_id: playerIdParam ? Number(playerIdParam) : undefined,
      });
    });

    s.on("round_started", (data: any) => {
      setRoundId(data.round_id);
      setQuestion(data.question);
      setPhase("collecting");
      setAnswerText("");
      setSubmissions([]);
      setVoteCounts({});
      setRoundIndex((r) => r + 1);
    });

    s.on("submission_received", () => {
      // optional: show counts etc.
    });

    s.on("submissions_revealed", (data: any) => {
      setSubmissions(data.submissions || []);
      setPhase("voting");
    });

    s.on("vote_update", (data: any) => {
      setVoteCounts(data.counts || {});
    });

    s.on("round_finished", (data: any) => {
      setPhase("finished");
    });

    return () => s.disconnect();
  }, [id, playerName, playerIdParam]);

  // host triggers start_round to create a Round row on server
  const hostStartRound = () => {
    socketRef.current.emit("start_round", { game_id: Number(id) });
  };

  const submitAnswer = () => {
    if (!roundId || !answerText.trim()) return;
    socketRef.current.emit("submit_answer", { round_id: roundId, text: answerText.trim() });
    setAnswerText("");
  };

  const reveal = () => {
    socketRef.current.emit("reveal_submissions", { round_id: roundId });
  };

  const vote = (submission_id: number) => {
    socketRef.current.emit("vote_submission", { round_id: roundId, submission_id });
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Game Play — Round {roundIndex}/{roundsTotal}</h1>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Phase: {phase}</h2>

        {phase === "waiting" && isHost && (
          <>
            <p>Host: press to start the first round</p>
            <button onClick={hostStartRound} style={styles.btn}>Start Round</button>
          </>
        )}

        {phase === "collecting" && (
          <>
            <h3 style={styles.cardTitle}>Question</h3>
            <p>{question}</p>

            <textarea
              placeholder="Type your answer..."
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              style={styles.textarea}
            />
            <button onClick={submitAnswer} style={styles.btn}>Submit Answer</button>

            {isHost && (
              <button onClick={reveal} style={{...styles.btn, background: "#f0b429", marginTop: 10}}>
                Reveal Submissions
              </button>
            )}
          </>
        )}

        {phase === "voting" && (
          <>
            <h3 style={styles.cardTitle}>Vote for the best answer</h3>
            {submissions.map((s) => (
              <div key={s.submission_id} style={styles.submissionBox}>
                <div>{s.anon_id}: {s.text}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>{voteCounts[s.submission_id] || 0}</div>
                  <button style={styles.voteBtn} onClick={() => vote(s.submission_id)}>Vote</button>
                </div>
              </div>
            ))}
          </>
        )}

        {phase === "finished" && (
          <>
            <h3 style={styles.cardTitle}>Round finished</h3>
            <p>Host can start next round.</p>
            {isHost && <button onClick={hostStartRound} style={styles.btn}>Start Next Round</button>}
          </>
        )}
      </div>
    </div>
  );
}

/* styles - reuse similar look */
const styles: any = {
  page: { padding: 20, minHeight: "100vh", background: "#0f0f13", color: "white", display: "flex", justifyContent: "center" },
  title: { fontSize: 24, marginBottom: 12 },
  card: { width: "95%", maxWidth: 800, background: "#1f1f2a", padding: 18, borderRadius: 10 },
  cardTitle: { fontSize: 18, marginBottom: 8, fontWeight: 700 },
  textarea: { width: "100%", height: 100, borderRadius: 8, padding: 10, marginTop: 8, border: "none" },
  btn: { width: "100%", padding: 12, borderRadius: 8, background: "#5a8dee", border: "none", fontWeight: 700, color: "white", marginTop: 8 },
  submissionBox: { display: "flex", justifyContent: "space-between", padding: 10, background: "#2b2b35", borderRadius: 8, marginTop: 8 },
  voteBtn: { background: "#47d147", padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer" },
};
