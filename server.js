const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'users.json');

// ---------- Tiny JSON file "database" ----------
// Fine for small numbers of users. For bigger scale, swap this out for a
// real database (Postgres, MySQL, etc.) later without changing the routes.

function loadUsers() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function findUserByEmail(email) {
  const users = loadUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

// ---------- Middleware ----------

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Railway (and most hosts) put the app behind a reverse proxy that
// terminates HTTPS. Without this, Express can't tell the connection is
// actually secure, so express-session silently fails to persist the
// login cookie — this is what was causing "login succeeds but /api/me
// still says unauthorized".
app.set('trust proxy', 1);

app.use(session({
  // IMPORTANT: change this secret before deploying for real.
  secret: process.env.SESSION_SECRET || 'change-this-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production'
  }
}));

function requireLogin(req, res, next) {
  if (!req.session.userEmail) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// ---------- Auth routes ----------

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'An account with that email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ email, passwordHash, apiKey: '' });
  saveUsers(users);
  req.session.userEmail = email;
  res.json({ email });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(400).json({ error: 'Incorrect email or password.' });
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(400).json({ error: 'Incorrect email or password.' });
  }
  req.session.userEmail = user.email;
  res.json({ email: user.email });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireLogin, (req, res) => {
  const user = findUserByEmail(req.session.userEmail);
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ email: user.email, hasApiKey: Boolean(user.apiKey) });
});

// ---------- API key settings ----------

app.post('/api/settings/api-key', requireLogin, (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'API key cannot be empty.' });
  }
  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === req.session.userEmail.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  user.apiKey = apiKey.trim();
  saveUsers(users);
  res.json({ ok: true });
});

// ---------- Anthropic proxy ----------
// The browser never sees any user's API key. It sends the message content
// to this route, the server attaches the logged-in user's own key, calls
// Anthropic, and passes the response back.

app.post('/api/generate', requireLogin, async (req, res) => {
  const user = findUserByEmail(req.session.userEmail);
  if (!user || !user.apiKey) {
    return res.status(400).json({ error: 'Add your Anthropic API key in Settings first.' });
  }
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Missing content to send to the model.' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const message = (data && data.error && data.error.message) || ('Anthropic API error ' + response.status);
      return res.status(response.status).json({ error: message });
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reach Anthropic. Try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`BotCake spiel generator running on http://localhost:${PORT}`);
});
