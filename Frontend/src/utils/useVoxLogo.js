import { useState, useEffect } from 'react';
import logoLight from '../assets/VRLogo.png';
import logoDark from '../assets/logo_darkmode.png';

export { logoLight, logoDark };

/**
 * Custom hook to get the appropriate VoxReview logo based on active theme (Light vs Dark mode).
 * Automatically updates in real-time when the theme changes.
 *
 * @param {Object} [options]
 * @param {boolean} [options.forceDark=false] - Force dark mode logo (e.g. for Super Admin dark theme)
 * @param {string} [options.theme] - Explicit theme state ('light' | 'dark')
 * @returns {string} Image source URL for the logo
 */
export function useVoxLogo(options = {}) {
  const { forceDark = false, theme } = options;

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (forceDark) return true;
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (forceDark) {
      setIsDarkMode(true);
      return;
    }

    if (theme === 'dark') {
      setIsDarkMode(true);
      return;
    }

    if (theme === 'light') {
      setIsDarkMode(false);
      return;
    }

    if (typeof document === 'undefined') return;

    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [forceDark, theme]);

  return isDarkMode ? logoDark : logoLight;
}
