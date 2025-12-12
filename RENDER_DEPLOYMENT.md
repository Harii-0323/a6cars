# 🚀 A6 Cars - Render Deployment Guide

## **Prerequisites**
- GitHub account with the a6cars repository
- Render account (https://render.com)
- Git configured on your machine

---

## **Step 1: Push Code to GitHub**

```powershell
cd c:\A6cars\a6cars

# Configure git if needed
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Add and commit changes
git add -A
git commit -m "Production ready: Database schema, APIs, and Render config"

# Push to GitHub
git push origin main
```

If you get authentication errors, use GitHub Personal Access Token:
- Create token at: https://github.com/settings/tokens
- Use token as password when prompted

---

## **Step 2: Deploy on Render**

### **Option A: Using render.yaml (Recommended)**

1. Go to https://render.com/dashboard
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Authorize Render to access your GitHub account
5. Select the `a6cars` repository
6. Render will automatically read `render.yaml` and create:
   - ✅ Backend service (Node.js)
   - ✅ Frontend service (Static)
   - ✅ PostgreSQL database

7. Configure environment variables:
   - **JWT_SECRET:** `your-secret-key-here`
   - **ADMIN_EMAIL:** `karikeharikrishna@gmail.com`
   - **ADMIN_PASSWORD:** `Anu`
   - **NODE_ENV:** `production`

8. Click **"Deploy Blueprint"**
9. Wait for services to deploy (5-10 minutes)

---

### **Option B: Manual Setup (If render.yaml fails)**

#### **Create Backend Service:**
1. Dashboard → **"New +"** → **"Web Service"**
2. Connect GitHub repository
3. **Settings:**
   - Name: `a6cars-backend`
   - Environment: `Node`
   - Region: `Singapore` (or nearest)
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node server.js`
   
4. **Environment Variables:**
   ```
   JWT_SECRET=your-secret-key
   ADMIN_EMAIL=karikeharikrishna@gmail.com
   ADMIN_PASSWORD=Anu
   NODE_ENV=production
   PORT=3000
   ```

5. Click **"Create Web Service"**

#### **Create Database:**
1. Dashboard → **"New +"** → **"PostgreSQL"**
2. **Settings:**
   - Name: `a6cars-db`
   - Database Name: `a6cars_db`
   - User: `root`
   - Region: `Singapore`
   - Plan: Free

3. Click **"Create Database"**

#### **Link Database to Backend:**
1. Go to Backend service settings
2. Add environment variable:
   - Key: `DATABASE_URL`
   - Value: Copy from PostgreSQL service details page

3. After linking, run migrations:
   ```sql
   -- Connect to database and run setup_pg.sql
   ```

#### **Create Frontend Service:**
1. Dashboard → **"New +"** → **"Static Site"**
2. **Settings:**
   - Name: `a6cars-frontend`
   - Environment: `Static`
   - Build Command: Leave empty
   - Publish directory: `frontend`
   - Connect GitHub repository

3. Click **"Create Static Site"**

---

## **Step 3: Run Database Initialization**

After deployment:

1. Go to PostgreSQL service details
2. Click **"Connect"** → **"PSQL"**
3. Copy the connection string
4. Run the schema setup:

```bash
# Copy the connection string from Render
psql "postgresql://user:password@host:5432/a6cars_db" < setup_pg.sql
```

Or copy and paste the SQL from `setup_pg.sql` into the Render SQL editor.

---

## **Step 4: Verify Deployment**

### **Backend Health Check:**
```bash
# Railway backend URL
curl https://a6cars-api.up.railway.app/
# Should return: "🚗 A6 Cars Backend is running successfully!"
```

### **Test Endpoints:**
```bash
# Register user
curl -X POST https://a6cars-api.up.railway.app/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","phone":"9876543210","password":"test123"}'

# Login
curl -X POST https://a6cars-api.up.railway.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### **Frontend Access:**
```
https://a6cars-frontend.up.railway.app
```

---

## **Step 5: Configure Custom Domain (Optional)**

1. Go to Frontend service → **Settings** → **Custom Domain**
2. Add your domain name
3. Update DNS records (follow Render's instructions)

---

## **Environment Variables Reference**

| Variable | Value | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Auto-linked | PostgreSQL connection |
| `JWT_SECRET` | `secret123` | JWT token signing |
| `ADMIN_EMAIL` | `karikeharikrishna@gmail.com` | Admin account email |
| `ADMIN_PASSWORD` | `Anu` | Admin account password |
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | Backend port |

---

## **Troubleshooting**

### **Backend won't start:**
- Check build logs in Render dashboard
- Verify `DATABASE_URL` is set
- Ensure `package.json` exists in `backend/` folder

### **Database connection error:**
- Verify PostgreSQL service is running
- Check `DATABASE_URL` format
- Run `setup_pg.sql` to create tables

### **Static files not loading:**
- Check `staticPublishPath: frontend` in render.yaml
- Verify HTML files exist in `frontend/` folder
- Check browser console for 404 errors

### **CORS errors:**
- Verify backend CORS middleware is enabled
- Check frontend API URLs point to correct backend URL

---

## **Important URLs After Deployment**

| Service | URL Format |
|---------|-----------|
| Backend API | `https://a6cars-api.up.railway.app` |
| Frontend | `https://a6cars-frontend.up.railway.app` |
| Database | `postgresql://user:pass@host:5432/a6cars_db` |

---

## **Next Steps**

1. ✅ Push code to GitHub
2. ✅ Deploy services on Render
3. ✅ Initialize database with schema
4. ✅ Test all endpoints
5. ✅ Update Flutter/Web app with production URLs
6. ✅ Monitor logs and performance

---

## **Support**

For issues:
- Check Render logs: Service → **Logs**
- Review error messages
- Test locally with Docker first
- Contact Render support if needed

