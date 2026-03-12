import React from "react";
import { useEffect, useState } from "react";

export default function Quiz({ question, seq, clientId, onSubmit }) {
  const [selected, setSelected] = useState("");
  const [timer, setTimer] = useState(20);
  const [lastSubmission, setLastSubmission] = useState(null);

  useEffect(() => {
    setSelected("");
    setTimer(20);
  }, [question?.questionId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimer((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!question) {
    return (
      <div>
        <h2>Quiz</h2>
        <p className="subtle">Waiting for the admin to start the quiz.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-head">
        <h2>Quiz</h2>
        <span className="badge">Timer: {timer}s</span>
      </div>
      <p className="mono">Question #{question.questionId}</p>
      <h3>{question.text}</h3>
      <div className="choices">
        {question.choices.map((choice, index) => (
          <label key={choice} className={selected === String(index) ? "choice active" : "choice"}>
            <input
              type="radio"
              name="answer"
              value={index}
              checked={selected === String(index)}
              onChange={(event) => setSelected(event.target.value)}
            />
            <span>{choice}</span>
          </label>
        ))}
      </div>
      <button
        onClick={() => {
          const submittedAt = Date.now();
          onSubmit(selected);
          setLastSubmission({
            ts: submittedAt,
            seq,
            clientId
          });
        }}
        disabled={!selected}
      >
        Submit Answer
      </button>
      {lastSubmission ? (
        <div className="meta-box">
          <p>Local timestamp: {new Date(lastSubmission.ts).toLocaleTimeString()}</p>
          <p>Sequence number: {lastSubmission.seq}</p>
          <p>Client: {lastSubmission.clientId}</p>
        </div>
      ) : null}
    </div>
  );
}

