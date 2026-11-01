import React from 'react';
import { releaseNotes } from '../releaseNotes';
import { Sparkles, Bug, Wrench } from 'lucide-react';

export default function ChangelogModal() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
          Versionsverlauf & Changelog
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Hier siehst du alle Neuerungen und Verbesserungen des Launchers.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {releaseNotes.map(item => (
          <div key={item.version} className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge badge-accent" style={{ fontSize: '13px' }}>
                  v{item.version}
                </span>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff' }}>{item.title}</h2>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.date}</span>
            </div>

            {item.whatsNew && item.whatsNew.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '6px' }}>
                  <Sparkles size={14} /> Was ist neu?
                </div>
                <ul style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {item.whatsNew.map((entry, idx) => <li key={idx}>{entry}</li>)}
                </ul>
              </div>
            )}

            {item.bugFixes && item.bugFixes.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#ef4444', marginBottom: '6px' }}>
                  <Bug size={14} /> Behobene Fehler
                </div>
                <ul style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {item.bugFixes.map((entry, idx) => <li key={idx}>{entry}</li>)}
                </ul>
              </div>
            )}

            {item.adjustments && item.adjustments.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#38bdf8', marginBottom: '6px' }}>
                  <Wrench size={14} /> Anpassungen
                </div>
                <ul style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {item.adjustments.map((entry, idx) => <li key={idx}>{entry}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
