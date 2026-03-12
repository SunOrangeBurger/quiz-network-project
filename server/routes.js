const express = require("express");
const jwt = require("jsonwebtoken");

function createRoutes({ metrics, getSocketsCount, getLeaderboard, getNetConfig, adminPassword, jwtSecret }) {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({
      ok: true,
      timestamp: Date.now(),
      leaderboardReady: true
    });
  });

  router.get("/metrics", async (req, res) => {
    const leaderboard = await getLeaderboard();
    res.json(
      metrics.snapshot({
        socketsCount: getSocketsCount(),
        dropConfig: getNetConfig(),
        leaderboardSize: leaderboard.length
      })
    );
  });

  router.post("/api/admin/login", (req, res) => {
    const { password } = req.body || {};
    if (!password || password !== adminPassword) {
      res.status(401).json({ error: "Invalid admin password" });
      return;
    }

    const token = jwt.sign({ role: "admin" }, jwtSecret, { expiresIn: "8h" });
    res.json({ token });
  });

  return router;
}

module.exports = { createRoutes };
