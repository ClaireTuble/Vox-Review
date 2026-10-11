import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Mail, RefreshCw, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
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
    <div className="verification-modal-backdrop" role="presentation" onClick={isSubmitting ? undefined : onCancel}>
      <div
        className="verification-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="verification-modal-header">
          <div className="verification-modal-heading">
            <div className="verification-modal-icon">
              {isSignupFlow ? <Mail size={18} /> : <ShieldCheck size={18} />}
            </div>
            <h2 id="verification-modal-title" className="verification-modal-title">
              {isSignupFlow ? 'Verify your email' : 'Security Verification'}
            </h2>
          </div>
          <button
            type="button"
            className="verification-modal-close"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close verification dialog"
          >
            <X size={16} />
          </button>
        </div>

        <p className="verification-modal-description">
          {isSignupFlow ? (
            <>We sent a 6-digit verification code to: <strong>{maskedEmail}</strong></>
          ) : (
            <>Enter the 6-digit verification code sent to <strong>{maskedEmail}</strong>.</>
          )}
        </p>

        {errorMsg && (
          <div className="verification-modal-message verification-modal-error" role="alert" aria-live="polite">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="verification-modal-message verification-modal-success" role="status" aria-live="polite">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleVerifySubmit}>
          <div className="verification-code-inputs">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                className="verification-code-input"
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
                aria-label={`Verification code digit ${idx + 1}`}
                className={`verification-code-input${digit ? ' has-value' : ''}`}
              />
            ))}
          </div>

          <div className="verification-countdown-row">
            <span className={`verification-countdown${countdown < 60 ? ' is-urgent' : ''}`}>
              Expires in: {formatTimer(countdown)}
            </span>
            <button
              type="button"
              className="verification-resend"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || isResending || isSubmitting}
            >
              {isResending ? (
                <Loader2 size={14} className="verification-modal-spinner" />
              ) : (
                <RefreshCw size={14} />
              )}
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
            </button>
          </div>

          <div className="verification-modal-actions">
            <button
              type="button"
              className="verification-action-button secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="verification-action-button primary"
              disabled={digits.join('').length < 6 || isSubmitting || countdown === 0}
            >
              {isSubmitting && <Loader2 size={15} className="verification-modal-spinner" />}
              {isSubmitting ? (isSignupFlow ? 'Creating your account...' : 'Verifying...') : 'Verify Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
