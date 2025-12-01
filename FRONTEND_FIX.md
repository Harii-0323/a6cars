# 🛠️ Frontend Issues - Complete Fix Guide

## **Problem Identified**

The frontend was configured with incorrect backend URLs:
- ❌ Hardcoded `https://a6cars.onrender.com` (wrong domain)
- ❌ Hardcoded `http://localhost:10000` (wrong port)
- ❌ Inconsistent URLs across different HTML files

---

## **✅ What's Been Fixed**

### **1. Created Smart Configuration File**
- **File:** `frontend/api-config.js`
- **Purpose:** Auto-detects backend URL based on environment
- **Features:**
  - Automatically uses `http://localhost:3000` for local development
  - Automatically uses `https://a6cars-backend.onrender.com` for production
  - Provides helper functions for API calls

### **2. Updated All Frontend Files**

| File | Old URL | New URL |
|------|---------|---------|
| `index.html` | `https://a6cars.onrender.com` | Auto-detected |
| `login.html` | `https://a6cars.onrender.com` | Auto-detected |
| `register.html` | `https://a6cars.onrender.com` | Auto-detected |
| `home.html` | `http://localhost:10000` | `http://localhost:3000` |
| `book.html` | `http://localhost:10000` | `http://localhost:3000` |
| `booking.html` | `http://localhost:10000` | `http://localhost:3000` |
| `history.html` | `http://localhost:5000` | `http://localhost:3000` |
| `admin.html` | `http://localhost:10000` | `http://localhost:3000` |

---

## **🚀 How to Redeploy on Render**

### **Step 1: Verify Changes Locally**

```bash
# Clear browser cache and local storage
# Open browser DevTools → Application → Clear Storage

# Test locally
cd c:\A6cars\a6cars
docker-compose up -d

# Visit http://localhost:8080 (or your frontend URL)
# Should automatically use http://localhost:3000 for API
```

### **Step 2: Push Changes to GitHub**

```bash
cd c:\A6cars\a6cars
git push origin main
```

### **Step 3: Redeploy Frontend on Render**

**Option A: Auto-Redeploy (If enabled)**
- Just push to GitHub, Render will auto-deploy

**Option B: Manual Redeploy**
1. Go to Render Dashboard
2. Select `a6cars-frontend` service
3. Click **"Manual Deploy"** or **"Clear Build Cache & Deploy"**
4. Wait for deployment to complete

### **Step 4: Verify Deployment**

```bash
# Test frontend
curl https://a6cars-frontend.onrender.com

# Test API call (should show no errors in browser console)
```

---

## **📊 URL Reference**

### **Local Development**
```
Frontend: http://localhost:8080
Backend:  http://localhost:3000
Database: localhost:5432
```

### **Render Production**
```
Frontend: https://a6cars-frontend.onrender.com
Backend:  https://a6cars-backend.onrender.com
Database: [PostgreSQL connection string from Render]
```

---

## **🔍 Troubleshooting**

### **Problem: Frontend still shows errors**

**Solution 1: Clear Browser Cache**
```javascript
// Open browser DevTools Console and run:
localStorage.clear();
sessionStorage.clear();
location.reload();
```

**Solution 2: Check Render Deployment Status**
- Go to Render Dashboard
- Check `a6cars-frontend` → **Logs**
- Look for any build or deploy errors

**Solution 3: Verify Backend URL in Browser**
```javascript
// Open DevTools Console
console.log(window.API_CONFIG.BACKEND_URL);
// Should show: https://a6cars-backend.onrender.com
```

### **Problem: API calls failing with 404**

**Check:**
1. Backend is running: `curl https://a6cars-backend.onrender.com/`
2. Database is initialized: Run `setup_pg.sql`
3. Environment variables set in Render
4. CORS is enabled in backend (should be)

### **Problem: Images not loading**

**Solution:**
- Check image paths in console
- Should be: `https://a6cars-backend.onrender.com/uploads/...`
- If showing different URL, there's a mismatch

### **Problem: Login redirects to wrong page**

**Solution:**
- Clear browser storage: `localStorage.clear()`
- Check that auth token is being saved correctly
- Verify backend returns proper JWT token

---

## **✅ Deployment Checklist**

- [ ] All frontend files updated with correct URLs
- [ ] api-config.js created in frontend folder
- [ ] Changes committed to GitHub
- [ ] Frontend redeployed on Render
- [ ] Backend is running on Render
- [ ] Database is initialized
- [ ] Browser cache cleared
- [ ] Login page works
- [ ] Can register new user
- [ ] Can view cars
- [ ] Can book a car
- [ ] Payment QR code appears
- [ ] Images load correctly

---

## **🎯 Next Steps**

1. **Force redeploy frontend** on Render
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Test login** at https://a6cars-frontend.onrender.com/login.html
4. **Check console** for any API errors (F12)
5. **Monitor logs** in Render dashboard

---

## **📞 If Still Having Issues**

Check these logs:

**Frontend Logs (Render Dashboard):**
- Service: `a6cars-frontend`
- Tab: **Logs**

**Backend Logs (Render Dashboard):**
- Service: `a6cars-backend`
- Tab: **Logs**

**Browser Console (F12):**
- Check for red error messages
- Look for failed API calls
- Verify backend URL is correct

---

**Frontend is now properly configured for Render deployment!** ✅

