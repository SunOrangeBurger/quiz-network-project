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
  connectedClients,
  onDisqualify,
  onSetTimer,
  onUpdateQuestion,
  onDeleteQuestion,
  questionList
}) {
  const [password, setPassword] = useState("admin123");
  const [question, setQuestion] = useState(initialQuestion);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(20);
  const [editingQuestion, setEditingQuestion] = useState(null);

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

  function startEditQuestion(q) {
    setEditingQuestion({
      id: q.id,
      text: q.text,
      choices: [...q.choices],
      correctAnswerId: q.correctAnswerId
    });
  }

  function updateEditChoice(index, value) {
    const next = [...editingQuestion.choices];
    next[index] = value;
    setEditingQuestion((current) => ({ ...current, choices: next }));
  }

  function saveEditQuestion() {
    onUpdateQuestion(editingQuestion);
    setEditingQuestion(null);
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
            onKeyPress={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
          />
          <button onClick={handleLogin}>Login</button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : (
        <>
          <div className="stack">
            <button onClick={onStart}>Start Quiz</button>
            <button onClick={onStop}>Stop Quiz</button>
          </div>

          <div className="stack top-gap">
            <h3>Timer Settings</h3>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="number"
                value={timer}
                onChange={(e) => setTimer(Math.max(5, Math.min(120, parseInt(e.target.value) || 20)))}
                min="5"
                max="120"
                style={{ width: "80px" }}
              />
              <span>seconds</span>
              <button onClick={() => onSetTimer(timer)}>Set Timer</button>
            </div>
          </div>
        </>
      )}

      <div className="stack top-gap">
        <h3>Connected Clients</h3>
        <div className="meta-box">
          {connectedClients?.length ? (
            connectedClients.map((client) => (
              <div key={client.clientId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span>{client.name} ({client.clientId.substring(0, 10)}...)</span>
                {token && (
                  <button 
                    onClick={() => onDisqualify(client.clientId)}
                    style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem", background: "#ef4444" }}
                  >
                    Disqualify
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="subtle">No connected quiz clients visible yet.</p>
          )}
        </div>
      </div>

      {token && (
        <>
          <div className="stack top-gap">
            <h3>Question Bank</h3>
            <div className="meta-box" style={{ maxHeight: "300px", overflow: "auto" }}>
              {questionList?.length ? (
                questionList.map((q) => (
                  <div key={q.id} style={{ marginBottom: "1rem", padding: "0.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px" }}>
                    {editingQuestion?.id === q.id ? (
                      <div className="stack">
                        <textarea
                          value={editingQuestion.text}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                          rows={2}
                        />
                        {editingQuestion.choices.map((choice, idx) => (
                          <input
                            key={idx}
                            value={choice}
                            onChange={(e) => updateEditChoice(idx, e.target.value)}
                            placeholder={`Choice ${idx + 1}`}
                          />
                        ))}
                        <input
                          value={editingQuestion.correctAnswerId}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, correctAnswerId: e.target.value })}
                          placeholder="Correct choice index (0-3)"
                        />
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button onClick={saveEditQuestion}>Save</button>
                          <button onClick={() => setEditingQuestion(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontWeight: "bold", marginBottom: "0.3rem" }}>Q{q.id}: {q.text}</p>
                        <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                          Correct: {q.choices[parseInt(q.correctAnswerId)]}
                        </p>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button 
                            onClick={() => startEditQuestion(q)}
                            style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => onDeleteQuestion(q.id)}
                            style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem", background: "#ef4444" }}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              ) : (
                <p className="subtle">No questions yet.</p>
              )}
            </div>
          </div>

          <div className="stack top-gap">
            <h3>Create New Question</h3>
            <textarea
              value={question.text}
              onChange={(event) => setQuestion((current) => ({ ...current, text: event.target.value }))}
              rows={3}
              placeholder="Question text"
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
              placeholder="Correct choice index (0-3)"
            />
            <button onClick={() => {
              onCreateQuestion(question);
              setQuestion(initialQuestion);
            }}>
              Add Question
            </button>
          </div>
        </>
      )}
    </div>
  );
}
