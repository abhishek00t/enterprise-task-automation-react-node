const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");

let dbPath;
if (process.env.VERCEL) {
  dbPath = "/tmp/automation.db";
} else {
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  dbPath = path.join(dataDir, "automation.db");
}

const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Admin', 'Manager', 'Employee')),
      department TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')),
      status TEXT NOT NULL CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
      requested_by INTEGER NOT NULL,
      assigned_to INTEGER,
      approved_by INTEGER,
      due_date TEXT,
      decision_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );
  `);

  const row = db.prepare("SELECT COUNT(*) AS total FROM users").get();

  if (row.total === 0) {
    seedUsers();
    seedTasks();
  }
}

function seedUsers() {
  const passwordHash = bcrypt.hashSync("password123", 10);
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, department)
    VALUES (@name, @email, @passwordHash, @role, @department)
  `);

  db.exec("BEGIN");
  try {
    insertUser.run({ name: "System Admin", email: "admin@enterprise.com", passwordHash, role: "Admin", department: "Operations" });
    insertUser.run({ name: "Task Manager", email: "manager@enterprise.com", passwordHash, role: "Manager", department: "Delivery" });

    const departments = ["Finance", "HR", "IT", "Sales", "Support", "Delivery"];
    for (let index = 1; index <= 50; index += 1) {
      insertUser.run({
        name: `Employee ${index}`,
        email: `user${index}@enterprise.com`,
        passwordHash,
        role: "Employee",
        department: departments[index % departments.length]
      });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function seedTasks() {
  const manager = db.prepare("SELECT id FROM users WHERE email = ?").get("manager@enterprise.com");
  const employeeOne = db.prepare("SELECT id FROM users WHERE email = ?").get("user1@enterprise.com");
  const employeeTwo = db.prepare("SELECT id FROM users WHERE email = ?").get("user2@enterprise.com");

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      title, description, priority, status,
      requested_by, assigned_to, approved_by, due_date, decision_note
    )
    VALUES (
      @title, @description, @priority, @status,
      @requestedBy, @assignedTo, @approvedBy, @dueDate, @decisionNote
    )
  `);

  insertTask.run({
    title: "Prepare monthly automation report",
    description: "Collect task completion data and prepare the monthly automation summary.",
    priority: "High",
    status: "Pending",
    requestedBy: employeeOne.id,
    assignedTo: manager.id,
    approvedBy: null,
    dueDate: "2026-06-30",
    decisionNote: null
  });

  insertTask.run({
    title: "Update onboarding checklist",
    description: "Review the employee onboarding task checklist and remove duplicate steps.",
    priority: "Medium",
    status: "Approved",
    requestedBy: employeeTwo.id,
    assignedTo: manager.id,
    approvedBy: manager.id,
    dueDate: "2026-06-25",
    decisionNote: "Approved for this sprint."
  });
}

module.exports = { db, initDatabase };
