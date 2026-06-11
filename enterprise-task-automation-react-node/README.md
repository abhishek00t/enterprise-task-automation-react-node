# Enterprise Task Automation

A complete React + Node.js + SQLite project for internal task requests and approvals.

## Features

- Login with demo users
- 50 seeded employee accounts
- Role-based access for `Admin`, `Manager`, and `Employee`
- Employees can request tasks
- Managers/Admins can approve or reject pending requests
- Users can track Pending, Approved, Rejected, and Completed tasks
- SQLite database stored locally
- Works on macOS and Windows

## Tech Stack

- React
- Vite
- Node.js
- Express
- SQLite
- JWT authentication

## Setup

Install Node.js 18 or newer.

Then run:

```bash
npm run install:all
```

Start the full app:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

API runs at:

```text
http://localhost:4000
```

## Demo Login

Admin:

```text
email: admin@enterprise.com
password: password123
```

Manager:

```text
email: manager@enterprise.com
password: password123
```

Employee:

```text
email: user1@enterprise.com
password: password123
```

More users are available from:

```text
user1@enterprise.com
user2@enterprise.com
...
user50@enterprise.com
```

All demo passwords:

```text
password123
```

## Project Structure

```text
enterprise-task-automation/
  client/
    src/
      App.jsx
      main.jsx
      styles.css
  server/
    src/
      auth.js
      db.js
      server.js
    data/
      automation.db
```

## Notes

- The SQLite database is created automatically when the backend starts.
- Delete `server/data/automation.db` if you want to reset the data.
- For production, replace the demo JWT secret with a strong value in `.env`.

