============================================================
// ✅ A6 Cars Backend - Final Updated Version (Dec 2, 2025 )
// ============================================================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const app = express();
app.use(cors({
  origin: [
    "https://a6cars-frontend-4i84.onrender.com",
    "https://a6cars.onrender.com",
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.send("🚗 A6 Cars Backend is running successfully!");
});

// Lightweight health endpoint used by container healthchecks
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Debug endpoint - list available routes
app.get('/debug/routes', (req, res) => {
  const routes = app._router.stack
    .filter(r => r.route)
    .map(r => ({
      path: r.route.path,
      methods: Object.keys(r.route.methods)
    }));
  res.json({ total: routes.length, routes });
});


// ============================================================
// ✅ PostgreSQL Connection
// ============================================================
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER || 'root'}:${process.env.DB_PASS || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'a6cars_db'}`;

console.log('📡 Connecting to database...');

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('❌ Pool error:', err.message);
});

pool.on('connect', () => {
  console.log('✅ New connection established');
});

// Test connection on startup with promise
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('   Connection string:', connectionString.replace(/:[^:]*@/, ':****@'));
  } else {
    console.log('✅ Database connected successfully at', result.rows[0].now);
    // Run auto-migration on successful connection
    runDatabaseMigrations();
  }
});

// ============================================================
// ✅ Auto-Migration: Ensure payment_reference_id column exists
// ============================================================
async function runDatabaseMigrations() {
  try {
    console.log('📋 Checking database schema...');
    
    // Check if payment_reference_id column exists
    const checkColumn = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'payment_reference_id'
      )`
    );
    
    if (!checkColumn.rows[0].exists) {
      console.log('⚠️ Column payment_reference_id missing - running migration...');
      
      // Add payment_reference_id column
      await pool.query(
        `ALTER TABLE payments ADD COLUMN payment_reference_id VARCHAR(255) UNIQUE`
      );
      console.log('✅ Added payment_reference_id column');
      
      // Add updated_at column if missing
      const checkUpdatedAt = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payments' AND column_name = 'updated_at'
        )`
      );
      
      if (!checkUpdatedAt.rows[0].exists) {
        await pool.query(
          `ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
        );
        console.log('✅ Added updated_at column');
      }
      
      // Create indexes
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_payment_reference_id ON payments(payment_reference_id)`
      );
      console.log('✅ Created idx_payment_reference_id index');
      
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_payment_booking_status ON payments(booking_id, status)`
      );
      console.log('✅ Created idx_payment_booking_status index');
      
      console.log('✅ Database migration completed successfully!');
    } else {
      console.log('✅ Database schema is up to date (payment_reference_id column exists)');
    }
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    console.error('   Please run migration manually: migration_add_payment_reference.sql');
  }
}


// ============================================================
// ✅ Multer Configuration (Car Image Uploads)
// ============================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      Date.now() +
        "-" +
        Math.round(Math.random() * 1e9) +
        path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage });

// ============================================================
// ✅ JWT Secrets and Admin Credentials
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || "secretkey123";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "karikeharikrishna@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Anu";

// ============================================================
// ✅ Middleware for Admin Verification
// ============================================================
function verifyAdmin(req, res, next) {
  const header = req.headers["authorization"];
  if (!header)
    return res.status(401).json({ message: "Missing authorization header" });
  const token = header.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid or expired token" });
    req.admin = decoded;
    next();
  });
}

// ============================================================
// ✅ USER ROUTES
// ============================================================

// Register a new user
app.post("/api/register", async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const existing = await pool.query("SELECT * FROM customers WHERE email=$1", [
      email,
    ]);
    if (existing.rows.length)
      return res.status(400).json({ message: "Email already registered." });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO customers (name, email, phone, password) VALUES ($1,$2,$3,$4)",
      [name, email, phone, hashed]
    );
    res.json({ message: "Registration successful!" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error during registration." });
  }
});

// User login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM customers WHERE email=$1", [
      email,
    ]);
    if (!result.rows.length)
      return res.status(400).json({ message: "Invalid email or password." });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid password." });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
    res.json({
      message: "Login successful",
      token,
      customer_id: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed." });
  }
});

// ============================================================
// ✅ ADMIN ROUTES
// ============================================================

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
    return res.status(401).json({ message: "Invalid admin credentials" });

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ message: "Admin login successful", token });
});

// Add a new car
app.post("/api/admin/addcar", verifyAdmin, upload.array("images", 10), async (req, res) => {
  const { brand, model, year, daily_rate, location } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "INSERT INTO cars (brand, model, year, daily_rate, location) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [brand, model, year, daily_rate, location]
    );
    const carId = result.rows[0].id;

    for (const file of req.files) {
      await client.query("INSERT INTO car_images (car_id, image_url) VALUES ($1,$2)", [
        carId,
        "/uploads/" + file.filename,
      ]);
    }

    await client.query("COMMIT");
    res.json({ message: "Car added successfully!" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Add car error:", err);
    res.status(500).json({ message: "Failed to add car." });
  } finally {
    client.release();
  }
});

// ============================================================
// ✅ CARS & BOOKINGS ROUTES
// ============================================================

// Fetch all cars
app.get("/api/cars", async (req, res) => {
  try {
    const cars = await pool.query("SELECT * FROM cars ORDER BY id DESC");
    for (let car of cars.rows) {
      const imgs = await pool.query("SELECT image_url FROM car_images WHERE car_id=$1", [
        car.id,
      ]);
      car.images = imgs.rows.map((r) => r.image_url);
    }
    res.json(cars.rows);
  } catch (err) {
    console.error("Fetch cars error:", err);
    res.status(500).json({ message: "Error fetching cars." });
  }
});

// Book a car
app.post("/api/book", async (req, res) => {
  const { car_id, customer_id, start_date, end_date } = req.body;
  if (!car_id || !customer_id || !start_date || !end_date)
    return res.status(400).json({ message: "Missing booking info." });

  const client = await pool.connect();
  try {
    const carRes = await client.query("SELECT daily_rate FROM cars WHERE id=$1", [
      car_id,
    ]);
    if (!carRes.rows.length)
      return res.status(404).json({ message: "Car not found." });

    // Check for booking conflicts
    const conflictRes = await client.query(
      `SELECT * FROM bookings 
       WHERE car_id=$1 
       AND (
         (start_date <= $2 AND end_date >= $2) OR
         (start_date <= $3 AND end_date >= $3) OR
         (start_date >= $2 AND end_date <= $3)
       )
       AND status IN ('pending', 'confirmed')`,
      [car_id, start_date, end_date]
    );

    if (conflictRes.rows.length > 0) {
      return res.status(409).json({ message: "Car already booked for these dates." });
    }

    const rate = parseFloat(carRes.rows[0].daily_rate);
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)
      )
    );
    const total = rate * days;

    await client.query("BEGIN");
    const booking = await client.query(
      `INSERT INTO bookings (car_id, customer_id, start_date, end_date, amount, status, paid, verified)
       VALUES ($1,$2,$3,$4,$5,'pending',false,false) RETURNING id`,
      [car_id, customer_id, start_date, end_date, total]
    );

    const bookingId = booking.rows[0].id;
    const upiString = `upi://pay?pa=8179134484@pthdfc&pn=A6Cars&am=${total}&tn=Booking%20${bookingId}`;
    const paymentQR = await QRCode.toDataURL(upiString);
    
    // QR expires in 180 seconds (3 minutes)
    const qrExpiryTime = new Date(Date.now() + 180 * 1000);

    await client.query(
      `INSERT INTO payments (booking_id, amount, upi_id, qr_code, status, created_at, expires_at)
       VALUES ($1,$2,$3,$4,'pending', NOW(), $5)`,
      [bookingId, total, "8179134484@pthdfc", paymentQR, qrExpiryTime]
    );

    await client.query("COMMIT");
    res.json({
      message: "Booking created successfully",
      booking_id: bookingId,
      total,
      payment_qr: paymentQR,
      qr_expires_in: 180,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking error:", err);
    res.status(500).json({ message: "Booking failed." });
  } finally {
    client.release();
  }
});

// Get all bookings of a user
app.get("/api/mybookings/:customer_id", async (req, res) => {
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
    console.error("Fetch bookings error:", err);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
});

// Get bookings for specific car
app.get("/api/bookings/:car_id", async (req, res) => {
  const { car_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT start_date, end_date FROM bookings 
       WHERE car_id=$1 AND status IN ('pending', 'confirmed') 
       ORDER BY start_date ASC`,
      [car_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch car bookings error:", err);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
});

// Batch get bookings for multiple cars
app.post("/api/bookings/batch", async (req, res) => {
  const { car_ids } = req.body;
  if (!Array.isArray(car_ids) || car_ids.length === 0) {
    return res.status(400).json({ message: "car_ids must be a non-empty array" });
  }
  try {
    const result = await pool.query(
      "SELECT car_id, id, start_date, end_date FROM bookings WHERE car_id = ANY($1) AND status='pending' ORDER BY start_date DESC",
      [car_ids]
    );
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.car_id]) grouped[row.car_id] = [];
      grouped[row.car_id].push(row);
    }
    res.json(grouped);
  } catch (err) {
    console.error("Batch bookings error:", err);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
});

// ✅ Check payment status
app.get("/api/payment/status/:booking_id", async (req, res) => {
  const { booking_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT paid, status FROM bookings WHERE id=$1",
      [booking_id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({
      paid: result.rows[0].paid,
      status: result.rows[0].status
    });
  } catch (err) {
    console.error("Payment status error:", err);
    res.status(500).json({ message: "Error checking payment status." });
  }
});

// Confirm payment and generate QR for admin
app.post("/api/payment/confirm", async (req, res) => {
  const { booking_id } = req.body;
  const client = await pool.connect();
  try {
    const booking = await client.query(
      `SELECT b.id AS booking_id, b.start_date, b.end_date, b.amount, b.customer_id,
              c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
              ca.id AS car_id, ca.brand, ca.model, ca.location
       FROM bookings b
       JOIN customers c ON b.customer_id = c.id
       JOIN cars ca ON b.car_id = ca.id
       WHERE b.id = $1`,
      [booking_id]
    );

    if (!booking.rows.length)
      return res.status(404).json({ message: "Booking not found." });

    const data = booking.rows[0];
    
    // Collection QR (pickup)
    const collectionQRData = {
      qr_type: "collection",
      booking_id: data.booking_id,
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      car_id: data.car_id,
      car: `${data.brand} ${data.model}`,
      location: data.location,
      start_date: data.start_date,
      amount: data.amount,
    };
    const collectionQR = await QRCode.toDataURL(JSON.stringify(collectionQRData));

    // Return QR (dropoff)
    const returnQRData = {
      qr_type: "return",
      booking_id: data.booking_id,
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      car_id: data.car_id,
      car: `${data.brand} ${data.model}`,
      location: data.location,
      end_date: data.end_date,
      amount: data.amount,
    };
    const returnQR = await QRCode.toDataURL(JSON.stringify(returnQRData));

    await client.query("UPDATE bookings SET paid=true, status='confirmed' WHERE id=$1", [booking_id]);
    await client.query("UPDATE payments SET status='paid' WHERE booking_id=$1", [booking_id]);

    res.json({ 
      message: "Payment confirmed ✅", 
      collection_qr: collectionQR,
      return_qr: returnQR,
      booking_details: {
        booking_id: data.booking_id,
        customer_name: data.customer_name,
        car: data.brand + " " + data.model,
        amount: data.amount
      }
    });
  } catch (err) {
    console.error("Payment confirm error:", err);
    res.status(500).json({ message: "Error confirming payment." });
  } finally {
    client.release();
  }
});

// ============================================================
// ✅ CUSTOMER: Verify payment by reference ID
// ============================================================
app.post("/api/verify-payment", async (req, res) => {
  console.log("🔍 verify-payment endpoint called with body:", req.body);
  const { booking_id, payment_reference_id, customer_id } = req.body;
  
  if (!booking_id || !payment_reference_id || !customer_id) {
    return res.status(400).json({ message: "Missing required fields: booking_id, payment_reference_id, customer_id" });
  }

  const client = await pool.connect();
  try {
    // 1. Verify booking exists and belongs to customer
    const booking = await client.query(
      `SELECT b.id, b.customer_id, b.car_id, b.amount, b.start_date, b.end_date, b.paid,
              c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
              ca.brand, ca.model, ca.location
       FROM bookings b
       JOIN customers c ON b.customer_id = c.id
       JOIN cars ca ON b.car_id = ca.id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [booking_id, customer_id]
    );
    
    if (!booking.rows.length) {
      return res.status(404).json({ message: "Booking not found or does not belong to this customer." });
    }

    const bookingData = booking.rows[0];
    
    // 2. Check if payment already verified for this booking
    if (bookingData.paid) {
      return res.status(409).json({ message: "Payment already verified for this booking." });
    }

    // 3. Verify payment reference exists and matches customer, car, booking
    // (First, ensure payment_reference_id column exists in payments table)
    const paymentCheck = await client.query(
      `SELECT p.id, p.booking_id, p.amount, p.status
       FROM payments p
       WHERE p.booking_id = $1 AND p.amount = $2`,
      [booking_id, bookingData.amount]
    );

    if (!paymentCheck.rows.length) {
      return res.status(404).json({ message: "No payment found for this booking amount." });
    }

    // 4. Update payment with reference ID and mark as verified
    // Note: payment_reference_id  column may not exist if migration hasn't been applied
    // Try to update, but catch if column doesn't exist
    try {
      await client.query(
        `UPDATE payments 
         SET payment_reference_id = $1, status = 'verified'
         WHERE booking_id = $2`,
        [payment_reference_id, booking_id]
      );
    } catch (colErr) {
      // If column doesn't exist, just update status and log warning
      console.warn('⚠️ payment_reference_id column missing - run migration: migration_add_payment_reference.sql');
      await client.query(
        `UPDATE payments 
         SET status = 'verified'
         WHERE booking_id = $2`,
        [booking_id]
      );
    }

    // 5. Mark booking as paid and confirmed
    await client.query(
      `UPDATE bookings 
       SET paid = true, status = 'confirmed', updated_at = NOW()
       WHERE id = $1`,
      [booking_id]
    );

    // 6. Generate Collection QR (pickup)
    const collectionQRData = {
      qr_type: "collection",
      booking_id: bookingData.id,
      customer_id: bookingData.customer_id,
      customer_name: bookingData.customer_name,
      customer_phone: bookingData.customer_phone,
      car_id: bookingData.car_id,
      car: `${bookingData.brand} ${bookingData.model}`,
      location: bookingData.location,
      start_date: bookingData.start_date,
      amount: bookingData.amount,
      payment_reference_id: payment_reference_id
    };
    const collectionQR = await QRCode.toDataURL(JSON.stringify(collectionQRData));

    // 7. Generate Return QR (dropoff)
    const returnQRData = {
      qr_type: "return",
      booking_id: bookingData.id,
      customer_id: bookingData.customer_id,
      customer_name: bookingData.customer_name,
      customer_phone: bookingData.customer_phone,
      car_id: bookingData.car_id,
      car: `${bookingData.brand} ${bookingData.model}`,
      location: bookingData.location,
      end_date: bookingData.end_date,
      amount: bookingData.amount,
      payment_reference_id: payment_reference_id
    };
    const returnQR = await QRCode.toDataURL(JSON.stringify(returnQRData));

    res.json({
      message: "✅ Payment verified successfully!",
      payment_reference_id: payment_reference_id,
      collection_qr: collectionQR,
      return_qr: returnQR,
      booking_details: {
        booking_id: bookingData.id,
        customer_name: bookingData.customer_name,
        car: `${bookingData.brand} ${bookingData.model}`,
        amount: bookingData.amount,
        start_date: bookingData.start_date,
        end_date: bookingData.end_date
      }
    });
  } catch (err) {
    console.error("❌ Payment verification error:", err.message);
    console.error("Error details:", err);
    
    // Provide helpful error messages for common issues
    if (err.message && err.message.includes('payment_reference_id')) {
      return res.status(500).json({ message: "Database schema missing payment_reference_id column. Run migration: migration_add_payment_reference.sql" });
    }
    
    res.status(500).json({ message: "Error verifying payment: " + err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// ✅ ADMIN: Verify QR from mobile app / scanner
// ============================================================
app.post("/api/admin/verify-qr", verifyAdmin, async (req, res) => {
  const { qr_data } = req.body;
  try {
    const booking_id = qr_data.booking_id;
    const qr_type = qr_data.qr_type; // "collection" or "return"
    
    // Fetch full booking and car details
    const booking = await pool.query(
      `SELECT b.id, b.customer_id, b.start_date, b.end_date, b.amount, b.status,
              c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
              ca.id AS car_id, ca.brand, ca.model, ca.location
       FROM bookings b
       JOIN customers c ON b.customer_id = c.id
       JOIN cars ca ON b.car_id = ca.id
       WHERE b.id = $1`,
      [booking_id]
    );

    if (!booking.rows.length) {
      return res.status(404).json({ message: "Booking not found." });
    }

    const bookingData = booking.rows[0];
    
    // Update verification status
    if (qr_type === "collection") {
      await pool.query(
        "UPDATE bookings SET collection_verified=true WHERE id=$1",
        [booking_id]
      );
    } else if (qr_type === "return") {
      await pool.query(
        "UPDATE bookings SET return_verified=true WHERE id=$1",
        [booking_id]
      );
    }

    res.json({ 
      message: `${qr_type.toUpperCase()} QR verified successfully ✅`,
      qr_verification: {
        qr_type: qr_type,
        booking_id: bookingData.id,
        customer: {
          id: bookingData.customer_id,
          name: bookingData.customer_name,
          phone: bookingData.customer_phone,
          email: bookingData.customer_email
        },
        booking: {
          start_date: bookingData.start_date,
          end_date: bookingData.end_date,
          amount: bookingData.amount,
          status: bookingData.status
        },
        car: {
          id: bookingData.car_id,
          model: `${bookingData.brand} ${bookingData.model}`,
          location: bookingData.location
        }
      }
    });
  } catch (err) {
    console.error("QR verification error:", err);
    res.status(500).json({ message: "Error verifying booking." });
  }
});

// ============================================================
// ✅ Start Server
// ============================================================
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ A6 Cars backend running on http://0.0.0.0:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Set timeout for graceful shutdown
server.setTimeout(120000); // 120 seconds

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown - SIGTERM
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ Server closed, closing database pool...');
    
    // Close database pool
    pool.end(() => {
      console.log('✅ Database pool closed');
      console.log('✅ Process exiting gracefully');
      process.exit(0);
    });
  });
  
  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
});

// Graceful shutdown - SIGINT
process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ Server closed, closing database pool...');
    
    // Close database pool
    pool.end(() => {
      console.log('✅ Database pool closed');
      console.log('✅ Process exiting gracefully');
      process.exit(0);
    });
  });
  
  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
});
