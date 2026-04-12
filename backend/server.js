const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const session = require('express-session');
const passport = require('passport');
const Razorpay = require('razorpay');
require('dotenv').config();

// 1. Model Import (Sirf ek baar)
const User        = require('./models/user');
const Transaction = require('./models/Transaction');
const Goal        = require('./models/Goal');
const Budget      = require('./models/Budget');
const Wallet      = require('./models/Wallet');

// 2. Razorpay SDK Init
const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

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

// EMAIL SENDING via Brevo HTTP API
async function sendEmail(to, subject, html) {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { name: 'Finance AI', email: process.env.EMAIL_USER },
        to: [{ email: to }],
        subject,
        htmlContent: html
    }, {
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
        }
    });
    return response.data;
}

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
        const response = await axios.post(`${ML_ENGINE_URL}/predict`, {
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
        if (!email) return res.json([]);
        const userId = await resolveUserId(email);
        if (!userId) return res.json([]);
        const txs = await Transaction.find({ userId }).sort({ date: -1 });
        res.json(txs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/add-transaction', async (req, res) => {
    try {
        const { email, walletId, ...txData } = req.body;
        if (email) {
            const userId = await resolveUserId(email);
            if (userId) txData.userId = userId;
        }
        // Ensure date is a proper Date object
        if (txData.date) txData.date = new Date(txData.date);
        else txData.date = new Date();

        const tx = new Transaction(txData);
        await tx.save();

        // Auto-update wallet balance if Pay From selected
        let updatedWallet = null;
        if (walletId && txData.amount) {
            const wallet = await Wallet.findById(walletId);
            if (wallet) {
                const delta = txData.type === 'expense'
                    ? -(Math.abs(txData.amount))
                    :  (Math.abs(txData.amount));
                wallet.balance = Math.max(0, (wallet.balance || 0) + delta);
                await wallet.save();
                updatedWallet = { id: wallet._id, newBalance: wallet.balance, name: wallet.name || wallet.cardholderName };
            }
        }

        res.status(201).json({ message: 'Saved', tx, updatedWallet });
    } catch (err) {
        console.error('Transaction save error:', err.message);
        res.status(400).json({ error: err.message });
    }
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
        let userId = null;
        const matchFilter = {};

        if (email) {
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            if (user) { userId = user._id; matchFilter.userId = user._id; }
        }

        // ── 1. Wallet Balance (total across all linked accounts) ──────────────
        let walletBalance = 0;
        if (userId) {
            const wallets = await Wallet.find({ userId });
            walletBalance = wallets.reduce((s, w) => s + (w.balance || 0), 0);
        }

        // ── 2. This Month Spent (current month expenses only) ─────────────────
        const now       = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const monthTxStats = await Transaction.aggregate([
            { $match: { ...matchFilter, date: { $gte: monthStart, $lte: monthEnd } } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } }
        ]);
        let monthIncome = 0, monthSpent = 0;
        monthTxStats.forEach(s => {
            if (s._id === 'income')  monthIncome = s.total;
            if (s._id === 'expense') monthSpent  = s.total;
        });

        // ── 3. Savings Rate % (income - expense / income * 100) ───────────────
        // Uses either wallet-based ratio or transaction ratio
        let savingsRate = 0;
        if (monthIncome > 0) {
            savingsRate = Math.round(((monthIncome - monthSpent) / monthIncome) * 100);
            savingsRate = Math.max(0, Math.min(100, savingsRate)); // clamp 0-100
        } else if (walletBalance > 0 && monthSpent > 0) {
            // Fallback: how much of wallet is intact this month
            savingsRate = Math.round(((walletBalance - monthSpent) / walletBalance) * 100);
            savingsRate = Math.max(0, Math.min(100, savingsRate));
        }

        // ── 4. Goals Progress % (average across all active goals) ────────────
        let goalsProgress = 0;
        if (userId) {
            const goals = await Goal.find({ userId });
            if (goals.length > 0) {
                const totalPct = goals.reduce((sum, g) => {
                    const pct = g.targetAmount > 0
                        ? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100))
                        : 0;
                    return sum + pct;
                }, 0);
                goalsProgress = Math.round(totalPct / goals.length);
            }
        }

        // ── Also keep income/expense for other parts of the app ───────────────
        const allTxStats = await Transaction.aggregate([
            { $match: matchFilter },
            { $group: { _id: '$type', total: { $sum: '$amount' } } }
        ]);
        let income = 0, expense = 0;
        allTxStats.forEach(s => {
            if (s._id === 'income')  income  = s.total;
            if (s._id === 'expense') expense = s.total;
        });

        res.json({
            // Fi Money style cards
            walletBalance,
            monthSpent,
            savingsRate,
            goalsProgress,
            // Legacy (for charts/other routes)
            income,
            expense,
            savings: income - expense
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
            const info = await sendEmail(
                email,
                'Your OTP - Finance AI',
                `<h2>Finance AI - OTP Verification</h2><p>Your OTP is: <b style="font-size:24px">${otp}</b></p><p>This OTP is valid for 10 minutes.</p>`
            );
            console.log(`✅ OTP email sent`);
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
        res.redirect(`${frontendURL}/dashboard.html?email=${req.user.email}`);
    }
);

// AI Finance Chatbot Route - Groq (with user financial context)
app.post('/api/ai-chat', async (req, res) => {
    try {
        const { message, email, context = {} } = req.body;

        // Build personalized context string if user data is available
        let userFinanceContext = '';
        if (context.income > 0 || context.expense > 0) {
            const savingsRate = context.savingsRate || 0;
            const remaining  = (context.income || 0) - (context.expense || 0);
            userFinanceContext = `
USER'S CURRENT FINANCIAL SNAPSHOT:
- Monthly Income: ₹${context.income || 0}
- Total Expense: ₹${context.expense || 0}
- This Month Spent: ₹${context.monthSpent || 0}
- Net Savings: ₹${remaining}
- Savings Rate: ${savingsRate}%
- Wallet Balance: ₹${context.walletBalance || 0}

Use this data to give personalized advice when relevant. If the user asks generic questions, answer them accurately.`;
        }

        const systemPrompt = `You are FinanceAI, an expert AI Finance Assistant embedded in a personal finance app. You have deep knowledge of:

- Personal finance: budgeting, savings, expense tracking, emergency funds
- Investing: stocks, mutual funds, SIP, ETFs, bonds, real estate, gold
- Indian markets: NSE, BSE, Sensex, Nifty, Indian stocks, IPOs
- Banking: FD, RD, savings accounts, interest rates, loans, EMI, credit cards
- Taxes: Income tax, GST, tax saving (80C, 80D), ITR filing
- Insurance: life, health, term, ULIP
- Retirement: NPS, PPF, EPF, pension planning
- Cryptocurrency: Bitcoin, Ethereum, DeFi basics
- Global markets: NYSE, NASDAQ, forex, commodities
- Financial concepts: inflation, compound interest, diversification, risk management
${userFinanceContext}

RULES:
- Always respond in clear English
- Be direct, specific, and actionable
- Use the user's actual financial data when giving personalized advice
- For real-time stock prices say: "Check NSE/BSE or MoneyControl for live prices."
- For unrelated questions, politely decline in one line
- Format answers with bullet points when listing multiple items`;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: message }
            ],
            max_tokens: 600,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const reply = response.data.choices?.[0]?.message?.content || 'No response generated.';
        res.json({ reply });
    } catch (err) {
        console.error("❌ AI Chat Error:", err.response?.data || err.message);
        const statusCode = err.response?.status;
        if (statusCode === 401) {
            return res.status(500).json({ reply: "❌ AI service authentication failed. Please contact support." });
        }
        if (statusCode === 429) {
            return res.status(500).json({ reply: "⚠️ AI is currently busy (rate limited). Please wait a moment and try again." });
        }
        res.status(500).json({ reply: "⚠️ AI assistant is temporarily unavailable. Please try again shortly." });
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
            const mlRes = await axios.post(`${ML_ENGINE_URL}/predict`, {
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
            await sendEmail(
                email,
                'Reset your Finance AI password',
                `
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
                                If you didn't request a password reset, you can safely ignore this email.
                            </p>
                        </div>
                    </div>
                `
            );
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

// ─── MONTHLY STATS (Money Flow chart) ────────────────────────────────────────
app.get('/api/monthly-stats', async (req, res) => {
    try {
        const { email } = req.query;
        let userId = null;
        if (email) {
            const user = await User.findOne({ email });
            if (user) userId = user._id;
        }
        const matchFilter = userId ? { userId } : {};

        const stats = await Transaction.aggregate([
            { $match: matchFilter },
            { $group: {
                _id: {
                    year:  { $year: '$date' },
                    month: { $month: '$date' },
                    type:  '$type'
                },
                total: { $sum: '$amount' }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Build last 6 months structure
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ year: d.getFullYear(), month: d.getMonth() + 1, income: 0, expense: 0 });
        }

        stats.forEach(s => {
            const m = months.find(x => x.year === s._id.year && x.month === s._id.month);
            if (m) {
                if (s._id.type === 'income')  m.income  = s.total;
                if (s._id.type === 'expense') m.expense = s.total;
            }
        });

        res.json(months);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GOALS ────────────────────────────────────────────────────────────────────
app.get('/api/goals', async (req, res) => {
    try {
        const { email } = req.query;
        const user = await User.findOne({ email });
        if (!user) return res.json([]);
        const goals = await Goal.find({ userId: user._id }).sort({ createdAt: -1 });
        res.json(goals);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/goals', async (req, res) => {
    try {
        const { email, ...data } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const goal = new Goal({ ...data, userId: user._id });
        await goal.save();
        res.status(201).json(goal);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/goals/:id', async (req, res) => {
    try {
        const goal = await Goal.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(goal);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/goals/:id', async (req, res) => {
    try {
        await Goal.findByIdAndDelete(req.params.id);
        res.json({ message: 'Goal deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BUDGET ───────────────────────────────────────────────────────────────────
app.get('/api/budget', async (req, res) => {
    try {
        const { email } = req.query;
        const now = new Date();
        const user = await User.findOne({ email });
        if (!user) return res.json([]);
        const budgets = await Budget.find({
            userId: user._id,
            month: now.getMonth() + 1,
            year:  now.getFullYear()
        });
        res.json(budgets);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/budget', async (req, res) => {
    try {
        const { email, category, limitAmount } = req.body;
        const now = new Date();
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const budget = await Budget.findOneAndUpdate(
            { userId: user._id, category, month: now.getMonth() + 1, year: now.getFullYear() },
            { limitAmount },
            { upsert: true, new: true }
        );
        res.json(budget);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/budget/:id', async (req, res) => {
    try {
        await Budget.findByIdAndDelete(req.params.id);
        res.json({ message: 'Budget deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── WALLET ───────────────────────────────────────────────────────────────────
// Helper: get or create a userId from email (allows app to work without strict auth)
async function resolveUserId(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (user) return user._id;
    // Auto-create minimal placeholder user so wallet works without registration
    const placeholder = new User({
        email: cleanEmail,
        password: 'placeholder_' + Math.random().toString(36).slice(2)
    });
    await placeholder.save();
    return placeholder._id;
}

app.get('/api/wallet', async (req, res) => {
    try {
        const email = req.query.email?.toLowerCase().trim();
        if (!email) return res.json([]);
        const userId = await resolveUserId(email);
        if (!userId) return res.json([]);
        const wallets = await Wallet.find({ userId }).sort({ createdAt: 1 });
        res.json(wallets);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wallet', async (req, res) => {
    try {
        const { email, ...data } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const userId = await resolveUserId(email);
        if (!userId) return res.status(400).json({ error: 'Could not resolve user' });
        if (!data.name) data.name = data.cardholderName || data.bankName || data.upiId || 'Account';
        const wallet = new Wallet({ ...data, userId });
        await wallet.save();
        res.status(201).json(wallet);
    } catch (err) {
        console.error('Wallet save error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/wallet/:id', async (req, res) => {
    try {
        const wallet = await Wallet.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(wallet);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/wallet/:id', async (req, res) => {
    try {
        await Wallet.findByIdAndDelete(req.params.id);
        res.json({ message: 'Wallet deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── RAZORPAY ROUTES ──────────────────────────────────────────────────────────

// 1) Validate UPI VPA (real Razorpay API call)
app.post('/api/razorpay/validate-upi', async (req, res) => {
    try {
        const { vpa } = req.body;
        if (!vpa || !vpa.includes('@')) {
            return res.status(400).json({ success: false, message: 'Invalid UPI ID format' });
        }
        // Real Razorpay UPI VPA validation
        const response = await axios.post(
            'https://api.razorpay.com/v1/payments/validate/vpa',
            { vpa },
            {
                auth: {
                    username: process.env.RAZORPAY_KEY_ID,
                    password: process.env.RAZORPAY_KEY_SECRET
                }
            }
        );
        const data = response.data;
        res.json({
            success: true,
            valid: true,
            name: data.name || '',
            vpa: data.vpa || vpa
        });
    } catch (err) {
        const errData = err.response?.data;
        if (errData?.error?.code === 'BAD_REQUEST_ERROR') {
            return res.json({ success: true, valid: false, message: 'UPI ID not found' });
        }
        console.error('UPI validation error:', errData || err.message);
        res.status(500).json({ success: false, message: 'Validation failed. Try again.' });
    }
});

// 2) Create Razorpay Order (for card mandate/payment flow)
app.post('/api/razorpay/create-order', async (req, res) => {
    try {
        const { amount = 100, currency = 'INR', notes = {} } = req.body; // amount in paise
        const order = await razorpay.orders.create({
            amount,        // 100 paise = ₹1 (test)
            currency,
            receipt: `rcpt_${Date.now()}`,
            notes
        });
        res.json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        console.error('Razorpay order error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3) Create / Get Razorpay Customer (for saved cards flow)
app.post('/api/razorpay/create-customer', async (req, res) => {
    try {
        const { name, email, contact } = req.body;
        const customer = await razorpay.customers.create({
            name,
            email,
            contact: contact || '9999999999',
            fail_existing: false   // return existing customer if found
        });
        res.json({ success: true, customer_id: customer.id, name: customer.name });
    } catch (err) {
        console.error('Customer create error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4) Verify Razorpay Payment Signature (called after successful payment)
app.post('/api/razorpay/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature === razorpay_signature) {
            // Fetch payment details to get card info
            const payment = await razorpay.payments.fetch(razorpay_payment_id);
            res.json({
                success: true,
                verified: true,
                payment_id: razorpay_payment_id,
                method: payment.method,
                card: payment.card ? {
                    network:  payment.card.network?.toLowerCase(),
                    name:     payment.card.name,
                    last4:    payment.card.last4,
                    issuer:   payment.card.issuer
                } : null,
                vpa: payment.vpa || null
            });
        } else {
            res.status(400).json({ success: false, verified: false, message: 'Invalid signature' });
        }
    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── CATEGORY SPENDING (for budget page) ──────────────────────────────────────
app.get('/api/category-spending', async (req, res) => {
    try {
        const { email } = req.query;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const user = await User.findOne({ email });
        const matchFilter = user ? { userId: user._id, type: 'expense', date: { $gte: startOfMonth } } : {};

        const spending = await Transaction.aggregate([
            { $match: matchFilter },
            { $group: { _id: '$category', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } }
        ]);

        res.json(spending.map(s => ({ category: s._id, spent: s.total })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SMS PARSER ───────────────────────────────────────────────────────────────
// Indian bank SMS regex patterns (CRED-style parsing)
const SMS_PATTERNS = [
    // ── SBI ──
    {
        bank: 'SBI', icon: 'sbi',
        balance: [
            /(?:balance(?:\s+is)?|bal(?:ance)?)[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /(?:avl|available)\s+bal(?:ance)?[:\s-]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
        ],
        debit: [/(?:debited|debit)\s+(?:by\s+)?(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/(?:credited|credit)\s+(?:by\s+)?(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        acct: [/a\/c\s+(?:no\.?\s+)?[Xx*]+(\d{4})/i, /acct?\s+[Xx*]+(\d{4})/i],
        keywords: ['sbi', 'state bank'],
    },
    // ── HDFC ──
    {
        bank: 'HDFC Bank', icon: 'hdfc',
        balance: [
            /(?:avl|available)\s+bal(?:ance)?[:\s-]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /(?:avl|avail|available)\s+(?:bal|balance)[:\s\-]+(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
        ],
        debit: [/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+debited/i, /debited\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+credited/i],
        acct: [/a\/c\s+\*+(\d{4})/i, /acct?\s+\*+(\d{4})/i],
        keywords: ['hdfc'],
    },
    // ── ICICI ──
    {
        bank: 'ICICI Bank', icon: 'icici',
        balance: [
            /available\s+balance\s+is\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /(?:avl|avail)\s+bal[:\s]+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
        ],
        debit: [/debited\s+for\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i, /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+debited/i],
        credit: [/credited\s+(?:with\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        acct: [/acct?\s+[Xx*]+(\d{4})/i, /a\/c\s+[Xx*]+(\d{4})/i],
        keywords: ['icici'],
    },
    // ── Axis ──
    {
        bank: 'Axis Bank', icon: 'axis',
        balance: [
            /(?:current|available)\s+balance[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /bal(?:ance)?[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
        ],
        debit: [/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+has\s+been\s+debited/i, /debited\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+has\s+been\s+credited/i],
        acct: [/account\s+[Xx*]+(\d{4})/i, /a\/c\s+[Xx*]+(\d{4})/i],
        keywords: ['axis'],
    },
    // ── Kotak ──
    {
        bank: 'Kotak Bank', icon: 'kotak',
        balance: [
            /available\s+balance\s+is\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /(?:avl|avail)\s+bal[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
        ],
        debit: [/debited\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/credited\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        acct: [/acct?\s+[Xx*]+(\d{4})/i],
        keywords: ['kotak'],
    },
    // ── PNB ──
    {
        bank: 'Punjab National Bank', icon: 'pnb',
        balance: [/(?:avl|available)\s+bal(?:ance)?[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        debit: [/debited\s+(?:by\s+)?(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/credited\s+(?:with\s+)?(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        acct: [/a\/c\s+[Xx*]+(\d{4})/i],
        keywords: ['pnb', 'punjab national'],
    },
    // ── Yes Bank ──
    {
        bank: 'Yes Bank', icon: 'yes',
        balance: [/(?:avl|avail)\s+bal[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        debit: [/debited\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/credited\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        acct: [/a\/c\s+[Xx*]+(\d{4})/i],
        keywords: ['yes bank'],
    },
    // ── IndusInd ──
    {
        bank: 'IndusInd Bank', icon: 'indusind',
        balance: [/(?:avl|avail|available)\s+bal(?:ance)?[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        debit: [/debited\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/credited\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        acct: [/a\/c\s+[Xx*]+(\d{4})/i],
        keywords: ['indusind'],
    },
    // ── Canara ──
    {
        bank: 'Canara Bank', icon: 'canara',
        balance: [/(?:avl|avail|available)\s+bal(?:ance)?[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        debit: [/debited\s+(?:by\s+)?(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        credit: [/credited\s+(?:with\s+)?(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i],
        acct: [/a\/c\s+[Xx*]+(\d{4})/i],
        keywords: ['canara'],
    },
    // ── Generic UPI / Paytm ──
    {
        bank: 'UPI / Paytm', icon: 'upi',
        balance: [
            /(?:paytm|wallet)\s+balance[:\s]+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /balance[:\s]+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
        ],
        debit: [/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:paid|debited|sent)/i],
        credit: [/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:received|credited)/i],
        acct: [/a\/c\s+[Xx*]+(\d{4})/i, /@(\w+)/i],
        keywords: ['paytm', 'phonepe', 'upi', 'gpay', 'bhim'],
    },
];

function cleanAmount(str) {
    if (!str) return null;
    const cleaned = str.replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

function parseSmsText(smsText) {
    const text = smsText.trim();
    const textLower = text.toLowerCase();

    // Find matching bank
    let matchedPattern = SMS_PATTERNS.find(p =>
        p.keywords.some(kw => textLower.includes(kw))
    );
    // Fallback to generic patterns if no bank match
    if (!matchedPattern) matchedPattern = SMS_PATTERNS[SMS_PATTERNS.length - 1];

    const result = {
        bank:        matchedPattern.bank,
        icon:        matchedPattern.icon,
        balance:     null,
        txAmount:    null,
        txType:      null,
        acctLast4:   null,
        merchant:    null,
        raw:         text,
        confidence:  'low'
    };

    // Extract balance
    for (const rx of matchedPattern.balance) {
        const m = text.match(rx);
        if (m) { result.balance = cleanAmount(m[1]); break; }
    }
    // Fallback universal balance patterns
    if (result.balance === null) {
        const fallbacks = [
            /(?:balance|bal)[:\s]+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:available|avl)/i,
            /(?:avl|available)\s*:?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
        ];
        for (const rx of fallbacks) {
            const m = text.match(rx);
            if (m) { result.balance = cleanAmount(m[1]); break; }
        }
    }

    // Extract transaction amount
    for (const rx of matchedPattern.debit) {
        const m = text.match(rx);
        if (m) { result.txAmount = cleanAmount(m[1]); result.txType = 'debit'; break; }
    }
    if (!result.txAmount) {
        for (const rx of matchedPattern.credit) {
            const m = text.match(rx);
            if (m) { result.txAmount = cleanAmount(m[1]); result.txType = 'credit'; break; }
        }
    }

    // Extract account last 4 digits
    for (const rx of matchedPattern.acct) {
        const m = text.match(rx);
        if (m) { result.acctLast4 = m[1]; break; }
    }

    // Extract merchant name
    const merchantPatterns = [
        /(?:at|to|from|via|by)\s+([A-Z][A-Z0-9\s]{2,25})(?:\s+on|\s+ref|\s+utr|\s+\d|\.)/i,
        /(?:paid|payment)\s+to\s+([A-Z][A-Z0-9\s]+?)(?:\s+on|\s+ref|\.)/i,
    ];
    for (const rx of merchantPatterns) {
        const m = text.match(rx);
        if (m && m[1].length > 2) {
            const skip = ['your', 'the', 'bank', 'account', 'balance', 'inr', 'rupee'];
            if (!skip.some(w => m[1].toLowerCase().includes(w))) {
                result.merchant = m[1].trim();
                break;
            }
        }
    }

    // Confidence level
    if (result.balance !== null && result.txAmount !== null) result.confidence = 'high';
    else if (result.balance !== null || result.txAmount !== null) result.confidence = 'medium';

    return result;
}

// POST /api/parse-sms — Parse one or multiple SMS messages
app.post('/api/parse-sms', (req, res) => {
    try {
        const { messages } = req.body; // Array of SMS strings
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages array required' });
        }
        const results = messages.map(sms => parseSmsText(sms));
        // Sort: high confidence first
        results.sort((a, b) => {
            const rank = { high: 0, medium: 1, low: 2 };
            return rank[a.confidence] - rank[b.confidence];
        });
        res.json({ success: true, count: results.length, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Final Server Listen (SIRF EK BAAR)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on: http://localhost:${PORT}`);
});









