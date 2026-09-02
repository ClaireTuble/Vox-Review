import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Mail, RefreshCw, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import authService, { normalizeAuthErrorMessage } from '../../services/authService.js';
import '../css/ExtensionConfirmationModal.css';

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

  // Auto focus first input on open
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
        setSuccessMsg('Email verified. You can now create a new password.');
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

  return (
    <div className="extension-modal-backdrop" role="presentation" onClick={isSubmitting ? undefined : onCancel}>
      <div
        className="extension-modal-card verification-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '380px', width: '92%', padding: '20px 22px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(79, 70, 229, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-color, #4F46E5)'
            }}>
              {isSignupFlow ? <Mail size={18} /> : <ShieldCheck size={18} />}
            </div>
            <h2 id="verification-modal-title" style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {isSignupFlow ? 'Verify your email' : 'Security Verification'}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 16px 0' }}>
          {isSignupFlow ? (
            <>We sent a 6-digit verification code to: <strong style={{ color: 'var(--text-primary)' }}>{maskedEmail}</strong></>
          ) : (
            <>Enter the 6-digit verification code sent to <strong style={{ color: 'var(--text-primary)' }}>{maskedEmail}</strong>.</>
          )}
        </p>

        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '14px',
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '14px',
          }}>
            <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 6-Digit Code Input Row */}
        <form onSubmit={handleVerifySubmit}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={inputRefs[idx]}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                disabled={isSubmitting}
                style={{
                  width: '42px',
                  height: '48px',
                  fontSize: '20px',
                  fontWeight: 700,
                  textAlign: 'center',
                  borderRadius: '8px',
                  border: digit ? '2px solid var(--accent-color, #4F46E5)' : '1px solid var(--border-card, #d1d5db)',
                  background: 'var(--bg-stage, #f9fafb)',
                  color: 'var(--text-primary, #111827)',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                }}
              />
            ))}
          </div>

          {/* Countdown & Resend Code Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '12px' }}>
            <span style={{ color: countdown < 60 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 600 }}>
              Expires in: {formatTimer(countdown)}
            </span>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || isResending || isSubmitting}
              style={{
                background: 'none',
                border: 'none',
                color: resendCooldown > 0 ? 'var(--text-secondary)' : 'var(--accent-color, #4F46E5)',
                fontWeight: 600,
                cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
              }}
            >
              {isResending ? (
                <Loader2 size={12} className="extension-modal-spinner" />
              ) : (
                <RefreshCw size={12} />
              )}
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="extension-modal-actions" style={{ gap: '10px' }}>
            <button
              type="button"
              className="extension-modal-button extension-modal-button-secondary"
              onClick={onCancel}
              disabled={isSubmitting}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="extension-modal-button extension-modal-button-primary"
              disabled={digits.join('').length < 6 || isSubmitting || countdown === 0}
              style={{
                flex: 1,
                background: 'var(--accent-color, #4F46E5)',
                color: '#ffffff',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {isSubmitting && <Loader2 size={14} className="extension-modal-spinner" />}
              {isSubmitting ? (isSignupFlow ? 'Creating your account...' : 'Verifying...') : 'Verify Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
