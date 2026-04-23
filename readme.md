# 🗳️ Voting System (React + FastAPI)

A simple full-stack voting system built using **React + Tailwind CSS (Frontend)** and **FastAPI + SQLite (Backend)**.

This project ensures:

* ✅ Voter registration (name, age, secret code)
* 🔐 Secure voting using secret code verification
* 🚫 No duplicate voting
* ⚡ Real-time results (auto-refresh)


---

## ⚙️ Backend Setup (FastAPI + SQLite)

### 1️⃣ Navigate to backend folder

```bash
cd backend
```

### 2️⃣ Create virtual environment

```bash
python3 -m venv venv
```

### 3️⃣ Activate virtual environment

#### Linux / macOS

```bash
source venv/bin/activate
```

#### Windows

```bash
venv\Scripts\activate
```

---

### 4️⃣ Install dependencies

```bash
pip install fastapi uvicorn
```

> ⚠️ Note: `sqlite3` is already included in Python, no need to install it.

---

### 5️⃣ Run backend server

```bash
uvicorn main:app --reload
```

---

### 6️⃣ Open API docs

```
http://127.0.0.1:8000/docs
```

---

## 🎨 Frontend Setup (React + Tailwind)

### 1️⃣ Navigate to frontend folder

```bash
cd frontend
```

---

### 2️⃣ Install dependencies

```bash
npm install
```

If project not created yet:

```bash
npx create-react-app frontend
cd frontend
npm install axios
```

---

### 3️⃣ Install Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update `tailwind.config.js`:

```js
content: ["./src/**/*.{js,jsx}"],
```

---

### 4️⃣ Add Tailwind to CSS

In `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

### 5️⃣ Run frontend

```bash
npm run dev
```

or (CRA)

```bash
npm start
```

---

## 🔗 API Base URL

Make sure frontend uses:

```js
const API = "http://127.0.0.1:8000";
```

---

## ⚠️ CORS Fix (Important)

Backend already includes:

```python
from fastapi.middleware.cors import CORSMiddleware
```

This allows frontend to communicate with backend.

---

## 🚀 Features Explained

### 🧾 Registration

* Stores voter name, age, and secret code
* Prevents duplicate registration

### 🗳️ Voting

* Validates secret code
* Ensures one vote per user

### 📊 Results

* Fetches vote counts
* Auto-updates every 2 seconds

---

## 🧠 How It Works

* SQLite database stores voters & candidates
* React sends API requests using Axios
* FastAPI processes requests and updates database
* Results are fetched periodically for real-time display

---

## 📸 Example Files

Frontend: 
Backend: 

---

## 🧪 Test Flow

1. Register a user
2. Vote using same name + secret code
3. Try voting again → ❌ blocked
4. See results update live

---

## 🔮 Future Improvements

* 🔐 JWT Authentication
* 📧 OTP verification
* ⚡ WebSocket real-time updates
* 🎨 Better UI/UX
* 🧑‍💼 Admin panel

---

## 👨‍💻 Author

Built as a learning project for:

* Full-stack development
* API integration
* Database handling

---

## ⭐ If you like this project

Give it a star ⭐ and improve it further!
