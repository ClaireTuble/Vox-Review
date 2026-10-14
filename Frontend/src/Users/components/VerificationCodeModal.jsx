import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Mail, RefreshCw, X, AlertCircle, CheckCircle2, Loader2, KeyRound } from 'lucide-react';
import authService, { normalizeAuthErrorMessage } from '../../services/authService.js';
import '../css/VerificationCodeModal.css';

function mapVerificationUiError(error, isForgotPasswordFlow) {
  const fallbackMessage = isForgotPasswordFlow
    ? 'Incorrect verification code.'
    : 'Please enter the verification code sent to your email.';

  const message = normalizeAuthErrorMessage(error, isForgotPasswordFlow ? 'forgot' : 'signup');
  return message === 'Something went wrong. Please try again.' ? fallbackMessage : message;
}

export default function VerificationCodeModal({
  isOpen = true,
  email = '',
  purpose = 'change_password',
  signupData = null,
  onVerifySuccess,
  onCancel,
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const [resendCooldown, setResendCooldown] = useState(30); // 30 seconds resend timer

  const inputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
  ];

  const isSignupFlow = purpose === 'signup_email_verification';
  const isForgotPasswordFlow = purpose === 'forgot_password';

  // Prevent background page scroll while modal is open & restore on close
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Auto-focus first input on open
  useEffect(() => {
    if (isOpen && inputRefs[0].current) {
      setTimeout(() => inputRefs[0].current?.focus(), 150);
    }
  }, [isOpen]);

  // Main 5-minute countdown timer
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Resend cooldown timer
  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, resendCooldown]);

  if (!isOpen) return null;

  const handleDigitChange = (index, value) => {
    setErrorMsg('');
    setSuccessMsg('');
    const cleanValue = value.replace(/\D/g, '');

    if (!cleanValue) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    // Handle single digit input
    const char = cleanValue.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    // Auto advance focus to next box
    if (char && index < 5 && inputRefs[index + 1].current) {
      inputRefs[index + 1].current.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0 && inputRefs[index - 1].current) {
        inputRefs[index - 1].current.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0 && inputRefs[index - 1].current) {
      inputRefs[index - 1].current.focus();
    } else if (e.key === 'ArrowRight' && index < 5 && inputRefs[index + 1].current) {
      inputRefs[index + 1].current.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pastedData[i] || '';
    }
    setDigits(newDigits);

    const targetIndex = Math.min(pastedData.length, 5);
    if (inputRefs[targetIndex].current) {
      inputRefs[targetIndex].current.focus();
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isSignupFlow) {
        if (!signupData) {
          throw new Error('Registration details missing for code resend.');
        }
        await authService.requestSignupVerification(signupData);
      } else if (isForgotPasswordFlow) {
        await authService.requestForgotPassword(targetEmail);
      } else {
        await authService.requestVerificationCode(purpose);
      }

      setSuccessMsg('A new verification code has been sent to your email.');
      setCountdown(300); // Reset 5-min timer
      setResendCooldown(30); // Reset 30s resend timer
      setDigits(['', '', '', '', '', '']);
      if (inputRefs[0].current) {
        inputRefs[0].current.focus();
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to resend verification code.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e?.preventDefault();
    const fullCode = digits.join('');
    if (fullCode.length < 6) {
      setErrorMsg('Please enter all 6 digits.');
      return;
    }

    if (countdown === 0) {
      setErrorMsg('Verification code has expired. Please request a new code.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isSignupFlow) {
        const verifyRes = await authService.verifySignupCode({
          email: email || signupData?.email,
          code: fullCode,
        });
        setSuccessMsg('Email verified successfully! Preparing your account...');
        setTimeout(() => {
          onVerifySuccess?.(verifyRes);
        }, 600);
      } else if (isForgotPasswordFlow) {
        const verifyRes = await authService.verifyForgotPassword({ email: targetEmail, code: fullCode });
        setSuccessMsg('Email verified. You can now create a new password.');
        setTimeout(() => {
          onVerifySuccess?.(verifyRes);
        }, 500);
      } else {
        await authService.verifyCode(fullCode, purpose);
        setSuccessMsg('Code verified successfully!');
        setTimeout(() => {
          onVerifySuccess?.();
        }, 500);
      }
    } catch (err) {
      setErrorMsg(mapVerificationUiError(err, isForgotPasswordFlow));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const targetEmail = email || signupData?.email || '';
  const maskedEmail = targetEmail
    ? targetEmail.replace(/^(.{2})(.*)(@.*)$/, (_, p1, p2, p3) => p1 + '*'.repeat(Math.max(p2.length, 3)) + p3)
    : 'your registered email';

  const modalTitle = isSignupFlow ? 'Verify Your Email Address' : 'Security Verification';

  const modalContent = (
    <div
      className="vcm-backdrop"
      role="presentation"
      onClick={isSubmitting ? undefined : onCancel}
    >
      <div
        className="vcm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vcm-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button in top-right */}
        <button
          type="button"
          className="vcm-close-btn"
          onClick={onCancel}
          disabled={isSubmitting}
          aria-label="Close verification modal"
        >
          <X size={18} />
        </button>

        {/* Scrollable inner content */}
        <div className="vcm-body">
          {/* Centered Email/Key Illustration */}
          <div className="vcm-illustration" aria-hidden="true">
            <div className="vcm-illustration-ring">
              <div className="vcm-illustration-core">
                {isSignupFlow ? (
                  <Mail size={32} className="vcm-illustration-icon" strokeWidth={2.2} />
                ) : (
                  <KeyRound size={32} className="vcm-illustration-icon" strokeWidth={2.2} />
                )}
              </div>
            </div>
          </div>

          {/* Centered Heading */}
          <div className="vcm-header">
            <h2 id="vcm-title" className="vcm-title">{modalTitle}</h2>
            <p className="vcm-subtitle">
              We sent a 6-digit verification code to
            </p>
            <div className="vcm-email-chip" aria-label={`Code sent to ${maskedEmail}`}>
              <Mail size={13} aria-hidden="true" />
              <span>{maskedEmail}</span>
            </div>
            <p className="vcm-instruction">
              Enter the code below to confirm your account and get started.
            </p>
          </div>

          {/* Status / Error Alert Messages */}
          {errorMsg && (
            <div className="vcm-alert vcm-alert--error" role="alert" aria-live="polite">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="vcm-alert vcm-alert--success" role="status" aria-live="polite">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 6-Digit Code Input Row */}
          <form onSubmit={handleVerifySubmit} noValidate className="vcm-form">
            <div className="vcm-code-row" role="group" aria-label="6-digit verification code">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={inputRefs[idx]}
                  id={`vcm-digit-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  aria-label={`Digit ${idx + 1} of 6`}
                  autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  disabled={isSubmitting}
                  className={`vcm-code-input${digit ? ' vcm-code-input--filled' : ''}`}
                />
              ))}
            </div>

            {/* Verification Status / Countdown & Resend Action Row */}
            <div className="vcm-meta-row">
              <div className="vcm-countdown-badge">
                <span className="vcm-meta-label">Code expires in:</span>
                <span
                  className={`vcm-countdown-time${countdown < 60 ? ' vcm-countdown-time--urgent' : ''}`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {formatTimer(countdown)}
                </span>
              </div>

              <button
                type="button"
                id="vcm-resend-btn"
                className="vcm-resend-btn"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isResending || isSubmitting}
                aria-label={resendCooldown > 0 ? `Resend code available in ${resendCooldown} seconds` : 'Resend verification code'}
              >
                {isResending ? (
                  <Loader2 size={13} className="vcm-spinner" />
                ) : (
                  <RefreshCw size={13} aria-hidden="true" />
                )}
                <span>
                  {resendCooldown > 0
                    ? `Resend code (${resendCooldown}s)`
                    : 'Resend code'}
                </span>
              </button>
            </div>

            {/* Primary & Secondary Action Buttons */}
            <div className="vcm-actions">
              <button
                id="vcm-verify-btn"
                type="submit"
                className="vcm-btn-primary"
                disabled={digits.join('').length < 6 || isSubmitting || countdown === 0}
              >
                {isSubmitting && <Loader2 size={18} className="vcm-spinner" />}
                <span>
                  {isSubmitting
                    ? (isSignupFlow ? 'Creating your account…' : 'Verifying…')
                    : (isSignupFlow ? 'Verify Email' : 'Verify Code')}
                </span>
              </button>

              <button
                id="vcm-cancel-btn"
                type="button"
                className="vcm-btn-secondary"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
