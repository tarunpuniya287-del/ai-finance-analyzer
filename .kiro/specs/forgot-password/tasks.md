# Implementation Plan: Forgot Password

## Overview

Implement a secure, token-based password reset flow across four files: extend the User model with reset token fields, add two API routes to `server.js`, wire up an inline forgot-password section in `login.html`, and create a new `reset-password.html` page.

## Tasks

- [x] 1. Extend User model with reset token fields
  - Open `finance-ai-app/backend/models/user.js`
  - Add `resetToken: { type: String, default: null }` to `UserSchema`
  - Add `resetTokenExpiry: { type: Date, default: null }` to `UserSchema`
  - _Requirements: 11.1, 11.2_

  - [ ]* 1.1 Write property test for reset token fields
    - **Property 2: Google User Guard — No Token Written**
    - **Validates: Requirements 4.2, 11.4**
    - Verify that a User document with `googleId` set never has `resetToken` written to it after a forgot-password call

- [x] 2. Implement `POST /api/forgot-password` route in `server.js`
  - Add `const crypto = require('crypto');` at the top of `server.js` (built-in, no install needed)
  - Add the route before the final `app.listen` call
  - Return `400` with `"Email is required."` if `req.body.email` is empty or missing
  - Look up user with `User.findOne({ email })`
  - If user not found: return `200` with `"If that email exists, a reset link has been sent."` — no DB write
  - If `user.googleId` is set: return `400` with `"This account uses Google Sign-In. Please sign in with Google."` — no DB write
  - Generate token: `crypto.randomBytes(32).toString('hex')`
  - Set `user.resetToken = token` and `user.resetTokenExpiry = new Date(Date.now() + 3600000)`
  - Send reset email via existing `transporter` with link `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`
  - If `transporter.sendMail` throws: return `500` with `"Failed to send reset email. Please try again."` — do NOT call `user.save()` before the send succeeds
  - On success: call `user.save()` then return `200` with `"If that email exists, a reset link has been sent."`
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.1 Write property test for email enumeration prevention
    - **Property 1: Email Enumeration Prevention**
    - **Validates: Requirements 3.1, 3.2**
    - For any email not in the DB, assert response is HTTP 200 with the generic message and no DB mutation

  - [ ]* 2.2 Write property test for Google user guard
    - **Property 2: Google User Guard — No Token Written**
    - **Validates: Requirements 4.1, 4.2**
    - For any User with `googleId` set, assert response is HTTP 400 and `resetToken` remains `null`

  - [ ]* 2.3 Write property test for reset token format
    - **Property 3: Reset Token Format**
    - **Validates: Requirements 5.1**
    - For any valid manual user, assert the generated token is a 64-character lowercase hex string

  - [ ]* 2.4 Write property test for token expiry window
    - **Property 4: Token Expiry Is One Hour in the Future**
    - **Validates: Requirements 5.2**
    - For any valid manual user, assert `user.resetTokenExpiry` is within a small tolerance of `Date.now() + 3600000`

  - [ ]* 2.5 Write property test for email send failure rollback
    - **Property 6: Email Send Failure Prevents Database Mutation**
    - **Validates: Requirements 5.4**
    - Mock `transporter.sendMail` to throw; assert HTTP 500 is returned and `resetToken` is not persisted

- [x] 3. Checkpoint — Ensure backend routes are working
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `POST /api/reset-password` route in `server.js`
  - Add the route before the final `app.listen` call
  - Return `400` with `"Token and new password are required."` if `token` or `newPassword` is empty/missing
  - Find user: `User.findOne({ resetToken: token, resetTokenExpiry: { $gt: new Date() } })`
  - If no user found: return `400` with `"Reset link is invalid or has expired."` — no DB write
  - Hash password: `await bcrypt.hash(newPassword, 10)`
  - Set `user.password = hashedPassword`, `user.resetToken = null`, `user.resetTokenExpiry = null`
  - Call `user.save()` then return `200` with `"Password reset successful."`
  - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 4.1 Write property test for invalid/expired token rejection
    - **Property 7: Invalid or Expired Token Returns 400**
    - **Validates: Requirements 8.1, 8.2**
    - For any token not matching a valid non-expired DB entry, assert HTTP 400 and no DB mutation

  - [ ]* 4.2 Write property test for bcrypt hash correctness
    - **Property 8: Successful Reset Stores Bcrypt Hash**
    - **Validates: Requirements 9.1**
    - After a successful reset, assert `bcrypt.compare(newPassword, user.password)` returns `true`

  - [ ]* 4.3 Write property test for single-use token invalidation
    - **Property 9: Single-Use Token — Cleared After Reset**
    - **Validates: Requirements 9.2, 9.4, 11.3**
    - After a successful reset, assert `user.resetToken === null` and a second call with the same token returns HTTP 400

- [x] 5. Add inline `#forgot-section` to `login.html`
  - Inside `.login-box`, after the closing `</form>` tag, add a `<div id="forgot-section" style="display:none;">` containing:
    - A heading or label ("Reset your password")
    - An email input `<input type="email" id="forgot-email">`
    - A submit button `<button id="forgot-btn">Send Reset Link</button>`
    - A message area `<div id="forgot-msg"></div>`
    - A "Back to login" anchor that calls `hideForgotSection()`
  - Add CSS for `#forgot-section` and `#forgot-msg` (success/error states) inside the existing `<style>` block
  - Wire the existing `.forgot` anchor's `onclick` to call `showForgotSection()` and `e.preventDefault()`
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 6. Add forgot-password JavaScript logic to `login.html`
  - Add `showForgotSection()`: hide `#loginForm`, show `#forgot-section`, focus `#forgot-email`
  - Add `hideForgotSection()`: hide `#forgot-section`, show `#loginForm`
  - Add `#forgot-section`'s form submit handler (or button `onclick`):
    - Prevent default; validate email is non-empty (show inline error if empty — Requirement 2.5)
    - Disable `#forgot-btn`, set text to `'Sending...'`
    - `POST ${BASE_URL}/api/forgot-password` with `{ email }`
    - On success (`response.ok`): show success message in `#forgot-msg` (Requirement 2.3)
    - On error: show `data.message` in `#forgot-msg` (Requirement 2.4)
    - Re-enable button and restore text
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 7. Checkpoint — Verify forgot-password UI flow in login.html
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create `reset-password.html`
  - Create `finance-ai-app/frontend/reset-password.html` styled consistently with `login.html` (same font, color palette, `.btn-login` style)
  - Include a centered card with:
    - A heading ("Reset Password")
    - `<input type="password" id="new-password">` and `<input type="password" id="confirm-password">`
    - A submit button `<button id="reset-btn">Reset Password</button>`
    - A message area `<div id="reset-msg"></div>`
  - On page load, extract token via `new URLSearchParams(window.location.search).get('token')`
  - If token is absent/empty: show `"Invalid reset link. Please request a new one."` in `#reset-msg` and hide the form (Requirement 6.2)
  - Store token in a module-level variable for use on submit
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Add reset-password JavaScript logic to `reset-password.html`
  - On form submit:
    - Read `new-password` and `confirm-password` values
    - If they don't match: show `"Passwords do not match."` — do not submit (Requirement 7.1)
    - If `newPassword.length < 6`: show `"Password must be at least 6 characters."` — do not submit (Requirement 7.2)
    - Disable `#reset-btn`, set text to `'Resetting...'`
    - `POST ${BASE_URL}/api/reset-password` with `{ token, newPassword }`
    - On success: show `"Password reset! Redirecting to login..."`, then `setTimeout(() => window.location.href = 'login.html', 2000)` (Requirements 10.1, 10.2)
    - On error: show `data.message` inline (Requirement 10.3)
    - Re-enable button
  - _Requirements: 7.1, 7.2, 10.1, 10.2, 10.3_

  - [ ]* 9.1 Write property test for password mismatch validation
    - **Property 10: Password Mismatch Validation**
    - **Validates: Requirements 7.1**
    - For any two strings where `newPassword !== confirmPassword`, assert the form is not submitted

  - [ ]* 9.2 Write property test for short password validation
    - **Property 11: Short Password Validation**
    - **Validates: Requirements 7.2**
    - For any password string with `length < 6`, assert the form is not submitted

  - [ ]* 9.3 Write property test for token extraction from URL
    - **Property 12: Token Extraction from URL**
    - **Validates: Requirements 6.1, 6.2**
    - For any URL with a `token` query param, assert the extracted value matches; for URLs without it, assert `null` or empty string

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- `crypto` is a Node.js built-in — no `npm install` needed
- The `transporter` in `server.js` is already configured; reuse it directly
- `FRONTEND_URL` env var is already used in `server.js` for Google OAuth redirect — reuse it for the reset link
- Token must be saved to DB only after `sendMail` succeeds (prevents orphaned tokens on email failure)
- Property tests use `fast-check` as specified in the design document
