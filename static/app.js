const els = {
  hostTab: document.querySelector("#hostTab"),
  learnerTab: document.querySelector("#learnerTab"),
  hostView: document.querySelector("#hostView"),
  learnerView: document.querySelector("#learnerView"),
  toast: document.querySelector("#toast"),
  quizForm: document.querySelector("#quizForm"),
  moduleSelect: document.querySelector("#moduleSelect"),
  lessonTitle: document.querySelector("#lessonTitle"),
  savedLessonSelect: document.querySelector("#savedLessonSelect"),
  refreshBankButton: document.querySelector("#refreshBankButton"),
  loadLessonButton: document.querySelector("#loadLessonButton"),
  saveLessonButton: document.querySelector("#saveLessonButton"),
  deleteLessonButton: document.querySelector("#deleteLessonButton"),
  quizTitle: document.querySelector("#quizTitle"),
  questionList: document.querySelector("#questionList"),
  questionTemplate: document.querySelector("#questionTemplate"),
  addQuestionButton: document.querySelector("#addQuestionButton"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  createSessionButton: document.querySelector("#createSessionButton"),
  hostPhaseBadge: document.querySelector("#hostPhaseBadge"),
  sessionPin: document.querySelector("#sessionPin"),
  copyJoinButton: document.querySelector("#copyJoinButton"),
  startButton: document.querySelector("#startButton"),
  revealButton: document.querySelector("#revealButton"),
  nextButton: document.querySelector("#nextButton"),
  finishButton: document.querySelector("#finishButton"),
  playerCount: document.querySelector("#playerCount"),
  questionProgress: document.querySelector("#questionProgress"),
  timerValue: document.querySelector("#timerValue"),
  hostQuestionText: document.querySelector("#hostQuestionText"),
  hostAnswerChart: document.querySelector("#hostAnswerChart"),
  playerList: document.querySelector("#playerList"),
  leaderboardList: document.querySelector("#leaderboardList"),
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

const starterQuiz = {
  title: "Starter Check",
  module: 1,
  lessonTitle: "Starter Check",
  questions: [
    {
      text: "Which number is a prime number?",
      timeLimitSeconds: 20,
      points: 1000,
      answers: [
        { text: "21", correct: false },
        { text: "29", correct: true },
        { text: "35", correct: false },
        { text: "39", correct: false },
      ],
    },
    {
      text: "What should a learner do before submitting group work?",
      timeLimitSeconds: 25,
      points: 1000,
      answers: [
        { text: "Check the rubric", correct: true },
        { text: "Close the tab", correct: false },
        { text: "Rename everyone", correct: false },
        { text: "Skip the sources", correct: false },
      ],
    },
    {
      text: "Which item is usually renewable energy?",
      timeLimitSeconds: 20,
      points: 1000,
      answers: [
        { text: "Coal", correct: false },
        { text: "Natural gas", correct: false },
        { text: "Solar power", correct: true },
        { text: "Diesel", correct: false },
      ],
    },
  ],
};

const state = {
  savedLessons: [],
  host: {
    session: null,
    token: "",
    poll: 0,
  },
  learner: {
    session: null,
    player: null,
    poll: 0,
  },
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

function switchView(view) {
  const host = view === "host";
  els.hostTab.classList.toggle("active", host);
  els.learnerTab.classList.toggle("active", !host);
  els.hostTab.setAttribute("aria-selected", String(host));
  els.learnerTab.setAttribute("aria-selected", String(!host));
  els.hostView.classList.toggle("active", host);
  els.learnerView.classList.toggle("active", !host);
  if (host && state.host.session) {
    pollHost();
  }
  if (!host && state.learner.session) {
    pollLearner();
  }
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = busy ? "Working..." : label;
}

function setQuizEditor(quiz) {
  els.quizTitle.value = quiz.title || "Untitled Quiz";
  els.moduleSelect.value = String(quiz.module || 1);
  els.lessonTitle.value = quiz.lessonTitle || quiz.title || "Untitled Lesson";
  els.questionList.replaceChildren();
  for (const question of quiz.questions || []) {
    addQuestion(question);
  }
  if (!els.questionList.children.length) {
    addQuestion();
  }
  numberQuestions();
}

function addQuestion(question = {}) {
  const node = els.questionTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".question-text").value = question.text || "";
  node.querySelector(".question-time").value = question.timeLimitSeconds || 30;
  node.querySelector(".question-points").value = question.points || 1000;

  const answers = question.answers || [
    { text: "", correct: true },
    { text: "", correct: false },
    { text: "", correct: false },
    { text: "", correct: false },
  ];
  const editor = node.querySelector(".answers-editor");
  const radioName = `correct-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)}`;
  for (let index = 0; index < 4; index += 1) {
    const answer = answers[index] || { text: "", correct: false };
    const row = document.createElement("label");
    row.className = "answer-edit";
    row.innerHTML = `
      <input type="radio" name="${radioName}" ${answer.correct ? "checked" : ""}>
      <input class="answer-text" maxlength="180" placeholder="Answer ${index + 1}">
    `;
    row.querySelector(".answer-text").value = answer.text || "";
    editor.append(row);
  }
  if (!editor.querySelector("input[type='radio']:checked")) {
    editor.querySelector("input[type='radio']").checked = true;
  }

  node.querySelector(".remove-question").addEventListener("click", () => {
    if (els.questionList.children.length <= 1) {
      showToast("Keep at least one question.");
      return;
    }
    node.remove();
    numberQuestions();
  });

  els.questionList.append(node);
  numberQuestions();
}

function numberQuestions() {
  [...els.questionList.children].forEach((node, index) => {
    node.querySelector(".question-number").textContent = `Question ${index + 1}`;
  });
}

function collectQuiz() {
  const questions = [...els.questionList.children].map((node, questionIndex) => {
    const answers = [...node.querySelectorAll(".answer-edit")]
      .map((row) => ({
        text: row.querySelector(".answer-text").value.trim(),
        correct: row.querySelector("input[type='radio']").checked,
      }))
      .filter((answer) => answer.text);

    if (answers.length < 2) {
      throw new Error(`Question ${questionIndex + 1} needs at least two answers.`);
    }
    if (!answers.some((answer) => answer.correct)) {
      answers[0].correct = true;
    }

    const text = node.querySelector(".question-text").value.trim();
    if (!text) {
      throw new Error(`Question ${questionIndex + 1} needs a prompt.`);
    }

    return {
      text,
      timeLimitSeconds: Number(node.querySelector(".question-time").value),
      points: Number(node.querySelector(".question-points").value),
      answers,
    };
  });

  const lessonTitle = els.lessonTitle.value.trim() || els.quizTitle.value.trim() || "Untitled Lesson";
  const module = Number(els.moduleSelect.value || 1);
  return {
    title: els.quizTitle.value.trim() || lessonTitle,
    module,
    lessonTitle,
    questions,
  };
}

function renderSavedLessons() {
  els.savedLessonSelect.replaceChildren();
  if (!state.savedLessons.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved lessons yet";
    els.savedLessonSelect.append(option);
    return;
  }

  for (const lesson of state.savedLessons) {
    const option = document.createElement("option");
    option.value = lesson.id;
    option.textContent = `M${lesson.module}: ${lesson.lessonTitle || lesson.title} (${lesson.questionCount})`;
    els.savedLessonSelect.append(option);
  }
}

async function refreshQuestionBank() {
  const data = await api("/api/quizzes");
  state.savedLessons = data.quizzes || [];
  renderSavedLessons();
}

async function saveLessonToBank() {
  setBusy(els.saveLessonButton, true, "Save To Bank");
  try {
    const quiz = collectQuiz();
    const result = await api("/api/quizzes", {
      method: "POST",
      body: JSON.stringify(quiz),
    });
    await refreshQuestionBank();
    els.savedLessonSelect.value = result.quiz.id;
    showToast("Lesson saved to question bank.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(els.saveLessonButton, false, "Save To Bank");
  }
}

async function loadSelectedLesson() {
  const quizId = els.savedLessonSelect.value;
  if (!quizId) {
    showToast("Choose a saved lesson first.");
    return;
  }
  setBusy(els.loadLessonButton, true, "Load Lesson");
  try {
    const data = await api(`/api/quizzes/${encodeURIComponent(quizId)}`);
    setQuizEditor(data.quiz);
    showToast("Lesson loaded.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(els.loadLessonButton, false, "Load Lesson");
  }
}

async function deleteSelectedLesson() {
  const quizId = els.savedLessonSelect.value;
  if (!quizId) {
    showToast("Choose a saved lesson first.");
    return;
  }
  if (quizId === "starter_check") {
    showToast("The starter quiz cannot be deleted.");
    return;
  }
  const lesson = state.savedLessons.find((item) => item.id === quizId);
  const label = lesson ? `M${lesson.module}: ${lesson.lessonTitle || lesson.title}` : "this lesson";
  if (!window.confirm(`Delete ${label} from the question bank?`)) {
    return;
  }
  setBusy(els.deleteLessonButton, true, "Delete Lesson");
  try {
    await api(`/api/quizzes/${encodeURIComponent(quizId)}`, {
      method: "DELETE",
    });
    await refreshQuestionBank();
    showToast("Lesson deleted.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(els.deleteLessonButton, false, "Delete Lesson");
  }
}

function phaseLabel(phase) {
  return {
    lobby: "Lobby",
    question: "Question Open",
    reveal: "Results",
    finished: "Finished",
  }[phase] || "No session";
}

function renderHost(session) {
  state.host.session = session;
  const hasSession = Boolean(session);
  const phase = session?.phase || "";
  els.hostPhaseBadge.textContent = hasSession ? phaseLabel(phase) : "No session";
  els.sessionPin.textContent = hasSession ? session.pin : "------";
  els.playerCount.textContent = hasSession ? session.playerCount : "0";
  els.questionProgress.textContent =
    hasSession && session.questionIndex >= 0 ? `${session.questionIndex + 1}/${session.totalQuestions}` : "-";
  els.timerValue.textContent =
    hasSession && phase === "question" ? `${Math.ceil(session.timeRemainingMs / 1000)}s` : "-";
  els.copyJoinButton.disabled = !hasSession;

  els.startButton.disabled = !hasSession || phase !== "lobby";
  els.revealButton.disabled = !hasSession || phase !== "question";
  els.nextButton.disabled = !hasSession || !["question", "reveal", "lobby"].includes(phase);
  els.finishButton.disabled = !hasSession || phase === "finished";

  if (!hasSession) {
    els.hostQuestionText.textContent = "Create a session to begin.";
    els.hostAnswerChart.replaceChildren();
    renderList(els.playerList, [], "No players yet");
    renderList(els.leaderboardList, [], "No scores yet");
    return;
  }

  if (!session.question) {
    els.hostQuestionText.textContent = phase === "finished" ? "Session finished." : "Waiting for players.";
    els.hostAnswerChart.replaceChildren();
  } else {
    els.hostQuestionText.textContent = session.question.text;
    renderAnswerChart(session);
  }

  renderPlayers(session.players || []);
  renderLeaderboard(els.leaderboardList, session.leaderboard || []);
}

function renderAnswerChart(session) {
  const chart = els.hostAnswerChart;
  chart.replaceChildren();
  const answers = session.question.answers;
  const counts = session.stats?.counts || [];
  const max = Math.max(1, ...counts);
  answers.forEach((answer, index) => {
    const count = counts[index] || 0;
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-track ${answer.correct ? "correct" : ""}">
        <div class="chart-fill" style="width:${Math.round((count / max) * 100)}%"></div>
        <div class="chart-text">${escapeHtml(answer.text)}</div>
      </div>
      <div class="chart-count">${count}</div>
    `;
    chart.append(row);
  });
}

function renderPlayers(players) {
  if (!players.length) {
    renderList(els.playerList, [], "No players yet");
    return;
  }
  els.playerList.classList.remove("empty");
  els.playerList.replaceChildren();
  for (const player of players) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <strong>${escapeHtml(player.name)}</strong>
      <span class="answered-dot ${player.answered ? "on" : ""}" title="Answered"></span>
    `;
    els.playerList.append(item);
  }
}

function renderLeaderboard(target, players) {
  if (!players.length) {
    renderList(target, [], "No scores yet");
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

function renderList(target, items, emptyText) {
  target.replaceChildren();
  if (!items.length) {
    target.classList.add("empty");
    target.textContent = emptyText;
  }
}

function renderLearner(session) {
  state.learner.session = session;
  const player = session?.player || state.learner.player;
  if (player) state.learner.player = player;

  const phase = session?.phase || "waiting";
  els.learnerPhase.textContent = phaseLabel(phase);
  els.learnerTitle.textContent = session?.quizTitle || "No active session";
  els.learnerScore.textContent = `${Number(player?.score || 0).toLocaleString()} pts`;
  els.learnerTimer.textContent = session?.phase === "question" ? Math.ceil(session.timeRemainingMs / 1000) : "--";
  els.learnerFeedback.textContent = "";

  if (!session) {
    els.learnerQuestion.textContent = "Join a session to see questions here.";
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

async function createSession(event) {
  event.preventDefault();
  setBusy(els.createSessionButton, true, "Create Session");
  try {
    const quiz = collectQuiz();
    const result = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ quiz }),
    });
    state.host.token = result.hostToken;
    renderHost(result.session);
    startHostPolling();
    window.history.replaceState({}, "", result.hostUrl);
    showToast("Session created.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(els.createSessionButton, false, "Create Session");
  }
}

async function hostCommand(action) {
  if (!state.host.session) return;
  try {
    const result = await api(`/api/sessions/${state.host.session.id}/${action}`, {
      method: "POST",
      body: JSON.stringify({ hostToken: state.host.token }),
    });
    renderHost(result.session);
  } catch (error) {
    showToast(error.message);
  }
}

async function pollHost() {
  if (!state.host.session || !state.host.token) return;
  try {
    const result = await api(
      `/api/sessions/${state.host.session.id}?view=host&token=${encodeURIComponent(state.host.token)}`
    );
    renderHost(result.session);
  } catch (error) {
    window.clearInterval(state.host.poll);
    showToast(error.message);
  }
}

function startHostPolling() {
  window.clearInterval(state.host.poll);
  state.host.poll = window.setInterval(pollHost, 1000);
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
    state.learner.player = result.player;
    renderLearner(result.session);
    startLearnerPolling();
    window.history.replaceState(
      {},
      "",
      `/play?pin=${result.session.pin}&session=${result.session.id}&player=${result.player.id}`
    );
    showToast("Joined session.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(els.joinButton, false, "Join Session");
  }
}

async function submitAnswer(answerIndex) {
  const session = state.learner.session;
  const player = state.learner.player;
  if (!session || !player) return;
  try {
    const result = await api(`/api/sessions/${session.id}/answer`, {
      method: "POST",
      body: JSON.stringify({
        playerId: player.id,
        answerIndex,
      }),
    });
    renderLearner(result.session);
  } catch (error) {
    showToast(error.message);
  }
}

async function pollLearner() {
  const session = state.learner.session;
  const player = state.learner.player;
  if (!session || !player) return;
  try {
    const result = await api(
      `/api/sessions/${session.id}?view=player&playerId=${encodeURIComponent(player.id)}`
    );
    renderLearner(result.session);
  } catch (error) {
    window.clearInterval(state.learner.poll);
    showToast(error.message);
  }
}

function startLearnerPolling() {
  window.clearInterval(state.learner.poll);
  state.learner.poll = window.setInterval(pollLearner, 1000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyJoinLink() {
  const session = state.host.session;
  if (!session?.host?.joinUrl) return;
  const url = `${window.location.origin}${session.host.joinUrl}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Join link copied.");
  } catch {
    showToast(url);
  }
}

async function loadStarterQuiz() {
  try {
    const data = await api("/api/quizzes/starter_check");
    setQuizEditor(data.quiz);
  } catch {
    setQuizEditor(starterQuiz);
  }
}

async function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");
  const token = params.get("token");
  const playerId = params.get("player");
  const pin = params.get("pin");

  if (pin) {
    els.joinPin.value = pin;
    switchView("learner");
  }

  if (sessionId && token) {
    state.host.session = { id: sessionId };
    state.host.token = token;
    switchView("host");
    await pollHost();
    startHostPolling();
  }

  if (sessionId && playerId) {
    state.learner.session = { id: sessionId };
    state.learner.player = { id: playerId, name: "", score: 0 };
    switchView("learner");
    await pollLearner();
    startLearnerPolling();
  }

  if (!sessionId && !token && !playerId) {
    switchView("learner");
  }
}

els.hostTab.addEventListener("click", () => switchView("host"));
els.learnerTab.addEventListener("click", () => switchView("learner"));
els.addQuestionButton.addEventListener("click", () => addQuestion());
els.loadSampleButton.addEventListener("click", loadStarterQuiz);
els.refreshBankButton.addEventListener("click", () => refreshQuestionBank().catch((error) => showToast(error.message)));
els.saveLessonButton.addEventListener("click", saveLessonToBank);
els.loadLessonButton.addEventListener("click", loadSelectedLesson);
els.deleteLessonButton.addEventListener("click", deleteSelectedLesson);
els.savedLessonSelect.addEventListener("change", async () => {
  const lesson = state.savedLessons.find((item) => item.id === els.savedLessonSelect.value);
  if (!lesson) return;
  els.moduleSelect.value = String(lesson.module || 1);
  els.lessonTitle.value = lesson.lessonTitle || lesson.title || "";
});
els.quizForm.addEventListener("submit", createSession);
els.copyJoinButton.addEventListener("click", copyJoinLink);
els.startButton.addEventListener("click", () => hostCommand("start"));
els.revealButton.addEventListener("click", () => hostCommand("reveal"));
els.nextButton.addEventListener("click", () => hostCommand("next"));
els.finishButton.addEventListener("click", () => hostCommand("finish"));
els.joinForm.addEventListener("submit", joinSession);
els.joinPin.addEventListener("input", () => {
  els.joinPin.value = els.joinPin.value.replace(/\D/g, "").slice(0, 6);
});

refreshQuestionBank()
  .then(loadStarterQuiz)
  .then(restoreFromUrl)
  .catch((error) => showToast(error.message));
