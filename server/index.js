require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const db = require("./db");
const { createMetrics } = require("./metrics");
const { createNetSim } = require("./net_sim");
const { createRoutes } = require("./routes");
const { createSocketServer } = require("./socket");

async function start() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      methods: ["GET", "POST"]
    }
  });

  const metrics = createMetrics();
  const netSim = createNetSim(metrics);

  app.use(cors());
  app.use(express.json());

  await db.initDb();

  const socketServer = createSocketServer(io, {
    metrics,
    netSim,
    jwtSecret: process.env.JWT_SECRET || "quiz-demo-secret",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
    redisUrl: process.env.REDIS_URL
  });
  await socketServer.init();

  app.use(
    createRoutes({
      metrics,
      getSocketsCount: () => socketServer.getSocketsCount(),
      getLeaderboard: () => socketServer.getLeaderboard(),
      getNetConfig: () => socketServer.getNetConfig(),
      adminPassword: process.env.ADMIN_PASSWORD || "admin123",
      jwtSecret: process.env.JWT_SECRET || "quiz-demo-secret"
    })
  );

  const port = Number(process.env.PORT || 4000);
  server.listen(port, () => {
    console.log(`Quiz network server listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Server failed to start", error);
  process.exit(1);
});
