/* ======================================================
   GLOBAL HELPERS
====================================================== */
function $(id) { return document.getElementById(id); }

// Tries multiple API hosts and both "/api" and non-prefixed routes.
// Returns { url, data } or throws.
const API_HOSTS = [
  "http://127.0.0.1:8000",
  "http://localhost"
];

async function tryFetch(path, options = {}) {
  for (const host of API_HOSTS) {
    const candidates = [`${host}/api${path}`, `${host}${path}`];
    for (const url of candidates) {
      try {
        const res = await fetch(url, options);
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (!res.ok) {
          const err = new Error("Request failed");
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return { url, data };
      } catch (err) {
        // Continue to next url
      }
    }
  }
  throw new Error("All backend hosts failed");
}

/* ======================================================
   HOME PAGE NAVIGATION
====================================================== */
const startBtn = $("startBtn");
const joinBtn = $("joinBtn");
if (startBtn) startBtn.addEventListener("click", () => window.location.href = "create-game.html");
if (joinBtn) joinBtn.addEventListener("click", () => window.location.href = "join-game.html");

/* ======================================================
   CREATE GAME PAGE
   (unchanged behaviour; uses tryFetch)
====================================================== */
const createGameForm = $("createGameForm");
const roundsCustomSelect = document.querySelector(".custom-select");
const roundsNativeSelect = document.querySelector(".native-select");

if (createGameForm) {
  createGameForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const gameInput = $("gameName");
    const hostInput = $("hostName");
    const gameError = gameInput.nextElementSibling;
    const hostError = hostInput.nextElementSibling;

    let valid = true;
    if (!gameInput.value.trim()) { gameError.textContent = "Game name is required!"; gameError.style.display = "block"; valid = false; } else gameError.style.display = "none";
    if (!hostInput.value.trim()) { hostError.textContent = "Your name is required!"; hostError.style.display = "block"; valid = false; } else hostError.style.display = "none";
    if (!valid) return;

    let rounds = 5;
    if (window.matchMedia("(hover: hover)").matches && roundsCustomSelect) rounds = Number(roundsCustomSelect.dataset.value || 5);
    else if (roundsNativeSelect) rounds = Number(roundsNativeSelect.value);

    const payload = { name: gameInput.value.trim(), host_name: hostInput.value.trim(), rounds };

    try {
      const { data } = await tryFetch("/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      // store and go to lobby
      sessionStorage.setItem("game_id", String(data.game_id));
      sessionStorage.setItem("player_id", String(data.host_player_id));
      sessionStorage.setItem("player_name", hostInput.value.trim());
      window.location.href = "lobby.html";
    } catch (err) {
      console.error("Create game failed", err);
      alert("Failed to create game. See console.");
    }
  });
}

/* ======================================================
   CUSTOM DROPDOWN
====================================================== */
document.querySelectorAll(".custom-select").forEach(select => {
  const trigger = select.querySelector(".select-trigger");
  const valueSpan = select.querySelector(".select-value");
  const options = select.querySelectorAll(".select-option");
  if (!trigger || !valueSpan) return;
  select.dataset.value = valueSpan.textContent;
  trigger.addEventListener("click", e => { e.stopPropagation(); select.classList.toggle("open"); });
  options.forEach(option => {
    option.addEventListener("click", () => {
      valueSpan.textContent = option.textContent;
      select.dataset.value = option.dataset.value;
      select.classList.remove("open");
    });
  });
});
document.addEventListener("click", () => document.querySelectorAll(".custom-select").forEach(s => s.classList.remove("open")));

/* ======================================================
   JOIN GAME PAGE
   - lists games in UI? You likely have separate page, but keep behavior
====================================================== */
const usernameInput = $("username");
const joinGameBtn = $("joinGameBtn");
const gameItems = document.querySelectorAll(".game-item");
let selectedGameId = null;

if (usernameInput && joinGameBtn) {
  function updateJoinButton() {
    joinGameBtn.disabled = usernameInput.value.trim() === "" || selectedGameId === null;
  }
  usernameInput.addEventListener("input", updateJoinButton);
  gameItems.forEach(item => {
    item.addEventListener("click", () => {
      gameItems.forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      selectedGameId = item.dataset.gameId;
      updateJoinButton();
    });
  });

  joinGameBtn.addEventListener("click", async () => {
    try {
      const { data } = await tryFetch(`/games/${selectedGameId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_name: usernameInput.value.trim() })
      });
      sessionStorage.setItem("game_id", String(data.game_id));
      sessionStorage.setItem("player_id", String(data.player_id));
      sessionStorage.setItem("player_name", usernameInput.value.trim());
      window.location.href = "lobby.html";
    } catch (err) {
      console.error("Join failed", err);
      alert("Join failed. See console.");
    }
  });
}

/* ======================================================
   LOBBY PAGE (uses GET /games and GET /games/{game_id})
   - shows all games in a left list and details on select
   - host can Start Play which triggers POST /games/{id}/start and POST /games/{id}/start_round
   - listens for socket events and redirects players to round page on 'round_started'
====================================================== */
const gamesListEl = $("gamesList");
const refreshGamesBtn = $("refreshGamesBtn");
const playersListEl = $("playersList");
const lobbyGameName = $("lobbyGameName");
const lobbyGameId = $("lobbyGameId");
const copyLinkBtn = $("copyLinkBtn");
const startPlayBtn = $("startPlayBtn");
const meNameEl = $("meName");
const meRoleEl = $("meRole");

if (gamesListEl && playersListEl) {
  let allGames = [];
  let currentGame = null;
  const myGameId = sessionStorage.getItem("game_id");
  const myPlayerId = sessionStorage.getItem("player_id");
  const myName = sessionStorage.getItem("player_name") || "You";

  meNameEl && (meNameEl.textContent = myName);

  // socket candidates will be tried by URL; we create connection when a game is loaded
  let socket = null;

  async function loadAllGames() {
    try {
      const { data } = await tryFetch("/api/games");
      allGames = Array.isArray(data) ? data : [];
      renderGamesList();
    } catch (err) {
      console.error("Failed to load api/games", err);
      allGames = [];
      renderGamesList();
    }
  }

  function renderGamesList() {
    gamesListEl.innerHTML = "";
    allGames.forEach(g => {
      const li = document.createElement("li");
      li.className = "game-item";
      li.dataset.gameId = g.id;
      li.innerHTML = `<strong>${escapeHtml(g.name)}</strong><div class="muted small">Created: ${g.created_at || "—"}</div>`;
      li.addEventListener("click", () => selectGame(g.id));
      gamesListEl.appendChild(li);
    });
  }

  async function selectGame(gameId) {
    try {
      const { data } = await tryFetch(`/games/${gameId}`);
      currentGame = data;
      lobbyGameName.textContent = currentGame.name || "Game";
      lobbyGameId.textContent = `Game ID: ${gameId}`;
      renderPlayers(currentGame.players || []);
      // show start button only if I'm the host
      const isHost = String(currentGame.host_player_id) === String(myPlayerId);
      if (startPlayBtn) {
        startPlayBtn.style.display = isHost ? "inline-block" : "none";
        meRoleEl && (meRoleEl.textContent = isHost ? "(host)" : "(player)");
        // enable start only if at least 1 player (including host) and all ready
        const everyoneReady = (currentGame.players || []).length > 0 && (currentGame.players || []).every(p => p.ready);
        startPlayBtn.disabled = !everyoneReady && isHost ? false : !everyoneReady; // allow force-start? here require all ready
      }
      // open socket (join room) so we get real-time updates and events
      ensureSocketConnected(gameId);
    } catch (err) {
      console.error("Failed to load game", err);
      alert("Failed to load game details.");
    }
  }

  function renderPlayers(players) {
    playersListEl.innerHTML = "";
    players.forEach(p => {
      const li = document.createElement("li");
      li.className = "player-item";
      li.innerHTML = `<span class="player-name">${escapeHtml(p.name)}</span>
                      <span class="player-ready ${p.ready ? "ready" : "not-ready"}">${p.ready ? "Ready" : "Not ready"}</span>
                      ${p.id === currentGame?.host_player_id ? '<span class="badge host-badge">Host</span>' : ''}`;
      playersListEl.appendChild(li);
    });
  }

  refreshGamesBtn && refreshGamesBtn.addEventListener("click", loadAllGames);

  copyLinkBtn && copyLinkBtn.addEventListener("click", () => {
    if (!currentGame) return alert("Select a game first");
    const inviteUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}join-game.html?game_id=${currentGame.id}`;
    navigator.clipboard?.writeText(inviteUrl).then(() => {
      copyLinkBtn.textContent = "Copied!";
      setTimeout(() => copyLinkBtn.textContent = "Copy invite", 1500);
    }).catch(() => alert("Copy failed — here's the link:\n" + inviteUrl));
  });

  // Start Play: host action
  startPlayBtn && startPlayBtn.addEventListener("click", async () => {
    if (!currentGame) return;
    try {
      // 1) Tell backend to mark game started (emits game_started to room)
      await tryFetch(`/games/${currentGame.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host_id: Number(myPlayerId) })
      });

      // 2) Host immediately create the first round (so question exists). Backend will emit 'round_started' to room.
      await tryFetch(`/games/${currentGame.id}/start_round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host_id: Number(myPlayerId) })
      });

      // After server emits 'round_started', clients will redirect to round.html
      // We may redirect ourselves too as fallback:
      window.location.href = "round.html";
    } catch (err) {
      console.error("Failed to start game/round", err);
      alert("Failed to start game. See console.");
    }
  });

  // Socket setup & handlers
  function ensureSocketConnected(gameId) {
    // if already connected and same room, do nothing
    if (socket && socket.connected) {
      // emit join_game in case server needs refresh
      socket.emit("join_game", { game_id: Number(gameId), name: myName, player_id: Number(myPlayerId) });
      return;
    }

    // Try a candidate socket endpoint (we try both host + /ws and /api/ws)
    const endpoints = [];
    for (const h of API_HOSTS) {
      endpoints.push(`${h}/ws`);
      endpoints.push(`${h}/api/ws`);
    }

    let tried = 0;
    function tryConnect(url) {
      tried++;
      socket = io(url, { transports: ["websocket", "polling"], autoConnect: false });

      socket.on("connect", () => {
        console.log("Socket connected", url, socket.id);
        socket.emit("join_game", { game_id: Number(gameId), name: myName, player_id: Number(myPlayerId) });
      });

      socket.on("connect_error", (err) => {
        console.warn("Socket connect_error", err);
        socket.close();
        if (tried < endpoints.length) tryConnect(endpoints[tried]);
      });

      socket.on("disconnect", (reason) => console.log("Socket disconnected:", reason));

      socket.on("player_list", (payload) => {
        if (payload && Array.isArray(payload.players)) {
          // update currentGame players
          currentGame = currentGame || {};
          currentGame.players = payload.players;
          renderPlayers(payload.players);
        }
      });

      socket.on("player_joined", (payload) => {
        // refresh game state via REST for authoritative data
        if (currentGame) selectGame(currentGame.id);
      });

      socket.on("game_started", (payload) => {
        // redirect all players to round page when game started
        console.log("game_started", payload);
        window.location.href = "round.html";
      });

      socket.on("round_started", (payload) => {
        // Contains { game_id, round_id, question: {id,text} }
        console.log("round_started", payload);
        // forward to round page if we're not there
        if (location.pathname.endsWith("/round.html") || location.pathname.endsWith("round.html")) {
          // deliver event locally: store in sessionStorage so round page can pick it up
          sessionStorage.setItem("latest_round_event", JSON.stringify(payload));
          // also call a round page handler if present
          if (typeof onRoundStarted === "function") onRoundStarted(payload);
        } else {
          // Otherwise navigate to round page and let it read event from sessionStorage or from server
          sessionStorage.setItem("latest_round_event", JSON.stringify(payload));
          window.location.href = "round.html";
        }
      });

      socket.connect();
    }

    tryConnect(endpoints[0]);
  }

  // load initial all games & select the one stored in session if any
  (async function initLobby() {
    await loadAllGames();
    if (myGameId) {
      // if game exists in list, select it; otherwise try to fetch
      selectGame(Number(myGameId)).catch(() => {});
    }
  })();
}

/* ======================================================
   ROUND PAGE
   - listens for 'round_started' (socket)
   - host triggers start_round earlier in lobby flow; here we just listen and render
   - submit answer -> POST /rounds/{round_id}/submit
====================================================== */
const questionTextEl = $("questionText");
const answerForm = $("answerForm");
const answerInput = $("answerInput");
const submitAnswerBtn = $("submitAnswerBtn");
const submitStatus = $("submitStatus");
const roundPlayersList = $("roundPlayersList");
const roundGameName = $("roundGameName");
const roundGameId = $("roundGameId");

if (questionTextEl && answerForm) {
  const gameId = sessionStorage.getItem("game_id");
  let currentRoundId = null;
  const myPlayerId = Number(sessionStorage.getItem("player_id"));
  const myName = sessionStorage.getItem("player_name") || "You";

  roundGameId && (roundGameId.textContent = `Game ID: ${gameId}`);
  roundGameName && (roundGameName.textContent = sessionStorage.getItem("game_name") || "Game");

  // helper to render players (get from GET /games/{id})
  async function loadAndRenderPlayers() {
    try {
      const { data } = await tryFetch(`/games/${gameId}`);
      const players = data.players || [];
      roundPlayersList.innerHTML = "";
      players.forEach(p => {
        const li = document.createElement("li");
        li.className = "player-item";
        li.innerHTML = `<span class="player-name">${escapeHtml(p.name)}</span>
                        <span class="player-ready ${p.ready ? "ready" : "not-ready"}">${p.ready ? "Ready" : "Not ready"}</span>`;
        roundPlayersList.appendChild(li);
      });
    } catch (err) {
      console.warn("Could not load players for round", err);
    }
  }

  // If a round event was stored by the lobby's socket, use it
  const stored = sessionStorage.getItem("latest_round_event");
  if (stored) {
    try {
      const ev = JSON.parse(stored);
      if (ev && ev.round_id) {
        currentRoundId = ev.round_id;
        questionTextEl.textContent = ev.question?.text || "Question unavailable";
        submitAnswerBtn.disabled = false;
      }
    } catch (e) {}
  }

  // Socket: try to connect and listen for round_started & submission responses
  let socket = null;
  (function initSocket() {
    const endpoints = [];
    for (const h of API_HOSTS) {
      endpoints.push(`${h}/ws`);
      endpoints.push(`${h}/api/ws`);
    }
    let tried = 0;
    function tryConnect(url) {
      tried++;
      socket = io(url, { transports: ["websocket", "polling"], autoConnect: false });

      socket.on("connect", () => {
        console.log("Round socket connected", url);
        socket.emit("join_game", { game_id: Number(gameId), name: myName, player_id: myPlayerId });
      });

      socket.on("connect_error", (err) => {
        console.warn("Round socket connect_error", err);
        socket.close();
        if (tried < endpoints.length) tryConnect(endpoints[tried]);
      });

      socket.on("round_started", (payload) => {
        // update UI
        currentRoundId = payload.round_id;
        questionTextEl.textContent = payload.question?.text || "Question unavailable";
        submitAnswerBtn.disabled = false;
        // save for future navigations
        sessionStorage.setItem("latest_round_event", JSON.stringify(payload));
        loadAndRenderPlayers();
      });

      socket.on("submission_received", (payload) => {
        // you can add UI updates on submission events if you want
        console.log("submission_received", payload);
      });

      socket.connect();
    }
    tryConnect(endpoints[0]);
  })();

  // fallback: if no round id yet, try to fetch /games/{id} to see current_round_id
  (async function tryGetCurrentRound() {
    if (!currentRoundId) {
      try {
        const { data } = await tryFetch(`/games/${gameId}`);
        const rid = data.current_round_id;
        if (rid) {
          // fetch round question by relying on server: or rely on round_started socket event
          currentRoundId = rid;
          // enable submit so player can submit (question might still be unknown until round_started)
          submitAnswerBtn.disabled = false;
        }
        loadAndRenderPlayers();
      } catch (err) {
        console.warn("Could not fetch current round", err);
      }
    }
  })();

  // Submit answer
  answerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentRoundId) return alert("Round not started yet.");
    const text = answerInput.value.trim();
    if (!text) return alert("Enter an answer.");

    submitAnswerBtn.disabled = true;
    submitStatus.textContent = "Submitting...";
    try {
      await tryFetch(`/rounds/${currentRoundId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: myPlayerId, text })
      });
      submitStatus.textContent = "Submitted!";
      answerInput.value = "";
    } catch (err) {
      console.error("Submit failed", err);
      submitStatus.textContent = "Submit failed. See console.";
      submitAnswerBtn.disabled = false;
    }
  });
}

/* ======================================================
   BACK BUTTON
====================================================== */
document.querySelectorAll(".btn-back").forEach(btn => {
  btn.addEventListener("click", () => window.history.back());
});

/* ======================================================
   UTILITIES
====================================================== */
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, function (m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m];
  });
}
