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
// DATABASE CONNECTION
// ============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://root:password@localhost:5432/a6cars_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ============================================================
// MULTER SETUP
// ============================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg') return cb(new Error('Only .jpg or .jpeg allowed'));
    cb(null, true);
  }
});

// ============================================================
// ADMIN SETTINGS
// ============================================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karikeharikrishna@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Anu';
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey123';

// Verify JWT middleware
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
// ROOT ENDPOINT
// ============================================================
app.get('/', (req, res) => res.send('🚗 A6 Cars API is running successfully!'));

// ============================================================
// CUSTOMER AUTHENTICATION
// ============================================================
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ message: 'All fields are required' });

  try {
    const exists = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (exists.rows.length > 0)
      return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO customers (name, email, phone, password) VALUES ($1,$2,$3,$4)',
      [name, email, phone, hashed]);
    res.json({ message: 'Registration successful!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (user.rows.length === 0) return res.status(400).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.rows[0].password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.rows[0].id, email }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ message: 'Login successful', token, customer_id: user.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ============================================================
// ADMIN ROUTES
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
    return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ message: 'Admin login successful', token });
});

// ============================================================
// CAR MANAGEMENT
// ============================================================
app.post('/api/admin/addcar', verifyToken, upload.array('images', 10), async (req, res) => {
  const client = await pool.connect();
  try {
    const { brand, model, year, daily_rate, location } = req.body;
    if (!brand || !model || !year || !daily_rate || !location)
      return res.status(400).json({ message: 'Missing fields' });

    await client.query('BEGIN');
    const newCar = await client.query(
      'INSERT INTO cars (brand, model, year, daily_rate, location) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [brand, model, year, daily_rate, location]
    );
    const carId = newCar.rows[0].id;
    const imgs = (req.files || []).map(f => '/uploads/' + f.filename);
    for (const img of imgs)
      await client.query('INSERT INTO car_images (car_id, image_url) VALUES ($1,$2)', [carId, img]);
    await client.query('COMMIT');
    res.json({ message: 'Car added successfully', car_id: carId, images: imgs });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Failed to add car' });
  } finally {
    client.release();
  }
});

app.get('/api/cars', async (req, res) => {
  try {
    const cars = await pool.query('SELECT * FROM cars ORDER BY id DESC');
    for (let c of cars.rows) {
      const imgs = await pool.query('SELECT image_url FROM car_images WHERE car_id=$1', [c.id]);
      c.images = imgs.rows.map(r => r.image_url);
    }
    res.json(cars.rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch cars' });
  }
});

// ============================================================
// BOOKINGS & PAYMENTS
// ============================================================
app.post('/api/book', async (req, res) => {
  try {
    const { car_id, customer_id, start_date, end_date } = req.body;
    const car = await pool.query('SELECT daily_rate FROM cars WHERE id=$1', [car_id]);
    if (car.rows.length === 0) return res.status(404).json({ message: 'Car not found' });

    const rate = parseFloat(car.rows[0].daily_rate);
    const days = Math.max(1, (new Date(end_date) - new Date(start_date)) / (1000 * 3600 * 24));
    const amount = rate * days;

    const booking = await pool.query(
      `INSERT INTO bookings (car_id, customer_id, start_date, end_date, amount, status)
       VALUES ($1,$2,$3,$4,$5,'booked') RETURNING id`,
      [car_id, customer_id, start_date, end_date, amount]
    );
    res.json({ message: 'Booking successful', booking_id: booking.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create booking' });
  }
});

// ✅ Generate Payment QR
app.post('/api/payments/qr', async (req, res) => {
  try {
    const { booking_id, customer_id } = req.body;
    if (!booking_id || !customer_id)
      return res.status(400).json({ message: 'Missing booking/customer details' });

    const bookingRes = await pool.query(
      `SELECT b.*, c.name FROM bookings b JOIN customers c ON b.customer_id=c.id WHERE b.id=$1 AND c.id=$2`,
      [booking_id, customer_id]
    );
    if (bookingRes.rows.length === 0)
      return res.status(404).json({ message: 'Booking not found' });

    const booking = bookingRes.rows[0];
    const amount = booking.amount;
    const upiId = '8179134484@pthdfc';
    const txnId = 'TXN' + Date.now();
    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent('A6 Cars')}&am=${amount}&tn=Car%20Booking%20${booking_id}&cu=INR`;
    const qr = await QRCode.toDataURL(upiLink);

    await pool.query(
      `INSERT INTO payments (booking_id, customer_id, amount, status, transaction_id, upi_reference)
       VALUES ($1,$2,$3,'pending',$4,$5)`,
      [booking_id, customer_id, amount, txnId, upiId]
    );

    res.json({ message: 'Payment QR generated successfully', qr, upiLink, transactionId: txnId, amount });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate payment QR' });
  }
});

// ✅ Admin verifies payment & generates collection QR
app.post('/api/admin/verify-payment', verifyToken, async (req, res) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ message: 'Booking ID required' });

    await pool.query('UPDATE bookings SET paid=true, verified=true, status=$1 WHERE id=$2', ['paid', booking_id]);
    await pool.query('UPDATE payments SET status=$1 WHERE booking_id=$2', ['verified', booking_id]);

    const b = await pool.query(`
      SELECT b.id, b.start_date, b.end_date, c.name, c.email, ca.brand, ca.model, ca.location
      FROM bookings b
      JOIN customers c ON b.customer_id=c.id
      JOIN cars ca ON b.car_id=ca.id
      WHERE b.id=$1
    `, [booking_id]);

    const booking = b.rows[0];
    const qrData = JSON.stringify({
      booking_id,
      customer: booking.name,
      email: booking.email,
      car: `${booking.brand} ${booking.model}`,
      location: booking.location,
      from: booking.start_date,
      to: booking.end_date
    });

    const collectionQR = await QRCode.toDataURL(qrData);

    await pool.query('UPDATE bookings SET collection_qr=$1, status=$2 WHERE id=$3', [collectionQR, 'verified', booking_id]);

    res.json({ message: 'Payment verified & collection QR generated', collectionQR });
  } catch (err) {
    res.status(500).json({ message: 'Failed to verify payment' });
  }
});

// ✅ Fetch booking (for polling collection QR)
app.get('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM bookings WHERE id=$1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Booking not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching booking' });
  }
});

// ✅ Admin scans customer collection QR
app.post('/api/admin/verify-qr', verifyToken, async (req, res) => {
  try {
    const { qr_token } = req.body;
    if (!qr_token) return res.status(400).json({ message: 'QR data missing' });

    const data = JSON.parse(qr_token);
    const booking_id = data.booking_id;
    await pool.query('UPDATE bookings SET status=$1 WHERE id=$2', ['collected', booking_id]);
    res.json({ message: `Booking ${booking_id} verified. Car handed over to ${data.customer}.` });
  } catch (err) {
    res.status(500).json({ message: 'Failed to verify booking QR' });
  }
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
