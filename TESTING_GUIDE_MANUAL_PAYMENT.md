# 🧪 Manual Payment Verification - Testing Guide

## Prerequisites
- ✅ Database migration applied: `migration_add_payment_reference.sql`
- ✅ Backend redeployed with new `/api/verify-payment` endpoint
- ✅ Frontend updated with payment reference modal

---

## Test Scenario 1: Valid Payment Verification

### Steps:
1. Open frontend: `https://a6cars-latest.onrender.com`
2. Login with customer account
3. Select a car → Choose dates → Click "Book Now"
4. **Expected Result**: Payment reference modal appears with:
   - Booking ID
   - From/To dates
   - Amount in rupees
   - Payment QR image
   - Text input for "Payment Reference ID"
   - "Paid - Verify" (blue) and "Cancel" (red) buttons

5. Enter a test reference ID (e.g., `TEST123456789`)
6. Click "Paid - Verify"
7. **Expected Result**:
   - Spinner shows "Payment Verified!" in green
   - Modal closes after 1 second
   - Collection QR appears automatically
   - QR auto-downloads as `collection_qr_XXX.png`
   - After 4 seconds, Return QR appears
   - Return QR auto-downloads as `return_qr_XXX.png`

### Verification:
```sql
-- Check database for payment verification
SELECT booking_id, payment_reference_id, status, updated_at 
FROM payments 
WHERE payment_reference_id = 'TEST123456789';

-- Should show:
-- booking_id | payment_reference_id | status   | updated_at
-- 123        | TEST123456789        | verified | 2024-12-25 14:30:45
```

---

## Test Scenario 2: Invalid Reference ID (Empty)

### Steps:
1. In payment modal, leave reference ID field empty
2. Click "Paid - Verify"
3. **Expected Result**:
   - JavaScript alert: "Please enter a payment reference ID"
   - Modal remains open
   - Input field regains focus

---

## Test Scenario 3: Booking Not Found

### Steps:
1. In browser console, manually call:
   ```javascript
   fetch('https://a6cars-backend-latest.onrender.com/api/verify-payment', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       booking_id: 999999,  // Non-existent
       payment_reference_id: 'TEST123',
       customer_id: 123
     })
   })
   ```
2. **Expected Result**:
   ```json
   {
     "message": "Booking not found or does not belong to this customer."
   }
   ```

---

## Test Scenario 4: Already Paid Booking

### Steps:
1. Create booking with ID `X`
2. Verify payment once (reference ID: `FIRST`)
3. Try to verify again with different reference ID: `SECOND`
4. **Expected Result**:
   - Alert: "❌ Payment already verified for this booking."
   - Payment reference modal shows error

---

## Test Scenario 5: Customer Ownership Verification

### Steps:
1. Book car with Customer A (ID=5)
2. Try to verify payment with:
   ```javascript
   {
     booking_id: <Customer_A_booking>,
     payment_reference_id: 'TEST',
     customer_id: 999  // Different customer
   }
   ```
3. **Expected Result**:
   - Response: "Booking not found or does not belong to this customer."
   - No payment record created

---

## Test Scenario 6: Database Constraints

### Test Duplicate Reference ID:
1. Verify payment with reference: `UNIQUE123`
2. Try to verify another booking with same reference: `UNIQUE123`
3. **Expected Result**:
   - Database constraint error (UNIQUE violation)
   - Backend logs error
   - User sees: "❌ Error verifying payment"

---

## Test Scenario 7: Admin Dashboard

### Steps:
1. Login as admin
2. View bookings/payments
3. Verify payment reference ID is visible
4. Click on payment to see details
5. **Expected Result**:
   - Payment reference ID displayed
   - Verification timestamp shown
   - QR codes accessible

---

## Performance Test: Multiple Concurrent Verifications

```javascript
// Test multiple simultaneous verifications
async function stressTest() {
  const promises = [];
  
  for (let i = 0; i < 10; i++) {
    promises.push(
      fetch('https://a6cars-backend-latest.onrender.com/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: i + 1,
          payment_reference_id: `STRESS_${i}`,
          customer_id: 1
        })
      })
    );
  }
  
  const results = await Promise.all(promises);
  console.log('All requests completed:', results.map(r => r.status));
}

stressTest();
```

**Expected Result**: All requests return 200-500 (depending on data), no database crashes

---

## Database Verification

### Check Migration Applied:
```sql
\d payments

-- Should show columns:
-- payment_reference_id | character varying(255)
-- updated_at           | timestamp without time zone
```

### Check Indexes:
```sql
SELECT * FROM pg_indexes WHERE tablename = 'payments';

-- Should show:
-- idx_payment_reference_id
-- idx_payment_booking_status
```

### Check Sample Data:
```sql
SELECT id, booking_id, payment_reference_id, status, created_at, updated_at
FROM payments
ORDER BY updated_at DESC
LIMIT 5;
```

---

## Backend Logs to Check

### Success:
```
[INFO] POST /api/verify-payment
[INFO] ✅ Payment verified for booking 123 with reference TEST123456789
```

### Error Logs:
```
[ERROR] ❌ Payment verification error: Booking not found
[ERROR] ❌ Payment verification error: Payment already verified
[WARN]  Database constraint violation: UNIQUE on payment_reference_id
```

---

## Rollback Test (If Needed)

### If verification fails:
1. Check backend logs for errors
2. Verify migration was applied
3. Check customer_id is passed correctly
4. Verify payment table has `payment_reference_id` column

### Quick Debug:
```javascript
// In browser console - test backend connectivity
await fetch('https://a6cars-backend-latest.onrender.com/').then(r => r.text())
// Should return: "🚗 A6 Cars Backend is running successfully!"
```

---

## Checklist Before Going Live

- [ ] Migration applied to production database
- [ ] Backend redeployed successfully
- [ ] Frontend loads without errors
- [ ] Payment modal displays correctly
- [ ] Test Scenario 1 passes (valid verification)
- [ ] Test Scenario 2 passes (empty reference)
- [ ] Test Scenario 3 passes (booking not found)
- [ ] Test Scenario 4 passes (already paid)
- [ ] Database verification passed
- [ ] Backend logs show no errors
- [ ] QR codes generate and display
- [ ] Auto-download works for both QRs
- [ ] Admin dashboard shows verified payments
- [ ] Performance test passes (load test)

---

## Support Commands

### Check Backend Status:
```bash
curl https://a6cars-backend-latest.onrender.com/
```

### View Backend Logs:
```bash
# On Render dashboard → Backend → Logs
```

### Manual Database Check:
```bash
psql a6cars-db -c "SELECT COUNT(*) FROM payments WHERE payment_reference_id IS NOT NULL;"
```

### Reset Test Data (Be Careful!):
```sql
-- Only for testing - remove verified payments
DELETE FROM payments WHERE payment_reference_id LIKE 'TEST%';
```

---

**All Tests Passed? ✅ System is ready for production!**
