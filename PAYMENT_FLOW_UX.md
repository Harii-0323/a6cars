# A6 Cars - Payment Flow UX Documentation

## 📊 Complete Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ CUSTOMER INTERACTION FLOW                                       │
└─────────────────────────────────────────────────────────────────┘

  🏠 USER BOOKS CAR
        ↓
  ┌─────────────────────────────────────────┐
  │ Select Dates (Disabled: Past/Booked)    │ ← Booked dates hidden via /api/bookings/:car_id
  │ Click "Book Now"                        │
  └─────────────────────────────────────────┘
        ↓
  📡 Backend: POST /api/book
     - Create booking record
     - Generate payment QR (UPI string)
     - Set expires_at = NOW() + 180 seconds
     - Return: {booking_id, payment_qr, qr_expires_in: 180}
        ↓
  ┌─────────────────────────────────────────┐
  │  💳 SCAN TO PAY Modal Opens              │
  │  ┌─────────────────────────────────────┐ │
  │  │  💳 Scan to Pay                      │ │
  │  │  Amount: ₹100                        │ │
  │  │  ╔═════════════════════════════════╗ │ │
  │  │  ║  QR CODE IMAGE (UPI Enabled)     ║ │ │
  │  │  ║  User scans with UPI app         ║ │ │
  │  │  ╚═════════════════════════════════╝ │ │
  │  │  ⏱️ QR expires in: 180s              │ │
  │  │  [Cancel Payment]                   │ │
  │  └─────────────────────────────────────┘ │
  │                                          │
  │  ⏲️ Countdown Timer: 180 → 0 seconds     │
  │  • Updates every 1 second                 │
  │  • Color: Red when ≤ 30 seconds           │
  │  • Auto-closes when timer reaches 0       │
  └─────────────────────────────────────────┘
        ↓
  🔄 Frontend: Poll Payment Status
     - Check: GET /api/payment/status/{booking_id}
     - Poll interval: 1 second (180 attempts max)
     - Wait for response: {paid: true, status: "confirmed"}
        ↓
  ❌ [If Timer Runs Out Before Payment]
     ┌──────────────────────────────────────┐
     │ QR Code Expired                       │
     │ Please try booking again              │
     │ [Try Again] → Reload Page             │
     └──────────────────────────────────────┘
        ↓
  ✅ [Payment Received! payment_status = true]
        ↓
  ┌──────────────────────────────────────────┐
  │ ✔️ Payment Successful!                    │
  │                                           │
  │ Processing your booking...                │
  │ [Spinning loader animation]               │
  │                                           │
  │ ⏱️ Wait: 1 second                         │
  └──────────────────────────────────────────┘
        ↓
  📡 Backend: POST /api/payment/confirm
     - Fetch full booking, customer, car details
     - Generate TWO QRs:
       a) Collection QR (pickup)
          - qr_type: 'collection'
          - customer_name, phone, car, start_date, amount
       b) Return QR (dropoff)
          - qr_type: 'return'
          - customer_name, phone, car, end_date, amount
     - Update DB: bookings.paid = true, status = 'confirmed'
     - Return: {collection_qr, return_qr, booking_details}
        ↓
  🎫 COLLECTION QR Modal Opens (Blue Theme)
     ┌────────────────────────────────────┐
     │ 🎫 Collection QR                    │
     │ Pickup QR Code                      │
     │ ╔══════════════════════════════════╗ │
     │ ║  QR CODE (Collection)             ║ │
     │ ║  Booking: 3                       ║ │
     │ ║  Car: Toyota Camry                ║ │
     │ ║  Customer: John Doe               ║ │
     │ ║  Amount: ₹100                     ║ │
     │ ╚══════════════════════════════════╝ │
     │ Show this QR at pickup location     │
     │ [Got it!]                           │
     └────────────────────────────────────┘
     ↓
  💾 Auto-Download: collection_qr_3.png
        ↓
  ⏱️ Wait: 4 seconds (UX pause)
        ↓
  🔄 RETURN QR Modal Opens (Orange Theme)
     ┌────────────────────────────────────┐
     │ 🔄 Return QR                        │
     │ Return/Dropoff QR Code              │
     │ ╔══════════════════════════════════╗ │
     │ ║  QR CODE (Return)                 ║ │
     │ ║  Booking: 3                       ║ │
     │ ║  Car: Toyota Camry                ║ │
     │ ║  Customer: John Doe               ║ │
     │ ║  Amount: ₹100                     ║ │
     │ ╚══════════════════════════════════╝ │
     │ Show this QR at return location     │
     │ [Got it!]                           │
     └────────────────────────────────────┘
     ↓
  💾 Auto-Download: return_qr_3.png
        ↓
  ✅ Booking Complete!
     Customer has:
     - Collection QR (for pickup)
     - Return QR (for dropoff)
     - Both auto-downloaded to device
```

---

## 🔄 Payment State Machine

```
BOOKING CREATED
    ↓
    state = 'pending'
    paid = false
    expires_at = NOW() + 180 seconds
    ↓
[Customer scans UPI QR]
    ↓
PAYMENT CONFIRMED (Backend receives notification)
    ↓
    state = 'confirmed'
    paid = true
    status = 'confirmed'
    ↓
[Admin scans Collection QR at pickup]
    ↓
    collection_verified = true
    ↓
[Admin scans Return QR at dropoff]
    ↓
    return_verified = true
    ↓
BOOKING COMPLETE
```

---

## 💻 Frontend Implementation Details

### File: `frontend/book.html`

#### Function 1: `bookCar(car_id)`
```javascript
// User clicks "Book Now"
// 1. Validates dates selected
// 2. Calls POST /api/book
// 3. Receives payment_qr + expires_in: 180
// 4. Shows payment QR modal with countdown
```

#### Function 2: `showPaymentQRWithCountdown(booking_id, qr, amount, seconds)`
```javascript
// Displays modal with:
// - Payment QR image
// - Amount: ₹100
// - Countdown timer (180s)
// - "Waiting for payment confirmation..." message
// - Auto-closes when timer reaches 0
// - Timer color turns red when ≤ 30 seconds
```

#### Function 3: `pollForPaymentConfirmation(booking_id, timer, onQRClose)`
```javascript
// Polls GET /api/payment/status/{booking_id}
// - Interval: 1 second
// - Max attempts: 180 (180 seconds)
// 
// On payment.paid === true:
// 1. Show "✔️ Payment Successful!" with spinner
// 2. Wait 1 second for UX pause
// 3. Call POST /api/payment/confirm
// 4. Close payment QR modal
// 5. Show Collection QR modal
// 6. Auto-download collection_qr.png
// 7. Wait 4 seconds
// 8. Show Return QR modal
// 9. Auto-download return_qr.png
```

#### Function 4: `showCollectionQRModal(title, qr, booking_id, bookingDetails)`
```javascript
// Blue theme modal
// - Title: "🎫 Collection QR"
// - Subtitle: "Pickup QR Code"
// - Shows QR image
// - Displays car, customer, amount
// - Help text: "Show this QR at pickup location"
// - Button: "Got it!"
```

#### Function 5: `showReturnQRModal(title, qr, booking_id, bookingDetails)`
```javascript
// Orange theme modal
// - Title: "🔄 Return QR"
// - Subtitle: "Return/Dropoff QR Code"
// - Shows QR image
// - Displays car, customer, amount
// - Help text: "Show this QR at return location"
// - Button: "Got it!"
```

#### Function 6: `downloadQR(dataUrl, filename)`
```javascript
// Auto-downloads QR PNG file
// - Called for collection QR immediately
// - Called for return QR after 4-second delay
// - Filenames: collection_qr_3.png, return_qr_3.png
```

---

## 📡 Backend API Endpoints

### 1. POST `/api/book` - Create Booking
**Request:**
```json
{
  "car_id": 1,
  "customer_id": 1,
  "start_date": "2025-12-28",
  "end_date": "2025-12-30"
}
```

**Response:**
```json
{
  "message": "Booking created successfully",
  "booking_id": 3,
  "total": 100,
  "payment_qr": "data:image/png;base64...",
  "qr_expires_in": 180
}
```

**Database Updates:**
```sql
INSERT INTO bookings (
  customer_id, car_id, start_date, end_date, 
  total_amount, status, paid
) VALUES (
  1, 1, '2025-12-28', '2025-12-30',
  100, 'pending', false
);

INSERT INTO payments (
  booking_id, amount, status, payment_qr, expires_at
) VALUES (
  3, 100, 'pending', '...', NOW() + INTERVAL '180 seconds'
);
```

### 2. GET `/api/payment/status/:booking_id` - Check Payment
**Response (Pending):**
```json
{"paid": false, "status": "pending"}
```

**Response (Paid):**
```json
{"paid": true, "status": "confirmed"}
```

### 3. POST `/api/payment/confirm` - Generate QRs
**Request:**
```json
{"booking_id": 3}
```

**Response:**
```json
{
  "message": "Payment confirmed ✅",
  "collection_qr": "data:image/png;base64...",
  "return_qr": "data:image/png;base64...",
  "booking_details": {
    "booking_id": 3,
    "customer_name": "John Doe",
    "car": "Toyota Camry",
    "amount": "100.00"
  }
}
```

**Database Updates:**
```sql
UPDATE bookings 
SET paid = true, status = 'confirmed'
WHERE booking_id = 3;

UPDATE payments
SET status = 'paid'
WHERE booking_id = 3;
```

### 4. POST `/api/admin/verify-qr` - Verify QR at Pickup/Dropoff
**Request:**
```json
{"qr_data": {...collection QR JSON data...}}
```

**Response:**
```json
{
  "qr_type": "collection",
  "customer": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com"
  },
  "booking": {
    "start_date": "2025-12-28",
    "end_date": "2025-12-30",
    "amount": "100.00",
    "status": "confirmed"
  },
  "car": {
    "id": 1,
    "model": "Toyota Camry",
    "location": "Downtown"
  }
}
```

**Database Updates:**
```sql
-- If collection QR scanned:
UPDATE bookings
SET collection_verified = true
WHERE booking_id = 3;

-- If return QR scanned:
UPDATE bookings
SET return_verified = true
WHERE booking_id = 3;
```

---

## ⏱️ Timing Specifications

| Event | Timing | Purpose |
|-------|--------|---------|
| QR Display | Immediate | Show payment modal |
| QR Countdown | 180 seconds | Give customer time to pay |
| Poll Interval | 1 second | Check payment status |
| Success Message | 1 second | UX feedback |
| Collection QR Display | Immediate after payment | Show pickup QR |
| Auto-Download Collection | Immediate | Save to device |
| Return QR Display | 4 seconds after collection | Brief UX pause |
| Auto-Download Return | Immediate | Save to device |

---

## 🎨 Color Coding

| Element | Color | Purpose |
|---------|-------|---------|
| Payment QR Modal | White bg, Blue header | Initial payment stage |
| Countdown Timer | Red (#DC2626) | Urgent action needed |
| Collection QR Modal | Blue theme | Pickup stage |
| Return QR Modal | Orange theme | Dropoff stage |
| Success Message | Green | Payment confirmed |

---

## 🔐 Security Notes

1. **QR Expiration**: QRs expire after 180 seconds to prevent stale payments
2. **Verification Workflow**: Admin must scan both collection & return QRs
3. **Database Tracking**: All QR scans logged via `collection_verified` and `return_verified` flags
4. **Booking Status**: Can only transition from 'pending' → 'confirmed' → 'completed'

---

## 📱 UX Best Practices Implemented

1. ✅ **Clear Visual Hierarchy**: Large QR codes, prominent amounts, clear labels
2. ✅ **Real-Time Feedback**: Countdown timer shows time remaining
3. ✅ **Auto-Download**: No manual save dialog - seamless experience
4. ✅ **Color Coding**: Different colors for different stages (blue/orange)
5. ✅ **Progressive Disclosure**: Show collection QR first, return QR after 4-second pause
6. ✅ **Error Handling**: Clear messages for expired QR or payment failure
7. ✅ **Accessibility**: All text labels, no icon-only buttons
8. ✅ **Loading States**: Spinner shown while processing payment confirmation

---

## 🚀 Deployment Status

- ✅ Payment QR display with countdown: **IMPLEMENTED**
- ✅ Payment status polling: **IMPLEMENTED**
- ✅ Dual QR generation (collection + return): **IMPLEMENTED**
- ✅ Auto-download functionality: **IMPLEMENTED**
- ✅ Admin verification endpoint: **IMPLEMENTED**
- ⏳ Live production testing: **PENDING**

---

**Updated**: January 24, 2025
**Status**: Ready for Production Deployment
