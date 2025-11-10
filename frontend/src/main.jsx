import React, {useState, useEffect, useRef} from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function App(){
  const [socket, setSocket] = useState(null);
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState(null);
  const [name, setName] = useState("");
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [submissionText, setSubmissionText] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [voteCounts, setVoteCounts] = useState({});

  useEffect(()=> {
    const s = io(BACKEND, {transports: ["websocket"]});
    setSocket(s);
    s.on("connect", ()=> console.log("connected", s.id));
    s.on("joined", d => {
      setPlayerId(d.player_id);
    });
    s.on("player_list", d => {
      setPlayers(d.players || []);
    });
    s.on("round_started", d => {
      setRoundId(d.round_id);
      setQuestion(d.question);
      setSubmissions([]);
      setVoteCounts({});
    });
    s.on("submission_received", d => {
      // could show counts
    });
    s.on("submissions_revealed", d => {
      setSubmissions(d.submissions || []);
    });
    s.on("vote_update", d => {
      setVoteCounts(d.counts || {});
    });
    s.on("round_finished", d => {
      alert("Round finished! Winner submission id: " + d.winner_submission_id);
    });

    s.on("error", e => {
      console.error("socket error:", e);
      alert("Server error: " + JSON.stringify(e));
    });

    return ()=> s.disconnect();
  }, []);

  function createGame(){
    fetch(BACKEND + "/games", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({host_name: name || "Host"})})
      .then(r=>r.json()).then(d=>{
        setGameId(d.game_id);
        // auto join
        socket && socket.emit("join_game", {game_id: d.game_id, name});
      });
  }

  function joinGame(){
    socket && socket.emit("join_game", {game_id: gameId, name});
  }

  function startRound(){
    socket && socket.emit("start_round", {game_id: gameId});
  }

  function submitAnswer(){
    if(!roundId){
      alert("No active round");
      return;
    }
    socket && socket.emit("submit_answer", {round_id: roundId, text: submissionText});
    setSubmissionText("");
    alert("Submitted!");
  }

  function reveal(){
    socket && socket.emit("reveal_submissions", {round_id: roundId});
  }

  function vote(submission_id){
    socket && socket.emit("vote_submission", {round_id: roundId, submission_id});
  }

  return <div style={{fontFamily:"sans-serif", padding:20}}>
    <h2>Party Game — minimal</h2>

    <div style={{marginBottom:10}}>
      <input placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}/>
    </div>

    <div style={{display:"flex", gap:8, marginBottom:12}}>
      <button onClick={createGame}>Create Game</button>
      <input placeholder="game id" value={gameId} onChange={e=>setGameId(e.target.value)} />
      <button onClick={joinGame}>Join Game</button>
    </div>

    <div>
      <strong>Players:</strong>
      <ul>{players.map(p => <li key={p.id}>{p.name} (id:{p.id})</li>)}</ul>
    </div>

    <div style={{marginTop:10}}>
      <button onClick={startRound}>Start Round (host)</button>
    </div>

    {question && <div style={{marginTop:12, padding:10, border:"1px solid #ddd"}}>
      <h3>Question</h3>
      <p>{question}</p>

      <div>
        <textarea value={submissionText} onChange={e=>setSubmissionText(e.target.value)} placeholder="Write your answer..." rows={3} cols={50}></textarea>
      </div>
      <div>
        <button onClick={submitAnswer}>Submit Answer</button>
        <button onClick={reveal} style={{marginLeft:8}}>Reveal Submissions (host)</button>
      </div>

      <div style={{marginTop:10}}>
        <h4>Submissions (anonymous)</h4>
        <ul>
          {submissions.map(s => (
            <li key={s.anon_id} style={{marginBottom:8}}>
              <div><strong>{s.anon_id}:</strong> {s.text}</div>
              <div style={{marginTop:4}}>
                <button onClick={()=>vote(s.submission_id)}>Vote</button>
                <small style={{marginLeft:8}}>Votes: {voteCounts[String(s.submission_id)] || 0}</small>
              </div>
            </li>
          ))}
        </ul>
      </div>

    </div>}

  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
