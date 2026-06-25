const els = {
  toast: document.querySelector("#toast"),
  joinForm: document.querySelector("#joinForm"),
  joinPin: document.querySelector("#joinPin"),
  playerName: document.querySelector("#playerName"),
  joinButton: document.querySelector("#joinButton"),
  learnerPhase: document.querySelector("#learnerPhase"),
  learnerTitle: document.querySelector("#learnerTitle"),
  learnerScore: document.querySelector("#learnerScore"),
  learnerTimer: document.querySelector("#learnerTimer"),
  learnerQuestion: document.querySelector("#learnerQuestion"),
  answerGrid: document.querySelector("#answerGrid"),
  learnerFeedback: document.querySelector("#learnerFeedback"),
  learnerLeaderboard: document.querySelector("#learnerLeaderboard"),
};

const state = {
  session: null,
  player: null,
  poll: 0,
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = busy ? "Working..." : label;
}

function phaseLabel(phase) {
  return {
    lobby: "Lobby",
    question: "Question Open",
    reveal: "Results",
    finished: "Finished",
  }[phase] || "Waiting";
}

function renderList(target, items, emptyText) {
  target.replaceChildren();
  if (!items.length) {
    target.classList.add("empty");
    target.textContent = emptyText;
  }
}

function renderLeaderboard(target, players) {
  if (!players.length) {
    renderList(target, [], "Waiting for players");
    return;
  }
  target.classList.remove("empty");
  target.replaceChildren();
  players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <strong>${index + 1}. ${escapeHtml(player.name)}</strong>
      <span>${Number(player.score).toLocaleString()} pts</span>
    `;
    target.append(item);
  });
}

function renderLearner(session) {
  state.session = session;
  const player = session?.player || state.player;
  if (player) state.player = player;

  const phase = session?.phase || "waiting";
  els.learnerPhase.textContent = phaseLabel(phase);
  els.learnerTitle.textContent = session?.quizTitle || "No active session";
  els.learnerScore.textContent = `${Number(player?.score || 0).toLocaleString()} pts`;
  els.learnerTimer.textContent = session?.phase === "question" ? Math.ceil(session.timeRemainingMs / 1000) : "--";
  els.learnerFeedback.textContent = "";

  if (!session) {
    els.learnerQuestion.textContent = "Enter the session PIN to join.";
    els.answerGrid.replaceChildren();
    renderList(els.learnerLeaderboard, [], "Waiting for players");
    return;
  }

  if (!session.question) {
    els.learnerQuestion.textContent =
      phase === "finished" ? "Session finished. Check the leaderboard." : "Waiting for the host to start.";
    els.answerGrid.replaceChildren();
    renderLeaderboard(els.learnerLeaderboard, session.leaderboard || []);
    return;
  }

  els.learnerQuestion.textContent = session.question.text;
  renderLearnerAnswers(session);
  renderLeaderboard(els.learnerLeaderboard, session.leaderboard || []);
}

function renderLearnerAnswers(session) {
  els.answerGrid.replaceChildren();
  const submitted = session.playerAnswer;
  const reveal = ["reveal", "finished"].includes(session.phase);
  const locked = Boolean(submitted) || session.phase !== "question" || session.timeRemainingMs <= 0;

  session.question.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.type = "button";
    button.textContent = answer.text;
    button.disabled = locked;
    if (submitted?.answerIndex === index) button.classList.add("selected");
    if (reveal && answer.correct) button.classList.add("correct");
    if (reveal && submitted?.answerIndex === index && !submitted.correct) button.classList.add("incorrect");
    button.addEventListener("click", () => submitAnswer(index));
    els.answerGrid.append(button);
  });

  if (submitted && session.phase === "question") {
    els.learnerFeedback.textContent = "Answer locked.";
  }
  if (reveal && submitted?.correct) {
    els.learnerFeedback.textContent = `Correct. +${Number(submitted.score).toLocaleString()} pts`;
  } else if (reveal && submitted) {
    els.learnerFeedback.textContent = "Not this time.";
  } else if (reveal && !submitted) {
    els.learnerFeedback.textContent = "No answer submitted.";
  }
}

async function joinSession(event) {
  event.preventDefault();
  setBusy(els.joinButton, true, "Join Session");
  try {
    const result = await api("/api/join", {
      method: "POST",
      body: JSON.stringify({
        pin: els.joinPin.value,
        name: els.playerName.value,
      }),
    });
    state.player = result.player;
    renderLearner(result.session);
    startPolling();
    window.history.replaceState(
      {},
      "",
      `/trainee?pin=${result.session.pin}&session=${result.session.id}&player=${result.player.id}`
    );
    showToast("Joined session.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(els.joinButton, false, "Join Session");
  }
}

async function submitAnswer(answerIndex) {
  if (!state.session || !state.player) return;
  try {
    const result = await api(`/api/sessions/${state.session.id}/answer`, {
      method: "POST",
      body: JSON.stringify({
        playerId: state.player.id,
        answerIndex,
      }),
    });
    renderLearner(result.session);
  } catch (error) {
    showToast(error.message);
  }
}

async function pollLearner() {
  if (!state.session || !state.player) return;
  try {
    const result = await api(
      `/api/sessions/${state.session.id}?view=player&playerId=${encodeURIComponent(state.player.id)}`
    );
    renderLearner(result.session);
  } catch (error) {
    window.clearInterval(state.poll);
    showToast(error.message);
  }
}

function startPolling() {
  window.clearInterval(state.poll);
  state.poll = window.setInterval(pollLearner, 1000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");
  const playerId = params.get("player");
  const pin = params.get("pin");

  if (pin) {
    els.joinPin.value = pin;
  }

  if (sessionId && playerId) {
    state.session = { id: sessionId };
    state.player = { id: playerId, name: "", score: 0 };
    await pollLearner();
    startPolling();
  }
}

els.joinForm.addEventListener("submit", joinSession);
els.joinPin.addEventListener("input", () => {
  els.joinPin.value = els.joinPin.value.replace(/\D/g, "").slice(0, 6);
});

restoreFromUrl().catch((error) => showToast(error.message));
