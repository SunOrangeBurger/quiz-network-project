# Multi-Client Online Quiz System with Real-Time Ranking

Version 1 of a computer networks mini-project that turns a quiz app into a visible networking lab. The system uses Socket.IO for synchronized quiz delivery, implements application-layer reliability over WebSockets, measures live RTT and jitter, simulates packet loss and latency, and shows the effect of those network conditions in the UI and load tests.

## Architecture

The repository is split into three packages:

- `server/`: Express + Socket.IO server, quiz coordination, metrics, reliability acknowledgements, SQLite persistence, Redis leaderboard fallback.
- `client/`: React + Vite frontend with separate user and admin interfaces:
  - **User Page** (`/`): Clean quiz interface showing only timer, questions, and answer options
  - **Admin Page** (`/admin`): Dashboard with live leaderboard, per-user latency monitoring, and quiz controls
- `loadtest/`: Simulated Socket.IO clients and a small stress harness for throughput and RTT checks.

### Architecture diagram explanation

1. React clients connect to the Node.js server using Socket.IO.
2. Each client sends sequence-numbered JSON messages such as `join_quiz`, `answer`, and `client_ping`.
3. The server validates messages, applies network simulation on inbound/outbound traffic, stores quiz data in SQLite, and updates the leaderboard in Redis or in-memory fallback.
4. The server broadcasts `question`, `leaderboard`, `server_pong`, `ack`, and `net_event` messages to keep all clients synchronized.
5. The frontend computes RTT, jitter, retransmissions, packet-loss estimates, and displays them in the Network Inspector.
6. Load-test clients simulate many users to measure concurrent behavior.

## Networking Concepts Demonstrated

- WebSocket-style full duplex communication with Socket.IO
- Multi-client synchronization of quiz state and leaderboards
- Application-layer reliability using sequence numbers, ACKs, retransmission timeouts, and unacknowledged queues
- Application-level RTT and jitter measurement using `client_ping` / `server_pong`
- Packet loss and latency simulation with visible retransmissions and delayed leaderboard updates
- Server metrics for sockets, throughput, drops, retransmits, and RTT

## User Interface

### User Page (`/`)
The user interface provides a clean, distraction-free quiz experience:
- Simple join screen with name input
- Timer display showing remaining time for each question
- Question text and multiple choice options
- Submit button with visual feedback
- No leaderboard or admin controls visible

### Admin Dashboard (`/admin`)
The admin interface provides comprehensive quiz management and monitoring:
- Authentication required (default password: `admin123`)
- Live leaderboard with real-time score updates
- Per-user latency monitoring with color-coded indicators:
  - Green: < 100ms (good)
  - Yellow: 100-250ms (warning)
  - Red: > 250ms (poor)
- Quiz control buttons (Start, Next Question, Stop)
- Connected clients list
- Question creation interface

## Repository Layout

```text
.
|-- README.md
|-- package.json
|-- client/
|   |-- package.json
|   |-- index.html
|   |-- vite.config.js
|   `-- src/
|       |-- main.jsx
|       |-- App.jsx
|       |-- styles.css
|       |-- pages/
|       |   |-- UserPage.jsx
|       |   `-- AdminPage.jsx
|       `-- components/
|           |-- Admin.jsx
|           `-- Leaderboard.jsx
|-- server/
|   |-- package.json
|   |-- index.js
|   |-- socket.js
|   |-- routes.js
|   `-- db.js
`-- loadtest/
    |-- package.json
    |-- loadtest.js
    `-- sim_clients.js
```

## Run Instructions

### Install all workspaces

```bash
npm install
```

### Run server and client together from the repo root

```bash
npm run dev
```

### Run individually

```bash
cd server
npm install
npm run dev
```

```bash
cd client
npm install
npm run dev
```

### Access the application

- **User Interface**: http://localhost:5173/
- **Admin Dashboard**: http://localhost:5173/admin

### Production-style start

```bash
npm start
```

## Environment Variables

Create a `.env` file inside `server/` if you want to override defaults:

```env
PORT=4000
JWT_SECRET=quiz-demo-secret
ADMIN_PASSWORD=admin123
REDIS_URL=redis://127.0.0.1:6379
CLIENT_ORIGIN=http://localhost:5173
```

If Redis is unavailable, the server automatically falls back to in-memory leaderboard storage.

## HTTP Endpoints

- `GET /health`
- `GET /metrics`
- `POST /api/admin/login`

Example metrics payload:

```json
{
  "uptime": 123.45,
  "socketsCount": 8,
  "avgRTT_ms": 88.2,
  "messagesPerSecond": 17.3,
  "dropRate": 0.04,
  "retransmits": 12
}
```

## Load Testing

Run the included load test after starting the server:

```bash
cd loadtest
npm install
npm start -- --clients 100 --duration 15000
```

The script prints average RTT, successful submissions, failed submissions, message throughput, and the server metrics snapshot.

## Notes

- The project is intentionally instrumented for learning, so networking code is marked with comments such as `// NETWORK: retransmission logic`.
- Leaderboard latency coloring in the UI helps visualize slower clients.
- Admin controls let you change simulated packet loss and delay while clients are connected.
