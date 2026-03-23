import React from 'react';
import { useTaskStore } from '../store/useTaskStore';
import './SettingsModal.css';

interface Props {
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ onClose }) => {
  const { user, signInWithGoogle, signOut } = useTaskStore();
  const [isBackingUp, setIsBackingUp] = React.useState(false);
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [backupFiles, setBackupFiles] = React.useState<string[]>([]);
  const [selectedBackup, setSelectedBackup] = React.useState<string>('');

  React.useEffect(() => {
    fetch('https://backup-to-gcs-672698303673.asia-northeast1.run.app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' })
    })
      .then(r => r.json())
      .then(d => {
        if (d.files) {
          setBackupFiles(d.files);
          if (d.files.length > 0) setSelectedBackup(d.files[0]);
        }
      })
      .catch(console.error);
  }, []);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await fetch('https://backup-to-gcs-672698303673.asia-northeast1.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'backup' })
      });
      if (!res.ok) throw new Error('Backup failed');
      const data = await res.json();
      alert(`Backup successful: ${data.fileName}`);
      setBackupFiles(prev => [data.fileName, ...prev].sort((a, b) => b.localeCompare(a)));
      setSelectedBackup(data.fileName);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return alert('Please select a backup file');
    if (!window.confirm(`Are you sure you want to restore from ${selectedBackup}? Current data might be overwritten.`)) return;
    
    setIsRestoring(true);
    try {
      const res = await fetch('https://backup-to-gcs-672698303673.asia-northeast1.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', fileName: selectedBackup })
      });
      if (!res.ok) throw new Error('Restore failed');
      alert('Restore successful! Please refresh the page to see revived data.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Account & Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="settings-section">
            <h3>Cloud Sync</h3>
            {user ? (
              <>
                <p className="settings-description">
                  Signed in as {user.email}. Synchronizing tasks securely.
                </p>
                <button className="google-btn" onClick={() => signOut()}>
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <p className="settings-description">
                  Sign in with Google to sync your tasks across all devices securely.
                </p>
                <button className="google-btn" onClick={() => signInWithGoogle()}>
                  <span className="google-icon">G</span>
                  Sign in with Google
                </button>
              </>
            )}
          </div>

          <div className="settings-section">
            <h3>Data Backup & Restore</h3>
            <p className="settings-description">
              Manually backup your entire workspace to Google Cloud Storage or restore from a previous point in time.
            </p>
            
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className="brand-bg brand-btn" 
                onClick={handleBackup} 
                disabled={isBackingUp}
                style={{ alignSelf: 'flex-start' }}
              >
                {isBackingUp ? 'Backing up...' : 'Backup Now'}
              </button>

              <div style={{ borderTop: '1px solid var(--border-color)', margin: '8px 0', paddingTop: '16px' }}>
                <h4>Restore from Backup</h4>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                  <select 
                    value={selectedBackup} 
                    onChange={e => setSelectedBackup(e.target.value)}
                    style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', flex: 1 }}
                    disabled={backupFiles.length === 0}
                  >
                    {backupFiles.length === 0 ? (
                      <option value="">No backups found</option>
                    ) : (
                      backupFiles.map(file => (
                        <option key={file} value={file}>{file}</option>
                      ))
                    )}
                  </select>
                  <button 
                    className="brand-btn" 
                    style={{ background: 'var(--priority-high)' }}
                    onClick={handleRestore}
                    disabled={isRestoring || !selectedBackup}
                  >
                    {isRestoring ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
