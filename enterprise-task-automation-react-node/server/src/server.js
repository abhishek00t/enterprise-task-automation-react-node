require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { db, initDatabase } = require("./db");
const { createToken, requireAuth, requireRole } = require("./auth");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "127.0.0.1";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

initDatabase();

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department
  };
}

function taskSelectSql(whereClause = "") {
  return `
    SELECT
      tasks.id,
      tasks.title,
      tasks.description,
      tasks.priority,
      tasks.status,
      tasks.due_date AS dueDate,
      tasks.decision_note AS decisionNote,
      tasks.created_at AS createdAt,
      tasks.updated_at AS updatedAt,
      requester.id AS requesterId,
      requester.name AS requesterName,
      requester.department AS requesterDepartment,
      assignee.id AS assigneeId,
      assignee.name AS assigneeName,
      approver.id AS approverId,
      approver.name AS approverName
    FROM tasks
    JOIN users requester ON requester.id = tasks.requested_by
    LEFT JOIN users assignee ON assignee.id = tasks.assigned_to
    LEFT JOIN users approver ON approver.id = tasks.approved_by
    ${whereClause}
    ORDER BY tasks.created_at DESC
  `;
}

function canSeeTask(user, task) {
  if (user.role === "Admin" || user.role === "Manager") {
    return true;
  }

  return task.requesterId === user.id || task.assigneeId === user.id;
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "Enterprise Task Automation API" });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  return res.json({
    token: createToken(user),
    user: publicUser(user)
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json(publicUser(user));
});

app.get("/api/users", requireAuth, requireRole("Admin", "Manager"), (req, res) => {
  const users = db
    .prepare("SELECT id, name, email, role, department FROM users ORDER BY role, name")
    .all();

  res.json(users);
});

app.get("/api/tasks", requireAuth, (req, res) => {
  const tasks = db.prepare(taskSelectSql()).all();
  const visibleTasks = tasks.filter((task) => canSeeTask(req.user, task));
  res.json(visibleTasks);
});

app.get("/api/tasks/summary", requireAuth, (req, res) => {
  const tasks = db.prepare(taskSelectSql()).all().filter((task) => canSeeTask(req.user, task));
  const summary = {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "Pending").length,
    approved: tasks.filter((task) => task.status === "Approved").length,
    rejected: tasks.filter((task) => task.status === "Rejected").length,
    completed: tasks.filter((task) => task.status === "Completed").length
  };

  res.json(summary);
});

app.post("/api/tasks", requireAuth, (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const priority = String(req.body.priority || "Medium").trim();
  const assignedTo = req.body.assignedTo ? Number(req.body.assignedTo) : null;
  const dueDate = String(req.body.dueDate || "").trim() || null;

  if (!title || !description) {
    return res.status(400).json({ error: "Title and description are required." });
  }

  if (!["Low", "Medium", "High", "Critical"].includes(priority)) {
    return res.status(400).json({ error: "Priority is invalid." });
  }

  if (assignedTo) {
    const assignee = db.prepare("SELECT id FROM users WHERE id = ?").get(assignedTo);

    if (!assignee) {
      return res.status(400).json({ error: "Assigned user does not exist." });
    }
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, priority, status, requested_by, assigned_to, due_date)
    VALUES (?, ?, ?, 'Pending', ?, ?, ?)
  `).run(title, description, priority, req.user.id, assignedTo, dueDate);

  const task = db.prepare(taskSelectSql("WHERE tasks.id = ?")).get(result.lastInsertRowid);
  return res.status(201).json(task);
});

app.patch("/api/tasks/:id/decision", requireAuth, requireRole("Admin", "Manager"), (req, res) => {
  const taskId = Number(req.params.id);
  const decision = String(req.body.decision || "").trim();
  const note = String(req.body.note || "").trim() || null;

  if (!["Approved", "Rejected"].includes(decision)) {
    return res.status(400).json({ error: "Decision must be Approved or Rejected." });
  }

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);

  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (task.status !== "Pending") {
    return res.status(400).json({ error: "Only pending tasks can be approved or rejected." });
  }

  db.prepare(`
    UPDATE tasks
    SET status = ?, approved_by = ?, decision_note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision, req.user.id, note, taskId);

  const updatedTask = db.prepare(taskSelectSql("WHERE tasks.id = ?")).get(taskId);
  return res.json(updatedTask);
});

app.patch("/api/tasks/:id/status", requireAuth, (req, res) => {
  const taskId = Number(req.params.id);
  const status = String(req.body.status || "").trim();

  if (!["Completed"].includes(status)) {
    return res.status(400).json({ error: "Only Completed status can be set here." });
  }

  const task = db.prepare(taskSelectSql("WHERE tasks.id = ?")).get(taskId);

  if (!task) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (!canSeeTask(req.user, task)) {
    return res.status(403).json({ error: "You do not have permission for this task." });
  }

  if (task.status !== "Approved") {
    return res.status(400).json({ error: "Only approved tasks can be completed." });
  }

  db.prepare("UPDATE tasks SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);

  const updatedTask = db.prepare(taskSelectSql("WHERE tasks.id = ?")).get(taskId);
  return res.json(updatedTask);
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.listen(PORT, HOST, () => {
  console.log(`Enterprise Task Automation API running on http://${HOST}:${PORT}`);
});
