import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  LogOut,
  Plus,
  ShieldCheck,
  UserRoundCheck,
  XCircle
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "";
const tokenKey = "eta_token";
const userKey = "eta_user";

const initialRequest = {
  title: "",
  description: "",
  priority: "Medium",
  assignedTo: "",
  dueDate: ""
};

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) || "");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(userKey);
    return saved ? JSON.parse(saved) : null;
  });
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, completed: 0 });
  const [activeStatus, setActiveStatus] = useState("All");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canApprove = user?.role === "Admin" || user?.role === "Manager";

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      },
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  async function refreshData() {
    if (!token) return;

    setIsLoading(true);
    setMessage("");

    try {
      const [taskData, summaryData] = await Promise.all([
        api("/api/tasks"),
        api("/api/tasks/summary")
      ]);

      setTasks(taskData);
      setSummary(summaryData);

      if (canApprove) {
        const userData = await api("/api/users");
        setUsers(userData);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, [token, user?.role]);

  function saveSession(nextToken, nextUser) {
    localStorage.setItem(tokenKey, nextToken);
    localStorage.setItem(userKey, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    setToken("");
    setUser(null);
    setTasks([]);
    setUsers([]);
    setMessage("");
  }

  async function handleCreateTask(formValues) {
    setMessage("");

    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...formValues,
          assignedTo: formValues.assignedTo || null
        })
      });

      setMessage("Task request submitted for approval.");
      await refreshData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function decideTask(taskId, decision) {
    const note = decision === "Approved"
      ? "Approved for execution."
      : "Rejected after review.";

    try {
      await api(`/api/tasks/${taskId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note })
      });

      setMessage(`Task ${decision.toLowerCase()}.`);
      await refreshData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function completeTask(taskId) {
    try {
      await api(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Completed" })
      });

      setMessage("Task marked as completed.");
      await refreshData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const filteredTasks = useMemo(() => {
    if (activeStatus === "All") return tasks;
    return tasks.filter((task) => task.status === activeStatus);
  }, [activeStatus, tasks]);

  if (!token || !user) {
    return <LoginScreen onLogin={saveSession} />;
  }

  return (
    <main className="app-shell">
      <Sidebar user={user} onLogout={logout} />

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Enterprise workflow</p>
            <h1>Task Automation</h1>
          </div>
          <button className="ghost-button" onClick={refreshData} type="button">
            Refresh
          </button>
        </header>

        <MetricGrid summary={summary} />

        {message && <p className="message">{message}</p>}

        <section className="content-grid">
          <TaskRequestForm users={users} canAssign={canApprove} onSubmit={handleCreateTask} />

          <section className="panel board-panel">
            <div className="panel-header">
              <div>
                <h2>Requests</h2>
                <p>{isLoading ? "Loading tasks..." : `${filteredTasks.length} visible tasks`}</p>
              </div>
              <StatusTabs activeStatus={activeStatus} setActiveStatus={setActiveStatus} />
            </div>

            <div className="task-list">
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  canApprove={canApprove}
                  onDecision={decideTask}
                  onComplete={completeTask}
                />
              ))}
              {filteredTasks.length === 0 && <p className="empty">No tasks found for this status.</p>}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("admin@enterprise.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  async function login(event) {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed.");
      }

      onLogin(data.token, data.user);
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">
          <ShieldCheck size={34} />
        </div>
        <p className="eyebrow">Enterprise Task Automation</p>
        <h1>Sign in to manage requests</h1>

        <form onSubmit={login}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          <button className="primary-button" type="submit">Sign in</button>
        </form>

        {error && <p className="message error">{error}</p>}

        <div className="demo-logins">
          <strong>Demo accounts</strong>
          <span>Admin: admin@enterprise.com</span>
          <span>Manager: manager@enterprise.com</span>
          <span>Employee: user1@enterprise.com</span>
          <span>Password: password123</span>
        </div>
      </section>
    </main>
  );
}

function Sidebar({ user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="logo-row">
        <div className="logo">EA</div>
        <div>
          <strong>Automation</strong>
          <span>Control desk</span>
        </div>
      </div>

      <div className="profile">
        <UserRoundCheck size={28} />
        <div>
          <strong>{user.name}</strong>
          <span>{user.role} · {user.department}</span>
        </div>
      </div>

      <button className="logout-button" onClick={onLogout} type="button">
        <LogOut size={18} />
        Logout
      </button>
    </aside>
  );
}

function MetricGrid({ summary }) {
  const metrics = [
    { label: "Total", value: summary.total, icon: ClipboardList },
    { label: "Pending", value: summary.pending, icon: Clock3 },
    { label: "Approved", value: summary.approved, icon: CheckCircle2 },
    { label: "Rejected", value: summary.rejected, icon: XCircle }
  ];

  return (
    <section className="metrics">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className="metric" key={metric.label}>
            <Icon size={22} />
            <span>{metric.value}</span>
            <strong>{metric.label}</strong>
          </article>
        );
      })}
    </section>
  );
}

function TaskRequestForm({ users, canAssign, onSubmit }) {
  const [form, setForm] = useState(initialRequest);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(form);
    setForm(initialRequest);
  }

  return (
    <section className="panel request-panel">
      <div className="panel-header">
        <div>
          <h2>New Task Request</h2>
          <p>Submit work for manager approval</p>
        </div>
        <Plus size={22} />
      </div>

      <form onSubmit={submit}>
        <label>
          Title
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="Access approval automation"
            required
          />
        </label>

        <label>
          Description
          <textarea
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Describe the task, reason, and expected output"
            rows="5"
            required
          />
        </label>

        <div className="form-row">
          <label>
            Priority
            <select value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </label>

          <label>
            Due date
            <input value={form.dueDate} onChange={(event) => updateField("dueDate", event.target.value)} type="date" />
          </label>
        </div>

        {canAssign && (
          <label>
            Assign to
            <select value={form.assignedTo} onChange={(event) => updateField("assignedTo", event.target.value)}>
              <option value="">Unassigned</option>
              {users.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name} - {person.role}
                </option>
              ))}
            </select>
          </label>
        )}

        <button className="primary-button" type="submit">Submit request</button>
      </form>
    </section>
  );
}

function StatusTabs({ activeStatus, setActiveStatus }) {
  const statuses = ["All", "Pending", "Approved", "Rejected", "Completed"];

  return (
    <div className="status-tabs">
      {statuses.map((status) => (
        <button
          className={activeStatus === status ? "active" : ""}
          key={status}
          onClick={() => setActiveStatus(status)}
          type="button"
        >
          {status}
        </button>
      ))}
    </div>
  );
}

function TaskCard({ task, canApprove, onDecision, onComplete }) {
  const canDecide = canApprove && task.status === "Pending";
  const canComplete = task.status === "Approved";

  return (
    <article className="task-card">
      <div className="task-card-top">
        <span className={`status-pill status-${task.status.toLowerCase()}`}>{task.status}</span>
        <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
      </div>
      <h3>{task.title}</h3>
      <p>{task.description}</p>

      <dl>
        <div>
          <dt>Requested by</dt>
          <dd>{task.requesterName}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{task.assigneeName || "Unassigned"}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{task.dueDate || "Not set"}</dd>
        </div>
      </dl>

      {task.decisionNote && <p className="decision-note">{task.decisionNote}</p>}

      <div className="task-actions">
        {canDecide && (
          <>
            <button className="approve-button" onClick={() => onDecision(task.id, "Approved")} type="button">
              Approve
            </button>
            <button className="reject-button" onClick={() => onDecision(task.id, "Rejected")} type="button">
              Reject
            </button>
          </>
        )}
        {canComplete && (
          <button className="complete-button" onClick={() => onComplete(task.id)} type="button">
            Mark completed
          </button>
        )}
      </div>
    </article>
  );
}

export default App;
