const jwt = require("jsonwebtoken");
const db = require("./db");

function createSocketServer(io, { jwtSecret, adminPassword }) {
  const participants = new Map();
  const answered = new Set();
  const disqualified = new Set();
  const state = {
    started: false,
    currentQuestionIndex: -1,
    quizQuestions: [],
    questionTimer: 20,
    answersForCurrentQuestion: 0,
    totalActiveParticipants: 0
  };

  function getParticipant(clientId) {
    if (!participants.has(clientId)) {
      participants.set(clientId, {
        clientId,
        name: clientId,
        score: 0,
        latency: 0,
        socketId: null,
        disqualified: false
      });
    }
    return participants.get(clientId);
  }

  async function hydrateQuestions() {
    state.quizQuestions = await db.listQuestions();
  }

  function leaderboardEntries() {
    return Array.from(participants.values())
      .filter((p) => !p.disqualified)
      .sort((a, b) => b.score - a.score)
      .map((participant) => ({
        clientId: participant.clientId,
        name: participant.name,
        score: participant.score,
        latency: participant.latency,
        disqualified: participant.disqualified,
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
    
    // Reset answer counter for new question
    state.answersForCurrentQuestion = 0;
    state.totalActiveParticipants = Array.from(participants.values()).filter(p => !p.disqualified).length;
    
    broadcast({
      type: "question",
      questionId: question.id,
      text: question.text,
      choices: question.choices,
      timer: state.questionTimer
    });
  }

  function autoAdvanceQuestion() {
    if (!state.started) return;
    
    // Check if all active participants have answered
    if (state.answersForCurrentQuestion >= state.totalActiveParticipants && state.totalActiveParticipants > 0) {
      // Move to next question
      if (state.currentQuestionIndex + 1 < state.quizQuestions.length) {
        state.currentQuestionIndex += 1;
        broadcastQuestion();
        sendEvent("Auto-advancing to next question");
      } else {
        // Quiz finished
        state.started = false;
        broadcast({ type: "quiz_ended" });
        sendEvent("Quiz completed - all questions answered");
      }
    }
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

    const participant = getParticipant(clientId);
    
    // Check if participant is disqualified
    if (participant.disqualified) {
      return;
    }

    const key = `${clientId}:${questionId}`;
    if (answered.has(key)) {
      return;
    }
    answered.add(key);

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
    
    // Increment answer counter
    state.answersForCurrentQuestion += 1;
    
    broadcastLeaderboard();
    
    // Auto-advance if all participants have answered
    autoAdvanceQuestion();
  }

  async function handleAdminAction(message) {
    if (!isAdmin(message.token)) {
      return;
    }

    if (message.action === "create_question") {
      const question = await db.createQuestion(message.payload);
      state.quizQuestions.push(question);
      sendEvent(`Question ${question.id} created`);
      broadcastQuestionList();
      return;
    }

    if (message.action === "update_question") {
      const { questionId, text, choices, correctAnswerId } = message.payload;
      await db.updateQuestion(questionId, { text, choices, correctAnswerId });
      await hydrateQuestions();
      sendEvent(`Question ${questionId} updated`);
      broadcastQuestionList();
      return;
    }

    if (message.action === "delete_question") {
      const { questionId } = message.payload;
      await db.deleteQuestion(questionId);
      await hydrateQuestions();
      sendEvent(`Question ${questionId} deleted`);
      broadcastQuestionList();
      return;
    }

    if (message.action === "disqualify_user") {
      const { clientId } = message.payload;
      const participant = getParticipant(clientId);
      participant.disqualified = true;
      participants.set(clientId, participant);
      broadcastLeaderboard();
      sendEvent(`${participant.name} has been disqualified`);
      
      // Notify the disqualified user
      const socket = Array.from(io.sockets.sockets.values()).find(s => s.data.clientId === clientId);
      if (socket) {
        socket.emit("server_message", { type: "disqualified" });
      }
      return;
    }

    if (message.action === "set_timer") {
      const { timer } = message.payload;
      state.questionTimer = Math.max(5, Math.min(120, timer)); // Between 5 and 120 seconds
      sendEvent(`Timer set to ${state.questionTimer} seconds`);
      broadcast({ type: "timer_updated", timer: state.questionTimer });
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
      broadcast({ type: "quiz_ended" });
      sendEvent("Quiz stopped");
    }
  }

  function broadcastQuestionList() {
    broadcast({
      type: "question_list",
      questions: state.quizQuestions.map(q => ({
        id: q.id,
        text: q.text,
        choices: q.choices,
        correctAnswerId: q.correctAnswerId
      }))
    });
  }

  io.on("connection", (socket) => {
    // Send current question list to newly connected admin
    socket.emit("server_message", {
      type: "question_list",
      questions: state.quizQuestions.map(q => ({
        id: q.id,
        text: q.text,
        choices: q.choices,
        correctAnswerId: q.correctAnswerId
      }))
    });

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
