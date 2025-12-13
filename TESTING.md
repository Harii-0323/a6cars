# A6 Cars - Complete Testing Guide

## ✅ Features Implemented & Testing Checklist

### 1. **Navbar Authentication State** ✅
- **Feature**: Navbar shows/hides login buttons based on authentication state
- **Test**:
  - [ ] Open https://a6cars-frontend.up.railway.app/book.html (not logged in)
  - [ ] Verify: Shows "User Login", "Register", "Admin Login" buttons
  - [ ] Log in with credentials (john@example.com / test123)
  - [ ] Verify: Buttons hide, shows "👋 Hello, [Name]" and Logout button
  - [ ] Click Logout
  - [ ] Verify: Returns to guest state

### 2. **Car Images & Fallback** ✅
- **Feature**: Show car images, fallback to Unsplash if unavailable
- **Test**:
  - [ ] Go to /book.html (logged in)
  - [ ] Verify: All cars display with images
  - [ ] Verify: Images are from Unsplash (fallback works)

### 3. **Booked Dates Hidden** ✅
- **Feature**: Date picker disables already-booked dates
- **Test**:
  - [ ] Go to /book.html
  - [ ] Click "Start Date" input
  - [ ] Verify: Some dates are grayed out (disabled)
  - [ ] Check: These are actual booked dates from database
  - [ ] Try booking within those dates
  - [ ] Verify: Error: "Car already booked for these dates"

### 4. **Payment QR with 180-Second Expiry** ✅
- **Feature**: Payment QR shows countdown, expires after 180 seconds
- **Test**:
  - [ ] Select available dates
  - [ ] Click "Book Now"
  - [ ] Verify: Payment QR popup appears
  - [ ] Verify: Countdown timer shown (180s → 0s)
  - [ ] Wait until QR expires
  - [ ] Verify: Popup closes, shows "QR Code expired"
  - [ ] Try booking again

### 5. **Auto-Redirect After Payment** ✅
- **Feature**: After payment, auto-redirect to Collection QR + Return QR
- **Test**:
  - [ ] Book a car
  - [ ] Payment QR shown
  - [ ] Manually update database: `UPDATE bookings SET paid=true WHERE id=<booking_id>`
  - [ ] Wait 1 second for polling
  - [ ] Verify: Auto-redirects to Collection QR
  - [ ] Verify: Return QR shown 3 seconds later

### 6. **Auto-Download QRs** ✅
- **Feature**: Collection and Return QRs auto-download
- **Test**:
  - [ ] After payment confirmation (see above)
  - [ ] Verify: `collection_qr_<booking_id>.png` auto-downloads
  - [ ] Verify: `return_qr_<booking_id>.png` auto-downloads
  - [ ] Check: Downloads folder has both files

### 7. **Admin QR Verification** ✅
- **Feature**: Admin can scan QR, see collection/return type, customer, booking, car details
- **Test**:
  - [ ] Get collection_qr_<id>.png file
  - [ ] Extract QR data (contains JSON with qr_type, customer, booking info)
  - [ ] Call `/api/admin/verify-qr` with QR data
  - [ ] Verify: Response shows:
    - QR Type: "collection" or "return"
    - Customer: name, phone, email
    - Booking: dates, amount, status
    - Car: model, location
  - [ ] Repeat for return QR

### 8. **Backend Health Check** ✅
- **Feature**: Backend responds to health checks
- **Test**:
  ```bash
  curl https://a6cars-api.up.railway.app/
  # Expected: "🚗 A6 Cars Backend is running successfully!"
  ```

### 9. **GET /api/cars** ✅
- **Feature**: Fetch all available cars
- **Test**:
  ```bash
  curl https://a6cars-api.up.railway.app/api/cars
  # Expected: JSON array of cars with images, price, location
  ```

### 10. **GET /api/bookings/:car_id** ✅
- **Feature**: Get booked dates for a specific car
- **Test**:
  ```bash
  curl https://a6cars-api.up.railway.app/api/bookings/1
  # Expected: Array of {start_date, end_date} for car_id=1
  ```

### 11. **POST /api/book** ✅
- **Feature**: Create new booking with conflict detection
- **Test**:
  ```bash
  curl -X POST https://a6cars-api.up.railway.app/api/book \
    -H "Content-Type: application/json" \
    -d '{
      "car_id": 1,
      "customer_id": 1,
      "start_date": "2025-12-05",
      "end_date": "2025-12-07"
    }'
  # Expected: booking_id, payment_qr, total amount
  ```

### 12. **GET /api/payment/status/:booking_id** ✅
- **Feature**: Check if payment is done
- **Test**:
  ```bash
  curl https://a6cars-api.up.railway.app/api/payment/status/1
  # Expected: {paid: true/false, status: "pending"/"confirmed"}
  ```

### 13. **POST /api/payment/confirm** ✅
- **Feature**: Confirm payment, generate collection + return QRs
- **Test**:
  ```bash
  curl -X POST https://a6cars-api.up.railway.app/api/payment/confirm \
    -H "Content-Type: application/json" \
    -d '{"booking_id": 1}'
  # Expected: collection_qr, return_qr (both as data URLs)
  ```

### 14. **POST /api/admin/verify-qr** ✅
- **Feature**: Admin verifies QR and sees full details
- **Test**:
  ```bash
  curl -X POST https://a6cars-api.up.railway.app/api/admin/verify-qr \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <admin_token>" \
    -d '{
      "qr_data": {
        "qr_type": "collection",
        "booking_id": 1,
        "customer_name": "John"
      }
    }'
  # Expected: Full verification details with customer, booking, car info
  ```

## 📊 Database Updates Required

Run this on Render PostgreSQL database:

```sql
-- Add new columns to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS collection_verified BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_verified BOOLEAN DEFAULT false;

-- Add expiry tracking to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Verify columns exist
\d bookings
\d payments
```

## 🔧 Local Testing Setup

### Prerequisites
- Docker & Docker Compose installed
- Node.js 18+ (if running without Docker)
- PostgreSQL 17 (for local database)

### Start Local Environment
```bash
cd c:\A6cars\a6cars
docker-compose up
```

### Test Endpoints Locally
```bash
# Health check
curl http://localhost:3000

# Get cars
curl http://localhost:3000/api/cars

# Test booking
curl -X POST http://localhost:3000/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "car_id": 1,
    "customer_id": 1,
    "start_date": "2025-12-05",
    "end_date": "2025-12-07"
  }'
```

## 🌐 Production Testing (Render)

### Frontend URLs
- **Booking Page**: https://a6cars-frontend.up.railway.app/book.html
- **History Page**: https://a6cars-frontend.up.railway.app/history.html
- **Home Page**: https://a6cars-frontend.up.railway.app/home.html

### Backend URL
- **Base**: https://a6cars-api.up.railway.app
- **Health**: https://a6cars-api.up.railway.app/

### Test User Credentials
- **Email**: john@example.com
- **Password**: test123

### Test Admin Credentials
- **Email**: karikeharikrishna@gmail.com
- **Password**: Anu

## 🐛 Troubleshooting

### Backend not responding
1. Check Render deployment: https://dashboard.render.com
2. Check logs in Render dashboard
3. Verify DATABASE_URL is set correctly
4. Restart service

### Dates not disabling
1. Check `/api/bookings/:car_id` endpoint returns data
2. Verify flatpickr is loaded (check console for errors)
3. Check browser console for JavaScript errors

### QR not auto-downloading
1. Check browser console for errors
2. Verify QR code generation (should be base64 data URL)
3. Check browser download settings

### Payment status not updating
1. Manually update: `UPDATE bookings SET paid=true WHERE id=<id>`
2. Frontend polls `/api/payment/status/:booking_id`
3. Check polling interval (default: 1 second)

## 📝 Notes

- All QRs contain JSON with booking/customer/car details
- Payment QR expires in 180 seconds
- Admin can scan both collection and return QRs
- Collection QR = pickup verification
- Return QR = dropoff verification
- Database must have: `collection_verified`, `return_verified` columns

## ✨ Next Steps (Future)

- [ ] Email notifications on payment
- [ ] SMS notifications
- [ ] Real payment gateway integration (Razorpay/Stripe)
- [ ] Admin mobile app for QR scanning
- [ ] Analytics dashboard
- [ ] Insurance add-ons
