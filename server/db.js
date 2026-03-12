const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "quiz.sqlite");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS participants (
      client_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      last_latency_ms REAL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      choices_json TEXT NOT NULL,
      correct_answer_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      answer_id TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      latency_ms REAL DEFAULT 0,
      seq INTEGER NOT NULL,
      submitted_at INTEGER NOT NULL
    )
  `);

  const row = await get("SELECT COUNT(*) AS count FROM questions");
  if (!row || row.count === 0) {
    const now = Date.now();
    const seedQuestions = [
      {
        text: "Which layer is responsible for end-to-end delivery?",
        choices: ["Physical", "Data Link", "Transport", "Network"],
        correctAnswerId: "2"
      },
      {
        text: "Which metric measures variation in packet delay?",
        choices: ["Bandwidth", "Jitter", "Checksum", "TTL"],
        correctAnswerId: "1"
      },
      {
        text: "What does RTT stand for?",
        choices: ["Real-Time Transfer", "Round Trip Time", "Route Table Trace", "Remote Tunnel Timing"],
        correctAnswerId: "1"
      }
    ];

    for (const question of seedQuestions) {
      await run(
        "INSERT INTO questions (text, choices_json, correct_answer_id, created_at) VALUES (?, ?, ?, ?)",
        [question.text, JSON.stringify(question.choices), question.correctAnswerId, now]
      );
    }
  }
}

async function upsertParticipant(clientId, name) {
  const now = Date.now();
  await run(
    `
      INSERT INTO participants (client_id, name, joined_at)
      VALUES (?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET
      name = excluded.name
    `,
    [clientId, name, now]
  );
}

async function updateParticipantLatency(clientId, latencyMs) {
  await run("UPDATE participants SET last_latency_ms = ? WHERE client_id = ?", [
    latencyMs,
    clientId
  ]);
}

async function listQuestions() {
  const rows = await all(
    "SELECT id, text, choices_json AS choicesJson, correct_answer_id AS correctAnswerId FROM questions ORDER BY id ASC"
  );
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    choices: JSON.parse(row.choicesJson),
    correctAnswerId: row.correctAnswerId
  }));
}

async function createQuestion({ text, choices, correctAnswerId }) {
  const result = await run(
    "INSERT INTO questions (text, choices_json, correct_answer_id, created_at) VALUES (?, ?, ?, ?)",
    [text, JSON.stringify(choices), String(correctAnswerId), Date.now()]
  );
  return {
    id: result.id,
    text,
    choices,
    correctAnswerId: String(correctAnswerId)
  };
}

async function saveSubmission({ clientId, questionId, answerId, isCorrect, seq, latencyMs }) {
  await run(
    `
      INSERT INTO submissions (client_id, question_id, answer_id, is_correct, latency_ms, seq, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [clientId, questionId, String(answerId), isCorrect ? 1 : 0, latencyMs || 0, seq, Date.now()]
  );
}

module.exports = {
  initDb,
  upsertParticipant,
  updateParticipantLatency,
  listQuestions,
  createQuestion,
  saveSubmission
};
