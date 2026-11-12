// Syntax-Highlighting für Minecraft- und Launcher-Konsolenausgaben
export function getLogLineColor(rawText) {
  if (typeof rawText !== 'string') return '#10b981';

  // Fehler / Exceptions / Crashes / Stacktraces -> Rot
  if (
    /\[.*?\b(ERROR|FATAL|EXCEPTION|CRITICAL)\b.*?\]/i.test(rawText) ||
    /\[Fehler.*?\]/i.test(rawText) ||
    /\bException in thread\b/i.test(rawText) ||
    /\bCaused by:\b/i.test(rawText) ||
    /\bCrashReport\b/i.test(rawText) ||
    /\bFailed to\b/i.test(rawText) ||
    /^\s*at\s+[a-zA-Z0-9_$.]+\(/i.test(rawText)
  ) {
    return '#f87171'; // Rot
  }

  // Warnungen -> Gelb
  if (
    /\[.*?\b(WARN|WARNING)\b.*?\]/i.test(rawText) ||
    /\[Warnung.*?\]/i.test(rawText)
  ) {
    return '#fbbf24'; // Gelb
  }

  // Standard-Konsolenausgabe -> Klassisches Terminal-Grün
  return '#10b981';
}

