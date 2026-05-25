#!/bin/bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🗳️  SecureVote System Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start backend
echo "🔵 Starting backend on port 8000..."
cd voting-backend
pip install fastapi uvicorn passlib[bcrypt] -q
uvicorn main:app --reload &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

cd ../frontend
echo ""
echo "🟢 Starting frontend on port 5173..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Both services running!"
echo "  🌐 Frontend: http://localhost:5173"
echo "  🔧 Backend:  http://localhost:8000"
echo "  📖 API Docs: http://localhost:8000/docs"
echo ""
echo "  🔑 Election Secret Key: KB1234"
echo "  🛡️  Admin Login: admin / admin@secure2024"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
