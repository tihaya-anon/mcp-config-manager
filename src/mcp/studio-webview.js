const $ = (id) => document.getElementById(id);
let servers = [];
let enabledState = true;
let isSyncing = false;
const selectState = {};

function initCustomSelect(id, options) {
  selectState[id] = { options: options || [] };
  const trigger = $(id + "Trigger");
  const menu = $(id + "Menu");

  trigger.addEventListener("click", () => {
    const open = !menu.classList.contains("hidden");
    closeAllCustomSelects();
    if (!open) {
      menu.classList.remove("hidden");
      $(id + "Select").classList.add("open");
    }
  });

  setCustomSelectOptions(id, selectState[id].options);
}

function closeAllCustomSelects() {
  Object.keys(selectState).forEach((id) => {
    $(id + "Menu").classList.add("hidden");
    $(id + "Select").classList.remove("open");
  });
}

function setCustomSelectOptions(id, options) {
  const list = options || [];
  selectState[id].options = list;
  const menu = $(id + "Menu");
  menu.innerHTML = list
    .map(
      (opt) =>
        '<button type="button" class="custom-select-option" data-id="' +
        id +
        '" data-value="' +
        opt.value +
        '">' +
        opt.label +
        "</button>",
    )
    .join("");
  menu.querySelectorAll(".custom-select-option").forEach((node) => {
    node.addEventListener("click", () => {
      setCustomSelectValue(id, node.dataset.value || "", true);
      closeAllCustomSelects();
    });
  });
  const current = $(id).value;
  if (!list.some((x) => x.value === current)) {
    setCustomSelectValue(id, list.length ? list[0].value : "", false);
  } else {
    refreshCustomSelectVisual(id);
  }
}

function setCustomSelectValue(id, value, emitChange) {
  $(id).value = value;
  refreshCustomSelectVisual(id);
  if (emitChange) $(id).dispatchEvent(new Event("change", { bubbles: true }));
}

function refreshCustomSelectVisual(id) {
  const value = $(id).value;
  const options = selectState[id].options || [];
  const selected = options.find((x) => x.value === value);
  $(id + "Trigger").textContent = selected ? selected.label : "";
  $(id + "Menu")
    .querySelectorAll(".custom-select-option")
    .forEach((node) => {
      if (node.dataset.value === value) node.classList.add("active");
      else node.classList.remove("active");
    });
}

function getGroupValue() {
  return $("group").value === "__custom__"
    ? $("groupCustom").value.trim() || "default"
    : $("group").value || "default";
}

function syncGroupUi() {
  const custom = $("group").value === "__custom__";
  setVisible("groupCustom", custom);
  setDisabled("groupCustom", !custom);
}

function refreshGroupOptions() {
  const groups = Array.from(
    new Set(servers.map((s) => (s.meta?.group || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const opts = [{ value: "default", label: "default" }]
    .concat(
      groups
        .filter((g) => g !== "default")
        .map((g) => ({ value: g, label: g })),
    )
    .concat([{ value: "__custom__", label: "Custom..." }]);
  setCustomSelectOptions("group", opts);
}

function setStatus(text, isError) {
  const el = $("jsonStatus");
  el.textContent = text || "";
  el.style.color = isError
    ? "var(--vscode-errorForeground)"
    : "var(--vscode-descriptionForeground)";
}

function setEnabledVisual() {
  const btn = $("enabledToggle");
  if (enabledState) {
    btn.textContent = "Enabled: On";
    btn.classList.remove("toggle-off");
    btn.classList.add("toggle-on");
  } else {
    btn.textContent = "Enabled: Off";
    btn.classList.remove("toggle-on");
    btn.classList.add("toggle-off");
  }
}

function splitArgs(input) {
  return input
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseJsonSafe(raw) {
  if (!raw || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function formToServer() {
  const type = $("type").value;
  const isHttp = type === "http";
  const idValue = isHttp ? $("id").value : $("idRuntime").value;
  const descValue = isHttp
    ? $("description").value
    : $("descriptionRuntime").value;
  const server = {
    id: idValue || "",
    name: $("name").value || "",
    type,
    enabled: enabledState,
    meta: {
      group: getGroupValue(),
      description: descValue || undefined,
    },
  };
  if (type === "http")
    server.http = {
      url: $("httpUrl").value || "",
      headers: parseJsonSafe($("httpHeaders").value),
    };
  if (type === "stream")
    server.stream = {
      command: $("command").value || "",
      args: splitArgs($("args").value || ""),
      env: parseJsonSafe($("env").value),
    };
  if (type === "uvx-fastmcp")
    server.uvxFastmcp = {
      module: $("module").value || "",
      args: splitArgs($("args").value || ""),
      env: parseJsonSafe($("env").value),
    };
  return server;
}

function refreshJsonFromForm() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    $("jsonEditor").value = JSON.stringify(formToServer(), null, 2);
    setStatus("JSON synced from form", false);
  } finally {
    isSyncing = false;
  }
}

function setVisible(id, visible) {
  const el = $(id);
  if (!el) return;
  if (visible) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

function setDisabled(id, disabled) {
  const el = $(id);
  if (!el) return;
  el.disabled = !!disabled;
}

function syncTypeUi() {
  const type = $("type").value;
  const isHttp = type === "http";
  const isStream = type === "stream";
  const isUvx = type === "uvx-fastmcp";
  setVisible("httpCard", isHttp);
  setVisible("runtimeCard", isStream || isUvx);
  setDisabled("httpUrl", !isHttp);
  setDisabled("httpHeaders", !isHttp);
  setDisabled("command", !isStream);
  setDisabled("module", !isUvx);
  setDisabled("args", !(isStream || isUvx));
  setDisabled("env", !(isStream || isUvx));
  if (isHttp) {
    $("id").value = $("idRuntime").value || $("id").value;
    $("description").value =
      $("descriptionRuntime").value || $("description").value;
  } else {
    $("idRuntime").value = $("id").value || $("idRuntime").value;
    $("descriptionRuntime").value =
      $("description").value || $("descriptionRuntime").value;
  }
}

function syncNewButtonVisibility() {
  setVisible("new", $("existing").value !== "");
}

function fill(server) {
  const value = server || {};
  $("id").value = value.id || "";
  $("idRuntime").value = value.id || "";
  $("name").value = value.name || "";
  setCustomSelectValue("type", value.type || "http", false);
  enabledState = Boolean(value.enabled ?? true);
  setEnabledVisual();
  const group = value.meta?.group || "default";
  const groupOptions = (selectState.group?.options || []).map((x) => x.value);
  if (groupOptions.includes(group)) {
    setCustomSelectValue("group", group, false);
    $("groupCustom").value = "";
  } else {
    setCustomSelectValue("group", "__custom__", false);
    $("groupCustom").value = group;
  }
  syncGroupUi();
  $("description").value = value.meta?.description || "";
  $("descriptionRuntime").value = value.meta?.description || "";
  $("httpUrl").value = value.http?.url || "";
  $("httpHeaders").value = value.http?.headers
    ? JSON.stringify(value.http.headers, null, 2)
    : "";
  $("command").value = value.stream?.command || "";
  $("module").value = value.uvxFastmcp?.module || "";
  $("args").value = (value.stream?.args || value.uvxFastmcp?.args || []).join(
    " ",
  );
  $("env").value = value.stream?.env
    ? JSON.stringify(value.stream.env, null, 2)
    : value.uvxFastmcp?.env
      ? JSON.stringify(value.uvxFastmcp.env, null, 2)
      : "";
  syncTypeUi();
  refreshJsonFromForm();
}

function loadExistingSelect() {
  const options = [{ value: "", label: "(new server)" }].concat(
    servers.map((s) => ({
      value: s.id,
      label: s.name + " (" + (s.meta?.group || "default") + ")",
    })),
  );
  setCustomSelectOptions("existing", options);
  refreshGroupOptions();
  if (editingId) setCustomSelectValue("existing", editingId, false);
  syncNewButtonVisibility();
}

function applyJsonToForm() {
  const raw = $("jsonEditor").value || "";
  try {
    fill(JSON.parse(raw));
    setStatus("JSON applied to form", false);
  } catch (err) {
    setStatus("Invalid JSON: " + (err?.message || String(err)), true);
  }
}

$("enabledToggle").addEventListener("click", () => {
  enabledState = !enabledState;
  setEnabledVisual();
  refreshJsonFromForm();
});
$("existing").addEventListener("change", (e) => {
  const id = e.target.value;
  syncNewButtonVisibility();
  fill(servers.find((s) => s.id === id));
});
$("new").addEventListener("click", () => {
  setCustomSelectValue("existing", "", false);
  syncNewButtonVisibility();
  fill(undefined);
});
$("type").addEventListener("change", () => {
  syncTypeUi();
  refreshJsonFromForm();
});
$("group").addEventListener("change", () => {
  syncGroupUi();
  refreshJsonFromForm();
});
$("groupCustom").addEventListener("input", refreshJsonFromForm);
$("save").addEventListener("click", () => {
  const isHttp = $("type").value === "http";
  const idValue = isHttp ? $("id").value : $("idRuntime").value;
  const descValue = isHttp
    ? $("description").value
    : $("descriptionRuntime").value;
  vscode.postMessage({
    type: "save",
    payload: {
      id: idValue,
      name: $("name").value,
      type: $("type").value,
      enabled: enabledState,
      group: getGroupValue(),
      description: descValue,
      httpUrl: $("httpUrl").value,
      httpHeaders: $("httpHeaders").value,
      command: $("command").value,
      module: $("module").value,
      args: $("args").value,
      env: $("env").value,
    },
  });
});
$("previewBtn").addEventListener("click", () =>
  vscode.postMessage({ type: "preview", target: $("target").value }),
);
$("applyJson").addEventListener("click", applyJsonToForm);
$("formatJson").addEventListener("click", () => {
  try {
    $("jsonEditor").value = JSON.stringify(
      JSON.parse($("jsonEditor").value || "{}"),
      null,
      2,
    );
    setStatus("JSON formatted", false);
  } catch (err) {
    setStatus("Invalid JSON: " + (err?.message || String(err)), true);
  }
});
$("pasteJson").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    $("jsonEditor").value = text || "";
    applyJsonToForm();
  } catch {
    setStatus("Paste failed. Browser clipboard permission denied.", true);
  }
});
$("copyJson").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("jsonEditor").value || "");
    setStatus("JSON copied", false);
  } catch {
    setStatus("Copy failed. Browser clipboard permission denied.", true);
  }
});

[
  "name",
  "id",
  "idRuntime",
  "description",
  "descriptionRuntime",
  "httpUrl",
  "httpHeaders",
  "command",
  "module",
  "args",
  "env",
].forEach((id) => {
  const el = $(id);
  if (el) {
    el.addEventListener("input", refreshJsonFromForm);
  }
});

window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (msg.type === "data") {
    servers = msg.servers || [];
    loadExistingSelect();
    const initial = servers.find((s) => s.id === (msg.editingId || editingId));
    fill(initial);
  }
  if (msg.type === "saved")
    vscode.postMessage({ type: "requestData", editingId: msg.id });
  if (msg.type === "previewResult") $("preview").textContent = msg.text || "";
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select")) closeAllCustomSelects();
});

initCustomSelect("existing", [{ value: "", label: "(new server)" }]);
initCustomSelect("type", [
  { value: "http", label: "http" },
  { value: "stream", label: "stream" },
  { value: "uvx-fastmcp", label: "uvx fastmcp" },
]);
initCustomSelect("target", [
  { value: "claude-code", label: "claude-code" },
  { value: "codex", label: "codex" },
]);
initCustomSelect("group", [
  { value: "default", label: "default" },
  { value: "__custom__", label: "Custom..." },
]);
setCustomSelectValue("target", "claude-code", false);
setCustomSelectValue("group", "default", false);
syncGroupUi();
vscode.postMessage({ type: "requestData", editingId });
