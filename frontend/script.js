/* ======================================================
   NAVIGATION (HOME PAGE)
====================================================== */

const startBtn = document.getElementById("startBtn");
const joinBtn = document.getElementById("joinBtn");

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

const createGameForm = document.getElementById("createGameForm");
const roundsCustomSelect = document.querySelector(".custom-select");
const roundsNativeSelect = document.querySelector(".native-select");

if (createGameForm && roundsCustomSelect) {
  createGameForm.addEventListener("submit", e => {
    e.preventDefault();

    const hostInput = document.getElementById("hostName");
    const gameInput = document.getElementById("gameName");
    const hostError = hostInput.nextElementSibling;
    const gameError = gameInput.nextElementSibling;

    // ---- Validation
    if (!gameInput.value.trim()) {
      gameError.textContent = "Game name is required!";
      gameError.style.display = "block";
      return;
    } else {
      gameError.style.display = "none";
    }

    if (!hostInput.value.trim()) {
      hostError.textContent = "Your name is required!";
      hostError.style.display = "block";
      return;
    } else {
      hostError.style.display = "none";
    }


    // ---- Get rounds (desktop vs mobile)
    let rounds;
    if (window.matchMedia("(hover: hover)").matches) {
      rounds = roundsCustomSelect.dataset.value || "5";
    } else if (roundsNativeSelect) {
      rounds = roundsNativeSelect.value;
    }

    // ---- Payload
    const gameData = {
      host_name: hostInput.value.trim(),
      game_name: gameInput.value.trim(),
      rounds: Number(rounds)
    };

    // ---- POST to backend
    fetch("http://192.168.1.38:8000/create_game_games_post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(gameData)
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to create game");
        return res.json();
      })
      .then(data => {
        console.log("Game created:", data);
        // Example redirect later:
        // window.location.href = `lobby.html?id=${data.game_id}`;
      })
      .catch(err => {
        console.error("Create game failed:", err);
      });
  });
}


/* ======================================================
   CUSTOM DROPDOWN (CREATE GAME)
====================================================== */

document.querySelectorAll(".custom-select").forEach(select => {
  const trigger = select.querySelector(".select-trigger");
  const valueSpan = select.querySelector(".select-value");
  const options = select.querySelectorAll(".select-option");

  if (!trigger || !valueSpan) return;

  // Set initial value
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

const usernameInput = document.getElementById("username");
const joinGameBtn = document.getElementById("joinGameBtn");
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
    const joinData = {
      username: usernameInput.value.trim(),
      game_id: selectedGameId
    };

    console.log("Joining game:", joinData);

    // Next step:
    // fetch("/join_game", { ... })
  });
}

// ===============================
// BACK BUTTON
// ===============================
document.querySelectorAll(".btn-back").forEach(btn => {
  btn.addEventListener("click", () => {
    window.history.back();
  });
});
