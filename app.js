/* ============================================================
   FolgaField — app.js
   Lógica de UI, navegação, gráficos, filtros e exportação
   ============================================================ */

'use strict';

/* ── Estado global ── */
const App = {
  user: null,
  currentScreen: 'dashboard',
  filters: { obra: '', status: '', periodo: '', busca: '' },
  colabEditando: null,
};

/* ══════════════════════════════════════════════
   AUTENTICAÇÃO
══════════════════════════════════════════════ */
function login() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const user = FF.usuarios.find(u => u.email === email && u.senha === senha);
  if (!user) {
    document.getElementById('login-erro').textContent = 'E-mail ou senha incorretos.';
    return;
  }
  App.user = user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
  document.getElementById('user-name').textContent = user.nome;
  document.getElementById('user-role').textContent = user.perfil;
  document.getElementById('user-initials').textContent = FF.initials(user.nome);
  navigate('dashboard');
}

function logout() {
  App.user = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-email').value = '';
  document.getElementById('login-senha').value = '';
  document.getElementById('login-erro').textContent = '';
}

/* ══════════════════════════════════════════════
   NAVEGAÇÃO
══════════════════════════════════════════════ */
function navigate(screen, el) {
  App.currentScreen = screen;

  /* Ativa tela */
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const sc = document.getElementById(`sc-${screen}`);
  if (sc) sc.classList.add('active');

  /* Ativa nav item */
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = el || document.querySelector(`.nav-item[data-screen="${screen}"]`);
  if (navEl) navEl.classList.add('active');

  /* Atualiza título */
  const titles = {
    dashboard: 'Dashboard', alertas: 'Alertas', calendario: 'Calendário de Folgas',
    colaboradores: 'Colaboradores', folgas: 'Programação de Folgas',
    historico: 'Histórico de Folgas', importar: 'Importar Planilha',
    relatorios: 'Relatórios', documentos: 'Gerar Documentos',
    configuracoes: 'Configurações', usuarios: 'Controle de Acesso'
  };
  document.getElementById('topbar-title').textContent = titles[screen] || screen;

  /* Renderiza tela */
  const renders = {
    dashboard: renderDashboard,
    alertas: renderAlertas,
    calendario: renderCalendario,
    colaboradores: renderColaboradores,
    folgas: renderFolgas,
    historico: renderHistorico,
    importar: renderImportar,
    relatorios: renderRelatorios,
    documentos: renderDocumentos,
    usuarios: renderUsuarios,
  };
  if (renders[screen]) renders[screen]();

  /* Fecha sidebar no mobile */
  document.querySelector('.sidebar').classList.remove('open');
}

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
function renderDashboard() {
  const r = FF.getResumo();

  /* KPIs */
  document.getElementById('kpi-total').textContent   = r.total;
  document.getElementById('kpi-vencidas').textContent = r.vencidas;
  document.getElementById('kpi-proximas').textContent = r.proximas7 + r.proximas30;
  document.getElementById('kpi-emfolga').textContent  = r.emFolga;
  document.getElementById('kpi-alertas').textContent  = r.alertas;

  /* Badge do menu alertas */
  const badge = document.getElementById('badge-alertas');
  badge.textContent = r.alertas;
  badge.style.display = r.alertas > 0 ? 'inline' : 'none';

  /* Colaboradores por obra */
  const porObra = FF.getPorObra();
  const maxObra = porObra[0]?.[1] || 1;
  const obraHtml = porObra.map(([obra, qtd]) => `
    <div class="mini-bar">
      <span class="mini-bar-label" title="${obra}">${obra}</span>
      <div class="mini-bar-track"><div class="mini-bar-fill pb-blue" style="width:${Math.round(qtd/maxObra*100)}%"></div></div>
      <span class="mini-bar-val">${qtd}</span>
    </div>`).join('');
  document.getElementById('obras-lista').innerHTML = obraHtml;

  /* Alertas recentes */
  const criticos = FF.colaboradores
    .filter(c => c.periodoDias && !c.emFolga)
    .map(c => ({ c, dias: FF.diasParaVencer(c) }))
    .filter(({ dias }) => dias !== null && dias <= 30)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 5);

  const alertHtml = criticos.length === 0
    ? '<p class="text-muted" style="font-size:13px;padding:12px 0">Nenhum alerta crítico no momento. ✓</p>'
    : criticos.map(({ c, dias }) => {
        const tipo = dias < 0 ? 'alert-danger' : 'alert-warning';
        const txt  = dias < 0 ? `Vencida há ${Math.abs(dias)} dias` : `Vence em ${dias} dia${dias !== 1 ? 's' : ''}`;
        return `<div class="alert ${tipo}" style="margin-bottom:8px">
          <i class="ti ti-${dias < 0 ? 'alert-circle' : 'bell'}"></i>
          <div><strong>${c.nome.split(' ').slice(0,2).join(' ')}</strong> — ${txt} (${c.periodoDias}d)</div>
        </div>`;
      }).join('');
  document.getElementById('alertas-recentes').innerHTML = alertHtml;

  /* Programadas este mês */
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const programadasMes = FF.colaboradores
    .flatMap(c => (c.historico || []).map(h => ({ ...h, colab: c })))
    .filter(h => {
      const d = FF.parseDate(h.dataSaida);
      return d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    })
    .sort((a, b) => FF.parseDate(a.dataSaida) - FF.parseDate(b.dataSaida))
    .slice(0, 5);

  const progHtml = programadasMes.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:20px">Nenhuma folga programada este mês</td></tr>'
    : programadasMes.map(h => `
        <tr>
          <td><div class="person-cell">
            <div class="avatar av-blue" style="width:24px;height:24px;font-size:9px">${FF.initials(h.colab.nome)}</div>
            ${h.colab.nome.split(' ').slice(0,2).join(' ')}
          </div></td>
          <td>${FF.fmt(FF.parseDate(h.dataSaida))}</td>
          <td>${FF.fmt(FF.parseDate(h.dataRetorno))}</td>
          <td><span class="badge badge-info">${h.colab.periodoDias}d</span></td>
        </tr>`).join('');
  document.getElementById('programadas-mes').innerHTML = progHtml;

  /* Gráficos */
  renderChartStatus();
  renderChartMensal();
  renderChartPeriodo();
}

/* ── Gráfico Donut Status ── */
let chartStatus = null;
function renderChartStatus() {
  const r = FF.getResumo();
  const ctx = document.getElementById('chart-status');
  if (!ctx) return;
  if (chartStatus) { chartStatus.destroy(); chartStatus = null; }
  chartStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Vencidas', 'Próx. 7d', 'Próx. 30d', 'Em folga', 'Em dia'],
      datasets: [{ data: [r.vencidas, r.proximas7, r.proximas30, r.emFolga, r.ativos - r.vencidas - r.proximas7 - r.proximas30 - r.emFolga],
        backgroundColor: ['#E14B4A','#D4860F','#EF9F27','#3A7BD5','#1D9E75'],
        borderWidth: 0, hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
  });
}

/* ── Gráfico Mensal ── */
let chartMensal = null;
function renderChartMensal() {
  const ctx = document.getElementById('chart-mensal');
  if (!ctx) return;
  if (chartMensal) { chartMensal.destroy(); chartMensal = null; }
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const counts = new Array(12).fill(0);
  FF.colaboradores.forEach(c => {
    (c.historico || []).forEach(h => {
      const d = FF.parseDate(h.dataSaida);
      if (d && d.getFullYear() === 2026) counts[d.getMonth()]++;
    });
  });
  chartMensal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [{ label: 'Folgas', data: counts,
        backgroundColor: '#3A7BD5', borderRadius: 4, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 } } },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

/* ── Gráfico Periodicidade ── */
let chartPeriodo = null;
function renderChartPeriodo() {
  const ctx = document.getElementById('chart-periodo');
  if (!ctx) return;
  if (chartPeriodo) { chartPeriodo.destroy(); chartPeriodo = null; }
  const counts = { 30: 0, 45: 0, 60: 0, 90: 0, 0: 0 };
  FF.colaboradores.forEach(c => { if (c.periodoDias !== undefined) counts[c.periodoDias] = (counts[c.periodoDias] || 0) + 1; });
  chartPeriodo = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['30 dias','45 dias','60 dias','90 dias','Sem direito'],
      datasets: [{ data: [counts[30], counts[45], counts[60], counts[90], counts[0]],
        backgroundColor: ['#1A54A8','#1D9E75','#D4860F','#E14B4A','#8890A0'],
        borderWidth: 0, hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }
  });
}

/* ══════════════════════════════════════════════
   ALERTAS
══════════════════════════════════════════════ */
function renderAlertas() {
  const filtroTipo = document.getElementById('f-alerta-tipo')?.value || '';
  const filtroObra = document.getElementById('f-alerta-obra')?.value || '';

  let lista = FF.colaboradores
    .filter(c => c.periodoDias && !c.emFolga)
    .map(c => ({ c, dias: FF.diasParaVencer(c) }))
    .filter(({ dias }) => dias !== null && dias <= 30)
    .sort((a, b) => a.dias - b.dias);

  if (filtroObra) lista = lista.filter(({ c }) => c.obra === filtroObra);
  if (filtroTipo === 'vencidas') lista = lista.filter(({ dias }) => dias < 0);
  if (filtroTipo === 'urgente')  lista = lista.filter(({ dias }) => dias >= 0 && dias <= 7);
  if (filtroTipo === 'proximas') lista = lista.filter(({ dias }) => dias > 7 && dias <= 30);

  const tbody = document.getElementById('alertas-tbody');
  if (!tbody) return;

  tbody.innerHTML = lista.length === 0
    ? `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-3)"><i class="ti ti-circle-check" style="font-size:24px;display:block;margin-bottom:8px;color:var(--teal-400)"></i>Nenhum alerta com estes filtros</td></tr>`
    : lista.map(({ c, dias }) => {
        const prox = FF.calcProximaFolga(c);
        const cls  = dias < 0 ? 'badge-danger' : dias <= 7 ? 'badge-danger' : 'badge-warning';
        const txt  = dias < 0 ? `Vencida há ${Math.abs(dias)}d` : `Vence em ${dias}d`;
        const avatarCls = FF.avatarCls(c);
        return `<tr>
          <td><div class="person-cell">
            <div class="avatar ${avatarCls}">${FF.initials(c.nome)}</div>
            <div><div class="p-name">${c.nome.split(' ').slice(0,3).join(' ')}</div><div class="p-role">${c.funcao}</div></div>
          </div></td>
          <td><span class="mono">${c.chapa}</span></td>
          <td><span class="chip">${c.obra}</span></td>
          <td><span class="badge badge-info">${c.periodoDias}d</span></td>
          <td>${c.historico?.length ? FF.fmt(FF.parseDate(c.historico[c.historico.length-1].dataRetorno)) : '—'}</td>
          <td style="font-weight:500">${FF.fmt(prox)}</td>
          <td><span class="badge ${cls}">${txt}</span></td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn btn-sm btn-primary" onclick="abrirProgramarFolga(${c.id})"><i class="ti ti-calendar-plus"></i> Agendar</button>
              <button class="btn btn-sm" onclick="verColaborador(${c.id})"><i class="ti ti-eye"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');

  /* KPIs de alertas */
  const vencidas = FF.colaboradores.filter(c => c.periodoDias && !c.emFolga && (FF.diasParaVencer(c) ?? 0) < 0).length;
  const urg7     = FF.colaboradores.filter(c => c.periodoDias && !c.emFolga && (d => d !== null && d >= 0 && d <= 7)(FF.diasParaVencer(c))).length;
  const prox30   = FF.colaboradores.filter(c => c.periodoDias && !c.emFolga && (d => d !== null && d > 7 && d <= 30)(FF.diasParaVencer(c))).length;
  setEl('kpi-a-vencidas', vencidas);
  setEl('kpi-a-urgente', urg7);
  setEl('kpi-a-proximas', prox30);
}

/* ══════════════════════════════════════════════
   CALENDÁRIO
══════════════════════════════════════════════ */
let calMes = new Date().getMonth();
let calAno = new Date().getFullYear();

function renderCalendario() {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('cal-titulo').textContent = `${meses[calMes]} ${calAno}`;

  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const primeiro = new Date(calAno, calMes, 1).getDay();
  const dias = new Date(calAno, calMes+1, 0).getDate();
  const hoje = new Date();

  /* Mapa dia → folgas */
  const eventos = {};
  FF.colaboradores.forEach(c => {
    (c.historico || []).forEach(h => {
      const saida   = FF.parseDate(h.dataSaida);
      const retorno = FF.parseDate(h.dataRetorno);
      if (saida && saida.getMonth() === calMes && saida.getFullYear() === calAno) {
        const d = saida.getDate();
        if (!eventos[d]) eventos[d] = [];
        eventos[d].push({ tipo: 'saida', nome: c.nome.split(' ')[0], dias: FF.diasParaVencer(c) });
      }
      if (retorno && retorno.getMonth() === calMes && retorno.getFullYear() === calAno) {
        const d = retorno.getDate();
        if (!eventos[d]) eventos[d] = [];
        eventos[d].push({ tipo: 'retorno', nome: c.nome.split(' ')[0] });
      }
    });
    /* Vencimentos */
    const prox = FF.calcProximaFolga(c);
    if (prox && prox.getMonth() === calMes && prox.getFullYear() === calAno) {
      const d = prox.getDate();
      if (!eventos[d]) eventos[d] = [];
      eventos[d].push({ tipo: 'vence', nome: c.nome.split(' ')[0], dias: FF.diasParaVencer(c) });
    }
  });

  grid.innerHTML = '';
  for (let i = 0; i < primeiro; i++) grid.innerHTML += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= dias; d++) {
    const isHoje = d === hoje.getDate() && calMes === hoje.getMonth() && calAno === hoje.getFullYear();
    const evs = eventos[d] || [];
    const temVence  = evs.some(e => e.tipo === 'vence' && e.dias < 0);
    const temSaida  = evs.some(e => e.tipo === 'saida');
    const temRetorno = evs.some(e => e.tipo === 'retorno');
    let cls = 'cal-day';
    if (isHoje) cls += ' cal-hoje';
    if (temVence) cls += ' cal-vence';
    else if (temSaida) cls += ' cal-saida';
    else if (temRetorno) cls += ' cal-retorno';

    const evHtml = evs.slice(0,2).map(e => {
      const cor = e.tipo === 'vence' ? 'var(--red-600)' : e.tipo === 'saida' ? 'var(--amber-600)' : 'var(--teal-600)';
      return `<div style="font-size:9px;color:${cor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${e.nome}</div>`;
    }).join('');
    const mais = evs.length > 2 ? `<div style="font-size:9px;color:var(--text-3)">+${evs.length-2}</div>` : '';

    grid.innerHTML += `<div class="${cls}">
      <span class="cal-num">${d}</span>
      ${evHtml}${mais}
    </div>`;
  }

  /* Eventos do mês */
  const todosEvs = FF.colaboradores.flatMap(c =>
    (c.historico || []).flatMap(h => {
      const evs = [];
      const saida = FF.parseDate(h.dataSaida);
      const retorno = FF.parseDate(h.dataRetorno);
      if (saida && saida.getMonth() === calMes && saida.getFullYear() === calAno)
        evs.push({ data: saida, tipo: 'Saída', colab: c, destino: h.destino || '—', periodo: c.periodoDias });
      if (retorno && retorno.getMonth() === calMes && retorno.getFullYear() === calAno)
        evs.push({ data: retorno, tipo: 'Retorno', colab: c, destino: h.destino || '—', periodo: c.periodoDias });
      return evs;
    })
  ).sort((a,b) => a.data - b.data).slice(0,10);

  const evTbody = document.getElementById('cal-eventos');
  evTbody.innerHTML = todosEvs.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px">Nenhum evento neste mês</td></tr>`
    : todosEvs.map(e => `<tr>
        <td>${FF.fmt(e.data)}</td>
        <td>${e.colab.nome.split(' ').slice(0,3).join(' ')}</td>
        <td><span class="badge ${e.tipo === 'Saída' ? 'badge-warning' : 'badge-success'}">${e.tipo}</span></td>
        <td>${e.destino}</td>
        <td><span class="badge badge-info">${e.periodo}d</span></td>
      </tr>`).join('');
}

function calAnterior() { if (calMes === 0) { calMes = 11; calAno--; } else calMes--; renderCalendario(); }
function calProximo()  { if (calMes === 11) { calMes = 0; calAno++; } else calMes++; renderCalendario(); }

/* ══════════════════════════════════════════════
   COLABORADORES
══════════════════════════════════════════════ */
let colabPage = 1;
const COLAB_PER_PAGE = 10;

function renderColaboradores() {
  const busca   = (document.getElementById('f-colab-busca')?.value || '').toLowerCase();
  const obra    = document.getElementById('f-colab-obra')?.value || '';
  const status  = document.getElementById('f-colab-status')?.value || '';
  const periodo = document.getElementById('f-colab-periodo')?.value || '';

  let lista = FF.colaboradores.filter(c => {
    if (busca && !c.nome.toLowerCase().includes(busca) && !c.chapa.includes(busca)) return false;
    if (obra && c.obra !== obra) return false;
    if (status && c.status !== status) return false;
    if (periodo && String(c.periodoDias) !== periodo) return false;
    return true;
  });

  const total = lista.length;
  const pages = Math.max(1, Math.ceil(total / COLAB_PER_PAGE));
  colabPage = Math.min(colabPage, pages);
  const slice = lista.slice((colabPage-1)*COLAB_PER_PAGE, colabPage*COLAB_PER_PAGE);

  document.getElementById('colab-count').textContent = `${total} colaborador${total !== 1 ? 'es' : ''} encontrado${total !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('colab-tbody');
  tbody.innerHTML = slice.length === 0
    ? `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-3)">Nenhum colaborador encontrado</td></tr>`
    : slice.map((c, i) => {
        const st = FF.statusFolga(c);
        const prox = FF.calcProximaFolga(c);
        const avatarCls = FF.avatarCls(c);
        return `<tr>
          <td class="mono text-muted">${(colabPage-1)*COLAB_PER_PAGE+i+1}</td>
          <td><div class="person-cell">
            <div class="avatar ${avatarCls}">${FF.initials(c.nome)}</div>
            <div><div class="p-name">${c.nome.split(' ').slice(0,3).join(' ')}</div><div class="p-role">${c.funcao.split(' ').slice(0,3).join(' ')}</div></div>
          </div></td>
          <td><span class="mono">${c.chapa}</span></td>
          <td><span class="chip">${c.obra}</span></td>
          <td>${c.periodoDias ? `<span class="badge badge-info">${c.periodoDias}d</span>` : '<span class="badge badge-gray">Sem direito</span>'}</td>
          <td>${c.historico?.length ? FF.fmt(FF.parseDate(c.historico[c.historico.length-1].dataSaida)) : '—'}</td>
          <td style="font-weight:500">${FF.fmt(prox)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn-icon" title="Ver perfil" onclick="verColaborador(${c.id})"><i class="ti ti-eye"></i></button>
              <button class="btn-icon" title="Programar folga" onclick="abrirProgramarFolga(${c.id})"><i class="ti ti-calendar-plus"></i></button>
              <button class="btn-icon" title="Editar" onclick="editarColaborador(${c.id})"><i class="ti ti-edit"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');

  /* Paginação */
  const pg = document.getElementById('colab-pag');
  pg.innerHTML = '';
  if (pages > 1) {
    const prev = document.createElement('button');
    prev.className = 'page-btn'; prev.innerHTML = '<i class="ti ti-chevron-left"></i>';
    if (colabPage === 1) prev.disabled = true;
    prev.onclick = () => { colabPage--; renderColaboradores(); };
    pg.appendChild(prev);
    for (let p = 1; p <= pages; p++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (p === colabPage ? ' active' : '');
      btn.textContent = p;
      btn.onclick = () => { colabPage = p; renderColaboradores(); };
      pg.appendChild(btn);
    }
    const next = document.createElement('button');
    next.className = 'page-btn'; next.innerHTML = '<i class="ti ti-chevron-right"></i>';
    if (colabPage === pages) next.disabled = true;
    next.onclick = () => { colabPage++; renderColaboradores(); };
    pg.appendChild(next);
  }
}

function verColaborador(id) {
  const c = FF.colaboradores.find(x => x.id === id);
  if (!c) return;
  const st = FF.statusFolga(c);
  const prox = FF.calcProximaFolga(c);
  const numFolgas = c.historico?.length || 0;
  const regra = FF.descricaoRegra(c.periodoDias, numFolgas + 1);

  const hist = (c.historico || []).map(h => `
    <tr>
      <td>${h.num}ª</td>
      <td>${FF.fmt(FF.parseDate(h.dataSaida))}</td>
      <td>${FF.fmt(FF.parseDate(h.dataRetorno))}</td>
      <td><span class="badge ${h.tipo === 'Indenização' ? 'badge-warning' : 'badge-success'}">${h.tipo || 'Gozo'}</span></td>
      <td>${h.destino || '—'}</td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:12px">Sem histórico registrado</td></tr>`;

  document.getElementById('modal-colab-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div class="avatar ${FF.avatarCls(c)}" style="width:48px;height:48px;font-size:16px">${FF.initials(c.nome)}</div>
      <div>
        <div style="font-size:16px;font-weight:600">${c.nome}</div>
        <div style="font-size:12px;color:var(--text-3)">${c.funcao}</div>
        <div style="margin-top:4px"><span class="badge ${st.cls}">${st.label}</span></div>
      </div>
    </div>
    <div class="form-grid" style="margin-bottom:16px">
      <div><label>Matrícula</label><div class="mono" style="margin-top:4px">${c.chapa}</div></div>
      <div><label>Obra</label><div style="margin-top:4px">${c.obra}</div></div>
      <div><label>Admissão</label><div style="margin-top:4px">${c.dataAdmissao}</div></div>
      <div><label>Apresentação na obra</label><div style="margin-top:4px">${c.dataApresentacao}</div></div>
      <div><label>Periodicidade</label><div style="margin-top:4px"><span class="badge badge-info">${c.periodoDias ? c.periodoDias + ' dias' : 'Sem direito'}</span></div></div>
      <div><label>Próxima folga</label><div style="margin-top:4px;font-weight:500">${FF.fmt(prox)}</div></div>
      <div><label>Cidade / Estado</label><div style="margin-top:4px">${c.cidade} / ${c.estado}</div></div>
      <div><label>Status</label><div style="margin-top:4px">${c.status}</div></div>
    </div>
    <div class="periodo-box" style="margin-bottom:16px">
      <strong><i class="ti ti-info-circle"></i> Regra de período aquisitivo</strong>
      <div class="periodo-row"><span>1ª folga</span><span>Apresentação + ${c.periodoDias || 0} dias</span></div>
      <div class="periodo-row"><span>2ª folga em diante</span><span>${c.periodoDias === 30 ? '30 + 5 = 35 dias de ciclo' : c.periodoDias ? `${c.periodoDias} + 9 = ${c.periodoDias+9} dias de ciclo` : '—'}</span></div>
      <div class="periodo-row"><span>Número de folgas realizadas</span><span>${numFolgas}</span></div>
      <div class="periodo-row" style="border-bottom:none"><span>Próximo ciclo aplicado</span><span>${regra}</span></div>
    </div>
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Histórico de folgas</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Saída</th><th>Retorno</th><th>Tipo</th><th>Destino</th></tr></thead>
        <tbody>${hist}</tbody>
      </table>
    </div>`;
  openModal('modal-colab');
}

function editarColaborador(id) {
  const c = FF.colaboradores.find(x => x.id === id);
  if (!c) return;
  App.colabEditando = id;
  document.getElementById('novo-chapa').value = c.chapa;
  document.getElementById('novo-nome').value = c.nome;
  document.getElementById('novo-funcao').value = c.funcao;
  document.getElementById('novo-obra').value = c.obra;
  document.getElementById('novo-empresa').value = c.empresa || '';
  document.getElementById('novo-periodo').value = c.periodoDias;
  document.getElementById('novo-admissao').value = toInputDate(c.dataAdmissao);
  document.getElementById('novo-apresentacao').value = toInputDate(c.dataApresentacao);
  document.getElementById('novo-cidade').value = c.cidade || '';
  document.getElementById('novo-estado').value = c.estado || '';
  document.getElementById('novo-status').value = c.status;
  document.getElementById('modal-colab-titulo').textContent = 'Editar colaborador';
  openModal('modal-novo-colab');
}

function toInputDate(str) {
  if (!str) return '';
  const d = FF.parseDate(str);
  if (!d || isNaN(d)) return '';
  return d.toISOString().split('T')[0];
}

function salvarColaborador() {
  const id = App.colabEditando;
  const dados = {
    chapa: document.getElementById('novo-chapa').value.trim(),
    nome: document.getElementById('novo-nome').value.trim().toUpperCase(),
    funcao: document.getElementById('novo-funcao').value.trim().toUpperCase(),
    obra: document.getElementById('novo-obra').value,
    empresa: document.getElementById('novo-empresa').value.trim(),
    periodoDias: parseInt(document.getElementById('novo-periodo').value) || 0,
    dataAdmissao: document.getElementById('novo-admissao').value,
    dataApresentacao: document.getElementById('novo-apresentacao').value,
    cidade: document.getElementById('novo-cidade').value.trim(),
    estado: document.getElementById('novo-estado').value.trim().toUpperCase(),
    status: document.getElementById('novo-status').value,
  };
  if (!dados.chapa || !dados.nome) { alert('Matrícula e nome são obrigatórios.'); return; }
  if (id) {
    const c = FF.colaboradores.find(x => x.id === id);
    if (c) Object.assign(c, dados);
  } else {
    FF.addColaborador(dados);
  }
  App.colabEditando = null;
  closeModal('modal-novo-colab');
  renderColaboradores();
  showToast('Colaborador salvo com sucesso!', 'success');
}

/* ══════════════════════════════════════════════
   PROGRAMAÇÃO DE FOLGAS
══════════════════════════════════════════════ */
let folgaTab = 'programar';

function renderFolgas() { setFolgaTab(folgaTab); }

function setFolgaTab(tab) {
  folgaTab = tab;
  document.querySelectorAll('#sc-folgas .tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.querySelector(`#sc-folgas .tab[data-tab="${tab}"]`);
  if (tabEl) tabEl.classList.add('active');
  document.querySelectorAll('#sc-folgas .tab-pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById(`folga-${tab}`);
  if (pane) pane.style.display = 'block';
  if (tab === 'retorno') renderRetornos();
  if (tab === 'simular') renderSimulacao();
}

function abrirProgramarFolga(id) {
  navigate('folgas');
  setFolgaTab('programar');
  if (id) {
    setTimeout(() => {
      document.getElementById('f-colabId').value = id;
      const c = FF.colaboradores.find(x => x.id === id);
      if (c) {
        document.getElementById('f-colabNome').value = `${c.chapa} — ${c.nome}`;
        atualizarInfoFolga(c);
      }
    }, 50);
  }
}

function buscarColabParaFolga() {
  const q = document.getElementById('f-colabNome').value.toLowerCase();
  const sugg = document.getElementById('f-sugestoes');
  if (q.length < 2) { sugg.style.display = 'none'; return; }
  const res = FF.colaboradores.filter(c =>
    c.nome.toLowerCase().includes(q) || c.chapa.includes(q)
  ).slice(0, 5);
  if (res.length === 0) { sugg.style.display = 'none'; return; }
  sugg.innerHTML = res.map(c => `
    <div class="sugg-item" onclick="selecionarColabFolga(${c.id})">
      <div style="font-weight:500;font-size:13px">${c.nome.split(' ').slice(0,3).join(' ')}</div>
      <div style="font-size:11px;color:var(--text-3)">${c.chapa} · ${c.funcao.split(' ').slice(0,3).join(' ')}</div>
    </div>`).join('');
  sugg.style.display = 'block';
}

function selecionarColabFolga(id) {
  const c = FF.colaboradores.find(x => x.id === id);
  if (!c) return;
  document.getElementById('f-colabId').value = id;
  document.getElementById('f-colabNome').value = `${c.chapa} — ${c.nome}`;
  document.getElementById('f-sugestoes').style.display = 'none';
  atualizarInfoFolga(c);
}

function atualizarInfoFolga(c) {
  const prox = FF.calcProximaFolga(c);
  const numFolgas = c.historico?.length || 0;
  const ciclo = c.periodoDias === 30 ? 35 : c.periodoDias ? c.periodoDias + 9 : 0;
  document.getElementById('info-colab').style.display = 'block';
  document.getElementById('info-nome-colab').textContent = c.nome;
  document.getElementById('info-periodo').textContent = c.periodoDias ? `${c.periodoDias} dias` : 'Sem direito';
  document.getElementById('info-num-folga').textContent = numFolgas + 1;
  document.getElementById('info-proxima').textContent = FF.fmt(prox);
  document.getElementById('info-regra').textContent = numFolgas === 0
    ? `1ª folga: apresentação (${c.dataApresentacao}) + ${c.periodoDias}d`
    : `${numFolgas+1}ª folga: retorno anterior + ${ciclo}d`;
  const dias = FF.diasParaVencer(c);
  const st = FF.statusFolga(c);
  document.getElementById('info-status').innerHTML = `<span class="badge ${st.cls}">${st.label}</span>`;
}

function confirmarFolga() {
  const id = parseInt(document.getElementById('f-colabId').value);
  const c = FF.colaboradores.find(x => x.id === id);
  if (!c) { alert('Selecione um colaborador.'); return; }
  const saida   = document.getElementById('f-saida').value;
  const retorno = document.getElementById('f-retorno').value;
  const tipo    = document.getElementById('f-tipo').value;
  const destino = document.getElementById('f-destino').value;
  const obs     = document.getElementById('f-obs').value;
  if (!saida) { alert('Informe a data de saída.'); return; }
  FF.registrarFolga(c, { dataSaida: saida, dataRetorno: retorno || null, tipo, destino, obs });
  if (!retorno) c.emFolga = true;
  closeModal('modal-novo-colab');
  showToast(`Folga registrada para ${c.nome.split(' ')[0]}!`, 'success');
  renderFolgas();
  renderDashboard();
}

function renderRetornos() {
  const emFolga = FF.colaboradores.filter(c => c.emFolga);
  const tbody = document.getElementById('retornos-tbody');
  if (!tbody) return;
  tbody.innerHTML = emFolga.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-3)">Nenhum colaborador em folga no momento</td></tr>`
    : emFolga.map(c => {
        const ult = c.historico?.[c.historico.length-1];
        return `<tr>
          <td><div class="person-cell">
            <div class="avatar av-blue">${FF.initials(c.nome)}</div>
            ${c.nome.split(' ').slice(0,3).join(' ')}
          </div></td>
          <td>${ult ? FF.fmt(FF.parseDate(ult.dataSaida)) : '—'}</td>
          <td>${ult ? FF.fmt(FF.parseDate(ult.dataRetorno)) : '—'}</td>
          <td>${ult?.destino || '—'}</td>
          <td><button class="btn btn-sm btn-primary" onclick="confirmarRetorno(${c.id})"><i class="ti ti-check"></i> Confirmar retorno</button></td>
        </tr>`;
      }).join('');
}

function confirmarRetorno(id) {
  const c = FF.colaboradores.find(x => x.id === id);
  if (!c) return;
  const data = prompt(`Confirmar retorno de ${c.nome.split(' ')[0]}.\nData de retorno (DD/MM/AAAA):`, FF.fmt(new Date()));
  if (!data) return;
  FF.registrarRetorno(c, data);
  showToast(`Retorno de ${c.nome.split(' ')[0]} registrado!`, 'success');
  renderRetornos();
  renderDashboard();
}

function renderSimulacao() {
  const mesEl = document.getElementById('sim-mes');
  if (!mesEl) return;
}

function executarSimulacao() {
  const mesStr = document.getElementById('sim-mes').value;
  const obra   = document.getElementById('sim-obra').value;
  if (!mesStr) { alert('Selecione o mês de referência.'); return; }
  const [ano, mes] = mesStr.split('-').map(Number);
  const inicio = new Date(ano, mes-1, 1);
  const fim    = new Date(ano, mes, 0);

  let resultado = FF.colaboradores.filter(c => {
    if (!c.periodoDias) return false;
    if (obra && c.obra !== obra) return false;
    const prox = FF.calcProximaFolga(c);
    if (!prox) return false;
    return prox >= inicio && prox <= fim;
  });

  const tbody = document.getElementById('sim-tbody');
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('sim-resultado-titulo').textContent =
    `${resultado.length} colaborador${resultado.length !== 1 ? 'es' : ''} com folga em ${meses[mes-1]} ${ano}`;

  tbody.innerHTML = resultado.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-3)">Nenhum colaborador com folga no período</td></tr>`
    : resultado.map(c => {
        const prox = FF.calcProximaFolga(c);
        const st = FF.statusFolga(c);
        return `<tr>
          <td><div class="person-cell"><div class="avatar ${FF.avatarCls(c)}">${FF.initials(c.nome)}</div>
          <div><div class="p-name">${c.nome.split(' ').slice(0,3).join(' ')}</div><div class="p-role">${c.funcao.split(' ').slice(0,2).join(' ')}</div></div></div></td>
          <td><span class="mono">${c.chapa}</span></td>
          <td><span class="chip">${c.obra}</span></td>
          <td>${FF.fmt(prox)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td>
        </tr>`;
      }).join('');
  document.getElementById('sim-resultado').style.display = 'block';
}

/* ══════════════════════════════════════════════
   HISTÓRICO
══════════════════════════════════════════════ */
function renderHistorico() {
  const busca = (document.getElementById('f-hist-busca')?.value || '').toLowerCase();
  const tipo  = document.getElementById('f-hist-tipo')?.value || '';

  const todos = FF.colaboradores.flatMap(c =>
    (c.historico || []).map(h => ({ ...h, colab: c }))
  ).sort((a, b) => (FF.parseDate(b.dataSaida) || 0) - (FF.parseDate(a.dataSaida) || 0));

  const filtrado = todos.filter(h => {
    if (busca && !h.colab.nome.toLowerCase().includes(busca) && !h.colab.chapa.includes(busca)) return false;
    if (tipo && h.tipo !== tipo) return false;
    return true;
  });

  const tbody = document.getElementById('hist-tbody');
  if (!tbody) return;
  tbody.innerHTML = filtrado.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-3)">Nenhum registro encontrado</td></tr>`
    : filtrado.slice(0, 30).map(h => `<tr>
        <td><div class="person-cell">
          <div class="avatar av-blue">${FF.initials(h.colab.nome)}</div>
          ${h.colab.nome.split(' ').slice(0,3).join(' ')}
        </div></td>
        <td><span class="mono">${h.colab.chapa}</span></td>
        <td><span class="badge ${h.tipo === 'Indenização' ? 'badge-warning' : 'badge-info'}">${h.tipo || 'Gozo'}</span></td>
        <td>${FF.fmt(FF.parseDate(h.dataSaida))}</td>
        <td>${h.dataRetorno ? FF.fmt(FF.parseDate(h.dataRetorno)) : '<span class="badge badge-info">Em folga</span>'}</td>
        <td>${h.destino || '—'}</td>
        <td><span class="chip">${h.colab.obra}</span></td>
      </tr>`).join('');
}

/* ══════════════════════════════════════════════
   IMPORTAR
══════════════════════════════════════════════ */
function renderImportar() { /* estrutura já está no HTML */ }

function downloadModelo() {
  /* Gera CSV como modelo simplificado para download */
  const headers = [
    'ITEM','CHAPA','NOME','FUNÇÃO','DATA ADMISSÃO','CHEGADA/RETORNO',
    'PERÍODO (1=30d 2=60d 3=45d 4=90d 5=Sem)','TEMPO TRABALHO',
    'CIDADE','ESTADO','OBRA/PROJETO','EMPRESA','STATUS',
    'Nº FOLGA ATUAL','DATA SAÍDA FOLGA','DATA RETORNO FOLGA',
    'TIPO FOLGA (Gozo/Indenização)','OBSERVAÇÃO','DESTINO FOLGA','SUPERVISOR'
  ];
  const exemplo = [
    '1','50006','RAFAEL RODRIGUES DA SILVA','COORDENADOR DEPTO. RECURSOS HUMANOS',
    '06/02/2018','02/10/2022','1','30','Altos','PI','UHE Sinop MT',
    'Azulão Engenharia','Ativo','3','10/04/2026','19/04/2026','Gozo','','Altos / PI','João Silva'
  ];
  const csv = [headers, exemplo].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Modelo_Importacao_FolgaField.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('Modelo baixado! Abra no Excel e preencha.', 'success');
}

function handleUpload(evt) {
  const file = evt.target.files?.[0] || evt.dataTransfer?.files?.[0];
  if (!file) return;
  document.getElementById('upload-nome').textContent = `Arquivo: ${file.name}`;
  document.getElementById('upload-preview').style.display = 'block';
  showToast('Arquivo recebido. Em produção, o parser Excel processará os dados automaticamente.', 'info');
}

/* ══════════════════════════════════════════════
   RELATÓRIOS
══════════════════════════════════════════════ */
function renderRelatorios() { /* estático */ }

function gerarRelatorio(tipo) {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const hoje = new Date();
  let linhas = [];

  if (tipo === 'vencidas') {
    linhas = FF.colaboradores
      .filter(c => c.periodoDias && !c.emFolga && (FF.diasParaVencer(c) ?? 0) < 0)
      .map(c => [c.chapa, c.nome, c.funcao, c.obra, c.periodoDias+'d', FF.fmt(FF.calcProximaFolga(c)), `Vencida há ${Math.abs(FF.diasParaVencer(c))}d`]);
    exportCSV(['Matrícula','Nome','Função','Obra','Periodicidade','Vencimento','Status'], linhas, `FolgaField_Vencidas_${hoje.toISOString().split('T')[0]}.csv`);
  } else if (tipo === 'mensal') {
    const mes = hoje.getMonth(); const ano = hoje.getFullYear();
    const evs = FF.colaboradores.flatMap(c => (c.historico||[]).map(h => ({ ...h, c }))).filter(h => {
      const d = FF.parseDate(h.dataSaida);
      return d && d.getMonth() === mes && d.getFullYear() === ano;
    });
    linhas = evs.map(h => [h.c.chapa, h.c.nome, h.c.obra, FF.fmt(FF.parseDate(h.dataSaida)), FF.fmt(FF.parseDate(h.dataRetorno)), h.tipo||'Gozo', h.destino||'—']);
    exportCSV(['Matrícula','Nome','Obra','Saída','Retorno','Tipo','Destino'], linhas, `FolgaField_${meses[mes]}_${ano}.csv`);
  } else if (tipo === 'completo') {
    linhas = FF.colaboradores.map(c => {
      const st = FF.statusFolga(c);
      return [c.chapa, c.nome, c.funcao, c.obra, c.periodoDias+'d', FF.fmt(FF.calcProximaFolga(c)), st.label, c.historico?.length||0];
    });
    exportCSV(['Matrícula','Nome','Função','Obra','Periodicidade','Próx.Folga','Status','Qtd.Folgas'], linhas, `FolgaField_Completo_${hoje.toISOString().split('T')[0]}.csv`);
  }
  showToast('Relatório exportado em CSV. Abra no Excel para visualizar.', 'success');
}

function exportCSV(headers, rows, filename) {
  const bom = '\uFEFF';
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════
   DOCUMENTOS
══════════════════════════════════════════════ */
function renderDocumentos() { /* estático */ }

function buscarColabDoc() {
  const q = document.getElementById('doc-colab').value.toLowerCase();
  const s = document.getElementById('doc-sugestoes');
  if (q.length < 2) { s.style.display = 'none'; return; }
  const res = FF.colaboradores.filter(c => c.nome.toLowerCase().includes(q) || c.chapa.includes(q)).slice(0,5);
  s.innerHTML = res.map(c => `<div class="sugg-item" onclick="selecionarColabDoc(${c.id})">${c.nome.split(' ').slice(0,3).join(' ')} — <span style="color:var(--text-3)">${c.chapa}</span></div>`).join('');
  s.style.display = res.length ? 'block' : 'none';
}

let docColabId = null;
function selecionarColabDoc(id) {
  const c = FF.colaboradores.find(x => x.id === id);
  if (!c) return;
  docColabId = id;
  document.getElementById('doc-colab').value = `${c.chapa} — ${c.nome}`;
  document.getElementById('doc-sugestoes').style.display = 'none';
}

function gerarDocumento() {
  const id = docColabId;
  const c = FF.colaboradores.find(x => x.id === id);
  if (!c) { alert('Selecione um colaborador.'); return; }
  const tipo   = document.getElementById('doc-tipo').value;
  const saida  = document.getElementById('doc-saida').value;
  const retorno = document.getElementById('doc-retorno').value;
  const resp   = document.getElementById('doc-resp').value;
  if (!saida) { alert('Informe a data de saída.'); return; }

  const prox = FF.calcProximaFolga(c);
  const numFolga = (c.historico?.length || 0) + 1;

  const conteudo = `SOLICITAÇÃO DE FOLGA DE CAMPO
======================================
Empresa: Azulão Engenharia
Código: FI.BRA.GER-04.130A
Data de emissão: ${FF.fmt(new Date())}

COLABORADOR: ${c.nome}
MATRÍCULA: ${c.chapa}
FUNÇÃO: ${c.funcao}
ADMISSÃO: ${c.dataAdmissao}
OBRA: ${c.obra}

PERÍODO AQUISITIVO: ${FF.fmt(prox)}
NÚMERO DESTA FOLGA: ${numFolga}ª folga
PERIODICIDADE: A cada ${c.periodoDias} dias

TIPO: ${tipo}
DATA DE SAÍDA: ${saida ? FF.fmt(FF.parseDate(saida)) : '—'}
DATA DE RETORNO: ${retorno ? FF.fmt(FF.parseDate(retorno)) : '—'}
ORIGEM: ${c.cidade} / ${c.estado}

RESPONSÁVEL: ${resp || '—'}

======================================
Este documento foi gerado automaticamente pelo sistema FolgaField.
Para dúvidas, entre em contato com o RH.`;

  const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FolgaField_Formulario_${c.chapa}_${tipo.replace(/\s/g,'_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Documento gerado! Em produção será exportado em PDF.', 'success');

  /* Adiciona ao histórico de documentos */
  const hist = document.getElementById('doc-historico');
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><span class="badge badge-info">${tipo}</span></td>
    <td>${c.nome.split(' ').slice(0,3).join(' ')}</td>
    <td>${FF.fmt(new Date())} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
    <td>${App.user?.nome || '—'}</td>
    <td><button class="btn-icon"><i class="ti ti-download"></i></button></td>`;
  if (hist.firstChild) hist.insertBefore(tr, hist.firstChild);
}

/* ══════════════════════════════════════════════
   USUÁRIOS
══════════════════════════════════════════════ */
function renderUsuarios() {
  const perfis = { Administrador: 'badge-danger', RH: 'badge-warning', Supervisão: 'badge-info', Consulta: 'badge-gray' };
  document.getElementById('usuarios-tbody').innerHTML = FF.usuarios.map(u => `<tr>
    <td><div class="person-cell"><div class="avatar av-blue">${FF.initials(u.nome)}</div>
      <div><div class="p-name">${u.nome}</div></div></div></td>
    <td style="font-size:12px">${u.email}</td>
    <td><span class="badge ${perfis[u.perfil]||'badge-gray'}">${u.perfil}</span></td>
    <td style="font-size:11px;color:var(--text-3)">—</td>
    <td><span class="badge badge-success">Ativo</span></td>
    <td><div style="display:flex;gap:4px">
      <button class="btn-icon"><i class="ti ti-edit"></i></button>
      ${u.id !== App.user?.id ? `<button class="btn-icon"><i class="ti ti-trash"></i></button>` : ''}
    </div></td>
  </tr>`).join('');
}

/* ══════════════════════════════════════════════
   MODAIS
══════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'modal-novo-colab') App.colabEditando = null;
}

function abrirNovoColaborador() {
  App.colabEditando = null;
  document.getElementById('modal-colab-titulo').textContent = 'Novo colaborador';
  ['novo-chapa','novo-nome','novo-funcao','novo-empresa','novo-cidade','novo-estado'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('novo-periodo').value = '60';
  document.getElementById('novo-status').value = 'Ativo';
  document.getElementById('novo-obra').value = FF.obras[0];
  openModal('modal-novo-colab');
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function showToast(msg, tipo = 'success') {
  const t = document.getElementById('toast');
  const icon = { success: 'ti-circle-check', info: 'ti-info-circle', error: 'ti-alert-circle' };
  t.innerHTML = `<i class="ti ${icon[tipo]||icon.success}" style="font-size:16px;flex-shrink:0"></i> ${msg}`;
  t.className = `toast toast-${tipo} show`;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ══════════════════════════════════════════════
   BUSCA GLOBAL
══════════════════════════════════════════════ */
function buscaGlobal(q) {
  if (!q || q.length < 2) return;
  navigate('colaboradores');
  setTimeout(() => {
    const el = document.getElementById('f-colab-busca');
    if (el) { el.value = q; renderColaboradores(); }
  }, 50);
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Enter no login */
  document.getElementById('login-senha')?.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  /* Fechar modais clicando fora */
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });

  /* Busca global */
  const searchInput = document.getElementById('search-global');
  if (searchInput) {
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') buscaGlobal(e.target.value.trim()); });
  }

  /* Upload drag & drop */
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); handleUpload(e); });
    zone.addEventListener('click', () => document.getElementById('file-input').click());
  }

  /* Mobile sidebar toggle */
  const toggler = document.getElementById('sidebar-toggle');
  if (toggler) toggler.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
});
