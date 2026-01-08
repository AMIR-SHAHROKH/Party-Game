/* ======================================================
   HELPER
====================================================== */
function $(id) {
  return document.getElementById(id);
}

/* ======================================================
   HOME PAGE NAVIGATION
====================================================== */
const startBtn = $("startBtn");
const joinBtn = $("joinBtn");

if (startBtn) {
  startBtn.addEventListener("click", () => {
    window.location.href = "create-game.html";
  });
}

if (joinBtn) {
  joinBtn.addEventListener("click", () => {
    window.location.href = "join-game.html";
  });
}

/* ======================================================
   CREATE GAME PAGE
====================================================== */
const createGameForm = $("createGameForm");
const roundsCustomSelect = document.querySelector(".custom-select");
const roundsNativeSelect = document.querySelector(".native-select");

if (createGameForm) {
  createGameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    console.log("🟢 Create Game form submitted");

    const gameInput = $("gameName");
    const hostInput = $("hostName");

    const gameError = gameInput?.nextElementSibling;
    const hostError = hostInput?.nextElementSibling;

    let valid = true;

    // --------------------
    // GAME NAME VALIDATION
    // --------------------
    if (!gameInput.value.trim()) {
      gameError.textContent = "Game name is required!";
      gameError.style.display = "block";
      valid = false;
    } else {
      gameError.style.display = "none";
    }

    // --------------------
    // HOST NAME VALIDATION
    // --------------------
    if (!hostInput.value.trim()) {
      hostError.textContent = "Your name is required!";
      hostError.style.display = "block";
      valid = false;
    } else {
      hostError.style.display = "none";
    }

    if (!valid) return;

    // --------------------
    // GET ROUNDS
    // --------------------
    let rounds = 5;

    if (window.matchMedia("(hover: hover)").matches && roundsCustomSelect) {
      rounds = Number(roundsCustomSelect.dataset.value || 5);
    } else if (roundsNativeSelect) {
      rounds = Number(roundsNativeSelect.value);
    }

    // --------------------
    // PAYLOAD
    // --------------------
    const payload = {
      name: gameInput.value.trim(),
      host_name: hostInput.value.trim(),
      rounds: rounds
    };

    console.log("📦 Sending payload:", payload);

    // --------------------
    // SEND TO BACKEND
    // --------------------
    try {
      const res = await fetch("http://localhost/api/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      // Read body ONCE
      const text = await res.text();
      let data;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!res.ok) {
        console.error("❌ Backend error:", data);
        alert(
          "Server error. Please try again later.\n" +
          (typeof data === "string" ? data : JSON.stringify(data))
        );
        return;
      }

      console.log("✅ Game created successfully:", data);

      if (data?.game_id && data?.host_player_id) {
        sessionStorage.setItem("game_id", data.game_id);
        sessionStorage.setItem("player_id", data.host_player_id);
      } else {
        console.warn("⚠️ Unexpected response format:", data);
      }

      // Optional redirect
      // window.location.href = `lobby.html?game_id=${data.game_id}`;

    } catch (err) {
      console.error("🚨 Network error:", err);
      alert("Network error. Is the backend running?");
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

  trigger.addEventListener("click", e => {
    e.stopPropagation();
    select.classList.toggle("open");
  });

  options.forEach(option => {
    option.addEventListener("click", () => {
      valueSpan.textContent = option.textContent;
      select.dataset.value = option.dataset.value;
      select.classList.remove("open");
    });
  });
});

document.addEventListener("click", () => {
  document.querySelectorAll(".custom-select").forEach(select => {
    select.classList.remove("open");
  });
});

/* ======================================================
   JOIN GAME PAGE
====================================================== */
const usernameInput = $("username");
const joinGameBtn = $("joinGameBtn");
const gameItems = document.querySelectorAll(".game-item");

let selectedGameId = null;

if (usernameInput && joinGameBtn) {

  function updateJoinButton() {
    const hasName = usernameInput.value.trim() !== "";
    const hasGame = selectedGameId !== null;
    joinGameBtn.disabled = !(hasName && hasGame);
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

  joinGameBtn.addEventListener("click", () => {
    console.log("🎮 Joining game:", {
      username: usernameInput.value.trim(),
      game_id: selectedGameId
    });
  });
}

/* ======================================================
   BACK BUTTON
====================================================== */
document.querySelectorAll(".btn-back").forEach(btn => {
  btn.addEventListener("click", () => {
    window.history.back();
  });
});
