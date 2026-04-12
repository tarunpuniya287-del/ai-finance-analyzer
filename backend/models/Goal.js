const mongoose = require('mongoose');

const GoalSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:         { type: String, required: true },
    icon:          { type: String, default: '🎯' },
    color:         { type: String, default: '#7c3aed' },
    targetAmount:  { type: Number, required: true },
    savedAmount:   { type: Number, default: 0 },
    deadline:      { type: Date },
    createdAt:     { type: Date, default: Date.now }
});

GoalSchema.index({ userId: 1 });
module.exports = mongoose.models.Goal || mongoose.model('Goal', GoalSchema);
