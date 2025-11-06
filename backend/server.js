require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://root:password@localhost:5432/a6cars_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ✅ Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg') {
      return cb(new Error('Only .jpg or .jpeg allowed'));
    }
    cb(null, true);
  }
});

// ============================================================
// 🧩 Admin and Security
// ============================================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karikeharikrishna@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Anu';
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey123';

function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ message: 'Missing token' });
  const token = header.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.admin = decoded;
    next();
  });
}

// ============================================================
// 🏠 Root
// ============================================================
app.get('/', (req, res) => {
  res.send('🚗 A6 Cars API running successfully!');
});

// ============================================================
// 👤 Customer Registration & Login
// ============================================================
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ message: 'All fields required' });

  try {
    const existing = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (existing.rows.length) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO customers (name, email, phone, password) VALUES ($1,$2,$3,$4)', [
      name, email, phone, hashed
    ]);
    res.json({ message: 'Registration successful!' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (!result.rows.length) return res.status(400).json({ message: 'Invalid credentials' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ message: 'Login successful', token, customer_id: user.id });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// ============================================================
// 👨‍💼 Admin Routes
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
    return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, message: 'Admin login successful' });
});

// Add Car
app.post('/api/admin/addcar', verifyToken, upload.array('images', 10), async (req, res) => {
  const client = await pool.connect();
  try {
    const { brand, model, year, daily_rate, location } = req.body;
    if (!brand || !model || !year || !daily_rate || !location)
      return res.status(400).json({ message: 'Missing required fields' });

    await client.query('BEGIN');
    const insertCar = await client.query(
      'INSERT INTO cars (brand, model, year, daily_rate, location) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [brand, model, year, daily_rate, location]
    );
    const carId = insertCar.rows[0].id;

    const images = (req.files || []).map(file => '/uploads/' + file.filename);
    for (const img of images) {
      await client.query('INSERT INTO car_images (car_id, image_url) VALUES ($1,$2)', [carId, img]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Car added successfully', car_id: carId, images });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Failed to add car' });
  } finally {
    client.release();
  }
});

// Get all cars
app.get('/api/cars', async (req, res) => {
  try {
    const carsRes = await pool.query('SELECT * FROM cars ORDER BY id DESC');
    const cars = carsRes.rows;

    for (let car of cars) {
      const imgs = await pool.query('SELECT image_url FROM car_images WHERE car_id=$1', [car.id]);
      car.images = imgs.rows.map(r => r.image_url);
    }

    res.json(cars);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch cars' });
  }
});

// Delete car
app.post('/api/deletecar', verifyToken, async (req, res) => {
  try {
    const { car_id } = req.body;
    if (!car_id) return res.status(400).json({ message: 'Missing car_id' });
    await pool.query('DELETE FROM cars WHERE id=$1', [car_id]);
    res.json({ message: 'Car deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Delete failed' });
  }
});

// ============================================================
// 🚗 Bookings & Payments
// ============================================================

// Create booking
app.post('/api/book', async (req, res) => {
  const { car_id, customer_id, start_date, end_date, amount } = req.body;

  if (!car_id || !customer_id || !start_date || !end_date || !amount)
    return res.status(400).json({ message: 'Missing booking details' });

  try {
    const insert = await pool.query(
      'INSERT INTO bookings (car_id, customer_id, start_date, end_date, amount, paid, verified) VALUES ($1,$2,$3,$4,$5,false,false) RETURNING id',
      [car_id, customer_id, start_date, end_date, amount]
    );
    const booking_id = insert.rows[0].id;

    await pool.query(
      'INSERT INTO payments (booking_id, customer_id, amount, status) VALUES ($1,$2,$3,$4)',
      [booking_id, customer_id, amount, 'pending']
    );

    res.json({ message: 'Booking created successfully', booking_id });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ message: 'Failed to create booking' });
  }
});

// Fetch bookings per car (Admin)
app.get('/api/car-bookings/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, c.name, c.email FROM bookings b 
       JOIN customers c ON b.customer_id=c.id 
       WHERE b.car_id=$1 ORDER BY b.id DESC`, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
});

// Transactions for admin
app.get('/api/admin/transactions', verifyToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const count = await pool.query('SELECT COUNT(*) FROM bookings');
    const total = parseInt(count.rows[0].count);

    const q = `
      SELECT b.id as payment_id, b.start_date, b.end_date, b.amount, b.paid, b.verified,
             cu.name, cu.email, ca.brand, ca.model
      FROM bookings b
      JOIN customers cu ON b.customer_id = cu.id
      JOIN cars ca ON b.car_id = ca.id
      ORDER BY b.id DESC
      LIMIT $1 OFFSET $2`;

    const result = await pool.query(q, [pageSize, offset]);
    res.json({ page: parseInt(page), pageSize: parseInt(pageSize), total, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load transactions' });
  }
});

// ============================================================
// 💳 Dynamic QR Generation (UPI Payments)
// ============================================================
app.get('/api/payment-qr', async (req, res) => {
  try {
    const { amount, note } = req.query;
    if (!amount) return res.status(400).json({ message: 'Amount required' });

    const upiId = '8179134484@pthdfc';
    const name = 'A6 Cars Rentals';
    const txnNote = note || 'Car Booking Payment';

    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(txnNote)}`;
    const qrDataUrl = await QRCode.toDataURL(upiLink);

    res.json({ upiLink, qrImage: qrDataUrl, message: `QR generated for ₹${amount}` });
  } catch (err) {
    console.error('QR generation failed:', err);
    res.status(500).json({ message: 'Failed to generate QR' });
  }
});

// ============================================================
// 🖥️ Start Server
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
