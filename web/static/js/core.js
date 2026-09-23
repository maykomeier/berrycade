/* BerryCade — core UI toolkit (no build step, no external deps). */
"use strict";
const SW = (window.SW = { csrf: null, user: null, meta: null, pages: {}, timers: [] });

/* ───────────── helpers ───────────── */
SW.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
SW.$ = (sel, root = document) => root.querySelector(sel);
SW.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
SW.h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
SW.fmtBytes = (n) => { n = +n || 0; const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + " " + u[i]; };
SW.fmtBits = (n) => { n = +n || 0; const u = ["bps", "Kbps", "Mbps", "Gbps"]; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; } return (i ? n.toFixed(n < 10 ? 2 : 1) : Math.round(n)) + " " + u[i]; };
SW.fmtDur = (s) => { s = Math.max(0, Math.floor(+s || 0)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + "d " : "") + (d || h ? h + "h " : "") + m + "min"; };
SW.fmtTime = (t) => { if (!t) return ""; const d = new Date(t); return isNaN(d) ? SW.esc(t) : d.toLocaleString("pt-BR"); };
SW.get = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
SW.set = (o, path, v) => { const ks = path.split("."); let c = o; ks.slice(0, -1).forEach((k) => { if (c[k] == null || typeof c[k] !== "object") c[k] = {}; c = c[k]; }); c[ks[ks.length - 1]] = v; };
SW.clone = (o) => JSON.parse(JSON.stringify(o ?? null));
SW.badge = (text, kind = "off") => `<span class="badge ${kind}">${SW.esc(text)}</span>`;
SW.chips = (arr, cls = "") => (arr || []).map((x) => `<span class="chip ${cls}">${SW.esc(x)}</span>`).join("");
SW.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ───────────── icons (inline SVG, stroke = currentColor) ───────────── */
const P = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
SW.icon = {
  dash: P('<path d="M3 13a9 9 0 0 1 18 0"/><path d="M12 13l4-4"/><path d="M5 19h14"/>'),
  net: P('<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>'),
  policy: P('<path d="M4 4h16v4H4zM4 10h10v4H4zM4 16h13v4H4z"/>'),
  shield: P('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
  vpn: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  logs: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  sys: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  edit: P('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: P('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  refresh: P('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  chev: P('<path d="M9 6l6 6-6 6"/>'),
  clone: P('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  up: P('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  down: P('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  ban: P('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
  pin: P('<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
  x: P('<path d="M18 6L6 18M6 6l12 12"/>'),
  play: P('<path d="M6 4l14 8-14 8z"/>'),
  stop: P('<rect x="6" y="6" width="12" height="12"/>'),
  dl: P('<path d="M12 3v12M6 11l6 6 6-6M4 21h16"/>'),
  wifi: P('<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16.1a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>'),
};

/* ───────────── API ───────────── */
class ApiError extends Error {
  constructor(status, detail) {
    const d = typeof detail === "object" && detail ? detail : { message: String(detail || "erro"), errors: [] };
    super(d.message || "erro");
    this.status = status; this.errors = d.errors || [];
  }
}
SW.ApiError = ApiError;
SW.api = async (method, path, body, opts = {}) => {
  const headers = {};
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  if (method !== "GET" && SW.csrf) headers["X-CSRF-Token"] = SW.csrf;
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: "same-origin" });
  } catch (e) {
    throw new ApiError(0, { message: "sem comunicação com o firewall", errors: [] });
  }
  if (res.status === 401 && !opts.noAuthRedirect) { SW.showLogin(); throw new ApiError(401, "sessão expirada"); }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    let det = data && data.detail !== undefined ? data.detail : data;
    if (Array.isArray(det)) det = { message: "dados inválidos", errors: det.map((x) => `${(x.loc || []).slice(1).join(".")}: ${x.msg}`) };
    throw new ApiError(res.status, det);
  }
  return data;
};
SW.GET = (p) => SW.api("GET", p);
SW.POST = (p, b = {}) => SW.api("POST", p, b);
SW.PUT = (p, b) => SW.api("PUT", p, b);
SW.DEL = (p) => SW.api("DELETE", p);

/* Every config change goes through here: the browser confirms it can still reach the
   firewall right after applying (anti-lockout). If it can't, the backend rolls back. */
SW.apply = async (promise, { silent = false } = {}) => {
  const r = await promise;
  if (r && r.status === "pending") {
    // the firewall re-checks open panel connections ~1 s after applying; confirming only after that proves
    // the admin still has access under the new rules (anti-lockout)
    await new Promise((ok) => setTimeout(ok, 2500));
    try { await SW.POST("/api/apply/confirm"); } catch (e) { SW.checkPending(); throw e; }
  }
  if (!silent) SW.toast("Configuração aplicada com sucesso", "ok");
  // refresh (not just drop) the cached meta: pages and dialogs read SW.meta synchronously right after an apply
  await SW.loadMeta(true).catch(() => { SW.meta = null; });
  SW.checkPending();
  return r;
};

SW.loadMeta = async (force) => { if (!SW.meta || force) SW.meta = await SW.GET("/api/meta"); return SW.meta; };

/* ───────────── toast / modal / dialogs ───────────── */
SW.toast = (msg, kind = "") => {
  const t = SW.h(`<div class="toast ${kind}">${SW.esc(msg)}</div>`);
  SW.$("#toasts").appendChild(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3500);
};
SW.errHtml = (e) => {
  const errs = (e && e.errors) || [];
  return `<div class="errbox"><b>${SW.esc(e.message || e)}</b>${errs.length ? "<ul>" + errs.map((x) => `<li>${SW.esc(x)}</li>`).join("") + "</ul>" : ""}</div>`;
};
SW.fail = (e) => { console.error(e); if (e.status !== 401) SW.toast((e.message || e) + (e.errors && e.errors.length ? ": " + e.errors.join("; ") : ""), "err"); };

SW.modal = ({ title, body = "", size = "", buttons = [], onOpen, onClose }) => {
  const ov = SW.h(`<div class="overlay"><div class="modal ${size}"><div class="modal-head">${SW.esc(title)}<button class="x" aria-label="Fechar">×</button></div>
    <div class="modal-body"></div><div class="modal-foot"></div></div></div>`);
  const bodyEl = SW.$(".modal-body", ov);
  if (typeof body === "string") bodyEl.innerHTML = body; else bodyEl.appendChild(body);
  const close = () => { ov.remove(); document.removeEventListener("keydown", esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc);
  SW.$(".x", ov).onclick = close;
  const foot = SW.$(".modal-foot", ov);
  const ctl = { close, el: ov, body: bodyEl, setError: (e) => { const old = SW.$(".errbox", bodyEl); old && old.remove(); if (e) bodyEl.prepend(SW.h(SW.errHtml(e))); bodyEl.scrollTop = 0; } };
  buttons.forEach((b) => {
    const btn = SW.h(`<button class="btn ${b.primary ? "primary" : ""} ${b.danger ? "danger" : ""}">${SW.esc(b.label)}</button>`);
    btn.onclick = async () => {
      if (!b.onClick) return close();
      btn.disabled = true;
      try { await b.onClick(ctl); } catch (e) { ctl.setError(e); } finally { btn.disabled = false; }
    };
    foot.appendChild(btn);
  });
  if (!buttons.length) foot.remove();
  document.body.appendChild(ov);
  onOpen && onOpen(ctl);
  const f = SW.$("input:not([type=checkbox]):not([disabled]), select, textarea", bodyEl);
  f && f.focus();
  return ctl;
};
SW.confirm = (msg, { title = "Confirmar", ok = "Confirmar", danger = false } = {}) => new Promise((res) => {
  SW.modal({ title, body: `<p>${msg}</p>`, onClose: () => res(false),
    buttons: [{ label: "Cancelar" }, { label: ok, primary: !danger, danger, onClick: (m) => { res(true); m.close(); } }] });
});

/* ───────────── context menu ───────────── */
SW.ctxMenu = (x, y, items) => {
  SW.$$(".ctx").forEach((c) => c.remove());
  const m = SW.h(`<div class="ctx"></div>`);
  items.filter(Boolean).forEach((it) => {
    if (it === "-") return m.appendChild(document.createElement("hr"));
    const d = SW.h(`<div class="${it.danger ? "danger" : ""} ${it.disabled ? "dis" : ""}">${it.icon || ""}<span>${SW.esc(it.label)}</span></div>`);
    d.onclick = () => { m.remove(); it.onClick && it.onClick(); };
    m.appendChild(d);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 6) + "px";
  m.style.top = Math.min(y, innerHeight - r.height - 6) + "px";
  setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
};
document.addEventListener("contextmenu", (e) => { if (!e.target.closest("[data-ctx]")) SW.$$(".ctx").forEach((c) => c.remove()); });

/* ───────────── form builder ─────────────
   field: {key, label, type, options, help, placeholder, show(values), cols (table), required, disabled}
   types: text number password select multi checks bool textarea list table section html */
SW.form = (fields, initial = {}) => {
  const values = SW.clone(initial) || {};
  const el = SW.h(`<div class="form"></div>`);
  const rows = [];
  const opts = (f) => (typeof f.options === "function" ? f.options(values) : f.options || []).map((o) => (typeof o === "object" ? o : { value: o, label: o }));

  const build = (f) => {
    if (f.type === "section") { const s = SW.h(`<div class="sect">${SW.esc(f.label)}</div>`); el.appendChild(s); rows.push({ f, els: [s] }); return; }
    if (f.type === "html") { const s = SW.h(`<div class="full">${f.html}</div>`); el.appendChild(s); rows.push({ f, els: [s] }); return; }
    const lab = SW.h(`<label class="l">${SW.esc(f.label || "")}${f.required ? " *" : ""}</label>`);
    const wrap = SW.h(`<div></div>`);
    const v = SW.get(values, f.key);
    let input;
    switch (f.type) {
      case "select":
        input = SW.h(`<select class="in"></select>`);
        opts(f).forEach((o) => input.appendChild(new Option(o.label, o.value, false, String(o.value) === String(v ?? ""))));
        input.onchange = () => { SW.set(values, f.key, f.number ? +input.value : input.value === "__null" ? null : input.value); refresh(); };
        wrap.appendChild(input);
        break;
      case "bool":
        input = SW.h(`<label class="toggle"><input type="checkbox" ${v ? "checked" : ""}> <span>${SW.esc(f.text || "")}</span></label>`);
        SW.$("input", input).onchange = (e) => { SW.set(values, f.key, e.target.checked); refresh(); };
        wrap.appendChild(input);
        break;
      case "checks": {
        input = SW.h(`<div class="checks"></div>`);
        const cur = new Set(v || []);
        opts(f).forEach((o) => {
          const c = SW.h(`<label><input type="checkbox" value="${SW.esc(o.value)}" ${cur.has(o.value) ? "checked" : ""}> ${SW.esc(o.label)}</label>`);
          SW.$("input", c).onchange = () => { SW.set(values, f.key, SW.$$("input:checked", input).map((i) => i.value)); refresh(); };
          input.appendChild(c);
        });
        wrap.appendChild(input);
        break;
      }
      case "multi": {
        input = SW.h(`<div class="multi"></div>`);
        const draw = () => {
          const cur = SW.get(values, f.key) || [];
          input.innerHTML = "";
          cur.forEach((x) => {
            const c = SW.h(`<span class="chip accent">${SW.esc(x)} <b title="remover">×</b></span>`);
            SW.$("b", c).onclick = () => { SW.set(values, f.key, cur.filter((y) => y !== x)); draw(); refresh(); };
            input.appendChild(c);
          });
          const sel = SW.h(`<select><option value="">+ adicionar…</option></select>`);
          opts(f).filter((o) => !cur.includes(o.value)).forEach((o) => sel.appendChild(new Option(o.label, o.value)));
          sel.onchange = () => { if (!sel.value) return; let n = [...cur, sel.value]; if (f.exclusive && f.exclusive.includes(sel.value)) n = [sel.value]; else if (f.exclusive) n = n.filter((y) => !f.exclusive.includes(y)); SW.set(values, f.key, n); draw(); refresh(); };
          input.appendChild(sel);
        };
        draw();
        wrap.appendChild(input);
        break;
      }
      case "list": {
        input = SW.h(`<textarea class="in" style="min-height:60px" placeholder="${SW.esc(f.placeholder || "um item por linha")}"></textarea>`);
        input.value = (v || []).join("\n");
        input.oninput = () => SW.set(values, f.key, input.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean));
        wrap.appendChild(input);
        break;
      }
      case "table": {
        input = SW.h(`<div><table class="subtable"><thead><tr>${f.cols.map((c) => `<th>${SW.esc(c.label)}</th>`).join("")}<th style="width:28px"></th></tr></thead><tbody></tbody></table>
          <button type="button" class="btn sm" style="margin-top:4px">${SW.icon.plus} Adicionar</button></div>`);
        const tb = SW.$("tbody", input);
        const draw = () => {
          const cur = SW.get(values, f.key) || [];
          tb.innerHTML = "";
          cur.forEach((row, i) => {
            const tr = SW.h(`<tr>${f.cols.map((c) => `<td><input data-k="${c.key}" placeholder="${SW.esc(c.placeholder || "")}" value="${SW.esc(row[c.key] ?? "")}"></td>`).join("")}<td><button type="button" class="btn sm danger">×</button></td></tr>`);
            SW.$$("input", tr).forEach((inp) => (inp.oninput = () => { row[inp.dataset.k] = inp.value; }));
            SW.$("button", tr).onclick = () => { cur.splice(i, 1); draw(); };
            tb.appendChild(tr);
          });
        };
        SW.$("button.btn", input).onclick = () => { const cur = SW.get(values, f.key) || []; cur.push(Object.fromEntries(f.cols.map((c) => [c.key, ""]))); SW.set(values, f.key, cur); draw(); };
        draw();
        wrap.appendChild(input);
        break;
      }
      case "textarea":
        input = SW.h(`<textarea class="in" placeholder="${SW.esc(f.placeholder || "")}"></textarea>`);
        input.value = v ?? "";
        input.oninput = () => SW.set(values, f.key, input.value);
        wrap.appendChild(input);
        break;
      default: {
        const t = f.type === "number" ? "number" : f.type === "password" ? "password" : "text";
        input = SW.h(`<input class="in" type="${t}" placeholder="${SW.esc(f.placeholder || "")}" ${f.disabled ? "disabled" : ""} autocomplete="off">`);
        input.value = v ?? "";
        input.oninput = () => {
          let x = input.value;
          if (f.type === "number") x = x === "" ? null : +x;
          if (f.emptyNull && x === "") x = null;
          SW.set(values, f.key, x);
          if (f.live) refresh();
        };
        wrap.appendChild(input);
      }
    }
    el.appendChild(lab); el.appendChild(wrap);
    const els = [lab, wrap];
    if (f.help) { const hp = SW.h(`<div class="help">${f.help}</div>`); el.appendChild(hp); els.push(hp); }
    rows.push({ f, els });
  };
  const refresh = () => rows.forEach(({ f, els }) => { const vis = !f.show || f.show(values); els.forEach((e) => e.classList.toggle("hidden", !vis)); });
  fields.forEach(build);
  refresh();
  return { el, values, get: () => SW.clone(values) };
};

/* Edit dialog that submits through SW.apply and keeps the modal open on validation errors */
SW.editDialog = ({ title, fields, value, onSave, size = "", note = "" }) => {
  const fm = SW.form(fields, value);
  const body = document.createElement("div");
  if (note) body.appendChild(SW.h(`<div class="note">${note}</div>`));
  body.appendChild(fm.el);
  return SW.modal({ title, body, size, buttons: [
    { label: "Cancelar" },
    { label: "OK", primary: true, onClick: async (m) => { await onSave(fm.get()); m.close(); } },
  ] });
};

/* ───────────── list page (toolbar + grouped, sortable, searchable table) ───────────── */
SW.listPage = (root, cfg) => {
  const state = { rows: [], sel: null, sort: null, q: "", collapsed: new Set() };
  root.innerHTML = `<div class="page">
    <div class="page-head"><h2>${SW.esc(cfg.title)}</h2><div class="spacer"></div>${cfg.headExtra || ""}</div>
    ${cfg.intro ? `<div class="note tip">${cfg.intro}</div>` : ""}
    <div class="toolbar"></div>
    <div class="tbl-wrap"><table class="grid"><thead></thead><tbody></tbody></table></div>
    ${cfg.footer || ""}</div>`;
  const tb = SW.$(".toolbar", root), thead = SW.$("thead", root), tbody = SW.$("tbody", root);
  const btns = {};
  const addBtn = (id, html, fn, needSel) => { const b = SW.h(`<button class="btn">${html}</button>`); b.onclick = fn; tb.appendChild(b); btns[id] = { b, needSel }; };
  if (cfg.create) {
    if (Array.isArray(cfg.create)) {
      addBtn("create", `${SW.icon.plus} Criar Novo ▾`, (e) => { const r = e.currentTarget.getBoundingClientRect(); SW.ctxMenu(r.left, r.bottom + 2, cfg.create.map((c) => ({ label: c.label, onClick: c.fn }))); e.stopPropagation(); });
    } else addBtn("create", `${SW.icon.plus} Criar Novo`, () => cfg.create());
    btns.create.b.classList.add("primary");
  }
  if (cfg.edit) addBtn("edit", `${SW.icon.edit} Editar`, () => state.sel && cfg.edit(state.sel), true);
  if (cfg.clone) addBtn("clone", `${SW.icon.clone} Clonar`, () => state.sel && cfg.clone(state.sel), true);
  if (cfg.del) addBtn("del", `${SW.icon.trash} Apagar`, () => state.sel && cfg.del(state.sel), true);
  (cfg.buttons || []).forEach((x, i) => addBtn("x" + i, x.label, () => x.fn(state.sel), x.needSel));
  const search = SW.h(`<div class="search"><input placeholder="Pesquisar"><span>${SW.icon.search}</span></div>`);
  SW.$("input", search).oninput = SW.debounce((e) => { state.q = e.target.value.toLowerCase(); draw(); }, 150);
  tb.appendChild(search);
  tb.appendChild(SW.h(`<div class="spacer"></div>`));
  const rb = SW.h(`<button class="btn" title="Atualizar">${SW.icon.refresh}</button>`);
  rb.onclick = () => load();
  tb.appendChild(rb);

  const updBtns = () => Object.values(btns).forEach(({ b, needSel }) => { if (needSel) b.disabled = !state.sel || (cfg.canEdit && !cfg.canEdit(state.sel)); });
  const cols = cfg.columns;
  thead.innerHTML = `<tr>${cols.map((c, i) => `<th data-i="${i}" style="${c.width ? "width:" + c.width : ""}">${SW.esc(c.label)}</th>`).join("")}</tr>`;
  SW.$$("th", thead).forEach((th) => (th.onclick = () => {
    const i = +th.dataset.i; if (cfg.noSort) return;
    state.sort = state.sort && state.sort.i === i ? { i, dir: -state.sort.dir } : { i, dir: 1 }; draw();
  }));
  const text = (r) => cols.map((c) => String(c.text ? c.text(r) : c.get(r)).replace(/<[^>]+>/g, " ")).join(" ").toLowerCase();

  const draw = () => {
    let rows = state.rows.filter((r) => !state.q || text(r).includes(state.q));
    if (state.sort) {
      const c = cols[state.sort.i];
      const k = (r) => (c.sort ? c.sort(r) : String(c.get(r)).replace(/<[^>]+>/g, ""));
      rows = [...rows].sort((a, b) => (k(a) > k(b) ? 1 : k(a) < k(b) ? -1 : 0) * state.sort.dir);
    }
    tbody.innerHTML = "";
    // drag & drop reordering: only when the table shows the real order (no column sort, no search filter)
    const canDrag = !!cfg.reorder && !state.sort && !state.q && !state.busy;
    tbody.classList.toggle("reorderable", canDrag);
    if (!rows.length) { tbody.innerHTML = `<tr><td class="empty" colspan="${cols.length}">${state.loading ? "Carregando…" : "Nenhum item"}</td></tr>`; return; }
    const groups = new Map();
    rows.forEach((r) => { const g = cfg.groupBy ? cfg.groupBy(r) : ""; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
    let keys = [...groups.keys()];
    if (cfg.groupOrder) keys.sort((a, b) => (cfg.groupOrder.indexOf(a) + 1 || 99) - (cfg.groupOrder.indexOf(b) + 1 || 99));
    keys.forEach((g) => {
      if (cfg.groupBy) {
        const gr = SW.h(`<tr class="grp"><td colspan="${cols.length}">${state.collapsed.has(g) ? "⊞" : "⊟"} ${cfg.groupLabel ? cfg.groupLabel(g) : SW.esc(g)} <span class="cnt">${groups.get(g).length}</span></td></tr>`);
        gr.onclick = () => { state.collapsed.has(g) ? state.collapsed.delete(g) : state.collapsed.add(g); draw(); };
        tbody.appendChild(gr);
        if (state.collapsed.has(g)) return;
      }
      groups.get(g).forEach((r) => {
        const tr = document.createElement("tr");
        tr.dataset.ctx = "1";
        if (cfg.rowClass) tr.className = cfg.rowClass(r) || "";
        if (state.sel && cfg.key && state.sel[cfg.key] === r[cfg.key]) tr.classList.add("sel");
        tr.innerHTML = cols.map((c) => `<td class="${c.cls || ""}">${c.get(r) ?? ""}</td>`).join("");
        tr.onclick = () => { state.sel = r; SW.$$("tr.sel", tbody).forEach((x) => x.classList.remove("sel")); tr.classList.add("sel"); updBtns(); cfg.onSelect && cfg.onSelect(r); };
        tr.ondblclick = () => cfg.edit && (!cfg.canEdit || cfg.canEdit(r)) && cfg.edit(r);
        if (canDrag) dragRow(tr, r);
        tr.oncontextmenu = (e) => {
          e.preventDefault(); tr.onclick();
          const items = [];
          if (cfg.ctx) items.push(...cfg.ctx(r));
          if (cfg.edit) items.push({ label: "Editar", icon: SW.icon.edit, onClick: () => cfg.edit(r), disabled: cfg.canEdit && !cfg.canEdit(r) });
          if (cfg.clone) items.push({ label: "Clonar", icon: SW.icon.clone, onClick: () => cfg.clone(r), disabled: cfg.canEdit && !cfg.canEdit(r) });
          if (cfg.del) items.push("-", { label: "Apagar", icon: SW.icon.trash, danger: true, onClick: () => cfg.del(r), disabled: cfg.canEdit && !cfg.canEdit(r) });
          if (items.length) SW.ctxMenu(e.clientX, e.clientY, items);
        };
        tbody.appendChild(tr);
      });
    });
  };
  let dragged = null;
  const scope = (r) => (cfg.reorderScope ? cfg.reorderScope(r) : "");
  const clearMarks = () => SW.$$(".drop-before, .drop-after", tbody).forEach((x) => x.classList.remove("drop-before", "drop-after"));
  const dragRow = (tr, r) => {
    tr.draggable = true;
    tr.ondragstart = (e) => { dragged = r; tr.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(r[cfg.key])); };
    tr.ondragend = () => { dragged = null; tr.classList.remove("dragging"); clearMarks(); };
    tr.ondragover = (e) => {
      if (!dragged || dragged === r || scope(dragged) !== scope(r)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      const b = tr.getBoundingClientRect(), after = e.clientY > b.top + b.height / 2;
      clearMarks(); tr.classList.add(after ? "drop-after" : "drop-before");
    };
    tr.ondragleave = () => tr.classList.remove("drop-before", "drop-after");
    tr.ondrop = async (e) => {
      e.preventDefault();
      const src = dragged, where = tr.classList.contains("drop-after") ? "after" : "before";
      clearMarks();
      if (!src || src === r || scope(src) !== scope(r)) return;
      state.busy = true; draw();
      try { await cfg.reorder(src, r, where); } catch (err) { SW.fail(err); }
      state.busy = false; load();
    };
  };
  const load = async () => {
    state.loading = !state.rows.length; if (state.loading) draw();
    try {
      state.rows = await cfg.load();
      if (state.sel && cfg.key) state.sel = state.rows.find((r) => r[cfg.key] === state.sel[cfg.key]) || null;
    } catch (e) { SW.fail(e); }
    state.loading = false;
    draw(); updBtns();
  };
  updBtns();
  load();
  if (cfg.autoRefresh) SW.every(cfg.autoRefresh, load);
  return { reload: load, state, root };
};

/* Generic CRUD dialogs bound to /api/config/<section> */
SW.crud = (section, keyField) => ({
  create: (obj) => SW.apply(SW.POST(`/api/config/${section}`, obj)),
  update: (key, obj) => SW.apply(SW.PUT(`/api/config/${section}/${encodeURIComponent(key)}`, obj)),
  remove: async (row, label) => {
    const key = row[keyField];
    if (row._refs) {
      const refs = await SW.GET(`/api/config/${section}/${encodeURIComponent(key)}/refs`);
      return SW.modal({ title: "Objeto em uso", body: `<p>${SW.esc(label || key)} é referenciado por:</p><ul>${refs.map((r) => `<li>${SW.esc(r)}</li>`).join("")}</ul><p class="muted">Remova as referências antes de apagar.</p>`, buttons: [{ label: "Fechar" }] });
    }
    if (!(await SW.confirm(`Apagar <b>${SW.esc(label || key)}</b>?`, { ok: "Apagar", danger: true }))) return;
    try { await SW.apply(SW.DEL(`/api/config/${section}/${encodeURIComponent(key)}`)); } catch (e) { SW.fail(e); }
  },
});

/* timers bound to the current page (cleared on navigation) */
SW.every = (sec, fn) => { const t = setInterval(() => { if (!document.hidden) fn(); }, sec * 1000); SW.timers.push(t); return t; };
SW.clearTimers = () => { SW.timers.forEach(clearInterval); SW.timers = []; };

/* page registry: SW.page(id, {title, render(el)}) */
SW.page = (id, def) => { SW.pages[id] = def; };

/* ───────────── theme (colors chosen in Sistema › Configurações) ───────────── */
SW.themePresets = {
  petroleo: { label: "Petróleo", accent: "#0e7c86", sidebar: "#17202b" },
  oceano: { label: "Oceano", accent: "#2563eb", sidebar: "#0f1b2d" },
  floresta: { label: "Floresta", accent: "#2f8f4e", sidebar: "#16211a" },
  ametista: { label: "Ametista", accent: "#7c4dcc", sidebar: "#1c1729" },
  ambar: { label: "Âmbar", accent: "#c56a0a", sidebar: "#221a12" },
  rubi: { label: "Rubi", accent: "#c0392b", sidebar: "#221416" },
  grafite: { label: "Grafite", accent: "#4b5563", sidebar: "#111827" },
  claro: { label: "Barra clara", accent: "#0e7c86", sidebar: "#e8edf2" },
};
SW.color = {
  rgb: (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),
  hex: (c) => "#" + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join(""),
  mix: (a, b, t) => { const x = SW.color.rgb(a), y = SW.color.rgb(b); return SW.color.hex(x.map((v, i) => v + (y[i] - v) * t)); },
  /* rotate hue (degrees) keeping saturation/lightness — used for the second chart series */
  rotate: (h, deg) => {
    let [r, g, b] = SW.color.rgb(h).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let hh = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; }
    hh = (hh + deg + 360) % 360;
    const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((hh / 60) % 2 - 1)), m = l - C / 2;
    const [a, bb, c] = hh < 60 ? [C, X, 0] : hh < 120 ? [X, C, 0] : hh < 180 ? [0, C, X] : hh < 240 ? [0, X, C] : hh < 300 ? [X, 0, C] : [C, 0, X];
    return SW.color.hex([a + m, bb + m, c + m].map((v) => v * 255));
  },
  lum: (h) => { const [r, g, b] = SW.color.rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; },
};
SW.applyTheme = (t) => {
  if (!t) return;
  SW.themeCfg = t;
  const c = SW.color, a = t.accent, sb = t.sidebar;
  const sideLight = c.lum(sb) > 0.45;
  // menu text: user choice, or automatic contrast against the sidebar color
  const sideText = t.sidebar_text || (sideLight ? "#2b3643" : c.mix(sb, "#ffffff", 0.78));
  const sideStrong = t.sidebar_text ? c.mix(t.sidebar_text, sideLight ? "#000000" : "#ffffff", 0.35) : (sideLight ? "#0b1016" : "#ffffff");
  const accentText = c.lum(a) > 0.5 ? "#111111" : "#ffffff";
  const chart2 = c.lum(a) < 0.02 ? "#e0873a" : c.rotate(a, 150);
  const vars = (dark) => `--chart-2:${chart2};--accent:${a};--accent-2:${c.mix(a, "#000000", 0.18)};--accent-text:${accentText};
    --accent-soft:${dark ? c.mix(a, "#16202a", 0.72) : c.mix(a, "#ffffff", 0.87)};
    --row-hover:${dark ? c.mix(a, "#16202a", 0.85) : c.mix(a, "#ffffff", 0.93)};--row-sel:${dark ? c.mix(a, "#16202a", 0.7) : c.mix(a, "#ffffff", 0.82)};
    --side:${sb};--side-2:${c.mix(sb, sideLight ? "#000000" : "#ffffff", 0.04)};--side-hover:${c.mix(sb, sideLight ? "#000000" : "#ffffff", 0.09)};
    --side-text:${sideText};--side-strong:${sideStrong};--side-border:${sideLight ? "rgba(0,0,0,.14)" : "rgba(255,255,255,.14)"};`;
  let el = document.getElementById("sw-theme");
  if (!el) { el = document.createElement("style"); el.id = "sw-theme"; document.head.appendChild(el); }
  el.textContent = `:root{${vars(false)}} :root[data-theme="dark"]{${vars(true)}}
    @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(true)}}}
    ${sideLight ? "#sidebar{border-right:1px solid var(--border)} #topbar{border-bottom:1px solid var(--border)}" : ""}
    ${t.density === "compact" ? "table.grid td{padding:4px 8px} table.grid th{padding:6px 8px} .form{gap:6px 12px} .nav-items a{padding:5px 14px 5px 42px}" : ""}`;
  document.documentElement.classList.toggle("no-tips", t.show_tips === false);
  const local = localStorage.getItem("sw.theme");
  const mode = local || (t.mode !== "auto" ? t.mode : null);
  if (mode) document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme;
};
SW.loadTheme = async () => { try { SW.applyTheme(await SW.api("GET", "/api/ui/theme", undefined, { noAuthRedirect: true })); } catch (e) {} };

/* service state → dot + text (used by dashboard and Sistema › Serviços) */
SW.svcState = (u) => ({
  running: ["ok", "em execução"],
  failed: ["bad", "falhou"],
  missing: ["bad", "parado — necessário"],
  unused: ["off", "não utilizado"],
  "unused-active": ["warn", "ativo sem uso"],
}[u.state] || ["off", u.active]);
SW.dryrunNote = `<div class="note" style="margin-bottom:10px"><b>Modo pré-visualização:</b> as alterações são validadas e versionadas, mas <b>não são aplicadas ao sistema</b>
  (rede, firewall, serviços, hostname). Por isso os serviços necessários aparecem parados.</div>`;
