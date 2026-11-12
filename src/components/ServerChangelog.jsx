import React, { useState } from 'react';
import { Server, Edit3, Save, X, RefreshCw, CheckCircle2, AlertCircle, Calendar, PlusCircle, Sparkles } from 'lucide-react';

// Changelog des ausgewählten Servers (Modpack-Versionen). Admins können ihn hier verfassen.
export default function ServerChangelog({ manifest, isAdmin = false, onRefreshManifest }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editVersion, setEditVersion] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text: '' }

  const currentModpackVersion = manifest?.modpackVersion || '1.0.0';
  const serverName = manifest?.serverName || 'Minecraft Server';
  const history = Array.isArray(manifest?.changelogHistory) ? manifest.changelogHistory : [];

  const handleStartEdit = (entry = null) => {
    if (entry) {
      setEditVersion(entry.version || currentModpackVersion);
      setEditTitle(entry.title || `Server-Update v${entry.version}`);
      setEditText(entry.changelog || '');
    } else {
      setEditVersion(currentModpackVersion);
      setEditTitle(`Server-Update v${currentModpackVersion}`);
      setEditText(manifest?.changelog || '');
    }
    setFeedback(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!window.electronAPI?.updateServerChangelog) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await window.electronAPI.updateServerChangelog({
        version: editVersion,
        title: editTitle,
        changelog: editText
      });
      if (!res.success) throw new Error(res.error || 'Fehler beim Speichern');
      setFeedback({
        type: 'success',
        text: res.pushedToGithub
          ? 'Changelog erfolgreich gespeichert und zu GitHub gepusht!'
          : (res.githubError ? `Lokal gespeichert (GitHub-Hinweis: ${res.githubError})` : 'Changelog erfolgreich gespeichert!')
      });
      if (onRefreshManifest) {
        await onRefreshManifest();
      }
      setTimeout(() => {
        setIsEditing(false);
      }, 1200);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Speichern fehlgeschlagen.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header-Karte für Server */}
      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="badge badge-accent" style={{ fontSize: '12.5px', padding: '4px 10px' }}>
            Modpack v{currentModpackVersion}
          </span>
          <div>
            <strong style={{ fontSize: '15px', color: 'var(--text-main)' }}>{serverName}</strong>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Minecraft {manifest?.gameVersion || '26.3'} • {manifest?.loader || 'Fabric'} • {manifest?.mods?.length || 0} Mods
            </div>
          </div>
        </div>

        {isAdmin && !isEditing && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => handleStartEdit()}
            style={{ padding: '7px 14px', fontSize: '12.5px', gap: '6px' }}
          >
            <Edit3 size={14} />
            <span>Changelog verfassen / bearbeiten</span>
          </button>
        )}
      </div>

      {/* Admin Editor (wenn geöffnet) */}
      {isAdmin && isEditing && (
        <div className="glass-card" style={{ padding: '20px', border: '1px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit3 size={17} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                Server-Changelog bearbeiten (v{editVersion})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Titel des Updates:
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={`z. B. Server-Update v${editVersion}`}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-card)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  color: 'var(--text-main)',
                  fontSize: '13.5px',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Änderungsnotiz für die Spieler (Markdown oder Fließtext):
              </label>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Beschreibe, was sich auf dem Server oder an den Mods geändert hat..."
                rows={6}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-card)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  color: 'var(--text-main)',
                  fontSize: '13.5px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.5
                }}
              />
            </div>

            {feedback && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: feedback.type === 'success' ? '#10b981' : '#ef4444'
              }}>
                {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{feedback.text}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                <span>{isSaving ? 'Wird gespeichert...' : 'Speichern & für alle Spieler bereitstellen'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste der Server-Changelogs (Historie) */}
      {history.length > 0 ? (
        history.map((entry, idx) => (
          <div key={entry.version || idx} className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge badge-accent" style={{ fontSize: '13px' }}>
                  v{entry.version}
                </span>
                <h2 style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  {entry.title || `Server-Update v${entry.version}`}
                </h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {entry.date && (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} /> {entry.date}
                  </span>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleStartEdit(entry)}
                    title="Diesen Eintrag bearbeiten"
                    style={{ padding: '3px 8px', fontSize: '11.5px' }}
                  >
                    <Edit3 size={12} />
                  </button>
                )}
              </div>
            </div>

            {entry.changelog ? (
              <div style={{ fontSize: '13.5px', color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap', opacity: 0.95 }}>
                {entry.changelog}
              </div>
            ) : (
              !entry.modChanges && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Keine Beschreibung hinterlegt.
                </div>
              )
            )}

            {entry.modChanges && (entry.modChanges.added?.length > 0 || entry.modChanges.updated?.length > 0 || entry.modChanges.removed?.length > 0) && (
              <div style={{
                marginTop: entry.changelog ? '14px' : '4px',
                paddingTop: entry.changelog ? '12px' : 0,
                borderTop: entry.changelog ? '1px solid var(--border-card)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                {entry.modChanges.added?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', marginBottom: '5px' }}>
                      <Sparkles size={13} style={{ verticalAlign: '-2px', marginRight: '5px' }} />Neu hinzugefügt ({entry.modChanges.added.length}):
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {entry.modChanges.added.map((m, i) => (
                        <span key={i} className="badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '11.5px', padding: '2px 8px' }}>
                          + {m.name} {m.version ? `(${m.version})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {entry.modChanges.updated?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', marginBottom: '5px' }}>
                      Aktualisiert ({entry.modChanges.updated.length}):
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {entry.modChanges.updated.map((m, i) => (
                        <span key={i} className="badge" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '11.5px', padding: '2px 8px' }}>
                          ~ {m.name} {m.fromVersion && m.toVersion ? `(${m.fromVersion} → ${m.toVersion})` : m.toVersion || ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {entry.modChanges.removed?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f87171', marginBottom: '5px' }}>
                      Entfernt ({entry.modChanges.removed.length}):
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {entry.modChanges.removed.map((m, i) => (
                        <span key={i} className="badge" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '11.5px', padding: '2px 8px' }}>
                          − {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      ) : manifest?.changelog ? (
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge badge-accent" style={{ fontSize: '13px' }}>
                v{currentModpackVersion}
              </span>
              <h2 style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                Aktuelle Server-Änderungen
              </h2>
            </div>
          </div>

          <div style={{ fontSize: '13.5px', color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap', opacity: 0.95 }}>
            {manifest.changelog}
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Server size={24} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
            Noch kein Server-Changelog vorhanden
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 16px', lineHeight: 1.5 }}>
            Sobald beim Veröffentlichen eines Modpacks Notizen eingetragen werden, erscheinen sie hier für alle Mitspieler.
          </p>
          {isAdmin && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleStartEdit()}
              style={{ margin: '0 auto' }}
            >
              <PlusCircle size={15} />
              <span>Jetzt ersten Changelog verfassen</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
