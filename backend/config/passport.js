const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user'); 

module.exports = function(passport) {
    
    // 1. GOOGLE STRATEGY
    // config/passport.js
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:5000/auth/google/callback",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo" // ✨ Ye line add kar
},

    async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists in our DB
            let user = await User.findOne({ email: profile.emails[0].value });
            
            if (!user) {
                // Naya user banao agar nahi hai
                user = new User({
                    email: profile.emails[0].value,
                    password: 'oauth_google_user_secure_dummy', // Dummy password
                    isVerified: true
                });
                await user.save();
                console.log("🆕 New Google user saved to MongoDB!");
            }
            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }));

    // Session setup: User ID ko session cookie mein save karta hai
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Session se user object wapas nikalta hai ID ke zariye
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};