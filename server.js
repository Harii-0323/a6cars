require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bodyParser = require('body-parser');

const app = express();

// ===== Middleware =====
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== CORS (Allow Netlify frontend) =====
app.use(cors({
  origin: [
    'https://lustrous-daffodil-e493e1.netlify.app',
    'http://localhost:5173' // for local testing
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

// ===== PostgreSQL Database Connection =====
const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false } // required by Render PostgreSQL
});

db.connect()
  .then(() => console.log('✅ Connected to PostgreSQL database'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

// ===== Register API =====
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Please fill all required fields' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO customers (name, email, phone, password)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    await db.query(sql, [name, email, phone, hashedPassword]);
    res.json({ message: 'Registered successfully!' });

  } catch (error) {
    if (error.code === '23505') { // duplicate email
      return res.status(400).json({ message: 'Email already registered' });
    }
    console.error('Register Error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ===== Login API =====
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const sql = 'SELECT * FROM customers WHERE email = $1';
  try {
    const result = await db.query(sql, [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ message: 'User not found' });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: 'Invalid password' });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '2h' }
    );

  // Return token plus minimal user info so frontends can store customer id/name locally
  const resp = { message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } };
  console.log('Login response:', resp);
  res.json(resp);
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Admin Login =====
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;

  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '2h',
    });
    return res.json({ message: 'Admin logged in', token });
  }
  res.status(401).json({ message: 'Invalid admin credentials' });
});

// ===== Middleware to verify admin =====
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(403).json({ message: 'Unauthorized access' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Not an admin' });
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token' });
  }
}

// ===== Cars Management (Admin) =====
app.post('/api/admin/addcar', requireAdmin, async (req, res) => {
  try {
    const { brand, model, year, daily_rate, location } = req.body;
    const sql = `
      INSERT INTO cars (brand, model, year, daily_rate, location)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await db.query(sql, [brand, model, year, daily_rate, location]);
    res.json({ message: 'Car added successfully' });
  } catch (err) {
    console.error('Add Car Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Get All Cars =====
app.get('/api/cars', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cars');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Booking API =====
app.post('/api/book', async (req, res) => {
  const { car_id, customer_id, start_date, end_date } = req.body;
  const sql = `
    INSERT INTO bookings (car_id, customer_id, start_date, end_date)
    VALUES ($1, $2, $3, $4)
  `;
  try {
    await db.query(sql, [car_id, customer_id, start_date, end_date]);
    res.json({ message: 'Booking successful!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== QR Payment Token =====
app.post('/api/payment', (req, res) => {
  const { booking_id } = req.body;
  const paymentToken = crypto.randomBytes(16).toString('hex');
  res.json({ message: 'Payment successful!', paymentToken });
});

// ===== Default Route =====
app.get('/', (req, res) => {
  res.send('🚗 A6 Cars Rental API (PostgreSQL) is running successfully!');
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
