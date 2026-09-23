/* App shell: menu, router, login, pending-change banner, status bar. */
"use strict";
SW.menu = [
  { label: "Painel de Controle", icon: "dash", page: "dashboard" },
  { label: "Rede", icon: "net", items: [["interfaces", "Interfaces"], ["zones", "Zonas"], ["dhcp", "Clientes DHCP"], ["dns", "DNS"], ["routes", "Rotas estáticas"]] },
  { label: "Política & Objetos", icon: "policy", items: [["policies", "Política de Firewall"], ["addresses", "Endereços"], ["services", "Serviços"], ["vips", "Virtual IPs"], ["pools", "IP Pools"], ["snat", "NAT central", "central_nat"]] },
  { label: "Perfis de Segurança", icon: "shield", items: [["ids", "IDS / IPS"], ["webfilter", "Filtro Web"], ["sslinspect", "Inspeção SSL"]] },
  { label: "WiFi", icon: "wifi", items: [["wifi-aps", "Access Points"], ["wifi-clients", "Clientes Wi-Fi"]] },
  { label: "VPN", icon: "vpn", items: [["ipsec", "Túneis IPsec"], ["ipsec-wizard", "Assistente IPsec"], ["certs", "Certificados"], ["tailscale", "Tailscale"]] },
  { label: "Logs & Relatórios", icon: "logs", items: [["log-traffic", "Tráfego"], ["log-denied", "Conexões bloqueadas"], ["log-ids", "Eventos IDS/IPS"], ["log-webfilter", "Filtro Web"], ["sessions", "Sessões ativas"], ["log-audit", "Auditoria"], ["log-system", "Logs do sistema"]] },
  { label: "Sistema", icon: "sys", items: [["settings", "Configurações"], ["admins", "Administradores"], ["backup", "Backup e Restauração"], ["revisions", "Revisões"], ["firmware", "Firmware"], ["devtools", "Desenvolvimento", "dev"], ["services-status", "Serviços"]] },
];

SW.buildMenu = () => {
  const nav = SW.$("#nav-list");
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem("sw.menu") || "[]"); } catch (e) { /* ignore */ }
  const open = new Set(saved.slice(0, 1));
  nav.innerHTML = "";
  SW.menu.forEach((sec) => {
    const el = SW.h(`<div class="nav-sec ${sec.page ? "single" : ""} ${open.has(sec.label) ? "open" : ""}">
      <div class="nav-head" ${sec.page ? `data-page="${sec.page}"` : ""}>${SW.icon[sec.icon]}<span>${SW.esc(sec.label)}</span>${sec.items ? `<span class="chev">${SW.icon.chev}</span>` : ""}</div>
      ${sec.items ? `<div class="nav-items">${sec.items.filter(([, , only]) => !only || (only === "dev" ? SW.meta && SW.meta.dev_mode : SW.meta && SW.meta[only])).map(([id, l]) => `<a href="#/${id}" data-page="${id}">${SW.esc(l)}</a>`).join("")}</div>` : ""}</div>`);
    SW.$(".nav-head", el).onclick = () => {
      if (sec.page) { location.hash = "#/" + sec.page; return; }
      SW.openNavSec(el.classList.contains("open") ? null : el);
    };
    nav.appendChild(el);
  });
};

/* per-admin preferences, kept on the firewall (fallback: this browser) */
SW.pref = (k, dflt) => {
  if (SW.prefs && SW.prefs[k] != null) return SW.prefs[k];
  try { const v = localStorage.getItem("sw." + k); if (v != null) return v; } catch (e) { /* ignore */ }
  return dflt;
};
SW.setPref = (k, v) => {
  SW.prefs = { ...(SW.prefs || {}), [k]: v };
  try { localStorage.setItem("sw." + k, v); } catch (e) { /* ignore */ }
  SW.PUT("/api/ui/prefs", { [k]: v }).catch(() => {});
};

/* accordion: only one section open at a time (el = null closes all) */
SW.openNavSec = (el) => {
  SW.$$("#nav-list .nav-sec.open").forEach((x) => x !== el && x.classList.remove("open"));
  if (el) el.classList.add("open");
  const label = el && SW.$(".nav-head span", el).textContent;
  try { localStorage.setItem("sw.menu", JSON.stringify(label ? [label] : [])); } catch (e) { /* ignore */ }
};

SW.route = () => {
  const id = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
  const page = SW.pages[id] || SW.pages.dashboard;
  SW.clearTimers();
  SW.$$(".ctx, .overlay").forEach((x) => x.remove());
  SW.$$("#sidebar [data-page]").forEach((a) => a.classList.toggle("active", a.dataset.page === id));
  const sec = SW.$(`#sidebar a[data-page="${id}"]`);
  if (sec) SW.openNavSec(sec.closest(".nav-sec"));
  SW.$("#app").classList.remove("nav-open");
  document.title = `${page.title} · BerryCade`;
  const view = SW.$("#view");
  view.innerHTML = "";
  Promise.resolve(page.render(view)).catch(SW.fail);
  SW.statusTick();
};

/* pending (unconfirmed) change banner — shown e.g. after a management IP change */
SW.checkPending = async () => {
  let st;
  try { st = await SW.GET("/api/apply/status"); } catch (e) { return; }
  const b = SW.$("#pending");
  if (!st.pending) { b.classList.add("hidden"); return; }
  b.classList.remove("hidden");
  b.innerHTML = `<b>Alteração aguardando confirmação</b><span>"${SW.esc(st.message)}" — será revertida em <b id="pend-s">${st.remaining}</b> s.</span>
    <span class="spacer" style="flex:1"></span><button class="btn primary sm" id="pend-ok">Confirmar</button><button class="btn sm danger" id="pend-no">Reverter agora</button>`;
  SW.$("#pend-ok").onclick = async () => { await SW.POST("/api/apply/confirm").catch(SW.fail); SW.toast("Alteração confirmada", "ok"); SW.checkPending(); };
  SW.$("#pend-no").onclick = async () => { await SW.POST("/api/apply/cancel").catch(SW.fail); SW.toast("Alteração revertida"); SW.checkPending(); SW.route(); };
  clearTimeout(SW._pendT);
  SW._pendT = setTimeout(SW.checkPending, 3000);
};

SW.statusTick = async () => {
  try {
    const d = await SW.GET("/api/dashboard");
    SW.$("#sb-sync").innerHTML = d.drift.in_sync ? `<span class="dot ok"></span>Configuração sincronizada com o kernel` : `<span class="dot bad"></span>Divergência config/kernel detectada`;
    SW.$("#sb-sessions").textContent = `${d.sessions} sessões`;
    SW.$("#tb-host").textContent = `${d.system.hostname} · up ${SW.fmtDur(d.system.uptime)}`;
    SW.$("#sb-updated").textContent = "Atualizado: " + new Date().toLocaleTimeString("pt-BR");
  } catch (e) {}
};

SW.showLogin = () => {
  SW.clearTimers();
  SW.$("#app").classList.add("hidden");
  SW.$("#login").classList.remove("hidden");
  SW.$$(".overlay").forEach((x) => x.remove());
};

SW.navFoot = () => {
  if (SW.meta) SW.$("#nav-foot").innerHTML = `<img src="/static/img/logo-32.png" alt=""><span>BerryCade</span><span class="ver">v${SW.esc(SW.meta.version)}</span>${SW.meta.dev_mode ? `<span class="badge warn" title="equipamento de desenvolvimento">DEV</span>` : ""}`;
};
SW.boot = async () => {
  let me;
  try { me = await SW.api("GET", "/api/auth/me", undefined, { noAuthRedirect: true }); } catch (e) { return SW.showLogin(); }
  SW.csrf = me.csrf; SW.user = me.user;
  if (me.must_change) { SW.showLogin(); return SW.changePassword(true); }
  SW.$("#login").classList.add("hidden");
  SW.$("#app").classList.remove("hidden");
  SW.$("#tb-user").textContent = `👤 ${me.user} ▾`;
  await SW.loadMeta().catch(() => {});
  SW.prefs = await SW.GET("/api/ui/prefs").catch(() => ({}));
  SW.buildMenu();
  SW.navFoot();
  SW.route();
  if (SW.meta && !SW.meta.setup_done) SW.setupWizard({ forced: true }).catch(SW.fail);
  SW.checkPending();
  clearInterval(SW._sbT);
  SW._sbT = setInterval(() => !document.hidden && SW.statusTick(), 10000);
};

SW.$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = SW.$("#login-err");
  err.classList.add("hidden");
  try {
    const r = await SW.api("POST", "/api/auth/login", { username: f.get("username"), password: f.get("password") }, { noAuthRedirect: true });
    SW.csrf = r.csrf;
    e.target.reset();
    if (r.must_change) return SW.changePassword(true);
    SW.boot();
  } catch (x) { err.textContent = x.message; err.classList.remove("hidden"); }
};

SW.$("#tb-user").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  SW.ctxMenu(r.left, r.bottom + 4, [
    { label: "Alterar senha", onClick: () => SW.changePassword(false) },
    "-",
    { label: "Sair", onClick: async () => { await SW.POST("/api/auth/logout").catch(() => {}); SW.csrf = null; SW.showLogin(); } },
  ]);
  e.stopPropagation();
};
SW.$("#burger").onclick = () => SW.$("#app").classList.toggle("nav-open");
/* the top-bar button flips light/dark for this browser only; colors come from the saved theme */
SW.$("#tb-theme").onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  localStorage.setItem("sw.theme", cur === "dark" ? "light" : "dark");
  SW.applyTheme(SW.themeCfg || { accent: "#0e7c86", sidebar: "#17202b", mode: "auto" });
};
SW.loadTheme();
window.addEventListener("hashchange", () => SW.csrf && SW.route());
SW.boot();
