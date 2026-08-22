(() => {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    rules: []
  });
  const MAX_RULES = 100;
  const MAX_PATTERN_LENGTH = 500;
  const VALID_FLAGS = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);

  function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeFlags(value) {
    if (typeof value !== "string") return "";
    return value.trim();
  }

  function validateFlags(flags) {
    const used = new Set();
    for (const flag of flags) {
      if (!VALID_FLAGS.has(flag) || used.has(flag)) {
        return { valid: false, message: "フラグには JavaScript 正規表現で使える重複のない文字だけを指定してください。" };
      }
      used.add(flag);
    }
    return { valid: true };
  }

  function validateRuleInput(pattern, flags = "") {
    if (typeof pattern !== "string" || !pattern.trim()) {
      return { valid: false, message: "URL 正規表現を入力してください。" };
    }
    if (pattern.trim().length > MAX_PATTERN_LENGTH) {
      return { valid: false, message: `URL 正規表現は ${MAX_PATTERN_LENGTH} 文字以内にしてください。` };
    }

    const normalizedFlags = normalizeFlags(flags);
    const flagValidation = validateFlags(normalizedFlags);
    if (!flagValidation.valid) return flagValidation;

    try {
      new RegExp(pattern.trim(), normalizedFlags);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        message: `正規表現の形式が正しくありません: ${error instanceof Error ? error.message : "構文エラー"}`
      };
    }
  }

  function normalizeRules(value, { strict = false } = {}) {
    if (!Array.isArray(value)) return [];

    const ids = new Set();
    const rules = [];
    for (const rule of value.slice(0, MAX_RULES)) {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
        if (strict) throw new Error("ルールの形式が正しくありません。");
        continue;
      }

      const pattern = typeof rule.pattern === "string" ? rule.pattern.trim() : "";
      const flags = normalizeFlags(rule.flags);
      const validation = validateRuleInput(pattern, flags);
      if (!validation.valid) {
        if (strict) throw new Error(validation.message);
        continue;
      }

      let id = typeof rule.id === "string" && rule.id.trim() ? rule.id.trim() : createId();
      while (ids.has(id)) id = createId();
      ids.add(id);
      rules.push({
        id,
        pattern,
        flags,
        enabled: rule.enabled !== false
      });
    }
    return rules;
  }

  function compileEnabledRules(rules) {
    const compiled = [];
    const invalid = [];
    for (const rule of normalizeRules(rules)) {
      if (!rule.enabled) continue;
      try {
        compiled.push({ ...rule, regex: new RegExp(rule.pattern, rule.flags) });
      } catch (error) {
        invalid.push({ rule, error });
      }
    }
    return { compiled, invalid };
  }

  function getTabUrl(tab) {
    if (!tab || typeof tab !== "object") return "";
    return typeof tab.url === "string" && tab.url ? tab.url : (typeof tab.pendingUrl === "string" ? tab.pendingUrl : "");
  }

  function matchesAnyRule(url, compiledRules) {
    if (!url) return false;
    return compiledRules.some(({ regex }) => {
      regex.lastIndex = 0;
      return regex.test(url);
    });
  }

  function classifyTabs(tabs, rules) {
    const { compiled, invalid } = compileEnabledRules(rules);
    const keep = [];
    const close = [];

    for (const tab of Array.isArray(tabs) ? tabs : []) {
      if (matchesAnyRule(getTabUrl(tab), compiled)) {
        keep.push(tab);
      } else {
        close.push(tab);
      }
    }

    return { keep, close, invalid, activeRuleCount: compiled.length };
  }

  function createExportPayload(settings) {
    return {
      format: "regex-tab-keeper",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        enabled: settings?.enabled !== false,
        rules: normalizeRules(settings?.rules)
      }
    };
  }

  function parseImportedSettings(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("JSON の最上位は設定オブジェクトである必要があります。");
    }
    if (payload.format && payload.format !== "regex-tab-keeper") {
      throw new Error("このファイルは Regex Tab Keeper の設定ファイルではありません。");
    }

    const source = payload.settings && typeof payload.settings === "object" ? payload.settings : payload;
    if (!Array.isArray(source.rules)) {
      throw new Error("ルール配列が見つかりません。");
    }
    if ("enabled" in source && typeof source.enabled !== "boolean") {
      throw new Error("有効・無効の設定値が正しくありません。");
    }
    if (source.rules.length > MAX_RULES) {
      throw new Error(`ルールは最大 ${MAX_RULES} 件までです。`);
    }

    return {
      enabled: "enabled" in source ? source.enabled : DEFAULT_SETTINGS.enabled,
      rules: normalizeRules(source.rules, { strict: true })
    };
  }

  const api = {
    DEFAULT_SETTINGS,
    MAX_RULES,
    createId,
    validateRuleInput,
    normalizeRules,
    compileEnabledRules,
    getTabUrl,
    matchesAnyRule,
    classifyTabs,
    createExportPayload,
    parseImportedSettings
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.RegexTabKeeperCore = api;
})();
