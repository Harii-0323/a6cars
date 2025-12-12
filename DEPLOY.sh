#!/bin/bash
# A6 Cars - Quick Deployment Commands

echo "🚀 A6 CARS - DEPLOYMENT SETUP"
echo "=============================="
echo ""

# Check if authenticated with GitHub
echo "📦 Step 1: GitHub Authentication"
echo "================================"
echo ""
echo "If you haven't authenticated yet, run:"
echo "git config --global user.name 'Your Name'"
echo "git config --global user.email 'your.email@example.com'"
echo ""
echo "Or use GitHub CLI:"
echo "gh auth login"
echo ""

# Show current git status
echo "📝 Step 2: Check Git Status"
echo "=========================="
echo ""
echo "Current changes:"
git status --short
echo ""

# Show how to push to GitHub
echo "🔄 Step 3: Push to GitHub"
echo "========================"
echo ""
echo "Run these commands:"
echo "cd c:\A6cars\a6cars"
echo "git push origin main"
echo ""

# Render deployment
echo "🎯 Step 4: Deploy to Render"
echo "=========================="
echo ""
echo "Method A: Using Blueprint (Recommended)"
echo "1. Go to https://render.com/dashboard"
echo "2. Click 'New +' → 'Blueprint'"
echo "3. Connect your GitHub account"
echo "4. Select 'a6cars' repository"
echo "5. Click 'Deploy Blueprint'"
echo ""

echo "Method B: Manual Deployment"
echo "1. Create Backend Service (Node.js)"
echo "2. Create PostgreSQL Database"
echo "3. Create Frontend Service (Static)"
echo "4. Link database to backend"
echo "5. Run setup_pg.sql to initialize schema"
echo ""

# Show deployment info
echo "📊 Step 5: Verify Deployment"
echo "============================"
echo ""
echo "Test Backend Health:"
echo "curl https://a6cars-api.up.railway.app/"
echo ""
echo "Test API:"
echo "curl -X POST https://a6cars-api.up.railway.app/api/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"john@example.com\",\"password\":\"test123\"}'"
echo ""
echo "Access Frontend:"
echo "https://a6cars-frontend.up.railway.app"
echo ""

# Environment variables
echo "🔐 Step 6: Environment Variables"
echo "================================"
echo ""
echo "Set these in Render Backend service:"
echo "JWT_SECRET=secret123"
echo "ADMIN_EMAIL=karikeharikrishna@gmail.com"
echo "ADMIN_PASSWORD=Anu"
echo "NODE_ENV=production"
echo "PORT=3000"
echo ""

# Admin credentials
echo "👤 Step 7: Admin Login Credentials"
echo "=================================="
echo ""
echo "Email: karikeharikrishna@gmail.com"
echo "Password: Anu"
echo ""

# Test user
echo "👤 Step 8: Test User Credentials"
echo "=============================="
echo ""
echo "Email: john@example.com"
echo "Password: test123"
echo ""

echo "✅ DEPLOYMENT CHECKLIST"
echo "======================="
echo ""
echo "[ ] Push code to GitHub"
echo "[ ] Create Render Blueprint or Services"
echo "[ ] Run database initialization (setup_pg.sql)"
echo "[ ] Test backend health endpoint"
echo "[ ] Test login endpoint"
echo "[ ] Access frontend URL"
echo "[ ] Update Flutter app API URLs"
echo "[ ] Monitor application logs"
echo ""

echo "📚 Documentation"
echo "================="
echo "See RENDER_DEPLOYMENT.md for detailed instructions"
echo ""
