import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function NetInspector({ clientId, rows, messageLog, rttSamples, events }) {
  const chartData = {
    labels: rttSamples.map((_, index) => `${index + 1}`),
    datasets: [
      {
        label: "Latency (ms)",
        data: rttSamples,
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.18)",
        tension: 0.28
      }
    ]
  };

  return (
    <div>
      <div className="section-head">
        <h2>Network Inspector</h2>
        <span className="badge">Client {clientId}</span>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>clientId</th>
            <th>Latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.clientId}>
              <td>{row.clientId}</td>
              <td>{row.latency}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="chart-card">
        <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
      </div>

      <div className="inspector-grid">
        <div>
          <h3>Message Log</h3>
          <div className="log-list">
            {messageLog.map((entry, index) => (
              <pre key={index}>
                [{entry.ts}] {entry.direction} {JSON.stringify(entry.payload)}
              </pre>
            ))}
          </div>
        </div>

        <div>
          <h3>Status</h3>
          <div className="meta-box">
            <p>Recent latency samples: {rttSamples.length}</p>
            <p>Current client: {clientId}</p>
          </div>
          <h3>Events</h3>
          <ul className="event-list">
            {events.map((event, index) => (
              <li key={index}>{event}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
