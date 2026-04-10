# 💰 AI Finance Analyzer

An intelligent personal finance management web app that combines **Machine Learning**, **Generative AI**, and **real-time data** to help users track expenses, predict budgets, and get personalized investment advice.

## 🚀 Features

- **Smart Dashboard** — Real-time income, expense & savings tracking with animated stats
- **ML Budget Prediction** — Gradient Boosting model (R²=0.98) trained on 50K records predicts safe spending limits
- **AI Finance Assistant** — Floating chatbot powered by Groq (LLaMA 3.3) for finance Q&A
- **Smart Financial Analysis** — Personalized SIP, FD & savings recommendations via LLM
- **AI Insights** — Auto-generated financial advice based on your actual spending patterns
- **Analytics** — Interactive charts for spending breakdown and cash flow trends
- **Authentication** — OTP-based email login + Google OAuth
- **Export** — Download transactions as Excel report

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Backend | Node.js, Express.js |
| Database | MongoDB (Mongoose) |
| ML Engine | Python, Flask, Scikit-learn (Gradient Boosting) |
| AI/LLM | Groq API (LLaMA 3.3-70B) |
| Auth | Passport.js, Google OAuth 2.0, Nodemailer |

## 📁 Project Structure

```
finance-ai-app/
├── frontend/          # HTML/CSS/JS pages
├── backend/           # Node.js + Express API
│   ├── models/        # MongoDB schemas
│   ├── config/        # Passport OAuth config
│   └── server.js      # Main server
└── ml-engine/         # Python Flask ML server
    ├── data.py        # Dataset generation
    ├── train.py       # Model training
    └── app.py         # Flask prediction API
```

## ⚙️ Setup

**Backend:**
```bash
cd backend
npm install
node server.js
```

**ML Engine:**
```bash
cd ml-engine
pip install flask flask-cors scikit-learn pandas numpy
python data.py
python train.py
python app.py
```

**Environment Variables** — Create `backend/.env`:
```
MONGO_URI=mongodb://localhost:27017/financeDB
GROQ_API_KEY=your_key
GOOGLE_CLIENT_ID=your_id
GOOGLE_CLIENT_SECRET=your_secret
EMAIL_USER=your_email
EMAIL_PASS=your_app_password
SESSION_SECRET=your_secret
```
