import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import Quiz from "./components/Quiz";
import Admin from "./components/Admin";
import Leaderboard from "./components/Leaderboard";
import NetInspector from "./components/NetInspector";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [clientId] = useState(() => randomId("client"));
  const [leaderboard, setLeaderboard] = useState([]);
  const [question, setQuestion] = useState(null);
  const [messageLog, setMessageLog] = useState([]);
  const [events, setEvents] = useState([]);
  const [submissionSeq, setSubmissionSeq] = useState(1);
  const [rttSamples, setRttSamples] = useState([]);
  const [latency, setLatency] = useState(0);
  const [adminToken, setAdminToken] = useState("");
  const socketRef = useRef(null);
  const pingStartRef = useRef(0);

  function logLine(direction, payload) {
    setMessageLog((current) =>
      [{ direction, payload, ts: new Date().toLocaleTimeString() }, ...current].slice(0, 20)
    );
  }

  function sendMessage(type, payload = {}) {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    const message = { type, clientId, ...payload };
    logLine("send", message);
    socket.emit("client_message", message);
  }

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setEvents((current) => [`Connected to ${SERVER_URL}`, ...current].slice(0, 10));
    });

    socket.on("server_message", (payload) => {
      logLine("recv", payload);

      if (payload.type === "leaderboard") {
        setLeaderboard(payload.entries || []);
        return;
      }

      if (payload.type === "question") {
        setQuestion(payload);
        return;
      }

      if (payload.type === "server_pong" && pingStartRef.current) {
        const nextRtt = Date.now() - pingStartRef.current;
        pingStartRef.current = 0;
        setLatency(nextRtt);
        setRttSamples((current) => [...current.slice(-19), nextRtt]);
        socket.emit("client_latency", { clientId, latency: nextRtt });
        return;
      }

      if (payload.type === "event") {
        setEvents((current) => [payload.message, ...current].slice(0, 10));
      }
    });

    return () => socket.disconnect();
  }, [clientId]);

  useEffect(() => {
    if (!joined) {
      return;
    }
    const timer = window.setInterval(() => {
      pingStartRef.current = Date.now();
      sendMessage("client_ping");
    }, 2500);
    return () => window.clearInterval(timer);
  }, [joined]);

  const inspectorRows = useMemo(
    () => [
      {
        clientId,
        latency
      }
    ],
    [clientId, latency]
  );

  function handleJoin() {
    if (!name.trim()) {
      return;
    }
    sendMessage("join_quiz", { name: name.trim() });
    setJoined(true);
  }

  function handleSubmitAnswer(answerId) {
    if (!question) {
      return;
    }
    sendMessage("answer", {
      questionId: question.questionId,
      answerId,
      ts_local: Date.now()
    });
    setSubmissionSeq((current) => current + 1);
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
    sendMessage("admin_action", { action, token: adminToken, payload });
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Computer Networks Mini Project</p>
          <h1>Multi-Client Online Quiz System</h1>
          <p className="subtle">
            WebSockets, live quiz participation, admin-driven question flow, and a latency-aware leaderboard.
          </p>
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
          <Quiz question={question} seq={submissionSeq} clientId={clientId} onSubmit={handleSubmitAnswer} />
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
            connectedClients={leaderboard}
          />
        </section>

        <section className="panel wide">
          <NetInspector
            clientId={clientId}
            rows={inspectorRows}
            messageLog={messageLog}
            rttSamples={rttSamples}
            events={events}
          />
        </section>
      </main>
    </div>
  );
}

