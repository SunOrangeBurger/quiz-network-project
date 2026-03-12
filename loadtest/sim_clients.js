const { io } = require("socket.io-client");

function randomDelay(minDelay, maxDelay) {
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
}

function createSimClient(index, options = {}) {
  const clientId = `sim-${index}`;
  const socket = io(options.serverUrl || "http://localhost:4000", {
    transports: ["websocket", "polling"]
  });

  const stats = {
    clientId,
    sent: 0,
    acked: 0,
    failed: 0,
    retransmits: 0,
    rtts: []
  };

  let seq = 1;
  const unacked = new Map();

  function send(payload, requiresAck = false) {
    const outbound = { ...payload, clientId, seq };
    seq += 1;
    stats.sent += 1;
    socket.emit("client_message", outbound);

    if (requiresAck) {
      const startedAt = Date.now();
      const timeoutId = setTimeout(() => {
        stats.retransmits += 1;
        socket.emit("client_retransmit", { clientId });
        socket.emit("client_message", outbound);
      }, options.ackTimeoutMs || 900);
      unacked.set(outbound.seq, { timeoutId, startedAt });
    }
    return outbound.seq;
  }

  socket.on("connect", () => {
    send({ type: "join_quiz", name: `Sim ${index}` }, true);
    setInterval(() => {
      const pingSeq = send({ type: "client_ping", ts_local: Date.now() }, true);
      const record = unacked.get(pingSeq);
      if (record) {
        record.isPing = true;
        unacked.set(pingSeq, record);
      }
    }, options.pingIntervalMs || 2500);

    setInterval(() => {
      const delay = randomDelay(options.minAnswerDelay || 500, options.maxAnswerDelay || 1800);
      setTimeout(() => {
        send(
          {
            type: "answer",
            questionId: 1,
            answerId: String(index % 4),
            ts_local: Date.now()
          },
          true
        );
      }, delay);
    }, options.answerEveryMs || 3000);
  });

  socket.on("server_message", (payload) => {
    if (payload.type === "ack" && unacked.has(payload.source_seq)) {
      const record = unacked.get(payload.source_seq);
      clearTimeout(record.timeoutId);
      unacked.delete(payload.source_seq);
      stats.acked += 1;
    }
    if (payload.type === "server_pong" && unacked.has(payload.seq)) {
      const record = unacked.get(payload.seq);
      const rtt = Date.now() - record.startedAt;
      stats.rtts.push(rtt);
      socket.emit("client_rtt", { clientId, rttMs: rtt });
    }
    if (payload.type === "net_event" && payload.code === "rate_limited") {
      stats.failed += 1;
    }
  });

  return {
    clientId,
    stats,
    stop() {
      socket.disconnect();
      unacked.forEach((record) => clearTimeout(record.timeoutId));
    }
  };
}

module.exports = { createSimClient };
