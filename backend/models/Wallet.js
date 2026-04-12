const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
    userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:              { type: String, required: true },
    type:              { type: String, enum: ['bank', 'cash', 'upi', 'credit', 'debit'], default: 'bank' },
    balance:           { type: Number, default: 0 },
    color:             { type: String, default: '#7c3aed' },

    // ── Bank Account Fields ────────────────────────────────────────────────────
    accountNumber:     { type: String, default: '' },    // last 4 digits only
    ifscCode:          { type: String, default: '' },
    bankName:          { type: String, default: '' },

    // ── Credit / Debit Card Fields ─────────────────────────────────────────────
    cardholderName:    { type: String, default: '' },
    maskedCardNumber:  { type: String, default: '' },    // e.g. "•••• •••• •••• 4242"
    cardNetwork:       { type: String, enum: ['visa', 'mastercard', 'rupay', 'amex', 'diners', ''], default: '' },
    expiryDate:        { type: String, default: '' },    // MM/YY
    cardLast4:         { type: String, default: '' },

    // Razorpay references (for actual tokenized cards)
    razorpayCustomerId: { type: String, default: '' },
    razorpayTokenId:    { type: String, default: '' },

    // ── UPI Fields ─────────────────────────────────────────────────────────────
    upiId:             { type: String, default: '' },    // e.g. user@okaxis
    upiName:           { type: String, default: '' },    // Name registered with UPI
    upiHandle:         { type: String, default: '' },    // @okaxis, @ybl, etc.
    upiVerified:       { type: Boolean, default: false },

    createdAt:         { type: Date, default: Date.now }
});

WalletSchema.index({ userId: 1 });
module.exports = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);
