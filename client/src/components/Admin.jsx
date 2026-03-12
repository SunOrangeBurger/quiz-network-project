import React from "react";
import { useState } from "react";

const initialQuestion = {
  text: "Which metric grows when packet delay becomes inconsistent?",
  choices: ["TTL", "ARP", "Jitter", "Throughput"],
  correctAnswerId: "2"
};

export default function Admin({
  token,
  onLogin,
  onCreateQuestion,
  onStart,
  onStop,
  onNext,
  onNetworkChange,
  connectedClients
}) {
  const [password, setPassword] = useState("admin123");
  const [question, setQuestion] = useState(initialQuestion);
  const [network, setNetwork] = useState({
    packetLossPercent: 0,
    minDelayMs: 0,
    maxDelayMs: 0
  });
  const [error, setError] = useState("");

  async function handleLogin() {
    try {
      setError("");
      await onLogin(password);
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  function updateChoice(index, value) {
    const next = [...question.choices];
    next[index] = value;
    setQuestion((current) => ({ ...current, choices: next }));
  }

  return (
    <div>
      <div className="section-head">
        <h2>Admin Panel</h2>
        <span className={token ? "badge ok" : "badge"}>{token ? "Authenticated" : "Locked"}</span>
      </div>

      {!token ? (
        <div className="stack">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
          />
          <button onClick={handleLogin}>Login</button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : (
        <div className="stack">
          <button onClick={onStart}>Start Quiz</button>
          <button onClick={onNext}>Next Question</button>
          <button onClick={onStop}>Stop Quiz</button>
        </div>
      )}

      <div className="stack top-gap">
        <h3>Connected Clients</h3>
        <div className="meta-box">
          {connectedClients?.length ? (
            connectedClients.map((client) => <p key={client.clientId}>{client.name} ({client.clientId})</p>)
          ) : (
            <p className="subtle">No connected quiz clients visible yet.</p>
          )}
        </div>
      </div>

      <div className="stack top-gap">
        <h3>Create Question</h3>
        <textarea
          value={question.text}
          onChange={(event) => setQuestion((current) => ({ ...current, text: event.target.value }))}
          rows={3}
        />
        {question.choices.map((choice, index) => (
          <input
            key={index}
            value={choice}
            onChange={(event) => updateChoice(index, event.target.value)}
            placeholder={`Choice ${index + 1}`}
          />
        ))}
        <input
          value={question.correctAnswerId}
          onChange={(event) =>
            setQuestion((current) => ({ ...current, correctAnswerId: event.target.value }))
          }
          placeholder="Correct choice index"
        />
        <button onClick={() => onCreateQuestion(question)} disabled={!token}>
          Add Question
        </button>
      </div>

      <div className="stack top-gap">
        <h3>Network Simulation</h3>
        <label>
          Packet Loss %
          <input
            type="number"
            value={network.packetLossPercent}
            onChange={(event) =>
              setNetwork((current) => ({
                ...current,
                packetLossPercent: Number(event.target.value)
              }))
            }
          />
        </label>
        <label>
          Min Delay (ms)
          <input
            type="number"
            value={network.minDelayMs}
            onChange={(event) =>
              setNetwork((current) => ({ ...current, minDelayMs: Number(event.target.value) }))
            }
          />
        </label>
        <label>
          Max Delay (ms)
          <input
            type="number"
            value={network.maxDelayMs}
            onChange={(event) =>
              setNetwork((current) => ({ ...current, maxDelayMs: Number(event.target.value) }))
            }
          />
        </label>
        <button onClick={() => onNetworkChange(network)} disabled={!token}>
          Apply Network Settings
        </button>
      </div>
    </div>
  );
}

