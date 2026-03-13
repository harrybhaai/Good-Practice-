const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'complaintsecret',
  resave: false,
  saveUninitialized: false
}));

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'complaint_db'
};

const MONGO_URI = 'mongodb://localhost:27017';
const MONGO_DB = 'complaint_db';

let db;
let mongoDb;

async function init() {
  db = await mysql.createPool(MYSQL_CONFIG);

  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    password VARCHAR(255)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS complaints (
    complaint_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    title VARCHAR(200),
    category VARCHAR(100),
    priority VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Pending',
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  mongoDb = mongoClient.db(MONGO_DB);
}

app.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) {
    return res.json({ success: false, message: 'All fields required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.execute('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)', [name, email, phone, hash]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Email already exists' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length === 0) return res.json({ success: false, message: 'User not found' });
  const valid = await bcrypt.compare(password, rows[0].password);
  if (!valid) return res.json({ success: false, message: 'Invalid password' });
  req.session.user = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
  res.json({ success: true, user: req.session.user });
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/me', (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

app.post('/complaint', async (req, res) => {
  if (!req.session.user) return res.json({ success: false, message: 'Not logged in' });
  const { title, category, description, priority } = req.body;
  if (!title || !category || !description || !priority) {
    return res.json({ success: false, message: 'All fields required' });
  }
  const [result] = await db.execute(
    'INSERT INTO complaints (user_id, title, category, priority, status) VALUES (?, ?, ?, ?, ?)',
    [req.session.user.id, title, category, priority, 'Pending']
  );
  const complaintId = result.insertId;
  await mongoDb.collection('complaint_logs').insertOne({
    complaint_id: complaintId,
    description: description,
    updates: [{ status: 'Pending', date: new Date().toISOString().split('T')[0] }]
  });
  res.json({ success: true });
});

app.get('/complaints', async (req, res) => {
  if (!req.session.user) return res.json({ success: false, message: 'Not logged in' });
  let rows;
  if (req.query.admin === 'true') {
    [rows] = await db.execute(
      'SELECT c.*, u.name as user_name, u.email as user_email FROM complaints c JOIN users u ON c.user_id = u.id ORDER BY c.complaint_id DESC'
    );
  } else {
    [rows] = await db.execute(
      'SELECT * FROM complaints WHERE user_id = ? ORDER BY complaint_id DESC',
      [req.session.user.id]
    );
  }
  const logs = await mongoDb.collection('complaint_logs').find({}).toArray();
  const logsMap = {};
  logs.forEach(l => { logsMap[l.complaint_id] = l; });
  const data = rows.map(r => ({ ...r, log: logsMap[r.complaint_id] || null }));
  res.json({ success: true, complaints: data });
});

app.put('/complaint/status', async (req, res) => {
  if (!req.session.user) return res.json({ success: false, message: 'Not logged in' });
  const { complaint_id, status } = req.body;
  await db.execute('UPDATE complaints SET status = ? WHERE complaint_id = ?', [status, complaint_id]);
  await mongoDb.collection('complaint_logs').updateOne(
    { complaint_id: parseInt(complaint_id) },
    { $push: { updates: { status, date: new Date().toISOString().split('T')[0] } } }
  );
  res.json({ success: true });
});

init().then(() => {
  app.listen(3000, () => console.log('Server running on http://localhost:3000'));
}).catch(console.error);
