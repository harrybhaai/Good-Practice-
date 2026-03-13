# Good-Practice-

**To run:**
```
cd complaint-system
npm install
node server.js
```
Then open `http://localhost:3000`

**What's included:**

- `server.js` — Express backend with all 5 APIs (`/register`, `/login`, `/complaint`, `/complaints`, `/complaint/status`), MySQL2 pool, MongoDB4 client (no mongoose), bcrypt passwords, session auth
- `public/index.html` — Single-page app with Login, Register, Submit Complaint, My Complaints, and Admin View tabs — all in plain HTML/CSS/JS
- `package.json` — dependencies

**MySQL** stores `users` and `complaints` tables (auto-created on startup). **MongoDB** stores `complaint_logs` with description and status update history. The Admin View shows the full status log pulled from MongoDB below each complaint row.
