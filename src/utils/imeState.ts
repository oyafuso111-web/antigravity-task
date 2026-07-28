/**
 * グローバルIME（日本語入力）状態管理
 * 
 * ブラウザの compositionstart / compositionend イベントを監視し、
 * IME変換中かどうかを同期的に追跡する。
 * 
 * React の isComposing はイベントのタイミングによって不正確になることがあるため、
 * このモジュールで独自にフラグを管理する。
 */

let _isComposing = false;
let _lastCompositionEndTime = 0;

// Guard interval (ms) after compositionend to ignore stale keydown events.
// Some browsers fire keydown for the confirming key (Space/Enter) *after*
// compositionend, so we need a small window to swallow those events.
const COMPOSITION_END_GUARD_MS = 100;

function onCompositionStart() {
  _isComposing = true;
}

function onCompositionEnd() {
  _isComposing = false;
  _lastCompositionEndTime = Date.now();
}

/**
 * IME変換中、またはcompositionend直後かどうかを返す。
 * keydownハンドラーからこの関数を呼ぶことで、
 * Space/Enterキーが変換操作の一部であるかを判定できる。
 */
export function isIMEActive(): boolean {
  if (_isComposing) return true;
  // compositionend直後のキーイベントもIME操作の一部として扱う
  if (Date.now() - _lastCompositionEndTime < COMPOSITION_END_GUARD_MS) return true;
  return false;
}

/**
 * compositionstart/compositionend リスナーを document に登録する。
 * アプリ起動時に1回呼ぶこと。
 */
export function initIMEListeners() {
  document.addEventListener('compositionstart', onCompositionStart, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
}

/**
 * クリーンアップ（通常は不要だが、テスト用）
 */
export function cleanupIMEListeners() {
  document.removeEventListener('compositionstart', onCompositionStart, true);
  document.removeEventListener('compositionend', onCompositionEnd, true);
}
