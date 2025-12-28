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
  const [phase, setPhase] = useState<
    "waiting" | "collecting" | "voting" | "finished"
  >("waiting");

  const socketRef = useRef<any>(null);

  // Load game configuration
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

  // Socket setup
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

    s.on("submissions_revealed", (data: any) => {
      setSubmissions(data.submissions || []);
      setPhase("voting");
    });

    s.on("vote_update", (data: any) => {
      setVoteCounts(data.counts || {});
    });

    s.on("round_finished", () => {
      setPhase("finished");
    });

    return () => s.disconnect();
  }, [id, playerName, playerIdParam]);

  // Host-only: start round
  const hostStartRound = () => {
    socketRef.current.emit("start_round", { game_id: Number(id) });
  };

  // Player: submit answer
  const submitAnswer = () => {
    if (!roundId || !answerText.trim()) return;
    socketRef.current.emit("submit_answer", {
      round_id: roundId,
      text: answerText.trim(),
    });
    setAnswerText("");
  };

  // Host: reveal submissions
  const reveal = () => {
    socketRef.current.emit("reveal_submissions", { round_id: roundId });
  };

  // Player: vote on submission
  const vote = (submission_id: number) => {
    socketRef.current.emit("vote_submission", {
      round_id: roundId,
      submission_id,
    });
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>
          Game Play  •  Round {roundIndex}/{roundsTotal}
        </h1>

        <div style={styles.phaseBanner[phase]}>
          Phase: {phase.toUpperCase()}
        </div>

        <div style={styles.card}>
          {/* WAITING */}
          {phase === "waiting" && (
            <div style={styles.section}>
              <p style={styles.infoText}>
                Waiting for host to start the first round.
              </p>
              {isHost && (
                <button style={styles.primaryBtn} onClick={hostStartRound}>
                  Start Round
                </button>
              )}
            </div>
          )}

          {/* COLLECTING */}
          {phase === "collecting" && (
            <div style={styles.section}>
              <h2 style={styles.cardTitle}>Question</h2>
              <div style={styles.questionBox}>{question}</div>

              <textarea
                style={styles.textarea}
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Type your answer..."
              />

              <button style={styles.primaryBtn} onClick={submitAnswer}>
                Submit Answer
              </button>

              {isHost && (
                <button style={styles.revealBtn} onClick={reveal}>
                  Reveal Submissions
                </button>
              )}
            </div>
          )}

          {/* VOTING */}
          {phase === "voting" && (
            <div style={styles.section}>
              <h2 style={styles.cardTitle}>Vote for the best answer</h2>
              {submissions.map((s, index) => (
                <div
                  key={s.submission_id}
                  style={{
                    ...styles.submissionBox,
                    animationDelay: `${index * 0.05}s`,
                  }}
                  className="fadeIn"
                >
                  <div style={styles.submissionText}>
                    {s.anon_id}: {s.text}
                  </div>
                  <div style={styles.voteWrapper}>
                    <div style={styles.voteCount}>
                      {voteCounts[s.submission_id] || 0}
                    </div>
                    <button
                      style={styles.voteBtn}
                      onClick={() => vote(s.submission_id)}
                    >
                      Vote
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* FINISHED */}
          {phase === "finished" && (
            <div style={styles.section}>
              <h2 style={styles.cardTitle}>Round Completed</h2>
              <p style={styles.infoText}>
                Host can proceed to the next round.
              </p>
              {isHost && (
                <button style={styles.primaryBtn} onClick={hostStartRound}>
                  Start Next Round
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CSS animations injected */}
      <style>
        {`
        .fadeIn {
          opacity: 0;
          transform: translateY(8px);
          animation: fadeInUp 0.35s forwards;
        }

        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}
      </style>
    </div>
  );
}

const styles: any = {
  page: {
    background: "#0d0d12",
    color: "white",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: 24,
  },

  container: {
    width: "100%",
    maxWidth: 900,
  },

  title: {
    fontSize: 26,
    fontWeight: 800,
    marginBottom: 16,
    textAlign: "center",
  },

  phaseBanner: {
    waiting: {
      background: "#383838",
      padding: 12,
      borderRadius: 10,
      fontWeight: 700,
      marginBottom: 16,
      textAlign: "center",
    },
    collecting: {
      background: "#3254a8",
      padding: 12,
      borderRadius: 10,
      fontWeight: 700,
      marginBottom: 16,
      textAlign: "center",
    },
    voting: {
      background: "#7842a3",
      padding: 12,
      borderRadius: 10,
      fontWeight: 700,
      marginBottom: 16,
      textAlign: "center",
    },
    finished: {
      background: "#3c803c",
      padding: 12,
      borderRadius: 10,
      fontWeight: 700,
      marginBottom: 16,
      textAlign: "center",
    },
  },

  card: {
    background: "#1a1a24",
    padding: 22,
    borderRadius: 12,
  },

  section: {
    marginTop: 8,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 12,
  },

  infoText: {
    opacity: 0.8,
    marginBottom: 12,
  },

  questionBox: {
    background: "#242430",
    padding: 16,
    borderRadius: 10,
    fontSize: 18,
    marginBottom: 12,
  },

  textarea: {
    width: "100%",
    minHeight: 110,
    background: "#22222c",
    border: "none",
    borderRadius: 10,
    padding: 12,
    color: "white",
    fontSize: 16,
    marginBottom: 12,
  },

  primaryBtn: {
    width: "100%",
    padding: 14,
    background: "#5a8dee",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
    color: "white",
    marginBottom: 12,
  },

  revealBtn: {
    width: "100%",
    padding: 14,
    background: "#f0b429",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
    color: "#1a1a1a",
    marginTop: 6,
  },

  submissionBox: {
    background: "#262632",
    padding: 14,
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  submissionText: {
    maxWidth: "70%",
  },

  voteWrapper: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },

  voteCount: {
    fontWeight: 900,
    fontSize: 18,
  },

  voteBtn: {
    padding: "8px 12px",
    background: "#45c045",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    color: "white",
  },
};
