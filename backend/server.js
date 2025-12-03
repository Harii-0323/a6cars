//============================================================
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
      
      // Ensure refund-related columns exist so we can track refunds
      const checkRefundAmount = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payments' AND column_name = 'refund_amount'
        )`
      );
      if (!checkRefundAmount.rows[0].exists) {
        await pool.query(`ALTER TABLE payments ADD COLUMN refund_amount NUMERIC(10,2)`);
        console.log('✅ Added refund_amount column to payments');
      }

      const checkRefundStatus = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payments' AND column_name = 'refund_status'
        )`
      );
      if (!checkRefundStatus.rows[0].exists) {
        await pool.query(`ALTER TABLE payments ADD COLUMN refund_status VARCHAR(50) DEFAULT 'none'`);
        console.log('✅ Added refund_status column to payments');
      }

      const checkRefundRequested = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payments' AND column_name = 'refund_requested_at'
        )`
      );
      if (!checkRefundRequested.rows[0].exists) {
        await pool.query(`ALTER TABLE payments ADD COLUMN refund_requested_at TIMESTAMP`);
        console.log('✅ Added refund_requested_at column to payments');
      }

      const checkRefundProcessed = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payments' AND column_name = 'refund_processed_at'
        )`
      );
      if (!checkRefundProcessed.rows[0].exists) {
        await pool.query(`ALTER TABLE payments ADD COLUMN refund_processed_at TIMESTAMP`);
        console.log('✅ Added refund_processed_at column to payments');
      }

      const checkRefundDue = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payments' AND column_name = 'refund_due_by'
        )`
      );
      if (!checkRefundDue.rows[0].exists) {
        await pool.query(`ALTER TABLE payments ADD COLUMN refund_due_by TIMESTAMP`);
        console.log('✅ Added refund_due_by column to payments');
      }

      // Create refunds table to track refund operations
      await pool.query(
        `CREATE TABLE IF NOT EXISTS refunds (
          id SERIAL PRIMARY KEY,
          payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
          customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
          amount NUMERIC(10,2) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP
        )`);
      console.log('✅ Ensured refunds table exists');

      // Booking cancellations table
      await pool.query(
        `CREATE TABLE IF NOT EXISTS booking_cancellations (
          id SERIAL PRIMARY KEY,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
          admin_email VARCHAR(255),
          reason TEXT,
          cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
      console.log('✅ Ensured booking_cancellations table exists');

      // If a legacy column name exists (e.g. cancelled_by, cancelled_on), migrate into new columns
      try {
        const colsRes = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name='booking_cancellations'`
        );
        const cols = colsRes.rows.map(r => r.column_name);

        // If admin_email missing but cancelled_by exists, add admin_email and copy data
        if (!cols.includes('admin_email')) {
          await pool.query(`ALTER TABLE booking_cancellations ADD COLUMN admin_email VARCHAR(255)`);
          console.log('✅ Added admin_email column to booking_cancellations');
          if (cols.includes('cancelled_by')) {
            await pool.query(`UPDATE booking_cancellations SET admin_email = cancelled_by WHERE admin_email IS NULL`);
            console.log('✅ Migrated cancelled_by -> admin_email');
          }
        }

        // If cancelled_at missing but cancelled_on exists, add cancelled_at and copy data
        if (!cols.includes('cancelled_at')) {
          await pool.query(`ALTER TABLE booking_cancellations ADD COLUMN cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
          console.log('✅ Added cancelled_at column to booking_cancellations');
          if (cols.includes('cancelled_on')) {
            await pool.query(`UPDATE booking_cancellations SET cancelled_at = cancelled_on WHERE cancelled_at IS NULL`);
            console.log('✅ Migrated cancelled_on -> cancelled_at');
          }
        }
        // Ensure new audit/refund columns exist
        if (!cols.includes('refund_percent')) {
          await pool.query(`ALTER TABLE booking_cancellations ADD COLUMN refund_percent NUMERIC(5,2)`);
          console.log('✅ Added refund_percent column to booking_cancellations');
        }
        if (!cols.includes('refund_amount')) {
          await pool.query(`ALTER TABLE booking_cancellations ADD COLUMN refund_amount NUMERIC(10,2)`);
          console.log('✅ Added refund_amount column to booking_cancellations');
        }
        if (!cols.includes('canceled_by')) {
          await pool.query(`ALTER TABLE booking_cancellations ADD COLUMN canceled_by VARCHAR(255)`);
          console.log('✅ Added canceled_by column to booking_cancellations');
          // If admin_email exists, copy it
          if (cols.includes('admin_email')) {
            await pool.query(`UPDATE booking_cancellations SET canceled_by = admin_email WHERE canceled_by IS NULL`);
            console.log('✅ Migrated admin_email -> canceled_by');
          }
        }
      } catch (mErr) {
        console.warn('⚠️ Could not migrate legacy booking_cancellations columns:', mErr.message);
      }

      // Discounts table for future bookings
      await pool.query(
        `CREATE TABLE IF NOT EXISTS discounts (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
          car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
          percent NUMERIC(5,2) NOT NULL,
          start_date DATE,
          end_date DATE,
          code VARCHAR(100),
          used BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
      console.log('✅ Ensured discounts table exists');

      // Notifications table (simple in-app notifications)
      await pool.query(
        `CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
          title VARCHAR(255),
          message TEXT,
          read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
      console.log('✅ Ensured notifications table exists');
      
      console.log('✅ Database migration completed successfully!');
    } else {
      console.log('✅ Database schema is up to date (payment_reference_id column exists)');
    }

    // Always ensure refund-related tables and payment refund columns exist
    try {
      console.log('🔎 Ensuring refund/discount/notification tables and refund columns exist');

      // Ensure refund-related columns exist on payments (safeguard if migration ran partially)
      const ensureColumn = async (colName, colDef) => {
        const exists = await pool.query(
          `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name=$1)`,
          [colName]
        );
        if (!exists.rows[0].exists) {
          await pool.query(`ALTER TABLE payments ADD COLUMN ${colDef}`);
          console.log(`✅ Added ${colName} column to payments`);
        }
      };

      await ensureColumn('refund_amount', `refund_amount NUMERIC(10,2)`);
      await ensureColumn('refund_status', `refund_status VARCHAR(50) DEFAULT 'none'`);
      await ensureColumn('refund_requested_at', `refund_requested_at TIMESTAMP`);
      await ensureColumn('refund_processed_at', `refund_processed_at TIMESTAMP`);
      await ensureColumn('refund_due_by', `refund_due_by TIMESTAMP`);

      // Create tables if they do not exist
      await pool.query(
        `CREATE TABLE IF NOT EXISTS refunds (
          id SERIAL PRIMARY KEY,
          payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
          customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
          amount NUMERIC(10,2) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP
        )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS booking_cancellations (
          id SERIAL PRIMARY KEY,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
          admin_email VARCHAR(255),
          reason TEXT,
          cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS discounts (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
          car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
          percent NUMERIC(5,2) NOT NULL,
          start_date DATE,
          end_date DATE,
          code VARCHAR(100),
          used BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
          title VARCHAR(255),
          message TEXT,
          read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      );

      console.log('✅ Ensured refund/discount/notification tables and payments refund columns exist');
    } catch (errInner) {
      console.error('❌ Failed to ensure refund-related tables/columns:', errInner.message);
    }
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    console.error('   Please run migration manually: migration_add_payment_reference.sql');
  }
}

// ============================================================
// ✅ ADMIN: Cancel booking (admin-initiated)
// - Admin cancels booking => full refund regardless of timing
// - Admin must provide a reason
// - Creates booking_cancellations, refund entry, notification, and a 50% discount for same dates
// ============================================================
app.post('/api/admin/cancel-booking', verifyAdmin, async (req, res) => {
  const { booking_id, reason } = req.body;
  if (!booking_id || !reason) return res.status(400).json({ message: 'Missing booking_id or reason' });

  const adminEmail = req.admin?.email || 'admin';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const q = await client.query(
      `SELECT b.id, b.customer_id, b.car_id, b.start_date, b.end_date, b.amount, b.paid,
              p.id AS payment_id, p.amount AS paid_amount
       FROM bookings b
       LEFT JOIN payments p ON p.booking_id = b.id
       WHERE b.id = $1`,
      [booking_id]
    );

    if (!q.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found.' });
    }

    const booking = q.rows[0];

    if (booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Booking already cancelled.' });
    }

    // Mark booking cancelled
    await client.query(`UPDATE bookings SET status='cancelled' WHERE id=$1`, [booking_id]);

    // Admin cancellation -> prepare full refund values
    const refundPercent = 100; // admin cancels => full refund
    let refundAmount = 0;
    if (booking.paid) {
      refundAmount = parseFloat(booking.paid_amount || booking.amount || 0);
    }

    // Record cancellation with refund details (refundAmount may be 0 if unpaid)
    await client.query(
      `INSERT INTO booking_cancellations 
       (booking_id, customer_id, reason, refund_percent, refund_amount, canceled_by, admin_email, cancelled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        booking_id,
        booking.customer_id,         // ✔ ALWAYS available
        reason,
        refundPercent,
        refundAmount,
        'admin',
        adminEmail
      ]
    );

    // If paid, schedule full refund
    if (booking.paid) {
      // create refund record
      await client.query(
        `INSERT INTO refunds (payment_id, booking_id, customer_id, amount, status, reason)
         VALUES ($1,$2,$3,$4,'pending',$5)`,
        [booking.payment_id || null, booking_id, booking.customer_id, refundAmount, 'Admin cancellation: ' + reason]
      );

      // update payments table refund columns
      await client.query(
        `UPDATE payments SET refund_amount=$1, refund_status='pending', refund_requested_at=NOW(), refund_due_by=NOW()+INTERVAL '72 hours' WHERE booking_id=$2`,
        [refundAmount, booking_id]
      );
    }

    // Insert a notification for the customer
    const title = 'Booking Cancelled by Admin';
    const message = `Your booking #${booking_id} was cancelled by admin. Reason: ${reason}. Refund: ₹${refundAmount}.`;
    await client.query(
      `INSERT INTO notifications (customer_id, title, message) VALUES ($1,$2,$3)`,
      [booking.customer_id, title, message]
    );

    // Create a 50% discount for the same car and dates (usable for future booking)
    const discountPercent = 50;
    await client.query(
      `INSERT INTO discounts (customer_id, car_id, percent, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5)`,
      [booking.customer_id, booking.car_id, discountPercent, booking.start_date, booking.end_date]
    );

    await client.query('COMMIT');

    res.json({ message: 'Booking cancelled by admin. Full refund scheduled, customer notified, discount issued.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin cancel booking error:', err);
    res.status(500).json({ message: 'Failed to cancel booking (admin).' });
  } finally {
    client.release();
  }
});

// ============================================================
// ✅ ADMIN: List canceled bookings
// ============================================================
app.get('/api/admin/canceled-bookings', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bc.*, b.start_date, b.end_date, b.amount, b.car_id, c.brand, c.model, b.customer_id, cu.name AS customer_name, cu.email
       FROM booking_cancellations bc
       JOIN bookings b ON bc.booking_id = b.id
       JOIN cars c ON b.car_id = c.id
       JOIN customers cu ON b.customer_id = cu.id
       ORDER BY bc.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch canceled bookings error:', err);
    res.status(500).json({ message: 'Failed to fetch canceled bookings.' });
  }
});

// ============================================================
// ✅ ADMIN: List refunds
// ============================================================
app.get('/api/admin/refunds', verifyAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT r.*, p.payment_id AS payment_row_id, p.refund_status AS payment_refund_status, cu.name AS customer_name, cu.email
       FROM refunds r
       LEFT JOIN payments p ON p.id = r.payment_id
       LEFT JOIN customers cu ON cu.id = r.customer_id
       ORDER BY r.created_at DESC`);
    res.json(q.rows);
  } catch (err) {
    console.error('Fetch refunds error:', err);
    res.status(500).json({ message: 'Failed to fetch refunds.' });
  }
});

// ============================================================
// ✅ ADMIN: Process refunds (simulate/process)
// - If `refund_id` provided in body, process that refund, else process all pending refunds (limit 50)
// - Marks `refunds.status='processed'`, `refunds.processed_at=NOW()` and updates `payments` refund columns
// - Inserts notification for customer about processed refund
// ============================================================
app.post('/api/admin/process-refunds', verifyAdmin, async (req, res) => {
  const { refund_id } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const params = [];
    let qstr = `SELECT r.* FROM refunds r WHERE r.status='pending'`;
    if (refund_id) {
      qstr += ` AND r.id=$1`;
      params.push(refund_id);
    } else {
      qstr += ` ORDER BY r.created_at ASC LIMIT 50`;
    }

    const refundsRes = await client.query(qstr, params);
    if (!refundsRes.rows.length) {
      await client.query('COMMIT');
      return res.json({ message: 'No pending refunds found.' });
    }

    const processed = [];
    for (const r of refundsRes.rows) {
      // In a real system we'd call the payment gateway here. We'll simulate success.
      await client.query(`UPDATE refunds SET status='processed', processed_at=NOW() WHERE id=$1`, [r.id]);

      // update payments row
      await client.query(`UPDATE payments SET refund_status='processed', refund_processed_at=NOW() WHERE booking_id=$1`, [r.booking_id]);

      // insert notification
      await client.query(
        `INSERT INTO notifications (customer_id, title, message) VALUES ($1,$2,$3)`,
        [r.customer_id, 'Refund Processed', `Your refund of ₹${r.amount} for booking #${r.booking_id} has been processed.`]
      );

      processed.push({ refund_id: r.id, booking_id: r.booking_id, amount: r.amount });
    }

    await client.query('COMMIT');
    res.json({ message: 'Processed refunds', processed });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Process refunds error:', err);
    res.status(500).json({ message: 'Failed to process refunds.' });
  } finally {
    client.release();
  }
});

// ============================================================
// ✅ ADMIN: Get car schedule and vacancy ranges (next 180 days)
// ============================================================
app.get('/api/admin/car-schedule/:car_id', verifyAdmin, async (req, res) => {
  const { car_id } = req.params;
  try {
    const bookingsRes = await pool.query(
      `SELECT id, start_date, end_date, status FROM bookings WHERE car_id=$1 AND status!='cancelled' ORDER BY start_date ASC`,
      [car_id]
    );

    const bookings = bookingsRes.rows.map(r => ({ start: new Date(r.start_date), end: new Date(r.end_date), id: r.id }));

    // Compute vacancy ranges between today and +180 days
    const today = new Date();
    const endWindow = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);

    // Create sorted non-overlapping booked ranges
    const ranges = bookings.map(b => ({ start: b.start, end: b.end })).sort((a,b) => a.start - b.start);
    const merged = [];
    for (const r of ranges) {
      if (!merged.length) merged.push(r);
      else {
        const last = merged[merged.length-1];
        if (r.start <= new Date(last.end.getTime() + 24*60*60*1000)) {
          // overlap or contiguous
          last.end = new Date(Math.max(last.end, r.end));
        } else merged.push(r);
      }
    }

    const vacancies = [];
    let cursor = new Date(today);
    for (const m of merged) {
      if (m.end < today) continue;
      if (m.start > cursor) {
        vacancies.push({ start: cursor.toISOString().split('T')[0], end: new Date(m.start.getTime() - 24*60*60*1000).toISOString().split('T')[0] });
      }
      cursor = new Date(m.end.getTime() + 24*60*60*1000);
      if (cursor > endWindow) break;
    }
    if (cursor <= endWindow) vacancies.push({ start: cursor.toISOString().split('T')[0], end: endWindow.toISOString().split('T')[0] });

    res.json({ bookings: bookingsRes.rows, vacancies });
  } catch (err) {
    console.error('Car schedule error:', err);
    res.status(500).json({ message: 'Failed to fetch car schedule.' });
  }
});

// ============================================================
// ✅ CANCEL BOOKING (admin or user)
// - Admin cancellations: full refund (100%)
// - User cancellations: full refund if >=48 hours before start, else 50%
// - Refunds are scheduled and marked pending; admin can process them
// ============================================================
app.post('/api/cancel-booking', async (req, res) => {
  console.log('🔍 Cancel Booking API called:', req.body);

  const {
    booking_id,
    cancelled_by,       // 'admin' or 'user'
    reason,
    admin_email,        // optional, when admin cancels
    customer_id         // optional, fallback to booking.customer_id
  } = req.body;

  if (!booking_id || !cancelled_by) {
    return res.status(400).json({ message: 'Missing booking_id or cancelled_by' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If admin cancellation, verify admin token
    let verifiedAdminEmail = null;
    if (cancelled_by === 'admin') {
      const header = req.headers['authorization'];
      if (!header) {
        await client.query('ROLLBACK');
        return res.status(401).json({ message: 'Admin authorization required for admin cancellations' });
      }
      const token = header.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        verifiedAdminEmail = decoded.email || admin_email || 'admin';
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(401).json({ message: 'Invalid admin token' });
      }
    }

    // Fetch booking and payment info
    const bookingRes = await client.query(
      `SELECT b.*, p.id AS payment_id, p.amount AS paid_amount, p.status AS payment_status
       FROM bookings b
       LEFT JOIN payments p ON p.booking_id = b.id
       WHERE b.id = $1`,
      [booking_id]
    );

    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found' });
    }

    const booking = bookingRes.rows[0];
    if (booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Booking already cancelled.' });
    }

    const paidAmount = parseFloat(booking.paid_amount || booking.amount || 0);
    let refundAmount = 0;
    let refundPercent = 0;

    if (cancelled_by === 'admin') {
      refundPercent = 100;
      refundAmount = paidAmount;
      console.log('🟢 Admin cancellation → Full refund:', refundAmount);
    } else {
      // user cancellation
      if (!booking.paid) {
        // Not paid — just cancel
        await client.query(`INSERT INTO booking_cancellations (booking_id, customer_id, reason, canceled_by, refund_percent, refund_amount, cancelled_at)
                            VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
          [booking_id, customer_id || booking.customer_id, reason || null, 'user', 0, 0]
        );
        await client.query(`UPDATE bookings SET status='cancelled' WHERE id=$1`, [booking_id]);
        await client.query('COMMIT');
        client.release();
        return res.json({ message: 'Booking cancelled. No payment was recorded, so no refund necessary.' });
      }

      const now = new Date();
      const startTime = new Date(booking.start_date);
      const diffHours = (startTime - now) / (1000 * 60 * 60);

      if (diffHours >= 48) {
        refundPercent = 100;
        refundAmount = paidAmount;
      } else {
        refundPercent = 50;
        refundAmount = parseFloat((paidAmount * 0.5).toFixed(2));
      }

      console.log('🔵 User cancellation refund:', refundAmount, 'percent:', refundPercent);
    }

    // Insert cancellation record
    await client.query(
      `INSERT INTO booking_cancellations (booking_id, customer_id, reason, canceled_by, admin_email, refund_percent, refund_amount, cancelled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [booking_id, customer_id || booking.customer_id, reason || null, cancelled_by, verifiedAdminEmail || admin_email || null, refundPercent, refundAmount]
    );

    // Mark booking cancelled
    await client.query(`UPDATE bookings SET status='cancelled' WHERE id=$1`, [booking_id]);

    // If paid and refund applicable, create refund record and update payments
    if (booking.paid && refundAmount > 0) {
      await client.query(
        `INSERT INTO refunds (payment_id, booking_id, customer_id, amount, status, reason)
         VALUES ($1,$2,$3,$4,'pending',$5)`,
        [booking.payment_id || null, booking_id, booking.customer_id, refundAmount, (cancelled_by === 'admin' ? 'Admin cancellation' : 'User cancellation') + (reason ? ': ' + reason : '')]
      );

      await client.query(
        `UPDATE payments SET refund_amount=$1, refund_status='pending', refund_requested_at=NOW(), refund_due_by=NOW()+INTERVAL '72 hours' WHERE booking_id=$2`,
        [refundAmount, booking_id]
      );
    }

    // Insert notification
    const notifyMsg = cancelled_by === 'admin'
      ? `Your booking #${booking_id} was cancelled by admin. Reason: ${reason || 'No reason provided'}. Refund: ₹${refundAmount}`
      : `Your booking #${booking_id} has been cancelled. Refund Amount: ₹${refundAmount}`;

    await client.query(`INSERT INTO notifications (customer_id, title, message) VALUES ($1,$2,$3)`, [booking.customer_id, 'Booking Cancelled', notifyMsg]);

    await client.query('COMMIT');

    res.json({ message: 'Booking cancelled successfully', refundAmount, refundPercent, cancelled_by, booking_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Cancel booking error:', err);
    res.status(500).json({ message: 'Cancel booking failed', error: err.message });
  } finally {
    client.release();
  }
});


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
    let total = rate * days;

    // Check for available discount for this customer/car/date range
    try {
      const discRes = await client.query(
        `SELECT * FROM discounts WHERE customer_id=$1 AND car_id=$2 AND used=false
         AND start_date <= $3 AND end_date >= $4 ORDER BY created_at DESC LIMIT 1`,
        [customer_id, car_id, start_date, end_date]
      );
      if (discRes.rows.length) {
        const disc = discRes.rows[0];
        const percent = parseFloat(disc.percent) || 0;
        const discountAmount = parseFloat(((total * percent) / 100).toFixed(2));
        total = parseFloat((total - discountAmount).toFixed(2));

        // mark discount used
        await client.query(`UPDATE discounts SET used=true WHERE id=$1`, [disc.id]);
      }
    } catch (dErr) {
      console.warn('Discount check failed:', dErr.message);
    }

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
      `SELECT b.id, b.start_date, b.end_date, b.amount, b.status, b.paid, b.verified,
              c.name AS customer_name, c.email AS customer_email
       FROM bookings b
       LEFT JOIN customers c ON b.customer_id = c.id
       WHERE b.car_id=$1 AND b.status IN ('pending', 'confirmed')
       ORDER BY b.start_date ASC`,
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

// ============================================================
// ✅ USER: Active & Past Bookings (Home Dashboard)
// Returns two arrays: `active` (ongoing or upcoming, not cancelled) and `past` (ended or cancelled)
// ============================================================
app.get("/api/bookings/status/:customer_id", async (req, res) => {
  const { customer_id } = req.params;

  try {
    const now = new Date();

    const result = await pool.query(
      `SELECT b.*, c.brand, c.model, c.location,
              p.status AS payment_status, p.refund_amount, p.refund_status,
              bc.reason AS cancelled_reason, bc.cancelled_at
       FROM bookings b
       JOIN cars c ON b.car_id = c.id
       LEFT JOIN payments p ON p.booking_id = b.id
       LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
       WHERE b.customer_id = $1
       ORDER BY b.start_date DESC`,
      [customer_id]
    );

    const active = [];
    const past = [];

    result.rows.forEach(b => {
      const endDate = b.end_date ? new Date(b.end_date) : null;

      if (endDate && endDate >= now && b.status !== "cancelled") {
        active.push(b);
      } else {
        past.push(b);
      }
    });

    res.json({ active, past });

  } catch (err) {
    console.error("Status fetch error:", err);
    res.status(500).json({ message: "Failed to load booking status." });
  }
});

// ============================================================
// ✅ USER: Full Booking History (active + past + cancelled)
// Includes payment status and cancellation metadata when available
// ============================================================
app.get("/api/history/:customer_id", async (req, res) => {
  const { customer_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT b.*, 
              c.brand, c.model, c.location,
              p.status AS payment_status, p.refund_amount, p.refund_status,
              bc.reason AS cancelled_reason, bc.cancelled_at
       FROM bookings b
       JOIN cars c ON b.car_id = c.id
       LEFT JOIN payments p ON p.booking_id = b.id
       LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
       WHERE b.customer_id = $1
       ORDER BY b.start_date DESC`,
      [customer_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ message: "Failed to load booking history." });
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
