const jwt = require("jsonwebtoken");
const db = require("./db");

function createSocketServer(io, { jwtSecret, adminPassword }) {
  const participants = new Map();
  const answered = new Set();
  const state = {
    started: false,
    currentQuestionIndex: -1,
    quizQuestions: []
  };

  function getParticipant(clientId) {
    if (!participants.has(clientId)) {
      participants.set(clientId, {
        clientId,
        name: clientId,
        score: 0,
        latency: 0,
        socketId: null
      });
    }
    return participants.get(clientId);
  }

  async function hydrateQuestions() {
    state.quizQuestions = await db.listQuestions();
  }

  function leaderboardEntries() {
    return Array.from(participants.values())
      .sort((a, b) => b.score - a.score)
      .map((participant) => ({
        clientId: participant.clientId,
        name: participant.name,
        score: participant.score,
        latency: participant.latency,
        lastUpdateTs: Date.now()
      }));
  }

  function broadcast(payload) {
    io.emit("server_message", payload);
  }

  function broadcastLeaderboard() {
    broadcast({ type: "leaderboard", entries: leaderboardEntries() });
  }

  function currentQuestion() {
    return state.quizQuestions[state.currentQuestionIndex] || null;
  }

  function broadcastQuestion() {
    const question = currentQuestion();
    if (!question) {
      return;
    }
    broadcast({
      type: "question",
      questionId: question.id,
      text: question.text,
      choices: question.choices
    });
  }

  function sendEvent(message) {
    broadcast({ type: "event", message });
  }

  function isAdmin(token) {
    try {
      return jwt.verify(token, jwtSecret).role === "admin";
    } catch (error) {
      return token === adminPassword;
    }
  }

  async function handleJoin(socket, message) {
    if (!message.clientId || !message.name) {
      return;
    }
    const participant = getParticipant(message.clientId);
    participant.name = message.name;
    participant.socketId = socket.id;
    participants.set(message.clientId, participant);
    socket.data.clientId = message.clientId;
    await db.upsertParticipant(message.clientId, message.name);
    broadcastLeaderboard();

    if (state.started) {
      broadcastQuestion();
    }
  }

  async function handleAnswer(message) {
    const { clientId, questionId, answerId, ts_local: tsLocal } = message;
    if (!clientId || typeof questionId !== "number") {
      return;
    }

    const key = `${clientId}:${questionId}`;
    if (answered.has(key)) {
      return;
    }
    answered.add(key);

    const participant = getParticipant(clientId);
    const question = state.quizQuestions.find((item) => item.id === questionId);
    if (!question) {
      return;
    }

    const isCorrect = String(answerId) === String(question.correctAnswerId);
    if (isCorrect) {
      participant.score += 10;
    }

    await db.saveSubmission({
      clientId,
      questionId,
      answerId,
      isCorrect,
      seq: 0,
      latencyMs: tsLocal ? Date.now() - tsLocal : 0
    });

    participants.set(clientId, participant);
    broadcastLeaderboard();
  }

  async function handleAdminAction(message) {
    if (!isAdmin(message.token)) {
      return;
    }

    if (message.action === "create_question") {
      const question = await db.createQuestion(message.payload);
      state.quizQuestions.push(question);
      sendEvent(`Question ${question.id} created`);
      return;
    }

    if (message.action === "start_quiz") {
      if (!state.quizQuestions.length) {
        await hydrateQuestions();
      }
      state.started = true;
      state.currentQuestionIndex = 0;
      broadcastQuestion();
      sendEvent("Quiz started");
      return;
    }

    if (message.action === "next_question") {
      if (state.currentQuestionIndex + 1 < state.quizQuestions.length) {
        state.currentQuestionIndex += 1;
        broadcastQuestion();
        sendEvent("Next question broadcast");
      }
      return;
    }

    if (message.action === "stop_quiz") {
      state.started = false;
      sendEvent("Quiz stopped");
    }
  }

  io.on("connection", (socket) => {
    socket.on("client_message", async (message) => {
      if (!message?.type) {
        return;
      }

      if (message.type === "join_quiz") {
        await handleJoin(socket, message);
        return;
      }

      if (message.type === "client_ping") {
        socket.emit("server_message", { type: "server_pong", ts_server: Date.now() });
        return;
      }

      if (message.type === "answer") {
        await handleAnswer(message);
        return;
      }

      if (message.type === "admin_action") {
        await handleAdminAction(message);
      }
    });

    socket.on("client_latency", async ({ clientId, latency }) => {
      if (!clientId || typeof latency !== "number") {
        return;
      }
      const participant = getParticipant(clientId);
      participant.latency = Math.round(latency);
      participants.set(clientId, participant);
      await db.updateParticipantLatency(clientId, participant.latency);
      broadcastLeaderboard();
    });

    socket.on("disconnect", () => {
      const clientId = socket.data.clientId;
      if (!clientId || !participants.has(clientId)) {
        return;
      }
      const participant = participants.get(clientId);
      participant.socketId = null;
      participants.set(clientId, participant);
    });
  });

  return {
    async init() {
      await hydrateQuestions();
    }
  };
}

module.exports = { createSocketServer };
