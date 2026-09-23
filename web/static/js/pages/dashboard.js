/* Painel de Controle — real-time status. */
"use strict";
SW.page("dashboard", {
  title: "Painel de Controle",
  render(root) {
    root.innerHTML = `<div class="page">
      <div class="page-head"><h2>Painel de Controle</h2><div class="spacer"></div><span class="muted" id="d-upd"></span></div>
      <div class="cards">
        <div class="card full"><h3>Recursos do sistema<span class="spacer"></span><span class="muted" id="d-load"></span></h3>
          <div class="body"><div class="gauges" id="d-gauges"></div></div></div>
        <div class="card wide"><h3>Consumo WAN <span class="muted" id="d-wan-dev"></span></h3><div class="body"><div id="d-wan"></div></div></div>
        <div class="card wide"><h3>Consumo LAN <span class="muted" id="d-lan-dev"></span></h3><div class="body"><div id="d-lan"></div></div></div>
        <div class="card wide"><h3>Interfaces físicas</h3><div class="body"><div class="ports" id="d-ports"></div></div></div>
        <div class="card"><h3>Informações do sistema</h3><div class="body"><div class="kv" id="d-info"></div></div></div>
        <div class="card"><h3>Visão geral</h3><div class="body"><div class="stat-row" id="d-stats"></div>
          <div style="margin-top:12px" class="muted">CPU (últimos 5 min)</div><div id="d-spark"></div></div></div>
        <div class="card"><h3>Serviços</h3><div class="body"><div class="kv" id="d-svcs"></div></div></div>
        <div class="card"><h3>IDS / IPS<span class="spacer"></span><a href="#/ids">abrir</a></h3><div class="body" id="d-ids"></div></div>
        <div class="card wide"><h3>Últimas conexões bloqueadas<span class="spacer"></span><a href="#/log-denied">ver log</a></h3>
          <div class="body" style="padding:0"><table class="grid"><thead><tr><th>Hora</th><th>Origem</th><th>Destino</th><th>Serviço</th><th>Zonas</th><th>Política</th></tr></thead><tbody id="d-denied"></tbody></table></div></div>
      </div></div>`;

    const $ = (id) => SW.$("#" + id, root);
    const tick = async () => {
      let d;
      try { d = await SW.GET("/api/dashboard"); } catch (e) { return; }
      const s = d.system;
      const t = s.temperature;
      $("d-gauges").innerHTML =
        SW.chart.gauge({ value: s.cpu, label: "CPU", text: Math.round(s.cpu) + "%", sub: `${s.cpu_count} núcleos · ${s.cpu_per_core.map((c) => Math.round(c) + "%").join(" ")}` }) +
        SW.chart.gauge({ value: t, max: 90, warn: 65, bad: 80, label: "Temperatura", text: t == null ? "—" : t.toFixed(1) + "°C", sub: s.throttled && s.throttled !== "0x0" ? `<span style="color:var(--bad)">throttling ${SW.esc(s.throttled)}</span>` : "SoC" }) +
        SW.chart.gauge({ value: s.memory.percent, label: "Memória", text: Math.round(s.memory.percent) + "%", sub: `${SW.fmtBytes(s.memory.used)} de ${SW.fmtBytes(s.memory.total)}` }) +
        SW.chart.gauge({ value: s.disk.percent, label: "Disco", warn: 80, bad: 92, text: Math.round(s.disk.percent) + "%", sub: `${SW.fmtBytes(s.disk.used)} de ${SW.fmtBytes(s.disk.total)}` });
      $("d-load").textContent = `load ${s.load.join(" / ")}`;
      const ser = d.series;
      $("d-wan-dev").textContent = ser.devices.wan ? `(${ser.devices.wan})` : "";
      $("d-lan-dev").textContent = ser.devices.lan ? `(${ser.devices.lan})` : "";
      SW.chart.bars($("d-wan"), ser.throughput.wan || []);
      SW.chart.bars($("d-lan"), ser.throughput.lan || []);
      $("d-spark").innerHTML = SW.chart.spark(ser.cpu_history.map((x) => x.v));

      $("d-ports").innerHTML = d.interfaces.map((i) => {
        const up = i.link.exists && i.link.carrier;
        const spd = i.link.speed && +i.link.speed > 0 ? (+i.link.speed >= 1000 ? +i.link.speed / 1000 + " Gbps" : i.link.speed + " Mbps") : "";
        const st = !i.link.exists ? SW.badge("ausente", "bad") : !i.enabled ? SW.badge("desabilitada", "off") : up ? SW.badge("link up", "ok") : SW.badge("sem link", "warn");
        return `<div class="port ${up ? "up" : ""}"><div class="jack"></div><div class="pn">${SW.esc(i.name)} <span class="muted">${SW.esc(i.device)}</span></div>
          <div class="pi">${i.role.toUpperCase()} · ${SW.esc(i.mode)}</div><div class="pi mono">${SW.esc(i.addresses[0] || "—")}</div><div class="pi">${spd}</div><div>${st}</div></div>`;
      }).join("");

      $("d-info").innerHTML = [
        ["Hostname", SW.esc(s.hostname)], ["Versão", `BerryCade <b>${SW.esc(d.version)}</b>`], ["Horário", SW.esc(s.time)], ["Uptime", SW.fmtDur(s.uptime)], ["Kernel", `<span class="mono">${SW.esc(s.kernel)}</span>`],
        ["Sincronia config ↔ kernel", d.drift.in_sync ? SW.badge("sincronizado", "ok") : SW.badge("divergente", "bad")],
        ["Última verificação", SW.esc(d.drift.last_check || "—")],
      ].map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join("");

      const c = d.counts;
      $("d-stats").innerHTML = [["Sessões", d.sessions], ["Políticas", c.policies], ["VLANs", c.vlans], ["Túneis IPsec", c.tunnels], ["Objetos", c.addresses], ["Banidos", c.bans]]
        .map(([t, n]) => `<div class="stat"><div class="n">${n}</div><div class="t">${t}</div></div>`).join("");

      $("d-svcs").innerHTML = (d.dryrun ? `<div class="muted" style="grid-column:1/-1;margin-bottom:4px">Pré-visualização — nada é aplicado ao sistema</div>` : "")
        + d.services.filter((u) => u.needed || u.state === "unused-active").map((u) => {
          const [cls, txt] = SW.svcState(u);
          return `<div title="${SW.esc(u.reason)}"><span class="dot ${cls}"></span>${SW.esc(u.label)}</div><div class="muted">${txt}</div>`;
        }).join("")
        + `<div class="muted" style="grid-column:1/-1;margin-top:4px">${d.services.filter((u) => u.state === "unused").length} serviço(s) sob demanda não utilizados · <a href="#/services-status">detalhes</a></div>`;
      const zm = Object.entries(d.ids.zones);
      $("d-ids").innerHTML = `<div class="kv"><div>Regras ET Open</div><div>${d.ids.rules ? d.ids.rules.toLocaleString("pt-BR") : SW.badge("não baixadas", "warn")}</div>
        <div>Atualizadas em</div><div>${SW.esc(d.ids.updated || "—")}</div></div>
        <div style="margin-top:10px">${zm.map(([z, m]) => `<span class="chip">${SW.esc(z)}: ${m === "block" ? SW.badge("bloqueio", "bad") : m === "alert" ? SW.badge("alerta", "warn") : SW.badge("off", "off")}</span>`).join(" ")}</div>`;
      $("d-upd").textContent = "Atualizado: " + new Date().toLocaleTimeString("pt-BR");
    };
    const denied = async () => {
      try {
        const rows = await SW.GET("/api/logs/traffic?kind=denied&limit=8");
        $("d-denied").innerHTML = rows.length ? rows.map((r) => `<tr><td class="nowrap">${SW.fmtTime(r.time)}</td><td class="mono">${SW.esc(r.src)}${r.sport ? ":" + r.sport : ""}</td>
          <td class="mono">${SW.esc(r.dst)}${r.dport ? ":" + r.dport : ""}</td><td>${SW.esc(r.proto)}</td><td>${SW.esc(r.src_zone)} → ${SW.esc(r.dst_zone)}</td><td>${SW.esc(r.policy)}</td></tr>`).join("")
          : `<tr><td class="empty" colspan="6">Nenhum bloqueio registrado</td></tr>`;
      } catch (e) {}
    };
    tick(); denied();
    SW.every(2, tick);
    SW.every(10, denied);
  },
});
