// ============================================================
// Antigravity Task – Popup Script
// ============================================================

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const loginSection = document.getElementById('login-section');
  const userSection  = document.getElementById('user-section');
  const setupSection = document.getElementById('setup-section');

  // Show the redirect URL for setup reference
  const redirectUrl = chrome.identity.getRedirectURL();
  document.getElementById('redirect-url').textContent = redirectUrl;

  // Check current session
  const session = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });

  if (session?.loggedIn) {
    showLoggedIn(session);
  } else {
    loginSection.style.display = 'flex';
    userSection.style.display  = 'none';
  }

  // Login button
  document.getElementById('login-btn').addEventListener('click', async () => {
    const btn = document.getElementById('login-btn');
    btn.classList.add('loading');
    btn.textContent = 'ログイン中…';

    const result = await chrome.runtime.sendMessage({ type: 'LOGIN' });

    btn.classList.remove('loading');

    if (result?.success) {
      showLoggedIn({
        loggedIn: true,
        userName: result.user.name,
        userEmail: result.user.email,
      });
    } else {
      btn.innerHTML = `
        <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Googleでログイン
      `;

      // Check if it's a redirect URL issue
      if (result?.error?.includes('redirect') || result?.error?.includes('OAuth')) {
        setupSection.style.display = 'flex';
      } else {
        alert('ログインに失敗しました: ' + (result?.error || '不明なエラー'));
      }
    }
  });

  // Logout button
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    loginSection.style.display = 'flex';
    userSection.style.display  = 'none';
  });

  // Copy URL button
  document.getElementById('copy-url-btn').addEventListener('click', () => {
    const url = document.getElementById('redirect-url').textContent;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copy-url-btn');
      btn.textContent = 'コピーしました ✓';
      setTimeout(() => { btn.textContent = 'URLをコピー'; }, 2000);
    });
  });
}

function showLoggedIn(session) {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('user-section').style.display  = 'flex';
  document.getElementById('setup-section').style.display = 'none';

  const name = session.userName || session.userEmail || '—';
  document.getElementById('user-name').textContent  = name;
  document.getElementById('user-email').textContent = session.userEmail || '—';

  // Avatar initial
  const initial = name.charAt(0).toUpperCase();
  document.getElementById('user-avatar').textContent = initial;
}
