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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// 🧩 PostgreSQL Connection
// ============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://root:password@localhost:5432/a6cars_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ============================================================
// 🧩 Multer Config (for car image uploads)
// ============================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ============================================================
// 👤 USER ROUTES
// ============================================================

// ✅ Register new customer
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ message: 'All fields are required.' });

  try {
    const existing = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (existing.rows.length)
      return res.status(400).json({ message: 'Email already registered.' });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO customers (name, email, phone, password) VALUES ($1,$2,$3,$4)',
      [name, email, phone, hashed]
    );

    res.json({ message: 'Registration successful!' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ✅ Login customer
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (!result.rows.length)
      return res.status(400).json({ message: 'Invalid email or password.' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id, email: user.email }, 'secretkey123', { expiresIn: '2h' });
    res.json({
      message: 'Login successful',
      token,
      customer_id: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed.' });
  }
});

// ============================================================
// 🧩 ADMIN ROUTES
// ============================================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karikeharikrishna@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Anu';
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey123';

function verifyAdmin(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ message: 'Missing token' });
  const token = header.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.admin = decoded;
    next();
  });
}

// ✅ Admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
    return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ message: 'Admin login successful', token });
});

// ✅ Add new car
app.post('/api/admin/addcar', verifyAdmin, upload.array('images', 10), async (req, res) => {
  const { brand, model, year, daily_rate, location } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertCar = await client.query(
      'INSERT INTO cars (brand, model, year, daily_rate, location) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [brand, model, year, daily_rate, location]
    );
    const carId = insertCar.rows[0].id;

    for (const file of req.files) {
      await client.query('INSERT INTO car_images (car_id, image_url) VALUES ($1,$2)', [
        carId,
        '/uploads/' + file.filename,
      ]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Car added successfully', car_id: carId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add car error:', err);
    res.status(500).json({ message: 'Failed to add car.' });
  } finally {
    client.release();
  }
});

// ============================================================
// 🚗 BOOKINGS & PAYMENTS
// ============================================================

// ✅ Get all available cars
app.get('/api/cars', async (req, res) => {
  try {
    const cars = await pool.query('SELECT * FROM cars ORDER BY id DESC');
    for (let car of cars.rows) {
      const imgs = await pool.query('SELECT image_url FROM car_images WHERE car_id=$1', [car.id]);
      car.images = imgs.rows.map(r => r.image_url);
    }
    res.json(cars.rows);
  } catch (err) {
    console.error('Fetch cars error:', err);
    res.status(500).json({ message: 'Error fetching cars.' });
  }
});

// ✅ Book a car
app.post('/api/book', async (req, res) => {
  const { car_id, customer_id, start_date, end_date } = req.body;
  if (!car_id || !customer_id || !start_date || !end_date)
    return res.status(400).json({ message: 'Missing booking info.' });

  const client = await pool.connect();
  try {
    // ✅ Ensure customer exists (prevent foreign key error)
    const custCheck = await client.query('SELECT id FROM customers WHERE id=$1', [customer_id]);
    if (!custCheck.rows.length)
      return res.status(400).json({ message: 'Invalid customer ID.' });

    const carRes = await client.query('SELECT daily_rate FROM cars WHERE id=$1', [car_id]);
    if (!carRes.rows.length) return res.status(404).json({ message: 'Car not found.' });

    const rate = parseFloat(carRes.rows[0].daily_rate);
    const days = Math.max(1, Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)));
    const total = rate * days;

    await client.query('BEGIN');
    const booking = await client.query(
      `INSERT INTO bookings (car_id, customer_id, start_date, end_date, amount, status, paid, verified)
       VALUES ($1,$2,$3,$4,$5,'pending',false,false) RETURNING id`,
      [car_id, customer_id, start_date, end_date, total]
    );
    const bookingId = booking.rows[0].id;

    const upiString = `upi://pay?pa=8179134484@pthdfc&pn=A6Cars&am=${total}&tn=Booking%20${bookingId}`;
    const paymentQR = await QRCode.toDataURL(upiString);

    await client.query(
      `INSERT INTO payments (booking_id, amount, upi_id, qr_code, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [bookingId, total, '8179134484@pthdfc', paymentQR]
    );

    await client.query('COMMIT');
    res.json({ message: 'Booking created successfully', booking_id: bookingId, total, payment_qr: paymentQR });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Booking error:', err);
    res.status(500).json({ message: 'Booking failed.' });
  } finally {
    client.release();
  }
});

// ✅ Confirm payment & generate collection QR
app.post('/api/payment/confirm', async (req, res) => {
  const { booking_id } = req.body;
  const client = await pool.connect();
  try {
    const booking = await client.query(
      `SELECT b.*, c.name, ca.brand, ca.model, ca.location
       FROM bookings b
       JOIN customers c ON b.customer_id=c.id
       JOIN cars ca ON b.car_id=ca.id
       WHERE b.id=$1`, [booking_id]
    );
    if (!booking.rows.length) return res.status(404).json({ message: 'Booking not found' });

    const data = booking.rows[0];
    const qrData = {
      booking_id,
      car: `${data.brand} ${data.model}`,
      customer: data.name,
      location: data.location
    };
    const collectionQR = await QRCode.toDataURL(JSON.stringify(qrData));

    await client.query('UPDATE bookings SET paid=true, status=$1 WHERE id=$2', ['paid', booking_id]);
    await client.query('UPDATE payments SET status=$1 WHERE booking_id=$2', ['paid', booking_id]);

    res.json({ message: 'Payment confirmed', collection_qr: collectionQR });
  } catch (err) {
    console.error('Payment confirm error:', err);
    res.status(500).json({ message: 'Error confirming payment' });
  } finally {
    client.release();
  }
});

// ✅ Fetch bookings for a specific customer
app.get('/api/mybookings/:customer_id', async (req, res) => {
  const { customer_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT b.*, c.brand, c.model, c.location
       FROM bookings b
       JOIN cars c ON b.car_id=c.id
       WHERE b.customer_id=$1
       ORDER BY b.start_date DESC`,
      [customer_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch bookings error:', err);
    res.status(500).json({ message: 'Failed to fetch bookings.' });
  }
});

// ============================================================
// 🧾 ADMIN QR VERIFICATION
// ============================================================
app.post('/api/admin/verify-qr', verifyAdmin, async (req, res) => {
  const { qr_data } = req.body;
  try {
    const booking_id = qr_data.booking_id;
    await pool.query('UPDATE bookings SET verified=true WHERE id=$1', [booking_id]);
    res.json({ message: 'Booking verified successfully', booking_id });
  } catch (err) {
    console.error('QR verify error:', err);
    res.status(500).json({ message: 'Error verifying booking.' });
  }
});

// ============================================================
// 🚀 Server Start
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚗 A6Cars backend running on port ${PORT}`));
