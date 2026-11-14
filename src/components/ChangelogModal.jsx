import React from 'react';
import { releaseNotes } from '../releaseNotes';
import { Sparkles, Bug, Wrench, RefreshCw, Download, CheckCircle2, AlertCircle } from 'lucide-react';

const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

// Status der Update-Prüfung als kurzer Text neben dem Knopf
function updateStatusLine({ status, checkedAt }, updateInfo, currentVersion) {
  if (status === 'checking') return { icon: null, text: 'Suche nach Updates…', color: 'var(--text-muted)' };
  if (status === 'available' && updateInfo) return { icon: Download, text: `Version ${updateInfo.latestVersion} ist verfügbar`, color: 'var(--color-primary)' };
  if (status === 'current') return { icon: CheckCircle2, text: `Du hast die neueste Version (v${currentVersion}), geprüft um ${formatTime(checkedAt)}`, color: 'var(--color-success, #10b981)' };
  if (status === 'error') return { icon: AlertCircle, text: 'Die Suche nach Updates hat nicht geklappt. Bist du online?', color: 'var(--color-danger, #ef4444)' };
  return null;
}

// Reiter Changelog: nur die Neuerungen des Launchers. Die Changelogs der Server stehen im Reiter Server.
export default function ChangelogModal({ currentVersion, updateCheck = { status: 'idle' }, updateInfo, onCheckUpdate, onShowUpdate }) {
  const statusLine = updateStatusLine(updateCheck, updateInfo, currentVersion);
  const StatusIcon = statusLine?.icon;
  const checking = updateCheck.status === 'checking';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 className="app-page-title" style={{ margin: 0 }}>
            Changelog
          </h1>
          <p className="app-page-subtitle" style={{ margin: '4px 0 0 0' }}>
            Alle Neuerungen des Launchers. Die Changelogs deiner Server findest du im Reiter Server.
          </p>
        </div>
        {onCheckUpdate && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={updateCheck.status === 'available' && updateInfo ? onShowUpdate : onCheckUpdate}
              disabled={checking}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {updateCheck.status === 'available' && updateInfo
                ? <Download size={16} />
                : <RefreshCw size={16} className={checking ? 'spin' : undefined} />}
              {updateCheck.status === 'available' && updateInfo ? 'Update installieren' : 'Nach Updates suchen'}
            </button>
            {statusLine && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: statusLine.color }}>
                {StatusIcon && <StatusIcon size={14} />}
                {statusLine.text}
              </div>
            )}
          </div>
        )}
      </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {releaseNotes.map(item => (
        <div key={item.version} className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge badge-accent" style={{ fontSize: '13px' }}>
                v{item.version}
              </span>
              <h2 style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{item.title}</h2>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{item.date}</span>
          </div>

          {item.whatsNew && item.whatsNew.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--color-success, #10b981)', marginBottom: '6px' }}>
                <Sparkles size={14} /> Was ist neu?
              </div>
              <ul style={{ paddingLeft: '20px', fontSize: '13.5px', color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.92 }}>
                {item.whatsNew.map((entry, idx) => <li key={idx} style={{ marginBottom: '3px' }}>{entry}</li>)}
              </ul>
            </div>
          )}

          {item.bugFixes && item.bugFixes.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--color-danger, #ef4444)', marginBottom: '6px' }}>
                <Bug size={14} /> Behobene Fehler
              </div>
              <ul style={{ paddingLeft: '20px', fontSize: '13.5px', color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.92 }}>
                {item.bugFixes.map((entry, idx) => <li key={idx} style={{ marginBottom: '3px' }}>{entry}</li>)}
              </ul>
            </div>
          )}

          {item.adjustments && item.adjustments.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '6px' }}>
                <Wrench size={14} /> Anpassungen
              </div>
              <ul style={{ paddingLeft: '20px', fontSize: '13.5px', color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.92 }}>
                {item.adjustments.map((entry, idx) => <li key={idx} style={{ marginBottom: '3px' }}>{entry}</li>)}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
    </div>
  );
}
