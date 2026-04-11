const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();

// 1. Model Import (Sirf ek baar)
const User = require('./models/user'); 
const Transaction = require('./models/Transaction'); // Ensure models/Transaction.js exists

const app = express();
const otpStore = {};
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:5001';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// Middlewares
app.use(cors());
app.use(express.json());

// Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
}));

// Passport Config
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// MongoDB Connection (Sirf Ek Baar Connect karein)
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/financeDB')
    .then(() => console.log("✅ MongoDB Connected Successfully!"))
    .catch(err => console.log("❌ DB Error:", err));

// NODEMAILER SETUP
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter on startup
transporter.verify((error, success) => {
    if (error) {
        console.error("❌ Email transporter error:", error.message);
    } else {
        console.log("✅ Email server is ready to send messages");
    }
});

function ensureGroqConfigured() {
    if (!process.env.GROQ_API_KEY) {
        const error = new Error('GROQ_API_KEY is not configured');
        error.statusCode = 503;
        throw error;
    }
}

async function createGroqCompletion(messages, options = {}) {
    ensureGroqConfigured();

    const response = await axios.post(GROQ_API_URL, {
        model: GROQ_MODEL,
        messages,
        ...options
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    return response.data.choices?.[0]?.message?.content || '';
}

// --- ROUTES ---

// Gemini AI Advice
// Groq AI Advice
app.post('/api/ai-advice', async (req, res) => {
    try {
        const { income, expense, savings, topCategory } = req.body;
        const prompt = `Analyze these finances: Income: ₹${income}, Expense: ₹${expense}, Savings: ₹${savings}. The highest spending is on ${topCategory}. Give a professional 2-line advice in English on how to improve savings. Keep it witty and helpful.`;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ advice: response.data.choices[0].message.content });
    } catch (err) {
        console.error("AI Advice Error:", err.response?.data || err.message);
        res.status(500).json({ advice: "Add some transactions to get personalized AI insights!" });
    }
});

// Flask AI Prediction
app.post('/api/get-prediction', async (req, res) => {
    try {
        const { month, monthly_income, prev_month_expense, category } = req.body;
        const response = await axios.post('http://localhost:5001/predict', {
            month, monthly_income, prev_month_expense, category
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ status: "error", message: "Brain (Flask) is offline" });
    }
});

// Transaction Routes
app.get('/api/transactions', async (req, res) => {
    try {
        const { email } = req.query;
        const filter = {};
        if (email) {
            const user = await User.findOne({ email });
            if (user) filter.userId = user._id;
        }
        const txs = await Transaction.find(filter).sort({ date: -1 });
        res.json(txs);
    } catch (err) { 
        res.status(500).json({ error: "Database se data nahi mila" }); 
    }
});

app.post('/api/add-transaction', async (req, res) => {
    try {
        const { email, ...txData } = req.body;
        if (email) {
            const user = await User.findOne({ email });
            if (user) txData.userId = user._id;
        }
        const tx = new Transaction(txData);
        await tx.save();
        res.status(201).json({ message: "Saved" });
    } catch (err) { res.status(400).json(err); }
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', async (req, res) => {
    try {
        const { email } = req.query;
        const matchFilter = {};
        if (email) {
            const user = await User.findOne({ email });
            if (user) matchFilter.userId = user._id;
        }
        const stats = await Transaction.aggregate([
            { $match: matchFilter },
            { $group: { _id: "$type", total: { $sum: "$amount" } } }
        ]);
        let result = { income: 0, expense: 0 };
        stats.forEach(s => {
            if(s._id === 'income') result.income = s.total;
            if(s._id === 'expense') result.expense = s.total;
        });
        res.json({ ...result, savings: result.income - result.expense });
    } catch (err) { res.status(500).json(err); }
});

// Auth Logic (OTP & Google)
app.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            return res.json({ exists: true, isGoogleUser: !!user.googleId, message: "User exists." });
        } else {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore[email] = otp;
            console.log(`📧 Sending OTP to ${email}...`);
            const info = await transporter.sendMail({
                from: `"Finance AI" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Your OTP - Finance AI',
                text: `Your OTP is: ${otp}\n\nThis OTP is valid for 10 minutes.`,
                html: `<h2>Finance AI - OTP Verification</h2><p>Your OTP is: <b style="font-size:24px">${otp}</b></p><p>This OTP is valid for 10 minutes.</p>`
            });
            console.log(`✅ OTP email sent: ${info.messageId}`);
            res.json({ exists: false, message: "OTP Sent." });
        }
    } catch (err) { 
        console.error("❌ OTP Send Error:", err.message);
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/auth/final', async (req, res) => {
    const { email, password, otp, isNewUser } = req.body;
    try {
        if (isNewUser) {
            if (otpStore[email] !== otp) return res.status(400).json({ message: "Invalid OTP" });
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = new User({ email, password: hashedPassword });
            await newUser.save();
            delete otpStore[email];
            res.json({ success: true, email: newUser.email });
        } else {
            const user = await User.findOne({ email });
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) res.json({ success: true, email: user.email });
            else res.status(401).json({ message: "Wrong Password" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5500';
        res.redirect(`${frontendURL}/index.html?email=${req.user.email}`);
    }
);

// AI Finance Chatbot Route - Groq
app.post('/api/ai-chat', async (req, res) => {
    try {
        const { message } = req.body;
        const prompt = `You are an expert AI Finance Assistant with deep knowledge of all finance topics. You answer questions on:

- Personal finance: budgeting, savings, expense tracking, emergency funds
- Investing: stocks, mutual funds, SIP, ETFs, bonds, real estate, gold
- Indian markets: NSE, BSE, Sensex, Nifty, Indian stocks, IPOs
- Banking: FD, RD, savings accounts, interest rates, loans, EMI, credit cards
- Taxes: Income tax, GST, tax saving (80C, 80D), ITR filing
- Insurance: life, health, term, ULIP
- Retirement: NPS, PPF, EPF, pension planning
- Cryptocurrency: Bitcoin, Ethereum, crypto investing basics
- Global markets: NYSE, NASDAQ, forex, commodities
- Financial concepts: inflation, compound interest, diversification, risk management
- Company fundamentals: P/E ratio, market cap, revenue, profit, balance sheet

For real-time stock prices, say: "For live prices, check NSE/BSE or MoneyControl. Based on my knowledge, [give last known approximate value if available]."

Rules:
- Always respond in English only
- Be direct and informative
- If question is completely unrelated to finance, politely decline in one line
- For factual finance questions, give accurate detailed answers
- Keep responses clear and well-structured

User question: ${message}`;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 512
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const reply = response.data.choices[0].message.content;
        res.json({ reply });
    } catch (err) {
        console.error("❌ AI Chat Error:", err.response?.data || err.message);
        res.status(500).json({ reply: "Oops! AI assistant abhi available nahi hai. Thodi der mein try karo." });
    }
});

// Smart Analysis Route - ML + Groq Combined
app.post('/api/smart-analysis', async (req, res) => {
    try {
        const { income, expense, savings, categories } = req.body;
        const month = new Date().getMonth() + 1;

        // Step 1: ML Model se safe spending limit lo
        let budgetLimit = income * 0.65;
        let budgetStatus = 'Good';

        try {
            const mlRes = await axios.post('http://localhost:5001/predict', {
                month,
                monthly_income: income,
                prev_month_expense: expense,
                category: categories?.topCategory || 'Food'
            });
            if (mlRes.data.status === 'success') {
                budgetLimit = mlRes.data.safe_spending_limit || mlRes.data.predicted_expense || income * 0.65;
                budgetStatus = mlRes.data.budget_status;
            }
        } catch(mlErr) { console.log('ML offline, using fallback'); }

        const isOverspending = expense > budgetLimit;
        const savingsAmount = income - expense;
        const savingsRate = income > 0 ? ((savingsAmount / income) * 100).toFixed(1) : 0;
        const remainingBudget = Math.round(budgetLimit - expense);

        // Step 2: Groq se complete analysis
        const prompt = `You are an expert financial advisor. Analyze this user's finances:

FINANCIAL DATA:
- Monthly Income: ₹${income}
- Current Expense: ₹${expense}
- Net Savings: ₹${savingsAmount}
- Savings Rate: ${savingsRate}%
- ML Predicted Budget Limit: ₹${Math.round(budgetLimit)}
- Status: ${isOverspending ? 'OVERSPENDING!' : 'Within budget'}
- Top Category: ${categories?.topCategory || 'General'}

Respond with valid JSON only:
{
  "budget_alert": "one line status message",
  "next_month_limit": ${Math.round(budgetLimit)},
  "sip_suggestion": "specific SIP fund name and amount",
  "fd_suggestion": "specific bank FD rate and tenure",
  "savings_tip": "one actionable tip"
}`;

        const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300, temperature: 0.3
        }, {
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }
        });

        let aiAnalysis = {};
        try {
            const jsonMatch = groqRes.data.choices[0].message.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0]);
        } catch(e) {
            aiAnalysis = {
                budget_alert: isOverspending ? "⚠️ Overspending detected!" : "✅ Within budget",
                next_month_limit: Math.round(budgetLimit),
                sip_suggestion: `Invest ₹${Math.round(savingsAmount * 0.3)} in Mirae Asset Large Cap SIP`,
                fd_suggestion: "SBI FD at 7.1% for 1 year",
                savings_tip: "Follow 50-30-20 rule for better savings"
            };
        }

        res.json({
            success: true,
            ml_prediction: { 
                safe_spending_limit: Math.round(budgetLimit),
                budget_status: budgetStatus, 
                remaining_budget: remainingBudget, 
                is_overspending: isOverspending 
            },
            ai_analysis: aiAnalysis,
            summary: { income, expense, savings: savingsAmount, savings_rate: savingsRate }
        });

    } catch (err) {
        console.error("Smart Analysis Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Forgot Password Route
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.trim()) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
        }

        if (user.googleId) {
            return res.status(400).json({ message: 'This account uses Google Sign-In. Please sign in with Google.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000);

        const resetURL = `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`;

        try {
            await transporter.sendMail({
                from: `"Finance AI" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Reset your Finance AI password',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 8px;">
                        <div style="text-align: center; margin-bottom: 24px;">
                            <h1 style="color: #1a56db; font-size: 24px; margin: 0;">Finance AI</h1>
                            <p style="color: #6b7280; margin: 4px 0 0;">Password Reset Request</p>
                        </div>
                        <div style="background: #ffffff; border-radius: 8px; padding: 24px; border: 1px solid #e5e7eb;">
                            <p style="color: #111827; font-size: 16px; margin: 0 0 16px;">Hi there,</p>
                            <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">
                                We received a request to reset your Finance AI password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
                            </p>
                            <div style="text-align: center; margin: 24px 0;">
                                <a href="${resetURL}" style="display: inline-block; background: #1a56db; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 15px; font-weight: 600;">
                                    Reset Password
                                </a>
                            </div>
                            <p style="color: #6b7280; font-size: 13px; margin: 24px 0 0;">
                                If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
                            </p>
                            <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0; word-break: break-all;">
                                Or copy this link: ${resetURL}
                            </p>
                        </div>
                        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 16px 0 0;">
                            &copy; ${new Date().getFullYear()} Finance AI. All rights reserved.
                        </p>
                    </div>
                `
            });
        } catch (mailErr) {
            console.error('❌ Reset email send error:', mailErr.message);
            return res.status(500).json({ message: 'Failed to send reset email. Please try again.' });
        }

        user.resetToken = token;
        user.resetTokenExpiry = expiry;
        await user.save();

        return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
        console.error('❌ Forgot password error:', err.message);
        res.status(500).json({ message: 'An unexpected error occurred. Please try again.' });
    }
});

// Reset Password Route
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required.' });
        }

        const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: new Date() } });

        if (!user) {
            return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.resetToken = null;
        user.resetTokenExpiry = null;
        await user.save();

        return res.status(200).json({ message: 'Password reset successful.' });
    } catch (err) {
        console.error('❌ Reset password error:', err.message);
        res.status(500).json({ message: 'An unexpected error occurred. Please try again.' });
    }
});

// Final Server Listen (SIRF EK BAAR)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on: http://localhost:${PORT}`);
});






