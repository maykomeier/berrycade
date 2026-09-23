/* Perfis de Segurança: IDS/IPS (Suricata via NFQUEUE). */
"use strict";
SW.alertTable = (rows) => rows.length ? rows.map((a) => `<tr><td class="nowrap">${SW.fmtTime(a.time)}</td>
  <td>${a.action === "blocked" ? SW.badge("bloqueado", "bad") : SW.badge("alerta", "warn")}</td>
  <td>${SW.badge("sev " + (a.severity ?? "?"), a.severity === 1 ? "bad" : a.severity === 2 ? "warn" : "info")}</td>
  <td>${SW.esc(a.signature)}<div class="muted">SID ${a.sid} · ${SW.esc(a.category || "")}</div></td>
  <td class="mono">${SW.esc(a.src)}${a.sport ? ":" + a.sport : ""}</td><td class="mono">${SW.esc(a.dst)}${a.dport ? ":" + a.dport : ""}</td>
  <td>${SW.esc(a.proto || "")}</td><td>${SW.esc(a.src_zone)} → ${SW.esc(a.dst_zone)}</td></tr>`).join("")
  : `<tr><td class="empty" colspan="8">Nenhum alerta</td></tr>`;
SW.alertHead = `<tr><th>Hora</th><th>Ação</th><th>Sev.</th><th>Assinatura</th><th>Origem</th><th>Destino</th><th>Proto</th><th>Zonas</th></tr>`;

SW.page("ids", {
  title: "IDS / IPS",
  async render(root) {
    await SW.loadMeta(true);
    root.innerHTML = `<div class="page"><div class="page-head"><h2>IDS / IPS</h2><div class="spacer"></div>
      <button class="btn" id="upd">${SW.icon.dl} Atualizar regras ET Open</button></div>
      <div class="note tip">O Suricata recebe o tráfego encaminhado via <b>NFQUEUE</b> (modo <i>fail-open</i>: se o Suricata parar, o tráfego continua).
      <b>Alerta</b> apenas registra; <b>Bloqueio</b> descarta pacotes que casarem com as assinaturas (IPS inline).
      Recomendação: operar em <b>Alerta</b>, acompanhar CPU e filas abaixo durante o uso normal e só então habilitar Bloqueio.<br>
      O modo pode ser definido <b>por zona</b> (abaixo) ou <b>por política</b> (campo "IPS" em Política de Firewall › Perfis de segurança) — vale o mais restritivo.</div>
      <div class="cards">
        <div class="card wide"><h3>Modo por zona</h3><div class="body" style="padding:0"><table class="grid"><thead><tr><th>Zona</th><th>Descrição</th><th>Modo</th></tr></thead><tbody id="zones"></tbody></table></div></div>
        <div class="card"><h3>Regras</h3><div class="body"><div class="kv" id="rules"></div></div></div>
        <div class="card full"><h3>Desempenho (impacto de CPU e filas)</h3><div class="body"><div class="stat-row" id="perf"></div>
          <table class="grid" style="margin-top:10px"><thead><tr><th>Fila NFQUEUE</th><th>Instância</th><th>Pacotes</th><th>Aguardando</th><th>Descartes (fila cheia)</th><th>Descartes (usuário)</th></tr></thead><tbody id="queues"></tbody></table></div></div>
        <div class="card full"><h3>Alertas recentes<span class="spacer"></span>
          <select class="in" id="fz" style="width:auto"><option value="">todas as zonas</option>${SW.meta.zones.map((z) => `<option>${SW.esc(z)}</option>`).join("")}</select>
          <div class="search" style="min-width:220px"><input id="fq" placeholder="Filtrar"></div></h3>
          <div class="body" style="padding:0"><div class="tbl-wrap" style="border:0;max-height:480px"><table class="grid"><thead>${SW.alertHead}</thead><tbody id="alerts"></tbody></table></div></div></div>
      </div></div>`;
    const $ = (id) => SW.$("#" + id, root);
    const modeBtns = (z) => ["off", "alert", "block"].map((m) => `<button class="btn sm ${z.mode === m ? (m === "block" ? "danger primary" : "primary") : ""}" data-z="${SW.esc(z.name)}" data-m="${m}">${{ off: "Desligado", alert: "Alerta", block: "Bloqueio" }[m]}</button>`).join(" ");
    const status = async () => {
      const s = await SW.GET("/api/ids/status");
      $("zones").innerHTML = s.zones.map((z) => `<tr><td><b>${SW.esc(z.name)}</b></td><td>${SW.esc(z.description)}</td><td class="nowrap">${modeBtns(z)}</td></tr>`).join("");
      SW.$$("[data-m]", $("zones")).forEach((b) => (b.onclick = async () => {
        const m = b.dataset.m, z = b.dataset.z;
        if (m === "block" && !(await SW.confirm(`Ativar <b>bloqueio inline</b> na zona <b>${SW.esc(z)}</b>?<br><span class="muted">Assinaturas ET Open passam a descartar tráfego. Verifique antes o impacto de CPU em modo alerta.</span>`, { ok: "Ativar bloqueio", danger: true }))) return;
        try { await SW.apply(SW.PUT(`/api/ids/zones/${encodeURIComponent(z)}`, { mode: m })); status(); } catch (e) { SW.fail(e); }
      }));
      const r = s.rules;
      $("rules").innerHTML = `<div>Fonte</div><div>Emerging Threats Open</div><div>Regras</div><div>${r.rules ? r.rules.toLocaleString("pt-BR") : SW.badge("não baixadas", "warn")}</div>
        <div>Última atualização</div><div>${SW.esc(r.time || "—")} ${r.time ? (r.ok ? SW.badge("ok", "ok") : SW.badge("falhou", "bad")) : ""}</div>
        <div>Atualização automática</div><div>diária (04:30)</div><div>Estado</div><div>${s.updating ? SW.badge("baixando…", "info") : "ocioso"}</div>`;
      $("upd").disabled = s.updating;
      const p = s.perf;
      const procs = p.processes;
      $("perf").innerHTML = [
        ["Suricata (alerta)", p.running.alert ? SW.badge("rodando", "ok") : SW.badge("parado", "off")],
        ["Suricata (bloqueio)", p.running.block ? SW.badge("rodando", "ok") : SW.badge("parado", "off")],
        ["CPU Suricata", procs.length ? procs.reduce((a, x) => a + x.cpu, 0).toFixed(1) + "%" : "—"],
        ["Memória Suricata", procs.length ? SW.fmtBytes(procs.reduce((a, x) => a + x.rss, 0)) : "—"],
        ["Pacotes inspecionados", Object.values(p.stats).reduce((a, x) => a + (x.decoder_pkts || 0), 0).toLocaleString("pt-BR")],
        ["Fluxos ativos", Object.values(p.stats).reduce((a, x) => a + (x.flows || 0), 0)],
      ].map(([t, n]) => `<div class="stat"><div class="n" style="font-size:16px">${n}</div><div class="t">${t}</div></div>`).join("");
      $("queues").innerHTML = p.queues.length ? p.queues.map((q) => `<tr><td>${q.queue}</td><td>${q.queue < 2 ? "alerta" : "bloqueio"}</td><td>${q.packets.toLocaleString("pt-BR")}</td>
        <td>${q.waiting}</td><td>${q.queue_dropped ? `<b style="color:var(--bad)">${q.queue_dropped}</b>` : 0}</td><td>${q.user_dropped}</td></tr>`).join("")
        : `<tr><td class="empty" colspan="6">Nenhuma fila ativa</td></tr>`;
    };
    const alerts = async () => {
      const q = new URLSearchParams({ zone: $("fz").value, q: $("fq").value, limit: 300 });
      $("alerts").innerHTML = SW.alertTable(await SW.GET("/api/ids/alerts?" + q));
    };
    $("upd").onclick = async () => { try { await SW.POST("/api/ids/rules/update"); SW.toast("Download das regras iniciado (pode levar alguns minutos)"); status(); } catch (e) { SW.fail(e); } };
    $("fz").onchange = alerts;
    $("fq").oninput = SW.debounce(alerts, 300);
    status().catch(SW.fail); alerts().catch(SW.fail);
    SW.every(5, () => status().catch(() => {}));
    SW.every(15, () => alerts().catch(() => {}));
  },
});
