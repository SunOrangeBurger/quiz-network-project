import React from "react";
function latencyClass(latency) {
  if (latency < 100) {
    return "latency-good";
  }
  if (latency < 250) {
    return "latency-warn";
  }
  return "latency-bad";
}

export default function Leaderboard({ entries }) {
  return (
    <div>
      <div className="section-head">
        <h2>Leaderboard</h2>
        <span className="badge">{entries.length} clients</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>Score</th>
            <th>Latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.clientId}>
              <td>{index + 1}</td>
              <td>{entry.name}</td>
              <td>{entry.score}</td>
              <td className={latencyClass(entry.latency)}>{entry.latency}</td>
            </tr>
          ))}
          {!entries.length ? (
            <tr>
              <td colSpan="4" className="subtle">
                No scores yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

