const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: { type: String },           // Optional - frontend se description aata hai
    description: { type: String },     // Frontend ka field
    amount: { type: Number, required: true },
    type: { 
        type: String, 
        enum: ['income', 'expense'],   // Lowercase - server.js ke saath match
        required: true,
        lowercase: true                // Auto-convert to lowercase
    },
    category: { 
        type: String, 
        enum: [
            // Income categories
            'Salary', 'Freelance', 'Business', 'Dividend', 'Gift', 'Cashback', 'Rental', 'Other',
            // Expense categories
            'Groceries', 'Food', 'Shopping', 'Rent', 'Bills', 'Investment', 'Entertainment', 
            'Travel', 'Medical', 'Utilities', 'Education'
        ],
        required: true 
    },
    date: { type: Date, default: Date.now },
    paymentStatus: { type: String, default: 'Success' }
});

TransactionSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
