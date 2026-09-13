// ============================================================
// Antigravity Task – Gmail Chrome Extension (Background Worker)
// ============================================================

const SUPABASE_URL = 'https://iwzklfmylfaumjcmuoae.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JGsjsaeJrMWll-vYDpV9qg_seA1kBRp';

// ------------------------------------------------------------------
// Message router
// ------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'LOGIN':
      handleLogin().then(sendResponse);
      return true;
    case 'GET_SESSION':
      getSession().then(sendResponse);
      return true;
    case 'LOGOUT':
      handleLogout().then(sendResponse);
      return true;
    case 'CREATE_TASK':
      createTask(message.taskData).then(sendResponse);
      return true;
  }
});

// ------------------------------------------------------------------
// OAuth login via chrome.identity
// ------------------------------------------------------------------
async function handleLogin() {
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    // Supabase returns tokens in the URL hash fragment
    const url = new URL(responseUrl);
    const hash = url.hash.substring(1);          // remove leading #
    const params = new URLSearchParams(hash);

    const accessToken  = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn    = parseInt(params.get('expires_in') || '3600', 10);
    const expiresAt    = Date.now() + expiresIn * 1000;

    if (!accessToken) {
      return { success: false, error: 'トークンが取得できませんでした' };
    }

    // Fetch user profile from Supabase
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    const userData = await userRes.json();

    await chrome.storage.local.set({
      accessToken,
      refreshToken,
      expiresAt,
      userId: userData.id,
      userEmail: userData.email,
      userName: userData.user_metadata?.full_name || userData.email,
    });

    return {
      success: true,
      user: {
        email: userData.email,
        name: userData.user_metadata?.full_name || userData.email,
      },
    };
  } catch (err) {
    console.error('[bg] Login failed:', err);
    return { success: false, error: err.message || 'ログインに失敗しました' };
  }
}

// ------------------------------------------------------------------
// Token management
// ------------------------------------------------------------------
async function refreshAccessToken() {
  const { refreshToken } = await chrome.storage.local.get(['refreshToken']);
  if (!refreshToken) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const expiresAt = Date.now() + data.expires_in * 1000;

    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

async function getValidToken() {
  const { accessToken, expiresAt } =
    await chrome.storage.local.get(['accessToken', 'expiresAt']);
  if (!accessToken) return null;

  // Refresh 5 min before expiry
  if (expiresAt && Date.now() > expiresAt - 5 * 60 * 1000) {
    return await refreshAccessToken();
  }
  return accessToken;
}

// ------------------------------------------------------------------
// Session helper
// ------------------------------------------------------------------
async function getSession() {
  const token = await getValidToken();
  if (!token) return { loggedIn: false };

  const { userId, userEmail, userName } =
    await chrome.storage.local.get(['userId', 'userEmail', 'userName']);
  return { loggedIn: true, userId, userEmail, userName };
}

async function handleLogout() {
  await chrome.storage.local.remove([
    'accessToken', 'refreshToken', 'expiresAt',
    'userId', 'userEmail', 'userName', 'emailTagId',
  ]);
  return { success: true };
}

// ------------------------------------------------------------------
// Ensure the "メール" tag exists (create if missing)
// ------------------------------------------------------------------
async function ensureEmailTag(token, userId) {
  // Check cached tag ID first
  const { emailTagId } = await chrome.storage.local.get(['emailTagId']);
  if (emailTagId) {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tags?id=eq.${emailTagId}&select=id`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const checkData = await checkRes.json();
    if (checkData.length > 0) return emailTagId;
  }

  // Search DB for existing tag
  const searchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tags?name=eq.${encodeURIComponent('メール')}&user_id=eq.${userId}&select=id`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const searchData = await searchRes.json();
  if (searchData.length > 0) {
    await chrome.storage.local.set({ emailTagId: searchData[0].id });
    return searchData[0].id;
  }

  // Create new tag
  const newTagId = crypto.randomUUID();
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id: newTagId,
      name: 'メール',
      color: '#4285F4',
      created_at: new Date().toISOString(),
      user_id: userId,
    }),
  });

  if (createRes.ok) {
    await chrome.storage.local.set({ emailTagId: newTagId });
    return newTagId;
  }
  return null;
}

// ------------------------------------------------------------------
// Create a task in Supabase
// ------------------------------------------------------------------
async function createTask(taskData) {
  const token = await getValidToken();
  if (!token) return { success: false, error: 'ログインしてください' };

  const { userId } = await chrome.storage.local.get(['userId']);
  if (!userId) return { success: false, error: 'ユーザーIDが見つかりません' };

  // Ensure tag
  const emailTagId = await ensureEmailTag(token, userId);

  // Due date = today (local)
  const now = new Date();
  const dueDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const task = {
    id: crypto.randomUUID(),
    title: taskData.title,
    description: taskData.description || '',
    completed: false,
    priority: 'none',
    tag_ids: emailTagId ? [emailTagId] : [],
    due_date: dueDate,
    recurrence: null,
    created_at: new Date().toISOString(),
    accumulated_time: 0,
    estimated_minutes: 0,
    daily_logs: {},
    time_blocks: [],
    subtasks: [],
    comments: [],
    order: 0,
    home_bucket: null,
    project_id: null,
    user_id: userId,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(task),
    });

    if (res.ok) {
      return { success: true };
    }
    const errText = await res.text();
    console.error('[bg] Task insert failed:', errText);
    return { success: false, error: errText };
  } catch (err) {
    console.error('[bg] Task insert error:', err);
    return { success: false, error: err.message };
  }
}
