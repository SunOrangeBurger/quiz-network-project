import React from "react";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { io } from "socket.io-client";
import UserPage from "./pages/UserPage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";

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
  const [adminToken, setAdminToken] = useState("");
  const [disqualified, setDisqualified] = useState(false);
  const [questionTimer, setQuestionTimer] = useState(20);
  const [questionList, setQuestionList] = useState([]);
  const [quizEnded, setQuizEnded] = useState(false);
  const socketRef = useRef(null);
  const pingStartRef = useRef(0);

  function sendMessage(type, payload = {}) {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("client_message", { type, clientId, ...payload });
  }

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server");
    });

    socket.on("server_message", (payload) => {
      if (payload.type === "leaderboard") {
        setLeaderboard(payload.entries || []);
        return;
      }

      if (payload.type === "question") {
        setQuestion(payload);
        setQuizEnded(false);
        if (payload.timer) {
          setQuestionTimer(payload.timer);
        }
        return;
      }

      if (payload.type === "disqualified") {
        setDisqualified(true);
        return;
      }

      if (payload.type === "quiz_ended") {
        setQuestion(null);
        setQuizEnded(true);
        return;
      }

      if (payload.type === "timer_updated") {
        setQuestionTimer(payload.timer);
        return;
      }

      if (payload.type === "question_list") {
        setQuestionList(payload.questions || []);
        return;
      }

      if (payload.type === "server_pong" && pingStartRef.current) {
        const rtt = Date.now() - pingStartRef.current;
        pingStartRef.current = 0;
        socket.emit("client_latency", { clientId, latency: rtt });
        return;
      }
    });

    return () => socket.disconnect();
  }, [clientId]);

  useEffect(() => {
    if (!joined) return;
    const timer = window.setInterval(() => {
      pingStartRef.current = Date.now();
      sendMessage("client_ping");
    }, 2500);
    return () => window.clearInterval(timer);
  }, [joined]);

  function handleJoin(userName) {
    if (!userName.trim()) return;
    setName(userName.trim());
    sendMessage("join_quiz", { name: userName.trim() });
    setJoined(true);
    setQuizEnded(false);
  }

  function handleSubmitAnswer(answerId) {
    if (!question) return;
    sendMessage("answer", {
      questionId: question.questionId,
      answerId,
      ts_local: Date.now()
    });
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

  function handleDisqualify(clientId) {
    sendAdminAction("disqualify_user", { clientId });
  }

  function handleSetTimer(timer) {
    sendAdminAction("set_timer", { timer });
  }

  function handleUpdateQuestion(questionData) {
    sendAdminAction("update_question", {
      questionId: questionData.id,
      text: questionData.text,
      choices: questionData.choices,
      correctAnswerId: questionData.correctAnswerId
    });
  }

  function handleDeleteQuestion(questionId) {
    sendAdminAction("delete_question", { questionId });
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <UserPage
              name={name}
              clientId={clientId}
              question={question}
              onSubmit={handleSubmitAnswer}
              joined={joined}
              onJoin={handleJoin}
              disqualified={disqualified}
              questionTimer={questionTimer}
              quizEnded={quizEnded}
              leaderboard={leaderboard}
            />
          }
        />
        <Route
          path="/admin"
          element={
            <AdminPage
              token={adminToken}
              onLogin={handleAdminLogin}
              onCreateQuestion={(payload) => sendAdminAction("create_question", payload)}
              onStart={() => sendAdminAction("start_quiz")}
              onStop={() => sendAdminAction("stop_quiz")}
              onNext={() => sendAdminAction("next_question")}
              leaderboard={leaderboard}
              onDisqualify={handleDisqualify}
              onSetTimer={handleSetTimer}
              onUpdateQuestion={handleUpdateQuestion}
              onDeleteQuestion={handleDeleteQuestion}
              questionList={questionList}
            />
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

