(() => {
  "use strict";

  const {
    DEFAULT_SETTINGS,
    MAX_RULES,
    createId,
    validateRuleInput,
    normalizeRules,
    createExportPayload,
    parseImportedSettings
  } = RegexTabKeeperCore;
  const MAX_IMPORT_BYTES = 1024 * 1024;

  const state = {
    enabled: true,
    rules: [],
    preview: null
  };

  const enabled = document.querySelector("#enabled");
  const ruleForm = document.querySelector("#ruleForm");
  const editingId = document.querySelector("#editingId");
  const pattern = document.querySelector("#pattern");
  const flags = document.querySelector("#flags");
  const ruleFormTitle = document.querySelector("#rule-form-title");
  const saveButton = document.querySelector("#saveButton");
  const cancelButton = document.querySelector("#cancelButton");
  const formMessage = document.querySelector("#formMessage");
  const ruleCount = document.querySelector("#ruleCount");
  const ruleList = document.querySelector("#ruleList");
  const refreshPreviewButton = document.querySelector("#refreshPreviewButton");
  const closeButton = document.querySelector("#closeButton");
  const previewSummary = document.querySelector("#previewSummary");
  const keepCount = document.querySelector("#keepCount");
  const closeCount = document.querySelector("#closeCount");
  const keepList = document.querySelector("#keepList");
  const closeList = document.querySelector("#closeList");
  const actionMessage = document.querySelector("#actionMessage");
  const exportButton = document.querySelector("#exportButton");
  const importInput = document.querySelector("#importInput");
  const transferMessage = document.querySelector("#transferMessage");

  function setMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `message ${type}`.trim();
  }

  function saveSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ enabled: state.enabled, rules: state.rules }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function loadSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        state.enabled = settings.enabled !== false;
        state.rules = normalizeRules(settings.rules);
        resolve();
      });
    });
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.message || "処理に失敗しました。"));
          return;
        }
        resolve(response);
      });
    });
  }

  function resetForm() {
    ruleForm.reset();
    editingId.value = "";
    ruleFormTitle.textContent = "残す URL 正規表現";
    saveButton.textContent = "ルールを保存";
    cancelButton.hidden = true;
  }

  function beginEdit(id) {
    const rule = state.rules.find((item) => item.id === id);
    if (!rule) return;
    editingId.value = rule.id;
    pattern.value = rule.pattern;
    flags.value = rule.flags;
    ruleFormTitle.textContent = "URL 正規表現を編集";
    saveButton.textContent = "変更を保存";
    cancelButton.hidden = false;
    setMessage(formMessage, "");
    pattern.focus();
  }

  function createRuleCard(rule) {
    const article = document.createElement("article");
    article.className = `rule-card${rule.enabled ? "" : " disabled"}`;

    const patternCode = document.createElement("code");
    patternCode.className = "rule-pattern";
    patternCode.textContent = `/${rule.pattern}/${rule.flags}`;

    const meta = document.createElement("p");
    meta.className = "rule-meta";
    meta.textContent = rule.enabled ? "このルールを使用中" : "このルールは停止中";

    const controls = document.createElement("div");
    controls.className = "rule-controls";

    const enableLabel = document.createElement("label");
    enableLabel.className = "inline-check";
    enableLabel.textContent = "有効 ";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = rule.enabled;
    toggle.dataset.action = "toggle";
    toggle.dataset.id = rule.id;
    toggle.setAttribute("aria-label", `/${rule.pattern}/${rule.flags} を有効にする`);
    enableLabel.append(toggle);

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "button-row";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.dataset.action = "edit";
    edit.dataset.id = rule.id;
    edit.textContent = "編集";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button danger-outline";
    remove.dataset.action = "delete";
    remove.dataset.id = rule.id;
    remove.textContent = "削除";

    buttonGroup.append(edit, remove);
    controls.append(enableLabel, buttonGroup);
    article.append(patternCode, meta, controls);
    return article;
  }

  function renderRules() {
    ruleList.replaceChildren();
    ruleCount.textContent = String(state.rules.length);

    if (state.rules.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "登録済みルールはありません。";
      ruleList.append(empty);
      return;
    }

    for (const rule of state.rules) ruleList.append(createRuleCard(rule));
  }

  function appendTabList(listElement, tabs) {
    listElement.replaceChildren();
    if (tabs.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "該当するタブはありません。";
      listElement.append(empty);
      return;
    }

    for (const tab of tabs) {
      const item = document.createElement("li");
      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.title;
      title.title = tab.title;
      const url = document.createElement("span");
      url.className = "tab-url";
      url.textContent = tab.url || "URL を取得できません";
      url.title = url.textContent;
      item.append(title, url);
      listElement.append(item);
    }
  }

  function renderPreview(preview) {
    state.preview = preview;
    keepCount.textContent = String(preview.keep.length);
    closeCount.textContent = String(preview.close.length);
    appendTabList(keepList, preview.keep);
    appendTabList(closeList, preview.close);

    const hasRunnableRules = state.enabled && preview.activeRuleCount > 0;
    closeButton.disabled = !hasRunnableRules;

    if (!state.enabled) {
      previewSummary.textContent = "拡張機能は無効です。有効にすると実行できます。";
    } else if (preview.activeRuleCount === 0) {
      previewSummary.textContent = "有効なルールがありません。安全のため実行できません。";
    } else if (preview.invalidRuleCount > 0) {
      previewSummary.textContent = `有効なルール ${preview.activeRuleCount} 件で確認しました。無効なルール ${preview.invalidRuleCount} 件があります。`;
    } else {
      previewSummary.textContent = `有効なルール ${preview.activeRuleCount} 件により、${preview.keep.length} 件を残し、${preview.close.length} 件を閉じます。`;
    }
  }

  async function refreshPreview({ silent = false } = {}) {
    refreshPreviewButton.disabled = true;
    if (!silent) setMessage(actionMessage, "タブを確認しています。", "");
    try {
      const response = await sendMessage({ type: "getPreview" });
      renderPreview(response.preview);
      if (!silent) setMessage(actionMessage, "確認結果を更新しました。", "success");
    } catch (error) {
      state.preview = null;
      closeButton.disabled = true;
      previewSummary.textContent = "タブ一覧を取得できませんでした。";
      setMessage(actionMessage, error instanceof Error ? error.message : "タブ一覧を取得できませんでした。", "error");
    } finally {
      refreshPreviewButton.disabled = false;
    }
  }

  async function persistAndRefresh(successMessage) {
    try {
      await saveSettings();
      renderRules();
      enabled.checked = state.enabled;
      setMessage(formMessage, successMessage, "success");
      await refreshPreview({ silent: true });
    } catch (error) {
      setMessage(formMessage, `設定を保存できませんでした: ${error.message}`, "error");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextPattern = pattern.value.trim();
    const nextFlags = flags.value.trim();
    const validation = validateRuleInput(nextPattern, nextFlags);
    if (!validation.valid) {
      setMessage(formMessage, validation.message, "error");
      pattern.focus();
      return;
    }

    const id = editingId.value || createId();
    const nextRule = { id, pattern: nextPattern, flags: nextFlags, enabled: true };
    const index = state.rules.findIndex((rule) => rule.id === id);
    if (index >= 0) {
      nextRule.enabled = state.rules[index].enabled;
      state.rules[index] = nextRule;
    } else {
      if (state.rules.length >= MAX_RULES) {
        setMessage(formMessage, `ルールは最大 ${MAX_RULES} 件までです。`, "error");
        return;
      }
      state.rules.push(nextRule);
    }

    resetForm();
    await persistAndRefresh(index >= 0 ? "ルールを更新しました。" : "ルールを保存しました。");
  }

  async function handleRuleListChange(event) {
    const input = event.target.closest("input[data-action='toggle']");
    if (!input) return;
    const rule = state.rules.find((item) => item.id === input.dataset.id);
    if (!rule) return;
    rule.enabled = input.checked;
    await persistAndRefresh("ルールの有効状態を更新しました。");
  }

  async function handleRuleListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "edit") {
      beginEdit(id);
      return;
    }
    if (action !== "delete") return;

    const rule = state.rules.find((item) => item.id === id);
    if (!rule || !window.confirm(`/${rule.pattern}/${rule.flags} を削除しますか？`)) return;
    state.rules = state.rules.filter((item) => item.id !== id);
    if (editingId.value === id) resetForm();
    await persistAndRefresh("ルールを削除しました。");
  }

  async function runClose() {
    if (!state.preview || closeButton.disabled) return;
    const { close, keep } = state.preview;
    const text = `すべての Chrome ウィンドウで ${close.length} 件のタブを閉じ、${keep.length} 件のタブを残します。\n\n続行しますか？`;
    if (!window.confirm(text)) {
      setMessage(actionMessage, "一括削除を取り消しました。", "");
      return;
    }

    closeButton.disabled = true;
    setMessage(actionMessage, "一致しないタブを閉じています。", "");
    try {
      const response = await sendMessage({ type: "closeNonMatchingTabs" });
      setMessage(actionMessage, `${response.result.closedCount} 件のタブを閉じ、${response.result.keptCount} 件を残しました。`, "success");
      await refreshPreview({ silent: true });
    } catch (error) {
      setMessage(actionMessage, error instanceof Error ? error.message : "タブを閉じられませんでした。", "error");
      await refreshPreview({ silent: true });
    }
  }

  function exportSettings() {
    const payload = createExportPayload(state);
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `regex-tab-keeper-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    setMessage(transferMessage, "設定ファイルをエクスポートしました。", "success");
  }

  async function importSettings(file) {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error("設定ファイルが大きすぎます。1 MB 以下の JSON を選択してください。");
      }
      const imported = parseImportedSettings(JSON.parse(await file.text()));
      if (!window.confirm(`現在の ${state.rules.length} 件のルールを、ファイル内の ${imported.rules.length} 件で置き換えます。続行しますか？`)) {
        setMessage(transferMessage, "インポートを取り消しました。", "");
        return;
      }
      state.enabled = imported.enabled;
      state.rules = imported.rules;
      await saveSettings();
      enabled.checked = state.enabled;
      renderRules();
      resetForm();
      setMessage(formMessage, "");
      setMessage(transferMessage, `${state.rules.length} 件のルールをインポートしました。`, "success");
      await refreshPreview({ silent: true });
    } catch (error) {
      setMessage(transferMessage, `インポートできませんでした: ${error instanceof Error ? error.message : "設定ファイルを読み込めませんでした。"}`, "error");
    } finally {
      importInput.value = "";
    }
  }

  enabled.addEventListener("change", async () => {
    state.enabled = enabled.checked;
    try {
      await saveSettings();
      await refreshPreview({ silent: true });
    } catch (error) {
      enabled.checked = !state.enabled;
      state.enabled = enabled.checked;
      setMessage(actionMessage, `有効状態を保存できませんでした: ${error.message}`, "error");
    }
  });
  ruleForm.addEventListener("submit", handleSubmit);
  cancelButton.addEventListener("click", () => {
    resetForm();
    setMessage(formMessage, "");
  });
  ruleList.addEventListener("click", handleRuleListClick);
  ruleList.addEventListener("change", handleRuleListChange);
  refreshPreviewButton.addEventListener("click", () => refreshPreview());
  closeButton.addEventListener("click", runClose);
  exportButton.addEventListener("click", exportSettings);
  importInput.addEventListener("change", () => importSettings(importInput.files[0]));

  loadSettings()
    .then(async () => {
      enabled.checked = state.enabled;
      renderRules();
      await refreshPreview({ silent: true });
    })
    .catch((error) => {
      setMessage(formMessage, `設定を読み込めませんでした: ${error.message}`, "error");
    });
})();
