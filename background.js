importScripts("core.js");

const { DEFAULT_SETTINGS, normalizeRules, classifyTabs } = RegexTabKeeperCore;

function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve({
        enabled: settings.enabled !== false,
        rules: normalizeRules(settings.rules)
      });
    });
  });
}

function queryCurrentWindowTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs);
    });
  });
}

function removeTabs(tabIds) {
  return new Promise((resolve, reject) => {
    if (tabIds.length === 0) {
      resolve();
      return;
    }
    chrome.tabs.remove(tabIds, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function buildPreview() {
  const [settings, tabs] = await Promise.all([getSettings(), queryCurrentWindowTabs()]);
  const result = classifyTabs(tabs, settings.rules);
  return {
    enabled: settings.enabled,
    activeRuleCount: result.activeRuleCount,
    keep: result.keep.map((tab) => ({ id: tab.id, title: tab.title || "（タイトルなし）", url: RegexTabKeeperCore.getTabUrl(tab) })),
    close: result.close.map((tab) => ({ id: tab.id, title: tab.title || "（タイトルなし）", url: RegexTabKeeperCore.getTabUrl(tab) })),
    invalidRuleCount: result.invalid.length
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "getPreview") {
    buildPreview()
      .then((preview) => sendResponse({ ok: true, preview }))
      .catch((error) => sendResponse({ ok: false, message: `タブを取得できませんでした: ${error.message}` }));
    return true;
  }

  if (message.type === "closeNonMatchingTabs") {
    (async () => {
      const preview = await buildPreview();
      if (!preview.enabled) {
        throw new Error("拡張機能は無効です。設定で有効にしてください。");
      }
      if (preview.activeRuleCount === 0) {
        throw new Error("有効な URL 正規表現がありません。安全のためタブを閉じませんでした。");
      }

      const tabIds = preview.close.map((tab) => tab.id).filter(Number.isInteger);
      await removeTabs(tabIds);
      return { closedCount: tabIds.length, keptCount: preview.keep.length };
    })()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : "タブを閉じられませんでした。" }));
    return true;
  }
});
