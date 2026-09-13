// ============================================================
// Antigravity Task – Gmail Content Script
// ============================================================
// Injects a "📋 タスク登録" button into Gmail's message view.
// When clicked, extracts email data and sends it to the background
// worker which inserts it into Supabase.
// ============================================================

(() => {
  'use strict';

  // Prevent double-injection
  if (window.__antigravityTaskInjected) return;
  window.__antigravityTaskInjected = true;

  // ------------------------------------------------------------------
  // Gmail DOM selectors (multiple fallbacks for resilience)
  // ------------------------------------------------------------------
  const SELECTORS = {
    // Thread subject heading
    subject: [
      'h2.hP',                         // Classic Gmail
      'h2[data-thread-perm-id]',       // Newer Gmail
      'div[role="main"] h2',           // Fallback
    ],
    // Sender element (has email attribute)
    sender: [
      'span.gD',
      'span[email]',
    ],
    // Message body
    body: [
      'div.a3s.aiL',                   // Standard message body
      'div.a3s',                        // Fallback
      'div[data-message-id] div.ii',   // Alternative
    ],
    // Date header
    date: [
      'span.g3',
      'span[data-tooltip]',
    ],
    // Top toolbar where we'll inject the button (right side buttons area)
    toolbar: [
      'div[gh="mtb"]',                 // Gmail main toolbar
      'div.iH div[role="toolbar"]',
      'div[role="main"] div.G-atb',
    ],
    // Container that indicates we're viewing an email thread
    threadView: [
      'div.nH.if',                     // Thread container
      'div[role="main"] div.nH',
    ],
  };

  // ------------------------------------------------------------------
  // Utility: query with multiple selector fallbacks
  // ------------------------------------------------------------------
  function q(selectorList, root = document) {
    for (const sel of selectorList) {
      const els = root.querySelectorAll(sel);
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
      }
    }
    return null;
  }

  function qAll(selectorList, root = document) {
    for (const sel of selectorList) {
      const els = root.querySelectorAll(sel);
      const visibleEls = Array.from(els).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (visibleEls.length > 0) return visibleEls;
    }
    return [];
  }

  // ------------------------------------------------------------------
  // Extract email data from the currently open message
  // ------------------------------------------------------------------
  function extractEmailData() {
    // Subject
    const subjectEl = q(SELECTORS.subject);
    const subject = subjectEl?.textContent?.trim() || '(件名なし)';

    // Sender – get the LAST visible message's sender (bottom of thread)
    const senderEls = qAll(SELECTORS.sender);
    let senderName = '';
    let senderEmail = '';
    if (senderEls.length > 0) {
      const lastSender = senderEls[senderEls.length - 1];
      senderName  = lastSender.getAttribute('name') || lastSender.textContent?.trim() || '';
      senderEmail = lastSender.getAttribute('email') || '';
    }

    // Date
    const dateEl = q(SELECTORS.date);
    const dateText = dateEl?.getAttribute('title') ||
                     dateEl?.getAttribute('data-tooltip') ||
                     dateEl?.textContent?.trim() || '';

    // Body – get the last message's body (most recent in thread)
    const bodyEls = qAll(SELECTORS.body);
    let bodyText = '';
    if (bodyEls.length > 0) {
      const lastBody = bodyEls[bodyEls.length - 1];
      bodyText = extractPlainText(lastBody);
    }

    // Trim body to 1000 chars
    if (bodyText.length > 1000) {
      bodyText = bodyText.substring(0, 1000) + '\n…(以下省略)';
    }

    return { subject, senderName, senderEmail, dateText, bodyText };
  }

  // ------------------------------------------------------------------
  // Convert HTML element to plain text preserving basic structure
  // ------------------------------------------------------------------
  function extractPlainText(el) {
    if (!el) return '';
    // Clone to avoid side effects
    const clone = el.cloneNode(true);
    // Remove style and script tags
    clone.querySelectorAll('style, script, .gmail_signature').forEach(e => e.remove());
    // Get text with newlines
    return (clone.innerText || clone.textContent || '').trim();
  }

  // ------------------------------------------------------------------
  // Create and inject the "タスク登録" button
  // ------------------------------------------------------------------
  let currentButton = null;

  function injectButton() {
    // Check if the current button is still in the document and visible
    if (currentButton && document.contains(currentButton)) {
      const rect = currentButton.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return;
    }

    // Only inject when viewing a thread (ensure it's a visible one)
    const subjectEl = q(SELECTORS.subject);
    if (!subjectEl) return;

    // Find injection point – subject's parent row
    const subjectRow = subjectEl.closest('div.ha') || subjectEl.closest('div') || subjectEl.parentElement;
    if (!subjectRow) return;

    // Check if we already injected in this specific view
    const existingBtn = subjectRow.querySelector('.ag-task-btn');
    if (existingBtn) {
      currentButton = existingBtn;
      return;
    }

    // Create button
    const btn = document.createElement('button');
    btn.className = 'ag-task-btn';
    btn.setAttribute('title', 'Antigravity Task に登録');
    btn.innerHTML = `
      <span class="ag-task-btn-icon">📋</span>
      <span class="ag-task-btn-text">タスク登録</span>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showTaskModal();
    });

    // Insert button after the subject
    subjectRow.style.display = 'flex';
    subjectRow.style.alignItems = 'center';
    subjectRow.style.gap = '8px';
    subjectRow.style.flexWrap = 'wrap';
    subjectRow.appendChild(btn);
    currentButton = btn;
  }

  // ------------------------------------------------------------------
  // Mini modal for task creation
  // ------------------------------------------------------------------
  function showTaskModal() {
    // Remove existing modal
    const existing = document.getElementById('ag-task-modal-overlay');
    if (existing) existing.remove();

    const emailData = extractEmailData();

    // Build description
    const descParts = [];
    if (emailData.senderName || emailData.senderEmail) {
      descParts.push(`📧 From: ${emailData.senderName}${emailData.senderEmail ? ' <' + emailData.senderEmail + '>' : ''}`);
    }
    if (emailData.dateText) {
      descParts.push(`📅 Date: ${emailData.dateText}`);
    }
    descParts.push(`🔗 URL: ${window.location.href}`);
    if (emailData.bodyText) {
      descParts.push('');
      descParts.push(emailData.bodyText);
    }
    const description = descParts.join('\n');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'ag-task-modal-overlay';
    overlay.innerHTML = `
      <div class="ag-task-modal">
        <div class="ag-task-modal-header">
          <span class="ag-task-modal-logo">🚀</span>
          <span class="ag-task-modal-title">Antigravity Task に登録</span>
          <button class="ag-task-modal-close" id="ag-modal-close">&times;</button>
        </div>
        <div class="ag-task-modal-body">
          <label class="ag-task-label">タスクタイトル</label>
          <input
            type="text"
            class="ag-task-input"
            id="ag-task-title"
            value="${escapeHtml(emailData.subject)}"
            placeholder="タスクのタイトル"
          />
          <label class="ag-task-label">メール情報（説明に追記されます）</label>
          <div class="ag-task-email-preview">
            <div class="ag-task-email-meta">
              ${emailData.senderName || emailData.senderEmail
                ? `<span class="ag-email-from">📧 ${escapeHtml(emailData.senderName || emailData.senderEmail)}</span>`
                : ''}
              ${emailData.dateText
                ? `<span class="ag-email-date">📅 ${escapeHtml(emailData.dateText)}</span>`
                : ''}
            </div>
          </div>
          <div class="ag-task-tags">
            <span class="ag-task-tag-badge">📌 期日: 今日</span>
            <span class="ag-task-tag-badge ag-tag-email">🏷️ メール</span>
          </div>
        </div>
        <div class="ag-task-modal-footer">
          <button class="ag-task-btn-cancel" id="ag-modal-cancel">キャンセル</button>
          <button class="ag-task-btn-submit" id="ag-modal-submit">
            <span class="ag-submit-text">登録する</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Focus title input
    const titleInput = document.getElementById('ag-task-title');
    setTimeout(() => titleInput?.focus(), 50);

    // Enter key submits
    titleInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    });

    // Event handlers
    document.getElementById('ag-modal-close').addEventListener('click', closeModal);
    document.getElementById('ag-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('ag-modal-submit').addEventListener('click', handleSubmit);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // ESC closes
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    async function handleSubmit() {
      const title = titleInput?.value?.trim();
      if (!title) {
        titleInput.classList.add('ag-input-error');
        setTimeout(() => titleInput.classList.remove('ag-input-error'), 1000);
        return;
      }

      const submitBtn = document.getElementById('ag-modal-submit');
      submitBtn.classList.add('ag-btn-loading');
      submitBtn.querySelector('.ag-submit-text').textContent = '登録中…';

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'CREATE_TASK',
          taskData: { title, description },
        });

        if (result?.success) {
          showToast('✅ タスクを登録しました', 'success');
          closeModal();
        } else {
          const errorMsg = result?.error || '不明なエラー';
          if (errorMsg.includes('ログイン')) {
            showToast('⚠️ 拡張機能からログインしてください', 'error');
          } else {
            showToast('❌ 登録に失敗しました: ' + errorMsg, 'error');
          }
          submitBtn.classList.remove('ag-btn-loading');
          submitBtn.querySelector('.ag-submit-text').textContent = '登録する';
        }
      } catch (err) {
        showToast('❌ エラーが発生しました', 'error');
        submitBtn.classList.remove('ag-btn-loading');
        submitBtn.querySelector('.ag-submit-text').textContent = '登録する';
      }
    }
  }

  function closeModal() {
    const overlay = document.getElementById('ag-task-modal-overlay');
    if (overlay) {
      overlay.classList.add('ag-modal-closing');
      setTimeout(() => overlay.remove(), 200);
    }
  }

  // ------------------------------------------------------------------
  // Toast notification
  // ------------------------------------------------------------------
  function showToast(message, type = 'success') {
    const existing = document.getElementById('ag-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'ag-toast';
    toast.className = `ag-toast ag-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('ag-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('ag-toast-visible');
      toast.classList.add('ag-toast-hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------------
  // DOM Observer – detect when user opens an email thread
  // ------------------------------------------------------------------
  let observerDebounce = null;

  const observer = new MutationObserver(() => {
    clearTimeout(observerDebounce);
    observerDebounce = setTimeout(() => {
      injectButton();
    }, 300);
  });

  // Start observing once Gmail's main content is ready
  function startObserving() {
    // Observe the entire body because Gmail heavily modifies the DOM
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial check
    injectButton();
  }

  // Wait for Gmail to fully load
  if (document.readyState === 'complete') {
    setTimeout(startObserving, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(startObserving, 1000));
  }

  // Also listen for URL hash changes (Gmail uses hash-based navigation)
  let lastHash = location.hash;
  setInterval(() => {
    if (location.hash !== lastHash) {
      lastHash = location.hash;
      currentButton = null; // Reset so button is re-injected
      setTimeout(injectButton, 500);
    }
  }, 500);
})();
