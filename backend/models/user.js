const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Manual users ke liye
    googleId: { type: String }, // Google users ke liye
    authProvider: { type: String, default: 'manual' }, // 'google' ya 'manual'
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);
module.exports = User;


