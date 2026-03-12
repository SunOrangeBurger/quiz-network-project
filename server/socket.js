const jwt = require("jsonwebtoken");
const { createClient } = require("redis");
const db = require("./db");

function calculateJitter(samples) {
  if (samples.length < 2) {
    return 0;
  }
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) / samples.length;
  return Math.sqrt(variance);
}

async function createLeaderboardStore(redisUrl) {
  const memoryScores = new Map();
  let redisClient = null;
  let redisEnabled = false;

  if (redisUrl) {
    try {
      redisClient = createClient({ url: redisUrl });
      redisClient.on("error", () => {});
      await redisClient.connect();
      redisEnabled = true;
    } catch (error) {
      redisEnabled = false;
    }
  }

  return {
    isRedisEnabled() {
      return redisEnabled;
    },
    async setScore(clientId, score) {
      if (redisEnabled) {
        await redisClient.zAdd("leaderboard", [{ score, value: clientId }]);
      } else {
        memoryScores.set(clientId, score);
      }
    },
    async getScores() {
      if (redisEnabled) {
        const rows = await redisClient.zRangeWithScores("leaderboard", 0, -1, { REV: true });
        return rows.map((row) => ({ clientId: row.value, score: row.score }));
      }
      return Array.from(memoryScores.entries())
        .map(([clientId, score]) => ({ clientId, score }))
        .sort((a, b) => b.score - a.score);
    }
  };
}

function createSocketServer(io, { metrics, netSim, jwtSecret, adminPassword, redisUrl }) {
  const participants = new Map();
  const clientStats = new Map();
  const deliveredAnswers = new Set();
  const answerRateWindows = new Map();
  const state = {
    started: false,
    currentQuestionIndex: -1,
    quizQuestions: [],
    lastServerSeq: 0
  };

  const leaderboardPromise = createLeaderboardStore(redisUrl);

  function nextServerSeq() {
    state.lastServerSeq += 1;
    return state.lastServerSeq;
  }

  function getClientState(clientId) {
    if (!clientStats.has(clientId)) {
      clientStats.set(clientId, {
        lastSeqReceived: 0,
        lastSeqSent: 0,
        retransmits: 0,
        lostAcksEstimate: 0,
        rttSamples: [],
        lastRtt: 0,
        jitter: 0
      });
    }
    return clientStats.get(clientId);
  }

  async function hydrateQuestions() {
    state.quizQuestions = await db.listQuestions();
  }

  async function getLeaderboardEntries() {
    const leaderboard = await leaderboardPromise;
    const scores = await leaderboard.getScores();
    return scores.map((entry) => {
      const participant = participants.get(entry.clientId) || {};
      const stat = getClientState(entry.clientId);
      return {
        clientId: entry.clientId,
        name: participant.name || entry.clientId,
        score: entry.score,
        latency: Math.round(stat.lastRtt || 0),
        lastUpdateTs: Date.now()
      };
    });
  }

  function emitWithSimulation(socket, eventName, payload, options = {}) {
    // NETWORK: server-side delayed and dropped delivery simulation
    netSim.applyOutbound(
      () => {
        metrics.recordOutbound();
        socket.emit(eventName, payload);
      },
      () => {
        if (options.onDrop) {
          options.onDrop();
        }
      }
    );
  }

  async function broadcastLeaderboard() {
    const entries = await getLeaderboardEntries();
    const payload = {
      type: "leaderboard",
      entries,
      seq_server: nextServerSeq()
    };
    io.sockets.sockets.forEach((socket) => emitWithSimulation(socket, "server_message", payload));
  }

  function emitNetEvent(detail) {
    const payload = {
      type: "net_event",
      code: "network_update",
      detail
    };
    io.sockets.sockets.forEach((socket) => emitWithSimulation(socket, "server_message", payload));
  }

  function sendAck(socket, seqServer, sourceSeq) {
    emitWithSimulation(socket, "server_message", {
      type: "ack",
      seq_server: seqServer,
      source_seq: sourceSeq
    });
  }

  function authenticateAdmin(token) {
    if (!token) {
      return false;
    }
    try {
      const payload = jwt.verify(token, jwtSecret);
      return payload.role === "admin";
    } catch (error) {
      return token === adminPassword;
    }
  }

  function recordAnswerRate(clientId) {
    const now = Date.now();
    const samples = answerRateWindows.get(clientId) || [];
    samples.push(now);
    while (samples.length && now - samples[0] > 1000) {
      samples.shift();
    }
    answerRateWindows.set(clientId, samples);
    return samples.length <= 5;
  }

  async function handleJoin(socket, message) {
    const { clientId, name, seq } = message;
    if (!clientId || !name || typeof seq !== "number") {
      emitWithSimulation(socket, "server_message", {
        type: "net_event",
        code: "invalid_join",
        detail: "join_quiz requires clientId, name, and seq"
      });
      return;
    }

    const stat = getClientState(clientId);
    // NETWORK: sequence number validation
    if (seq <= stat.lastSeqReceived) {
      stat.retransmits += 1;
      metrics.recordRetransmit();
    }
    stat.lastSeqReceived = Math.max(stat.lastSeqReceived, seq);

    participants.set(clientId, {
      clientId,
      name,
      socketId: socket.id,
      score: participants.get(clientId)?.score || 0
    });
    socket.data.clientId = clientId;
    await db.upsertParticipant(clientId, name);

    const leaderboard = await leaderboardPromise;
    await leaderboard.setScore(clientId, participants.get(clientId).score);

    sendAck(socket, nextServerSeq(), seq);
    await broadcastLeaderboard();

    if (state.started && state.quizQuestions[state.currentQuestionIndex]) {
      const question = state.quizQuestions[state.currentQuestionIndex];
      emitWithSimulation(socket, "server_message", {
        type: "question",
        questionId: question.id,
        text: question.text,
        choices: question.choices,
        seq_server: nextServerSeq()
      });
    }
  }

  async function handlePing(socket, message) {
    const { clientId, seq, ts_local: tsLocal } = message;
    if (!clientId || typeof seq !== "number" || typeof tsLocal !== "number") {
      return;
    }

    const stat = getClientState(clientId);
    stat.lastSeqReceived = Math.max(stat.lastSeqReceived, seq);
    sendAck(socket, nextServerSeq(), seq);
    emitWithSimulation(socket, "server_message", {
      type: "server_pong",
      seq,
      ts_server: Date.now()
    });
  }

  async function handleAnswer(socket, message) {
    const { clientId, questionId, answerId, seq, ts_local: tsLocal } = message;
    if (!clientId || typeof questionId !== "number" || typeof seq !== "number") {
      emitWithSimulation(socket, "server_message", {
        type: "net_event",
        code: "invalid_answer",
        detail: "Malformed answer payload"
      });
      return;
    }

    if (!recordAnswerRate(clientId)) {
      emitWithSimulation(socket, "server_message", {
        type: "net_event",
        code: "rate_limited",
        detail: "Maximum 5 answers per second"
      });
      return;
    }

    const stat = getClientState(clientId);
    // NETWORK: retransmission logic
    if (seq <= stat.lastSeqReceived) {
      stat.retransmits += 1;
      metrics.recordRetransmit();
    }
    stat.lastSeqReceived = Math.max(stat.lastSeqReceived, seq);

    const answerKey = `${clientId}:${questionId}:${seq}`;
    if (deliveredAnswers.has(answerKey)) {
      sendAck(socket, nextServerSeq(), seq);
      return;
    }
    deliveredAnswers.add(answerKey);

    const question = state.quizQuestions.find((item) => item.id === questionId);
    if (!question) {
      emitWithSimulation(socket, "server_message", {
        type: "net_event",
        code: "missing_question",
        detail: `Question ${questionId} not found`
      });
      return;
    }

    const isCorrect = String(answerId) === String(question.correctAnswerId);
    const participant = participants.get(clientId);
    if (participant && isCorrect) {
      participant.score += 10;
      participants.set(clientId, participant);
    }

    await db.saveSubmission({
      clientId,
      questionId,
      answerId,
      isCorrect,
      seq,
      latencyMs: tsLocal ? Date.now() - tsLocal : 0
    });

    const leaderboard = await leaderboardPromise;
    await leaderboard.setScore(clientId, participant?.score || 0);

    sendAck(socket, nextServerSeq(), seq);
    await broadcastLeaderboard();
  }

  async function handleAdminAction(socket, message) {
    const { action, token, payload } = message;
    if (!authenticateAdmin(token)) {
      emitWithSimulation(socket, "server_message", {
        type: "net_event",
        code: "admin_auth_failed",
        detail: "Admin token invalid"
      });
      return;
    }

    if (action === "create_question") {
      const question = await db.createQuestion(payload);
      state.quizQuestions.push(question);
      emitNetEvent(`Question ${question.id} created`);
      return;
    }

    if (action === "start_quiz") {
      if (!state.quizQuestions.length) {
        await hydrateQuestions();
      }
      state.started = true;
      state.currentQuestionIndex = 0;
      const question = state.quizQuestions[state.currentQuestionIndex];
      const packet = {
        type: "question",
        questionId: question.id,
        text: question.text,
        choices: question.choices,
        seq_server: nextServerSeq()
      };
      io.sockets.sockets.forEach((clientSocket) => emitWithSimulation(clientSocket, "server_message", packet));
      emitNetEvent("Quiz started");
      return;
    }

    if (action === "next_question") {
      if (state.currentQuestionIndex + 1 < state.quizQuestions.length) {
        state.currentQuestionIndex += 1;
        const question = state.quizQuestions[state.currentQuestionIndex];
        const packet = {
          type: "question",
          questionId: question.id,
          text: question.text,
          choices: question.choices,
          seq_server: nextServerSeq()
        };
        io.sockets.sockets.forEach((clientSocket) => emitWithSimulation(clientSocket, "server_message", packet));
        emitNetEvent("Next question broadcast");
      }
      return;
    }

    if (action === "stop_quiz") {
      state.started = false;
      emitNetEvent("Quiz stopped");
      return;
    }

    if (action === "set_network") {
      const config = netSim.update(payload);
      emitNetEvent(`Simulation updated: ${JSON.stringify(config)}`);
    }
  }

  io.on("connection", async (socket) => {
    emitWithSimulation(socket, "server_message", {
      type: "net_event",
      code: "connected",
      detail: "Socket connected"
    });

    socket.on("client_message", (message) => {
      metrics.recordInbound();
      netSim.applyInbound(
        async () => {
          const type = message?.type;
          if (type === "join_quiz") {
            await handleJoin(socket, message);
            return;
          }
          if (type === "client_ping") {
            await handlePing(socket, message);
            return;
          }
          if (type === "answer") {
            await handleAnswer(socket, message);
            return;
          }
          if (type === "admin_action") {
            await handleAdminAction(socket, message);
            return;
          }
          emitWithSimulation(socket, "server_message", {
            type: "net_event",
            code: "unknown_message",
            detail: `Unsupported type ${type}`
          });
        },
        () => {
          emitWithSimulation(socket, "server_message", {
            type: "net_event",
            code: "simulated_drop",
            detail: `Dropped inbound ${message?.type || "unknown"}`
          });
        }
      );
    });

    socket.on("client_rtt", async ({ clientId, rttMs }) => {
      if (!clientId || typeof rttMs !== "number") {
        return;
      }
      const stat = getClientState(clientId);
      // NETWORK: RTT calculation
      stat.rttSamples.push(rttMs);
      while (stat.rttSamples.length > 20) {
        stat.rttSamples.shift();
      }
      stat.lastRtt = rttMs;
      stat.jitter = calculateJitter(stat.rttSamples);
      metrics.recordRTT(clientId, rttMs);
      await db.updateParticipantLatency(clientId, rttMs);
      await broadcastLeaderboard();
    });

    socket.on("client_retransmit", ({ clientId }) => {
      if (!clientId) {
        return;
      }
      const stat = getClientState(clientId);
      stat.retransmits += 1;
      metrics.recordRetransmit();
    });

    socket.on("disconnect", () => {
      const clientId = socket.data.clientId;
      if (clientId && participants.has(clientId)) {
        const participant = participants.get(clientId);
        participant.socketId = null;
        participants.set(clientId, participant);
      }
    });
  });

  return {
    async init() {
      await hydrateQuestions();
    },
    async getLeaderboard() {
      return getLeaderboardEntries();
    },
    getSocketsCount() {
      return io.sockets.sockets.size;
    },
    getNetConfig() {
      return netSim.getConfig();
    },
    getInspectorRows() {
      return Array.from(participants.values()).map((participant) => {
        const stat = getClientState(participant.clientId);
        return {
          clientId: participant.clientId,
          name: participant.name,
          rtt: Math.round(stat.lastRtt || 0),
          jitter: Number((stat.jitter || 0).toFixed(2)),
          packetLoss: stat.lostAcksEstimate,
          lastSeqSent: stat.lastSeqSent,
          lastSeqReceived: stat.lastSeqReceived,
          retransmits: stat.retransmits
        };
      });
    }
  };
}

module.exports = { createSocketServer };
