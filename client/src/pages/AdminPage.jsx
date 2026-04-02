import React from "react";
import { useEffect } from "react";
import Leaderboard from "../components/Leaderboard";
import Admin from "../components/Admin";

function LatencyMonitor({ entries }) {
  if (!entries || entries.length === 0) {
    return (
      <div>
        <h3>Live Client Latency</h3>
        <p className="subtle">No clients connected yet</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Live Client Latency</h3>
      <div className="latency-grid">
        {entries.map((entry) => (
          <div key={entry.clientId} className="latency-card">
            <div className="latency-name">{entry.name}</div>
            <div className={`latency-value ${getLatencyClass(entry.latency)}`}>
              {entry.latency}ms
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getLatencyClass(latency) {
  if (latency < 100) return "latency-good";
  if (latency < 250) return "latency-warn";
  return "latency-bad";
}

export default function AdminPage({
  token,
  onLogin,
  onCreateQuestion,
  onStart,
  onStop,
  onNext,
  leaderboard,
  onDisqualify,
  onSetTimer,
  onUpdateQuestion,
  onDeleteQuestion,
  questionList
}) {
  useEffect(() => {
    document.title = "Quiz Network - Admin Dashboard";
  }, []);

  if (!token) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <h1>Admin Dashboard</h1>
          <p className="subtle">Login to access quiz controls</p>
          <div className="panel">
            <Admin
              token={token}
              onLogin={onLogin}
              onCreateQuestion={onCreateQuestion}
              onStart={onStart}
              onStop={onStop}
              onNext={onNext}
              connectedClients={leaderboard}
              onDisqualify={onDisqualify}
              onSetTimer={onSetTimer}
              onUpdateQuestion={onUpdateQuestion}
              onDeleteQuestion={onDeleteQuestion}
              questionList={questionList}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="subtle">Real-time quiz management and monitoring</p>
        </div>
        <span className="badge ok">Authenticated</span>
      </header>

      <div className="admin-grid">
        <section className="panel">
          <Leaderboard entries={leaderboard} />
        </section>

        <section className="panel">
          <LatencyMonitor entries={leaderboard} />
        </section>

        <section className="panel wide">
          <Admin
            token={token}
            onLogin={onLogin}
            onCreateQuestion={onCreateQuestion}
            onStart={onStart}
            onStop={onStop}
            onNext={onNext}
            connectedClients={leaderboard}
            onDisqualify={onDisqualify}
            onSetTimer={onSetTimer}
            onUpdateQuestion={onUpdateQuestion}
            onDeleteQuestion={onDeleteQuestion}
            questionList={questionList}
          />
        </section>
      </div>
    </div>
  );
}
