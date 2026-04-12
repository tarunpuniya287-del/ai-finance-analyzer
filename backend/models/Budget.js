const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema({
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category:    { type: String, required: true },
    limitAmount: { type: Number, required: true },
    month:       { type: Number, required: true },   // 1–12
    year:        { type: Number, required: true },
    createdAt:   { type: Date, default: Date.now }
});

// Unique budget per user/category/month/year
BudgetSchema.index({ userId: 1, category: 1, month: 1, year: 1 }, { unique: true });
module.exports = mongoose.models.Budget || mongoose.model('Budget', BudgetSchema);
