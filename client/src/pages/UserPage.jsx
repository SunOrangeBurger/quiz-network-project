import React from "react";
import { useEffect, useState } from "react";

export default function UserPage({ 
  name, 
  clientId, 
  question, 
  onSubmit, 
  joined, 
  onJoin,
  disqualified,
  questionTimer,
  quizEnded,
  leaderboard
}) {
  const [selected, setSelected] = useState("");
  const [timer, setTimer] = useState(questionTimer || 20);
  const [nameInput, setNameInput] = useState(name);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = "Quiz Network - User";
  }, []);

  useEffect(() => {
    setTimer(questionTimer || 20);
  }, [questionTimer]);

  useEffect(() => {
    setSelected("");
    setTimer(question?.timer || questionTimer || 20);
    setSubmitted(false);
  }, [question?.questionId, question?.timer, questionTimer]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimer((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!joined) {
    return (
      <div className="user-page">
        <div className="join-screen">
          <h1>Quiz Network</h1>
          <p className="subtle">Enter your name to join the quiz</p>
          <div className="join-form">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Enter your name"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === "Enter" && nameInput.trim()) {
                  onJoin(nameInput);
                }
              }}
            />
            <button onClick={() => onJoin(nameInput)} disabled={!nameInput.trim()}>
              Join Quiz
            </button>
          </div>
          <p className="mono">Client ID: {clientId}</p>
        </div>
      </div>
    );
  }

  if (disqualified) {
    return (
      <div className="user-page">
        <div className="waiting-screen">
          <h2 style={{ color: "#f87171" }}>You have been disqualified</h2>
          <p className="subtle">You can no longer participate in this quiz</p>
          <p className="mono">Client ID: {clientId}</p>
        </div>
      </div>
    );
  }

  if (quizEnded) {
    const userEntry = leaderboard.find(entry => entry.clientId === clientId);
    const userRank = leaderboard.findIndex(entry => entry.clientId === clientId) + 1;

    return (
      <div className="user-page">
        <div className="quiz-ended-screen">
          <h1>Quiz Completed! 🎉</h1>
          
          {userEntry && (
            <div className="user-score-card">
              <h2>Your Results</h2>
              <div className="score-details">
                <div className="score-item">
                  <span className="score-label">Rank</span>
                  <span className="score-value">#{userRank}</span>
                </div>
                <div className="score-item">
                  <span className="score-label">Score</span>
                  <span className="score-value">{userEntry.score}</span>
                </div>
                <div className="score-item">
                  <span className="score-label">Latency</span>
                  <span className="score-value">{userEntry.latency}ms</span>
                </div>
              </div>
            </div>
          )}

          <div className="final-leaderboard">
            <h2>Final Leaderboard</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Score</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, index) => (
                  <tr 
                    key={entry.clientId}
                    className={entry.clientId === clientId ? "highlight-row" : ""}
                  >
                    <td>
                      {index === 0 && "🥇"}
                      {index === 1 && "🥈"}
                      {index === 2 && "🥉"}
                      {index > 2 && `#${index + 1}`}
                    </td>
                    <td>{entry.name}</td>
                    <td>{entry.score}</td>
                    <td className={getLatencyClass(entry.latency)}>{entry.latency}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function getLatencyClass(latency) {
    if (latency < 100) return "latency-good";
    if (latency < 250) return "latency-warn";
    return "latency-bad";
  }

  if (!question) {
    return (
      <div className="user-page">
        <div className="waiting-screen">
          <div className="pulse-dot"></div>
          <h2>Waiting for quiz to start...</h2>
          <p className="subtle">The admin will start the quiz shortly</p>
          <p className="mono">Connected as: {name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-page">
      <div className="quiz-header">
        <div>
          <h2>Question #{question.questionId}</h2>
          <p className="mono">{name} • <span className="connection-status">Connected</span></p>
        </div>
        <div className="timer-badge">
          <span className="timer-value">{timer}s</span>
        </div>
      </div>

      <div className="question-card">
        <h3 className="question-text">{question.text}</h3>
        
        <div className="choices">
          {question.choices.map((choice, index) => (
            <label 
              key={index} 
              className={selected === String(index) ? "choice active" : "choice"}
            >
              <input
                type="radio"
                name="answer"
                value={index}
                checked={selected === String(index)}
                onChange={(e) => setSelected(e.target.value)}
                disabled={submitted}
              />
              <span>{choice}</span>
            </label>
          ))}
        </div>

        <button
          className="submit-btn"
          onClick={() => {
            onSubmit(selected);
            setSubmitted(true);
          }}
          disabled={!selected || submitted}
        >
          {submitted ? "Answer Submitted" : "Submit Answer"}
        </button>
      </div>
    </div>
  );
}
