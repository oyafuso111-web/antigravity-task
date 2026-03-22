import React from 'react';
import './SettingsModal.css';

interface Props {
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ onClose }) => {
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
            <p className="settings-description">
              Sign in with Google to sync your tasks across all devices securely.
            </p>
            <button className="google-btn">
              <span className="google-icon">G</span>
              Sign in with Google
            </button>
          </div>

          <div className="settings-section">
            <h3>Data Backup</h3>
            <p className="settings-description">
              Automatically backup your entire workspace to Google Drive weekly.
            </p>
            <div className="backup-controls">
              <label>
                <input type="checkbox" defaultChecked /> Enable Weekly Auto-Backup
              </label>
              <div className="format-selection">
                Format: 
                <select>
                  <option>JSON</option>
                  <option>CSV</option>
                </select>
              </div>
            </div>
            <button className="brand-bg brand-btn backup-btn">
              Backup Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
