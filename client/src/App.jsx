import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import Quiz from "./components/Quiz";
import Admin from "./components/Admin";
import Leaderboard from "./components/Leaderboard";
import NetInspector from "./components/NetInspector";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
const ACK_TIMEOUT_MS = 800;

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeJitter(samples) {
  if (samples.length < 2) {
    return 0;
  }
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) / samples.length;
  return Math.sqrt(variance);
}

export default function App() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [clientId] = useState(() => randomId("client"));
  const [leaderboard, setLeaderboard] = useState([]);
  const [question, setQuestion] = useState(null);
  const [messageLog, setMessageLog] = useState([]);
  const [events, setEvents] = useState([]);
  const [seq, setSeq] = useState(1);
  const [lastAckedSeq, setLastAckedSeq] = useState(0);
  const [retransmits, setRetransmits] = useState(0);
  const [rttSamples, setRttSamples] = useState([]);
  const [avgRtt, setAvgRtt] = useState(0);
  const [jitter, setJitter] = useState(0);
  const [packetLossEstimate, setPacketLossEstimate] = useState(0);
  const [lastSeqReceived, setLastSeqReceived] = useState(0);
  const [unackedSize, setUnackedSize] = useState(0);
  const [adminToken, setAdminToken] = useState("");
  const [serverMetrics, setServerMetrics] = useState(null);
  const socketRef = useRef(null);
  const pingTimersRef = useRef(new Map());
  const unackedRef = useRef(new Map());

  function logLine(direction, payload) {
    setMessageLog((current) =>
      [{ direction, payload, ts: new Date().toLocaleTimeString() }, ...current].slice(0, 30)
    );
  }

  function retransmit(sourceSeq) {
    const socket = socketRef.current;
    const record = unackedRef.current.get(sourceSeq);
    if (!socket || !record) {
      return;
    }
    record.attempts += 1;
    record.timeoutId = window.setTimeout(() => retransmit(sourceSeq), ACK_TIMEOUT_MS);
    unackedRef.current.set(sourceSeq, record);
    setRetransmits((count) => count + 1);
    setPacketLossEstimate((value) => Number((Math.min(1, value + 0.02)).toFixed(2)));
    socket.emit("client_retransmit", { clientId, seq: sourceSeq });
    socket.emit("client_message", record.payload);
    logLine("retransmit", record.payload);
    setUnackedSize(unackedRef.current.size);
  }

  function queueMessage(message, options = {}) {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    // NETWORK: reliability logic
    const outbound = { ...message, seq: message.seq ?? seq };
    setSeq((current) => Math.max(current, outbound.seq + 1));
    logLine("send", outbound);
    socket.emit("client_message", outbound);

    if (!options.requiresAck) {
      return;
    }

    const record = {
      payload: outbound,
      attempts: 1
    };
    const timeoutId = window.setTimeout(() => retransmit(outbound.seq), ACK_TIMEOUT_MS);
    record.timeoutId = timeoutId;
    unackedRef.current.set(outbound.seq, record);
    setUnackedSize(unackedRef.current.size);
  }

  function clearAck(sourceSeq) {
    const record = unackedRef.current.get(sourceSeq);
    if (!record) {
      return;
    }
    window.clearTimeout(record.timeoutId);
    unackedRef.current.delete(sourceSeq);
    setUnackedSize(unackedRef.current.size);
    setLastAckedSeq(sourceSeq);
    setPacketLossEstimate((value) => Number(Math.max(0, value - 0.01).toFixed(2)));
  }

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setEvents((current) => [`Connected to ${SERVER_URL}`, ...current].slice(0, 12));
    });

    socket.on("server_message", (payload) => {
      logLine("recv", payload);
      if (payload.seq_server) {
        setLastSeqReceived(payload.seq_server);
      }

      if (payload.type === "ack") {
        clearAck(payload.source_seq);
        return;
      }

      if (payload.type === "server_pong") {
        const startedAt = pingTimersRef.current.get(payload.seq);
        if (startedAt) {
          const rtt = Date.now() - startedAt;
          pingTimersRef.current.delete(payload.seq);
          setRttSamples((current) => {
            const next = [...current, rtt].slice(-20);
            const avg = next.reduce((sum, value) => sum + value, 0) / next.length;
            setAvgRtt(Math.round(avg));
            setJitter(Number(computeJitter(next).toFixed(2)));
            return next;
          });
          socket.emit("client_rtt", { clientId, rttMs: rtt });
        }
        return;
      }

      if (payload.type === "question") {
        setQuestion(payload);
        return;
      }

      if (payload.type === "leaderboard") {
        setLeaderboard(payload.entries || []);
        return;
      }

      if (payload.type === "net_event") {
        setEvents((current) => [`${payload.code}: ${payload.detail}`, ...current].slice(0, 12));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [clientId]);

  useEffect(() => {
    if (!joined) {
      return;
    }
    const timer = window.setInterval(() => {
      const currentSeq = seq;
      pingTimersRef.current.set(currentSeq, Date.now());
      queueMessage(
        {
          type: "client_ping",
          clientId,
          ts_local: Date.now(),
          seq: currentSeq
        },
        { requiresAck: true }
      );
    }, 2500);
    return () => window.clearInterval(timer);
  }, [joined, seq, clientId]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${SERVER_URL}/metrics`);
        const data = await response.json();
        setServerMetrics(data);
      } catch (error) {
        setEvents((current) => [`metrics_error: ${error.message}`, ...current].slice(0, 12));
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const inspectorRows = useMemo(
    () => [
      {
        clientId,
        rtt: avgRtt,
        jitter,
        packetLoss: packetLossEstimate,
        lastSeqSent: seq - 1,
        lastSeqReceived,
        retransmits
      }
    ],
    [clientId, avgRtt, jitter, packetLossEstimate, seq, lastSeqReceived, retransmits]
  );

  function handleJoin() {
    if (!name.trim()) {
      return;
    }
    queueMessage(
      {
        type: "join_quiz",
        clientId,
        name: name.trim()
      },
      { requiresAck: true }
    );
    setJoined(true);
  }

  function handleSubmitAnswer(answerId) {
    if (!question) {
      return;
    }
    queueMessage(
      {
        type: "answer",
        clientId,
        questionId: question.questionId,
        answerId,
        ts_local: Date.now()
      },
      { requiresAck: true }
    );
  }

  async function handleAdminLogin(password) {
    const response = await fetch(`${SERVER_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      throw new Error("Admin login failed");
    }
    const data = await response.json();
    setAdminToken(data.token);
  }

  function sendAdminAction(action, payload) {
    queueMessage({
      type: "admin_action",
      clientId,
      action,
      token: adminToken,
      payload
    });
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Computer Networks Mini Project</p>
          <h1>Multi-Client Online Quiz System</h1>
          <p className="subtle">
            WebSockets, application-layer reliability, latency simulation, and live ranking in one
            visible network lab.
          </p>
          <p className="mono">Last acked seq: {lastAckedSeq}</p>
        </div>
        <div className="join-card">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter display name"
          />
          <button onClick={handleJoin} disabled={joined}>
            {joined ? "Joined" : "Join Quiz"}
          </button>
          <p className="mono">Client ID: {clientId}</p>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <Quiz question={question} seq={seq - 1} clientId={clientId} onSubmit={handleSubmitAnswer} />
        </section>

        <section className="panel">
          <Leaderboard entries={leaderboard} />
        </section>

        <section className="panel">
          <Admin
            token={adminToken}
            onLogin={handleAdminLogin}
            onCreateQuestion={(payload) => sendAdminAction("create_question", payload)}
            onStart={() => sendAdminAction("start_quiz")}
            onStop={() => sendAdminAction("stop_quiz")}
            onNext={() => sendAdminAction("next_question")}
            onNetworkChange={(payload) => sendAdminAction("set_network", payload)}
            connectedClients={leaderboard}
          />
        </section>

        <section className="panel wide">
          <NetInspector
            clientId={clientId}
            rows={inspectorRows}
            messageLog={messageLog}
            rttSamples={rttSamples}
            unackedSize={unackedSize}
            events={events}
            serverMetrics={serverMetrics}
          />
        </section>
      </main>
    </div>
  );
}


