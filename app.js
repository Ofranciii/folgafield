/* ============================================================
   FolgaField — app.js  v3.0
   Lógica de UI completa, permissões, PDF, fluxo de folgas
   ============================================================ */
'use strict';

/* ════ Estado global ════ */
const App = {
  user:              null,
  currentScreen:     'dashboard',
  colabSelecionados: new Set(),
  colabPage:         1,
  COLAB_PER_PAGE:    15,
  _colabEditId:      null,
  _usuarioEditId:    null,
  _folgaItinId:      null,
  _confirmCallback:  null,
};

/* ════════════════════════════════════════════════
   AUTENTICAÇÃO
════════════════════════════════════════════════ */
async function login() {
  const email = v('login-email').trim();
  const senha = v('login-senha');
  if (!email || !senha) { setEl('login-erro','Preencha e-mail e senha.'); return; }
  const user = await FF.autenticar(email, senha);
  if (!user) { setEl('login-erro','E-mail ou senha incorretos.'); return; }
  App.user = user;
  el('login-screen').style.display = 'none';
  el('app-screen').style.display   = 'flex';
  setEl('user-name',     user.nome);
  setEl('user-role',     user.perfil);
  setEl('user-initials', FF.initials(user.nome));
  /* Mostra menu Usuários apenas para Admin */
  const menuUsuarios = el('nav-usuarios');
  if (menuUsuarios) menuUsuarios.style.display = user.perfil === 'Administrador' ? '' : 'none';
  navigate('dashboard');
}

function logout() {
  App.user = null;
  el('login-screen').style.display = 'flex';
  el('app-screen').style.display   = 'none';
  el('login-email').value = '';
  el('login-senha').value = '';
  setEl('login-erro','');
}

function isAdmin()  { return App.user?.perfil === 'Administrador'; }
function isRH()     { return App.user?.perfil === 'RH'; }
function canEdit()  { return isAdmin() || isRH(); }
function canAdmin() { return isAdmin(); }

/* ════════════════════════════════════════════════
   NAVEGAÇÃO
════════════════════════════════════════════════ */
function navigate(screen, elem) {
  /* Protege rota de usuários apenas para Admin */
  if (screen === 'usuarios' && !canAdmin()) {
    showToast('Acesso restrito a Administradores.','error'); return;
  }
  App.currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el(`sc-${screen}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (elem || document.querySelector(`.nav-item[data-screen="${screen}"]`))?.classList.add('active');
  const titles = {
    dashboard:'Dashboard', alertas:'Alertas', calendario:'Calendário de Folgas',
    colaboradores:'Colaboradores', folgas:'Programação de Folgas',
    historico:'Histórico de Folgas', importar:'Importar Planilha',
    relatorios:'Relatórios', documentos:'Gerar Documentos', usuarios:'Controle de Acesso',
  };
  setEl('topbar-title', titles[screen] || screen);
  const renders = {
    dashboard: renderDashboard, alertas: renderAlertas, calendario: renderCalendario,
    colaboradores: renderColaboradores, folgas: renderFolgas, historico: renderHistorico,
    relatorios: ()=>{}, documentos: ()=>{}, usuarios: renderUsuarios,
  };
  renders[screen]?.();
  document.querySelector('.sidebar')?.classList.remove('open');
}

/* ════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════ */
function renderDashboard() {
  const r = FF.getResumo();
  ['kpi-total','kpi-vencidas','kpi-proximas','kpi-emfolga','kpi-alertas'].forEach((id,i) => {
    setEl(id, [r.total, r.vencidas, r.proximas7+r.proximas30, r.emFolga, r.alertas][i]);
  });
  const badge = el('badge-alertas');
  if (badge) { badge.textContent=r.alertas; badge.style.display=r.alertas>0?'inline':'none'; }

  /* Por obra */
  const porObra = FF.getPorObra();
  const maxO = porObra[0]?.[1] || 1;
  setEl('obras-lista', porObra.length
    ? porObra.map(([o,q]) => `<div class="mini-bar"><span class="mini-bar-label" title="${o}">${o}</span>
        <div class="mini-bar-track"><div class="mini-bar-fill pb-blue" style="width:${Math.round(q/maxO*100)}%"></div></div>
        <span class="mini-bar-val">${q}</span></div>`).join('')
    : '<p class="text-muted" style="padding:12px 0;font-size:13px">Nenhum colaborador cadastrado ainda.</p>');

  /* Alertas críticos */
  const crit = FF.colaboradores
    .filter(c => c.periodoDias && !c.emFolga)
    .map(c => ({ c, dias: FF.diasParaVencer(c) }))
    .filter(({ dias }) => dias !== null && dias <= 30)
    .sort((a,b) => a.dias - b.dias).slice(0,5);
  setEl('alertas-recentes', crit.length
    ? crit.map(({ c, dias }) => {
        const tp = dias < 0 ? 'alert-danger' : 'alert-warning';
        const tx = dias < 0 ? `Vencida há ${Math.abs(dias)} dias` : `Vence em ${dias} dia${dias!==1?'s':''}`;
        return `<div class="alert ${tp}" style="margin-bottom:8px">
          <i class="ti ti-${dias<0?'alert-circle':'bell'}"></i>
          <div><strong>${priNome(c.nome,2)}</strong> — ${tx} (${c.periodoDias}d)</div>
        </div>`;
      }).join('')
    : '<p class="text-muted" style="padding:12px 0;font-size:13px">✓ Nenhum alerta crítico.</p>');

  /* Programadas do mês */
  const hoje = new Date();
  const prog = FF.colaboradores
    .flatMap(c => (c.historico||[]).map(h => ({ ...h, colab:c })))
    .filter(h => { const d=FF.parseDate(h.dataSaida); return d&&d.getMonth()===hoje.getMonth()&&d.getFullYear()===hoje.getFullYear(); })
    .sort((a,b) => FF.parseDate(a.dataSaida)-FF.parseDate(b.dataSaida)).slice(0,6);
  setEl('programadas-mes', prog.length
    ? prog.map(h => `<tr>
        <td><div class="person-cell"><div class="avatar av-blue" style="width:24px;height:24px;font-size:9px">${FF.initials(h.colab.nome)}</div>${priNome(h.colab.nome,2)}</div></td>
        <td>${FF.fmt(FF.parseDate(h.dataSaida))}</td>
        <td>${FF.fmt(FF.parseDate(h.dataRetorno))}</td>
        <td><span class="badge badge-info">${h.colab.periodoDias}d</span></td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:16px">Nenhuma folga programada este mês</td></tr>');

  renderChartStatus(); renderChartMensal(); renderChartPeriodo();
}

/* ── Gráficos ── */
let _cs=null,_cm=null,_cp=null;
function renderChartStatus() {
  const r=FF.getResumo(), ctx=el('chart-status'); if(!ctx)return;
  _cs?.destroy(); _cs=null;
  _cs = new Chart(ctx, { type:'doughnut',
    data:{ labels:['Vencidas','Próx.7d','Próx.30d','Em folga','Em dia'],
      datasets:[{ data:[r.vencidas,r.proximas7,r.proximas30,r.emFolga,
        Math.max(0,r.ativos-r.vencidas-r.proximas7-r.proximas30-r.emFolga)],
        backgroundColor:['#E14B4A','#D4860F','#EF9F27','#3A7BD5','#1D9E75'],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false}}}});
}
function renderChartMensal() {
  const ctx=el('chart-mensal'); if(!ctx)return;
  _cm?.destroy(); _cm=null;
  const counts=new Array(12).fill(0);
  const anoAtual = new Date().getFullYear();
  FF.colaboradores.forEach(c=>(c.historico||[]).forEach(h=>{
    const d=FF.parseDate(h.dataSaida); if(d&&d.getFullYear()===anoAtual) counts[d.getMonth()]++;
  }));
  _cm=new Chart(ctx,{type:'bar',
    data:{labels:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
      datasets:[{label:'Folgas',data:counts,backgroundColor:'#3A7BD5',borderRadius:4,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{font:{size:11}}},x:{grid:{display:false},ticks:{font:{size:11}}}}}});
}
function renderChartPeriodo() {
  const ctx=el('chart-periodo'); if(!ctx)return;
  _cp?.destroy(); _cp=null;
  const c={30:0,45:0,60:0,90:0,0:0};
  FF.colaboradores.forEach(x=>{if(x.periodoDias!==undefined) c[x.periodoDias]=(c[x.periodoDias]||0)+1;});
  _cp=new Chart(ctx,{type:'doughnut',
    data:{labels:['30d','45d','60d','90d','Sem dir.'],
      datasets:[{data:[c[30],c[45],c[60],c[90],c[0]],
        backgroundColor:['#1A54A8','#1D9E75','#D4860F','#E14B4A','#8890A0'],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{display:false}}}});
}

/* ════════════════════════════════════════════════
   ALERTAS
════════════════════════════════════════════════ */
function renderAlertas() {
  const fT=v('f-alerta-tipo'), fO=v('f-alerta-obra');
  let lista=FF.colaboradores.filter(c=>c.periodoDias&&!c.emFolga)
    .map(c=>({c,dias:FF.diasParaVencer(c)}))
    .filter(({dias})=>dias!==null&&dias<=30)
    .sort((a,b)=>a.dias-b.dias);
  if(fO) lista=lista.filter(({c})=>c.obra===fO);
  if(fT==='vencidas') lista=lista.filter(({dias})=>dias<0);
  if(fT==='urgente')  lista=lista.filter(({dias})=>dias>=0&&dias<=7);
  if(fT==='proximas') lista=lista.filter(({dias})=>dias>7);
  setEl('kpi-a-vencidas',lista.filter(({dias})=>dias<0).length);
  setEl('kpi-a-urgente', lista.filter(({dias})=>dias>=0&&dias<=7).length);
  setEl('kpi-a-proximas',lista.filter(({dias})=>dias>7).length);
  setEl('alertas-tbody', lista.length===0
    ? `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-3)">
        <i class="ti ti-circle-check" style="font-size:28px;display:block;margin-bottom:8px;color:var(--teal-400)"></i>
        Nenhum alerta com estes filtros</td></tr>`
    : lista.map(({c,dias})=>{
        const prox=FF.calcProximaFolga(c);
        const cls=dias<0?'badge-danger':dias<=7?'badge-danger':'badge-warning';
        const txt=dias<0?`Vencida há ${Math.abs(dias)}d`:`Vence em ${dias}d`;
        return `<tr>
          <td><div class="person-cell"><div class="avatar ${FF.avatarCls(c)}">${FF.initials(c.nome)}</div>
            <div><div class="p-name">${priNome(c.nome,3)}</div><div class="p-role">${priNome(c.funcao,3)}</div></div></div></td>
          <td><span class="mono">${c.chapa}</span></td>
          <td><span class="chip">${c.obra}</span></td>
          <td><span class="badge badge-info">${c.periodoDias}d</span></td>
          <td>${c.historico?.length?FF.fmt(FF.parseDate(c.historico[c.historico.length-1].dataRetorno)):'—'}</td>
          <td style="font-weight:500">${FF.fmt(prox)}</td>
          <td><span class="badge ${cls}">${txt}</span></td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-primary" onclick="abrirProgramarFolga(${c.id})"><i class="ti ti-calendar-plus"></i> Agendar</button>
            <button class="btn btn-sm" onclick="verColaborador(${c.id})"><i class="ti ti-eye"></i></button>
          </div></td></tr>`;
      }).join(''));
}

/* ════════════════════════════════════════════════
   CALENDÁRIO
════════════════════════════════════════════════ */
let calMes=new Date().getMonth(), calAno=new Date().getFullYear();
function renderCalendario() {
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  setEl('cal-titulo',`${meses[calMes]} ${calAno}`);
  const grid=el('cal-grid'); if(!grid)return;
  const primeiro=new Date(calAno,calMes,1).getDay();
  const dias=new Date(calAno,calMes+1,0).getDate();
  const hoje=new Date();
  const evs={};
  FF.colaboradores.forEach(c=>{
    (c.historico||[]).forEach(h=>{
      const s=FF.parseDate(h.dataSaida),r=FF.parseDate(h.dataRetorno);
      if(s&&s.getMonth()===calMes&&s.getFullYear()===calAno){const d=s.getDate();evs[d]=(evs[d]||[]);evs[d].push({tipo:'saida',nome:c.nome.split(' ')[0]});}
      if(r&&r.getMonth()===calMes&&r.getFullYear()===calAno){const d=r.getDate();evs[d]=(evs[d]||[]);evs[d].push({tipo:'retorno',nome:c.nome.split(' ')[0]});}
    });
    const prox=FF.calcProximaFolga(c);
    if(prox&&prox.getMonth()===calMes&&prox.getFullYear()===calAno){
      const d=prox.getDate();evs[d]=(evs[d]||[]);evs[d].push({tipo:'vence',nome:c.nome.split(' ')[0],dias:FF.diasParaVencer(c)});
    }
  });
  let html='';
  for(let i=0;i<primeiro;i++) html+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=dias;d++){
    const isH=d===hoje.getDate()&&calMes===hoje.getMonth()&&calAno===hoje.getFullYear();
    const ev=evs[d]||[];
    let cls='cal-day'+(isH?' cal-hoje':'');
    if(ev.some(e=>e.tipo==='vence'&&e.dias<0)) cls+=' cal-vence';
    else if(ev.some(e=>e.tipo==='saida')) cls+=' cal-saida';
    else if(ev.some(e=>e.tipo==='retorno')) cls+=' cal-retorno';
    html+=`<div class="${cls}"><span class="cal-num">${d}</span>
      ${ev.slice(0,2).map(e=>{
        const cor=e.tipo==='vence'?'var(--red-600)':e.tipo==='saida'?'var(--amber-600)':'var(--teal-600)';
        return `<div style="font-size:9px;color:${cor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.nome}</div>`;
      }).join('')}${ev.length>2?`<span style="font-size:9px;color:var(--text-3)">+${ev.length-2}</span>`:''}</div>`;
  }
  grid.innerHTML=html;
  const todosEvs=FF.colaboradores.flatMap(c=>(c.historico||[]).flatMap(h=>{
    const evL=[],s=FF.parseDate(h.dataSaida),r=FF.parseDate(h.dataRetorno);
    if(s&&s.getMonth()===calMes&&s.getFullYear()===calAno) evL.push({data:s,tipo:'Saída',colab:c,destino:h.destino||'—',periodo:c.periodoDias});
    if(r&&r.getMonth()===calMes&&r.getFullYear()===calAno) evL.push({data:r,tipo:'Retorno',colab:c,destino:h.destino||'—',periodo:c.periodoDias});
    return evL;
  })).sort((a,b)=>a.data-b.data).slice(0,12);
  setEl('cal-eventos', todosEvs.length
    ? todosEvs.map(e=>`<tr><td>${FF.fmt(e.data)}</td><td>${priNome(e.colab.nome,3)}</td>
        <td><span class="badge ${e.tipo==='Saída'?'badge-warning':'badge-success'}">${e.tipo}</span></td>
        <td>${e.destino}</td><td><span class="badge badge-info">${e.periodo}d</span></td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px">Nenhum evento neste mês</td></tr>`);
}
function calAnterior(){if(calMes===0){calMes=11;calAno--;}else calMes--;renderCalendario();}
function calProximo() {if(calMes===11){calMes=0;calAno++;}else calMes++;renderCalendario();}

/* ════════════════════════════════════════════════
   COLABORADORES
════════════════════════════════════════════════ */
function renderColaboradores() {
  const busca=(v('f-colab-busca')||'').toLowerCase();
  const obra=v('f-colab-obra'),status=v('f-colab-status'),periodo=v('f-colab-periodo');
  let lista=FF.colaboradores.filter(c=>{
    if(busca&&!c.nome.toLowerCase().includes(busca)&&!c.chapa.includes(busca)) return false;
    if(obra&&c.obra!==obra) return false;
    if(status&&c.status!==status) return false;
    if(periodo&&String(c.periodoDias)!==periodo) return false;
    return true;
  });
  const total=lista.length,pages=Math.max(1,Math.ceil(total/App.COLAB_PER_PAGE));
  App.colabPage=Math.min(App.colabPage,pages);
  const slice=lista.slice((App.colabPage-1)*App.COLAB_PER_PAGE,App.colabPage*App.COLAB_PER_PAGE);
  setEl('colab-count',`${total} colaborador${total!==1?'es':''} encontrado${total!==1?'s':''}`);
  const pEdit=canEdit();

  setEl('colab-tbody', slice.length===0
    ? `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text-3)">Nenhum colaborador encontrado</td></tr>`
    : slice.map((c,i)=>{
        const st=FF.statusFolga(c), prox=FF.calcProximaFolga(c);
        const chk=pEdit?`<td><input type="checkbox" class="colab-chk" data-id="${c.id}" ${App.colabSelecionados.has(c.id)?'checked':''} onchange="toggleSelectColab(${c.id},this.checked)"></td>`:'<td></td>';
        return `<tr class="${App.colabSelecionados.has(c.id)?'tr-selected':''}">
          ${chk}
          <td class="mono text-muted" style="font-size:11px">${(App.colabPage-1)*App.COLAB_PER_PAGE+i+1}</td>
          <td><div class="person-cell"><div class="avatar ${FF.avatarCls(c)}">${FF.initials(c.nome)}</div>
            <div><div class="p-name">${priNome(c.nome,3)}</div><div class="p-role">${priNome(c.funcao,3)}</div></div></div></td>
          <td><span class="mono">${c.chapa}</span></td>
          <td><span class="chip">${c.obra}</span></td>
          <td>${c.periodoDias?`<span class="badge badge-info">${c.periodoDias}d</span>`:'<span class="badge badge-gray">Sem dir.</span>'}</td>
          <td>${c.historico?.length?FF.fmt(FF.parseDate(c.historico[c.historico.length-1].dataSaida)):'—'}</td>
          <td style="font-weight:500">${FF.fmt(prox)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td>
          <td><div style="display:flex;gap:4px">
            <button class="btn-icon" title="Ver perfil" onclick="verColaborador(${c.id})"><i class="ti ti-eye"></i></button>
            ${pEdit?`<button class="btn-icon" title="Editar" onclick="editarColaborador(${c.id})"><i class="ti ti-edit"></i></button>
            <button class="btn-icon" title="Programar folga" onclick="abrirProgramarFolga(${c.id})"><i class="ti ti-calendar-plus"></i></button>`:''}
          </div></td></tr>`;
      }).join(''));

  /* Toolbar seleção */
  const sel=App.colabSelecionados.size;
  const toolbar=el('colab-sel-toolbar');
  if(toolbar) toolbar.style.display=sel>0&&pEdit?'flex':'none';
  setEl('sel-count',sel>0?`${sel} selecionado${sel!==1?'s':''}`:'');
  const btnEx=el('btn-excluir-lote');
  if(btnEx) btnEx.style.display=sel>0&&pEdit?'inline-flex':'none';
  const btnSA=el('btn-sel-all');
  if(btnSA) btnSA.textContent=sel===lista.length&&lista.length>0?'Desmarcar todos':'Selecionar todos';

  /* Paginação */
  const pg=el('colab-pag'); if(!pg) return;
  pg.innerHTML='';
  if(pages>1){
    addPageBtn(pg,'<i class="ti ti-chevron-left"></i>',()=>{App.colabPage--;renderColaboradores();},App.colabPage===1);
    for(let p=1;p<=pages;p++) addPageBtn(pg,p,()=>{App.colabPage=p;renderColaboradores();},false,p===App.colabPage);
    addPageBtn(pg,'<i class="ti ti-chevron-right"></i>',()=>{App.colabPage++;renderColaboradores();},App.colabPage===pages);
  }
}

function addPageBtn(pg,html,fn,disabled,active){
  const b=document.createElement('button');
  b.className='page-btn'+(active?' active':'');
  b.innerHTML=html; b.onclick=fn; b.disabled=!!disabled; pg.appendChild(b);
}

function toggleSelectColab(id,checked){
  if(checked) App.colabSelecionados.add(id); else App.colabSelecionados.delete(id);
  syncSelToolbar();
}

function syncSelToolbar(){
  const sel=App.colabSelecionados.size, pEdit=canEdit();
  const toolbar=el('colab-sel-toolbar');
  if(toolbar) toolbar.style.display=sel>0&&pEdit?'flex':'none';
  setEl('sel-count',sel>0?`${sel} selecionado${sel!==1?'s':''}`:'');
  const btnEx=el('btn-excluir-lote');
  if(btnEx) btnEx.style.display=sel>0&&pEdit?'inline-flex':'none';
}

function toggleSelectAll(){
  const busca=(v('f-colab-busca')||'').toLowerCase();
  const obra=v('f-colab-obra'),status=v('f-colab-status'),periodo=v('f-colab-periodo');
  const lista=FF.colaboradores.filter(c=>{
    if(busca&&!c.nome.toLowerCase().includes(busca)&&!c.chapa.includes(busca)) return false;
    if(obra&&c.obra!==obra) return false;
    if(status&&c.status!==status) return false;
    if(periodo&&String(c.periodoDias)!==periodo) return false;
    return true;
  });
  const allSel=lista.length>0&&lista.every(c=>App.colabSelecionados.has(c.id));
  lista.forEach(c=>allSel?App.colabSelecionados.delete(c.id):App.colabSelecionados.add(c.id));
  renderColaboradores();
}

function excluirEmLote(){
  if(!canEdit()){ showToast('Sem permissão.','error'); return; }
  const ids=[...App.colabSelecionados];
  if(!ids.length) return;
  abrirConfirm(
    `Excluir ${ids.length} colaborador${ids.length!==1?'es':''} selecionado${ids.length!==1?'s':''}?`,
    `Esta ação <strong>não pode ser desfeita</strong>. Todos os dados e histórico de folgas serão removidos permanentemente.`,
    'danger',
    () => {
      FF.deleteColaboradores(ids, App.user?.nome);
      App.colabSelecionados.clear();
      showToast(`${ids.length} colaborador${ids.length!==1?'es':''} excluído${ids.length!==1?'s':''}!`,'success');
      renderColaboradores();
    }
  );
}

function verColaborador(id){
  const c=FF.colaboradores.find(x=>x.id===id); if(!c) return;
  const st=FF.statusFolga(c), prox=FF.calcProximaFolga(c), n=c.historico?.length||0;
  const hist=(c.historico||[]).map(h=>`<tr>
    <td>${h.num}ª</td><td>${FF.fmt(FF.parseDate(h.dataSaida))}</td>
    <td>${FF.fmt(FF.parseDate(h.dataRetorno))}</td>
    <td><span class="badge ${h.tipo==='Indenização'?'badge-warning':'badge-success'}">${h.tipo||'Gozo'}</span></td>
    <td>${h.destino||'—'}</td><td>${h.origem||'—'}</td></tr>`).join('')
    ||`<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:12px">Sem histórico</td></tr>`;
  setEl('modal-colab-body',`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div class="avatar ${FF.avatarCls(c)}" style="width:48px;height:48px;font-size:16px">${FF.initials(c.nome)}</div>
      <div><div style="font-size:16px;font-weight:600">${c.nome}</div>
        <div style="font-size:12px;color:var(--text-3)">${c.funcao}</div>
        <div style="margin-top:4px"><span class="badge ${st.cls}">${st.label}</span></div></div>
    </div>
    <div class="form-grid" style="margin-bottom:16px">
      <div><label>Matrícula</label><div class="mono" style="margin-top:4px">${c.chapa}</div></div>
      <div><label>Obra</label><div style="margin-top:4px">${c.obra}</div></div>
      <div><label>CPF</label><div style="margin-top:4px">${FF.fmtCPF(c.cpf)}</div></div>
      <div><label>CIP</label><div style="margin-top:4px">${c.cip||'—'}</div></div>
      <div><label>Admissão</label><div style="margin-top:4px">${c.dataAdmissao||'—'}</div></div>
      <div><label>Apresentação na obra</label><div style="margin-top:4px">${c.dataApresentacao||'—'}</div></div>
      <div><label>Periodicidade</label><div style="margin-top:4px"><span class="badge badge-info">${c.periodoDias?c.periodoDias+' dias':'Sem direito'}</span></div></div>
      <div><label>Próxima folga</label><div style="margin-top:4px;font-weight:500">${FF.fmt(prox)}</div></div>
      <div><label>Cidade / Estado</label><div style="margin-top:4px">${c.cidade||'—'} / ${c.estado||'—'}</div></div>
      <div><label>Status</label><div style="margin-top:4px">${c.status}</div></div>
    </div>
    <div class="periodo-box" style="margin-bottom:16px">
      <strong><i class="ti ti-info-circle"></i> Regra de período aquisitivo</strong>
      <div class="periodo-row"><span>1ª folga</span><span>Apresentação + ${c.periodoDias||0} dias</span></div>
      <div class="periodo-row"><span>2ª+ folga</span><span>${c.periodoDias===30?'30+5=35d de ciclo':c.periodoDias?`${c.periodoDias}+9=${c.periodoDias+9}d de ciclo`:'—'}</span></div>
      <div class="periodo-row" style="border-bottom:none"><span>Folgas realizadas</span><span>${n}</span></div>
    </div>
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Histórico de folgas</div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Saída</th><th>Retorno</th><th>Tipo</th><th>Destino</th><th>Origem</th></tr></thead>
      <tbody>${hist}</tbody></table></div>`);
  openModal('modal-colab');
}

function editarColaborador(id){
  const c=FF.colaboradores.find(x=>x.id===id); if(!c) return;
  App._colabEditId=id;
  el('novo-chapa').value=c.chapa||''; el('novo-nome').value=c.nome||'';
  el('novo-funcao').value=c.funcao||''; el('novo-obra').value=c.obra||FF.obras[0];
  el('novo-empresa').value=c.empresa||''; el('novo-periodo').value=c.periodoDias??60;
  el('novo-admissao').value=FF.toInputDate(c.dataAdmissao);
  el('novo-apresentacao').value=FF.toInputDate(c.dataApresentacao);
  el('novo-cidade').value=c.cidade||''; el('novo-estado').value=c.estado||'';
  el('novo-status').value=c.status||'Ativo';
  el('novo-cpf').value=c.cpf||''; el('novo-cip').value=c.cip||'';
  setEl('modal-colab-titulo','Editar colaborador');
  openModal('modal-novo-colab');
}

function salvarColaborador(){
  const dados={
    chapa: v('novo-chapa').trim(), nome: v('novo-nome').trim().toUpperCase(),
    funcao: v('novo-funcao').trim().toUpperCase(), obra: v('novo-obra'),
    empresa: v('novo-empresa').trim(), periodoDias: parseInt(v('novo-periodo'))||0,
    dataAdmissao: v('novo-admissao'), dataApresentacao: v('novo-apresentacao'),
    cidade: v('novo-cidade').trim(), estado: v('novo-estado').trim().toUpperCase(),
    status: v('novo-status'), cpf: v('novo-cpf').replace(/\D/g,''), cip: v('novo-cip').trim(),
  };
  if(!dados.chapa||!dados.nome){ showToast('Matrícula e nome são obrigatórios.','error'); return; }
  if(App._colabEditId){
    FF.updateColaborador(App._colabEditId,dados);
  } else {
    if(FF.colaboradores.find(c=>c.chapa===dados.chapa)){ showToast('Matrícula já cadastrada.','error'); return; }
    FF.addColaborador(dados);
  }
  App._colabEditId=null;
  closeModal('modal-novo-colab');
  renderColaboradores();
  showToast('Colaborador salvo com sucesso!','success');
}

/* ════════════════════════════════════════════════
   PROGRAMAÇÃO DE FOLGAS
════════════════════════════════════════════════ */
let folgaTab='programar';
function renderFolgas(){ setFolgaTab(folgaTab); }

function setFolgaTab(tab){
  folgaTab=tab;
  document.querySelectorAll('#sc-folgas .tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(`#sc-folgas .tab[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelectorAll('#sc-folgas .tab-pane').forEach(p=>p.style.display='none');
  el(`folga-${tab}`)?.setAttribute('style','display:block');
  if(tab==='retorno')    renderRetornos();
  if(tab==='programadas') renderFolgasProgramadas();
}

function abrirProgramarFolga(id){
  navigate('folgas'); setFolgaTab('programar');
  setTimeout(()=>{
    if(!id) return;
    el('f-colabId').value=id;
    const c=FF.colaboradores.find(x=>x.id===id);
    if(c){ el('f-colabNome').value=`${c.chapa} — ${c.nome}`; atualizarInfoFolga(c); }
  },80);
}

function buscarColabParaFolga(){
  const q=(v('f-colabNome')||'').toLowerCase(), sugg=el('f-sugestoes');
  if(q.length<2){ sugg.style.display='none'; return; }
  const res=FF.colaboradores.filter(c=>c.nome.toLowerCase().includes(q)||c.chapa.includes(q)).slice(0,6);
  sugg.innerHTML=res.map(c=>`<div class="sugg-item" onclick="selecionarColabFolga(${c.id})">
    <div style="font-weight:500;font-size:13px">${priNome(c.nome,3)}</div>
    <div style="font-size:11px;color:var(--text-3)">${c.chapa} · ${c.obra}</div></div>`).join('');
  sugg.style.display=res.length?'block':'none';
}

function selecionarColabFolga(id){
  const c=FF.colaboradores.find(x=>x.id===id); if(!c) return;
  el('f-colabId').value=id;
  el('f-colabNome').value=`${c.chapa} — ${c.nome}`;
  el('f-sugestoes').style.display='none';
  atualizarInfoFolga(c);
}

function atualizarInfoFolga(c){
  const prox=FF.calcProximaFolga(c), n=c.historico?.length||0;
  el('info-colab').style.display='block';
  setEl('info-nome-colab',c.nome);
  setEl('info-periodo',c.periodoDias?`${c.periodoDias} dias`:'Sem direito');
  setEl('info-num-folga',n+1);
  setEl('info-proxima',FF.fmt(prox));
  setEl('info-regra',FF.descricaoRegra(c.periodoDias,n+1));
  const st=FF.statusFolga(c);
  setEl('info-status',`<span class="badge ${st.cls}">${st.label}</span>`);
  /* Destino = cidade do colaborador (automático) */
  const dest=el('f-destino');
  if(dest){
    const cidadeColab=c.cidade&&c.estado?`${c.cidade} / ${c.estado}`:c.cidade||'';
    dest.value=cidadeColab;
    dest.readOnly=!!cidadeColab;
    dest.style.background=cidadeColab?'var(--gray-50)':'';
    if(!cidadeColab) dest.placeholder='Cidade não cadastrada — preencha manualmente';
  }
  /* Origem = cidade da obra */
  const orig=el('f-origem');
  if(orig&&c.obra){ const co=OBRAS_CIDADES[c.obra]; if(co) orig.value=co; }
}

function limparFormFolga(){
  ['f-colabNome','f-colabId','f-saida','f-retorno','f-obs'].forEach(id=>{const e=el(id);if(e)e.value='';});
  const dest=el('f-destino'); if(dest){dest.value='';dest.readOnly=false;dest.style.background='';}
  el('f-origem') && (el('f-origem').value='');
  el('info-colab').style.display='none';
}

function confirmarFolga(){
  const id=parseInt(v('f-colabId'));
  const c=FF.colaboradores.find(x=>x.id===id);
  if(!c){ showToast('Selecione um colaborador.','error'); return; }
  const saida=v('f-saida'), tipo=v('f-tipo'), destino=v('f-destino'), origem=v('f-origem');
  if(!saida){ showToast('Informe a data de saída.','error'); return; }
  if(!destino){ showToast('Destino é obrigatório. Verifique o cadastro do colaborador.','error'); return; }
  FF.programarFolga({
    colabId:id, dataSaida:saida, dataRetorno:v('f-retorno')||null,
    tipo, destino, origem, obs:v('f-obs')
  }, App.user?.nome);
  showToast(`Folga registrada para ${c.nome.split(' ')[0]}!`,'success');
  limparFormFolga();
  renderDashboard();
}

/* ── Folgas programadas do mês (com filtros e histórico) ── */
function renderFolgasProgramadas(){
  const mesEl=el('fp-mes');
  const hoje=new Date();
  const mesStr=mesEl?.value||(hoje.getFullYear()+'-'+String(hoje.getMonth()+1).padStart(2,'0'));
  const [ano,mes]=mesStr.split('-').map(Number);
  const fBusca=(v('fp-busca')||'').toLowerCase();
  const fStatus=v('fp-status')||'';
  const fObra=v('fp-obra')||'';

  let lista=FF.getFolgasMes(ano,mes);
  if(fBusca) lista=lista.filter(f=>f.colab.nome.toLowerCase().includes(fBusca)||f.colab.chapa.includes(fBusca));
  if(fStatus) lista=lista.filter(f=>f.statusItinerario===fStatus);
  if(fObra) lista=lista.filter(f=>f.colab.obra===fObra);

  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  setEl('fp-count',`${lista.length} folga${lista.length!==1?'s':''} em ${meses[mes-1]} ${ano}`);
  const isRHAdmin=canEdit();

  setEl('fp-tbody', lista.length===0
    ? `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-3)">
        <i class="ti ti-calendar-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>
        Nenhuma folga programada com estes filtros</td></tr>`
    : lista.map(f=>{
        const si=STATUS_ITINERARIO.find(s=>s.val===f.statusItinerario)||STATUS_ITINERARIO[0];
        const ult=f.historicoStatus?.[f.historicoStatus.length-1];
        const atualEm=f.atualizadoEm?`<div style="font-size:10px;color:var(--text-3);margin-top:2px">Atualizado ${new Date(f.atualizadoEm).toLocaleDateString('pt-BR')}</div>`:'';
        return `<tr>
          <td><div class="person-cell"><div class="avatar av-blue">${FF.initials(f.colab.nome)}</div>
            <div><div class="p-name">${priNome(f.colab.nome,3)}</div>
            <div class="p-role">${f.colab.chapa} · ${f.colab.obra}</div></div></div></td>
          <td>${FF.fmt(FF.parseDate(f.dataSaida))}</td>
          <td>${f.dataRetorno?FF.fmt(FF.parseDate(f.dataRetorno)):'—'}</td>
          <td><span class="badge ${f.tipo==='Indenização'?'badge-warning':'badge-info'}">${f.tipo||'Gozo'}</span></td>
          <td style="font-size:12px">${f.origem||'—'}<br><span style="color:var(--text-3)">→ ${f.destino||'—'}</span></td>
          <td>${f.valorIndenizacao?`<strong>R$ ${Number(f.valorIndenizacao).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>`:'—'}</td>
          <td><span class="badge ${si.cls}">${si.label}</span>${atualEm}</td>
          <td>${isRHAdmin?`<button class="btn btn-sm" onclick="abrirAtualizarItinerario(${f.id})"><i class="ti ti-edit"></i></button>
              <button class="btn btn-sm" onclick="verHistoricoItinerario(${f.id})" title="Ver histórico"><i class="ti ti-history"></i></button>`:'—'}</td></tr>`;
      }).join(''));
}

function abrirAtualizarItinerario(folgaId){
  if(!canEdit()){ showToast('Sem permissão.','error'); return; }
  App._folgaItinId=folgaId;
  const f=FF.folgasProgramadas.find(x=>x.id===folgaId); if(!f) return;
  el('itin-status').value=f.statusItinerario||'aguardando';
  el('itin-obs').value='';
  el('itin-valor').value=f.valorIndenizacao||'';
  const c=FF.colaboradores.find(x=>x.id===f.colabId);
  setEl('itin-nome',c?priNome(c.nome,3):'');
  openModal('modal-itinerario');
}

function salvarItinerario(){
  FF.atualizarStatusItinerario(App._folgaItinId,v('itin-status'),v('itin-obs'),v('itin-valor'),App.user?.nome);
  closeModal('modal-itinerario');
  showToast('Status atualizado!','success');
  renderFolgasProgramadas();
}

function verHistoricoItinerario(folgaId){
  const f=FF.folgasProgramadas.find(x=>x.id===folgaId); if(!f) return;
  const c=FF.colaboradores.find(x=>x.id===f.colabId);
  const hist=(f.historicoStatus||[]).map(h=>{
    const si=STATUS_ITINERARIO.find(s=>s.val===h.status);
    return `<div class="tl-item">
      <div class="tl-dot tl-dot-${si?.cls?.replace('badge-','')?.replace('gray','blue')?.replace('amber','amber')?.replace('warning','amber')?.replace('success','green')?.replace('info','blue')?.replace('danger','red')||'blue'}"></div>
      <div class="tl-date">${new Date(h.ts).toLocaleString('pt-BR')} · ${h.usuario||'Sistema'}</div>
      <div class="tl-text"><span class="badge ${si?.cls||'badge-gray'}">${h.label||h.status}</span>
        ${h.obs?`<span style="font-size:12px;color:var(--text-2);margin-left:8px">${h.obs}</span>`:''}</div>
    </div>`;
  }).join('');
  setEl('modal-hist-itin-body',`
    <p style="font-size:13px;color:var(--text-2);margin-bottom:14px">
      <strong>${c?priNome(c.nome,3):'—'}</strong> · Saída: ${FF.fmt(FF.parseDate(f.dataSaida))} · Destino: ${f.destino||'—'}</p>
    <div class="timeline">${hist||'<p style="color:var(--text-3)">Sem histórico</p>'}</div>`);
  openModal('modal-hist-itin');
}

/* ── Retornos ── */
function renderRetornos(){
  const emFolga=FF.colaboradores.filter(c=>c.emFolga);
  setEl('retornos-tbody', emFolga.length===0
    ? `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-3)">Nenhum colaborador em folga no momento</td></tr>`
    : emFolga.map(c=>{
        const ult=c.historico?.[c.historico.length-1];
        return `<tr>
          <td><div class="person-cell"><div class="avatar av-blue">${FF.initials(c.nome)}</div>${priNome(c.nome,3)}</div></td>
          <td>${ult?FF.fmt(FF.parseDate(ult.dataSaida)):'—'}</td>
          <td>${ult?FF.fmt(FF.parseDate(ult.dataRetorno)):'—'}</td>
          <td>${ult?.destino||'—'}</td>
          <td><button class="btn btn-sm btn-primary" onclick="confirmarRetornoColab(${c.id})"><i class="ti ti-check"></i> Confirmar retorno</button></td></tr>`;
      }).join(''));
}

function confirmarRetornoColab(id){
  const c=FF.colaboradores.find(x=>x.id===id); if(!c) return;
  const data=prompt(`Confirmar retorno de ${c.nome.split(' ')[0]}.\nData de retorno (DD/MM/AAAA):`, FF.fmt(new Date()));
  if(!data) return;
  FF.registrarRetorno(id,data,App.user?.nome);
  showToast(`Retorno de ${c.nome.split(' ')[0]} registrado!`,'success');
  renderRetornos(); renderDashboard();
}

/* ── Simulação ── */
function executarSimulacao(){
  const mesStr=v('sim-mes'), obra=v('sim-obra');
  if(!mesStr){ showToast('Selecione o mês.','error'); return; }
  const [ano,mes]=mesStr.split('-').map(Number);
  const ini=new Date(ano,mes-1,1), fim=new Date(ano,mes,0);
  const res=FF.colaboradores.filter(c=>{
    if(!c.periodoDias) return false;
    if(obra&&c.obra!==obra) return false;
    const prox=FF.calcProximaFolga(c);
    return prox&&prox>=ini&&prox<=fim;
  });
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  setEl('sim-resultado-titulo',`${res.length} colaborador${res.length!==1?'es':''} com folga em ${meses[mes-1]} ${ano}`);
  setEl('sim-tbody', res.length===0
    ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-3)">Nenhum resultado</td></tr>`
    : res.map(c=>{
        const prox=FF.calcProximaFolga(c),st=FF.statusFolga(c);
        return `<tr>
          <td><div class="person-cell"><div class="avatar ${FF.avatarCls(c)}">${FF.initials(c.nome)}</div>
            <div><div class="p-name">${priNome(c.nome,3)}</div><div class="p-role">${priNome(c.funcao,2)}</div></div></div></td>
          <td><span class="mono">${c.chapa}</span></td>
          <td><span class="chip">${c.obra}</span></td>
          <td>${FF.fmt(prox)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td></tr>`;
      }).join(''));
  el('sim-resultado').style.display='block';
}

/* ════════════════════════════════════════════════
   HISTÓRICO
════════════════════════════════════════════════ */
function renderHistorico(){
  const busca=(v('f-hist-busca')||'').toLowerCase(), tipo=v('f-hist-tipo')||'';
  const todos=FF.colaboradores.flatMap(c=>(c.historico||[]).map(h=>({...h,colab:c})))
    .sort((a,b)=>(FF.parseDate(b.dataSaida)||0)-(FF.parseDate(a.dataSaida)||0));
  const fil=todos.filter(h=>{
    if(busca&&!h.colab.nome.toLowerCase().includes(busca)&&!h.colab.chapa.includes(busca)) return false;
    if(tipo&&h.tipo!==tipo) return false;
    return true;
  });
  setEl('hist-tbody', fil.length===0
    ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-3)">Nenhum registro</td></tr>`
    : fil.slice(0,50).map(h=>`<tr>
        <td><div class="person-cell"><div class="avatar av-blue">${FF.initials(h.colab.nome)}</div>${priNome(h.colab.nome,3)}</div></td>
        <td><span class="mono">${h.colab.chapa}</span></td>
        <td><span class="badge ${h.tipo==='Indenização'?'badge-warning':'badge-info'}">${h.tipo||'Gozo'}</span></td>
        <td>${FF.fmt(FF.parseDate(h.dataSaida))}</td>
        <td>${h.dataRetorno?FF.fmt(FF.parseDate(h.dataRetorno)):'<span class="badge badge-info">Em folga</span>'}</td>
        <td>${h.destino||'—'}</td>
        <td><span class="chip">${h.colab.obra}</span></td></tr>`).join(''));
}

/* ════════════════════════════════════════════════
   IMPORTAR
════════════════════════════════════════════════ */
function downloadModelo(){
  const headers=['ITEM','CHAPA*','NOME*','FUNÇÃO*','CPF','CIP','DATA ADMISSÃO*','CHEGADA/RETORNO*',
    'PERÍODO*(1=30d 2=60d 3=45d 4=90d 5=Sem)','TEMPO TRABALHO','CIDADE','ESTADO',
    'OBRA/PROJETO','EMPRESA','STATUS','Nº FOLGA ATUAL','DATA SAÍDA FOLGA',
    'DATA RETORNO FOLGA','TIPO FOLGA(Gozo/Indenização)','OBSERVAÇÃO','DESTINO FOLGA','SUPERVISOR'];
  const ex=['1','52991','VALDIR COSTA DE FREITAS','ENCARREGADO DE TURMA','26392976515','UT1.2.21',
    '12/03/2025','12/03/2025','4','75','Silves','AM','LT Norte AM','Azulão Engenharia',
    'Ativo','1','12/04/2026','11/07/2026','Gozo','','São Sebastião do Passé / BA','João Silva'];
  exportCSV(headers,[ex],'Modelo_Importacao_FolgaField_v3.csv');
  showToast('Modelo baixado! Abra no Excel e preencha.','success');
}

function handleUpload(evt){
  const file=evt.target?.files?.[0]||evt.dataTransfer?.files?.[0]; if(!file) return;
  setEl('upload-nome',`Arquivo: ${file.name}`);
  el('upload-preview').style.display='block';
  showToast('Arquivo recebido. Em produção o parser processará automaticamente.','info');
}

/* ════════════════════════════════════════════════
   RELATÓRIOS (CSV + Excel)
════════════════════════════════════════════════ */
function gerarRelatorio(tipo,fmt){
  const hoje=new Date(); let headers=[],rows=[],fname='';
  if(tipo==='vencidas'){
    headers=['Matrícula','Nome','Função','CPF','CIP','Obra','Periodicidade','Vencimento','Status'];
    rows=FF.colaboradores.filter(c=>c.periodoDias&&!c.emFolga&&(FF.diasParaVencer(c)??0)<0)
      .map(c=>[c.chapa,c.nome,c.funcao,FF.fmtCPF(c.cpf),c.cip||'—',c.obra,c.periodoDias+'d',FF.fmt(FF.calcProximaFolga(c)),`Vencida há ${Math.abs(FF.diasParaVencer(c))}d`]);
    fname=`FolgaField_Vencidas_${hoje.toISOString().split('T')[0]}`;
  } else if(tipo==='mensal'){
    const m=hoje.getMonth(),a=hoje.getFullYear();
    const evs=FF.colaboradores.flatMap(c=>(c.historico||[]).map(h=>({...h,c}))).filter(h=>{const d=FF.parseDate(h.dataSaida);return d&&d.getMonth()===m&&d.getFullYear()===a;});
    headers=['Matrícula','Nome','CPF','CIP','Obra','Saída','Retorno','Tipo','Destino','Origem'];
    rows=evs.map(h=>[h.c.chapa,h.c.nome,FF.fmtCPF(h.c.cpf),h.c.cip||'—',h.c.obra,FF.fmt(FF.parseDate(h.dataSaida)),FF.fmt(FF.parseDate(h.dataRetorno)),h.tipo||'Gozo',h.destino||'—',h.origem||'—']);
    fname=`FolgaField_Mensal_${hoje.toISOString().split('T')[0]}`;
  } else {
    headers=['Matrícula','Nome','Função','CPF','CIP','Obra','Periodicidade','Próx.Folga','Status','Qtd.Folgas'];
    rows=FF.colaboradores.map(c=>{const st=FF.statusFolga(c);return[c.chapa,c.nome,c.funcao,FF.fmtCPF(c.cpf),c.cip||'—',c.obra,c.periodoDias+'d',FF.fmt(FF.calcProximaFolga(c)),st.label,c.historico?.length||0];});
    fname=`FolgaField_Completo_${hoje.toISOString().split('T')[0]}`;
  }
  fmt==='xlsx'?exportXLSX(headers,rows,fname+'.xlsx'):exportCSV(headers,rows,fname+'.csv');
  showToast(`Relatório exportado em ${fmt==='xlsx'?'Excel':'CSV'}!`,'success');
}

function exportCSV(headers,rows,filename){
  const bom='\uFEFF';
  const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadBlob(bom+csv,'text/csv;charset=utf-8;',filename);
}
function exportXLSX(headers,rows,filename){
  const bom='\uFEFF';
  let html='<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="UTF-8"></head><body><table>';
  html+=`<tr>${headers.map(h=>`<th style="background:#1A3F6F;color:#fff;font-weight:bold;border:1px solid #ccc;padding:6px">${h}</th>`).join('')}</tr>`;
  rows.forEach(r=>{html+=`<tr>${r.map(c=>`<td style="border:1px solid #ddd;padding:5px">${c}</td>`).join('')}</tr>`;});
  html+='</table></body></html>';
  downloadBlob(bom+html,'application/vnd.ms-excel;charset=utf-8;',filename);
}
function downloadBlob(content,type,filename){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════
   GERAÇÃO DE DOCUMENTOS — PDF fiel ao modelo
════════════════════════════════════════════════ */
let docColabId=null;
function buscarColabDoc(){
  const q=(v('doc-colab')||'').toLowerCase(), s=el('doc-sugestoes');
  if(q.length<2){s.style.display='none';return;}
  const res=FF.colaboradores.filter(c=>c.nome.toLowerCase().includes(q)||c.chapa.includes(q)).slice(0,6);
  s.innerHTML=res.map(c=>`<div class="sugg-item" onclick="selecionarColabDoc(${c.id})">${priNome(c.nome,3)} — <span style="color:var(--text-3)">${c.chapa}</span></div>`).join('');
  s.style.display=res.length?'block':'none';
}
function selecionarColabDoc(id){
  const c=FF.colaboradores.find(x=>x.id===id); if(!c) return;
  docColabId=id;
  el('doc-colab').value=`${c.chapa} — ${c.nome}`;
  el('doc-sugestoes').style.display='none';
  /* Preenche automaticamente */
  const destEl=el('doc-destino');
  if(destEl){ destEl.value=c.cidade&&c.estado?`${c.cidade} / ${c.estado}`:c.cidade||''; }
  const origEl=el('doc-origem');
  if(origEl&&c.obra) origEl.value=OBRAS_CIDADES[c.obra]||'';
}

function gerarDocumento(){
  const c=FF.colaboradores.find(x=>x.id===docColabId);
  if(!c){ showToast('Selecione um colaborador.','error'); return; }
  const tipo=v('doc-tipo'), saida=v('doc-saida'), retorno=v('doc-retorno');
  const origem=v('doc-origem'), destino=v('doc-destino'), valorInden=v('doc-valor-iden')||'';
  if(!saida){ showToast('Informe a data de saída.','error'); return; }
  if(!destino){ showToast('Informe o destino.','error'); return; }

  const isInden=tipo==='Indenização';
  const dataSaidaFmt  = FF.fmt(FF.parseDate(saida));
  const dataRetornoFmt= retorno?FF.fmt(FF.parseDate(retorno)):'';
  const dataEmissao   = FF.fmt(new Date());
  const dataLonga     = FF.fmtLong(new Date());
  const periodoInicio = dataSaidaFmt;
  const periodoFim    = dataRetornoFmt||'__________';
  const valorFmt      = valorInden?`R$ ${Number(valorInden).toLocaleString('pt-BR',{minimumFractionDigits:2})}`:'';

  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${isInden?'Indenização':'Gozo'} — ${c.nome}</title>
<style>
  @page{size:A4 portrait;margin:15mm 15mm 15mm 15mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#000;background:#fff}
  .page{width:180mm;margin:0 auto}
  /* Cabeçalho */
  .cabecalho{width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:6px}
  .cabecalho td{border:1px solid #000;padding:3px 6px;vertical-align:middle}
  .logo-cell{width:42mm;text-align:center;padding:6px!important}
  .logo-brand{font-size:20px;font-weight:900;color:#E07820;letter-spacing:-1px}
  .logo-sub{font-size:9px;color:#E07820;font-weight:bold}
  .titulo-cell{text-align:center;font-size:13px;font-weight:bold;letter-spacing:.5px;padding:8px!important;border-left:1px solid #000}
  .meta-table{width:100%;border-collapse:collapse}
  .meta-table td{padding:2px 5px;font-size:9.5px}
  /* Dados empregado */
  .dados{width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:6px}
  .dados td{border:1px solid #000;padding:4px 7px;font-size:10px}
  .lbl{font-weight:bold}
  /* Período aquisitivo */
  .sec-title{text-align:center;font-weight:bold;font-size:10.5px;border:1px solid #000;
    padding:5px;background:#f0f0f0;margin-bottom:0;letter-spacing:.5px}
  .periodo-box{width:100%;border-collapse:collapse;border:1px solid #000;border-top:none;margin-bottom:6px}
  .periodo-box td{border:1px solid #000;padding:8px 10px;font-size:10px}
  .data-linha{text-align:center;font-size:13px;font-weight:bold}
  .underline{border-bottom:1.5px solid #000;display:inline-block;min-width:75px;padding-bottom:1px;text-align:center}
  /* Autorização */
  .auth-box{width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:8px}
  .auth-box td{border:1px solid #000;padding:6px 10px;font-size:10px;vertical-align:top}
  .checkbox{display:inline-block;width:11px;height:11px;border:1px solid #000;
    text-align:center;line-height:11px;font-size:10px;margin-right:4px;vertical-align:middle}
  /* Corpo */
  .corpo{font-size:10.5px;line-height:1.75;margin:8px 0}
  .ident{font-size:10.5px;line-height:1.75;margin:8px 0}
  .data-local{text-align:right;font-size:10.5px;margin:12px 0 6px}
  /* Assinaturas */
  .assinaturas{width:100%;border-collapse:collapse;margin-top:28px}
  .assinaturas td{text-align:center;font-size:9.5px;width:33%;padding-top:4px;border-top:1px solid #000;vertical-align:top}
  .assin-colab{text-align:center;margin:22px auto 6px;display:block}
  .assin-linha{display:inline-block;border-top:1px solid #000;width:200px;padding-top:4px;font-size:9.5px;font-weight:bold}
</style></head><body>
<div class="page">
  <!-- CABEÇALHO -->
  <table class="cabecalho">
    <tr>
      <td class="logo-cell" rowspan="5">
        <div class="logo-brand">elecnor</div>
        <div class="logo-sub">brasil</div>
      </td>
      <td class="titulo-cell" colspan="2" rowspan="1"><strong>SOLICITAÇÃO DE FOLGA DE CAMPO</strong></td>
    </tr>
    <tr><td colspan="2" style="border:1px solid #000;padding:3px 6px;font-size:9.5px">Código: FI.BRA.GER-04.130A</td></tr>
    <tr><td colspan="2" style="border:1px solid #000;padding:3px 6px;font-size:9.5px">Data: 27/03/2024</td></tr>
    <tr><td colspan="2" style="border:1px solid #000;padding:3px 6px;font-size:9.5px">Revisão: 01</td></tr>
    <tr>
      <td style="border:1px solid #000;padding:3px 6px;font-size:9.5px">Setor: RH</td>
      <td style="border:1px solid #000;padding:3px 6px;font-size:9.5px">Categoria: Geral</td>
    </tr>
  </table>

  <!-- DADOS DO EMPREGADO -->
  <table class="dados">
    <tr>
      <td style="width:60%"><span class="lbl">EMPREGADO:</span> ${c.nome}</td>
      <td><span class="lbl">CHAPA:</span> ${c.chapa}</td>
    </tr>
    <tr>
      <td><span class="lbl">FUNÇÃO:</span> ${c.funcao}</td>
      <td><span class="lbl">CPF:</span> ${FF.fmtCPF(c.cpf)}</td>
    </tr>
    <tr>
      <td><span class="lbl">ADMISSÃO:</span> ${c.dataAdmissao||'—'}</td>
      <td><span class="lbl">CIP:</span> ${c.cip||'—'}</td>
    </tr>
  </table>

  <!-- PERÍODO AQUISITIVO -->
  <div class="sec-title">PERÍODO AQUISITIVO</div>
  <table class="periodo-box">
    <tr>
      <td style="text-align:center;padding:10px">
        <div class="data-linha">
          <span class="underline">${periodoInicio}</span>
          &nbsp;&nbsp; A &nbsp;&nbsp;
          <span class="underline">${periodoFim}</span>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:6px 10px">
        <strong>ORIGEM:</strong> ${origem||'—'}<br>
        <strong>DESTINO:</strong> ${destino||'—'}
      </td>
    </tr>
  </table>

  <!-- AUTORIZAÇÃO -->
  <div class="sec-title">AUTORIZAÇÃO</div>
  <table class="auth-box">
    <tr>
      <td style="width:30px;border-right:1px solid #000">
        <span class="checkbox">${!isInden?'■':' '}</span>
      </td>
      <td>
        <strong>Data de Saída:</strong> ${!isInden?periodoInicio:'_______________________'}
        &nbsp;&nbsp;&nbsp;
        <strong>Data Retorno:</strong> ${!isInden?(dataRetornoFmt||'___________'):'___________'}
      </td>
    </tr>
    <tr>
      <td style="border-right:1px solid #000">
        <span class="checkbox">${isInden?'■':' '}</span>
      </td>
      <td>
        <strong>Indenização de folga de campo</strong><br>
        <strong>Valor Indenizado:</strong>
        ${isInden&&valorFmt?`<span style="border-bottom:1px solid #000;display:inline-block;min-width:120px;padding-bottom:1px">${valorFmt}</span>`:'_________________________________'}
      </td>
    </tr>
  </table>

  <!-- CORPO DO TEXTO -->
  ${isInden?`
  <div class="ident">
    Eu &nbsp;&nbsp;&nbsp;<strong>${c.nome}</strong>&nbsp;&nbsp;&nbsp; portador do CPF ${FF.fmtCPF(c.cpf)}<br>
    venho solicitar a <strong>INDENIZAÇÃO DE MINHA FOLGA</strong> referente ao período aquisitivo descrito acima.
  </div>
  `:`
  <div class="corpo">
    Prezado(a) Sr(a). &nbsp;&nbsp;&nbsp;<strong>${c.nome}</strong><br><br>
    Informamos que durante o período a qual V.S.ª irá visitar sua família, não deverá desempenhar qualquer
    atividade relacionada às suas atividades profissionais.<br><br>
    Por fim, solicitamos que informe à Elecnor do Brasil imediatamente caso venha sofrer algum acidente ou ser
    acometido de alguma doença durante esse período.<br><br>
    Em, &nbsp;&nbsp;${dataEmissao}&nbsp;&nbsp;, o empregado assina o presente comunicado declarando estar de
    acordo com as disposições ora definidas e comprometendo-se a seguir as orientações aqui determinadas pela Elecnor.
  </div>
  `}

  <div class="data-local">${origem||'—'} &nbsp;&nbsp;${dataLonga}</div>

  ${isInden
    ? `<div style="text-align:center;margin:30px 0 8px">
        <span class="assin-linha">ASSINATURA DO FUNCIONÁRIO</span></div>`
    : `<div style="text-align:center;margin:22px 0 8px">
        <span class="assin-linha">ASSINATURA DO FUNCIONÁRIO</span></div>`}

  <!-- RODAPÉ ASSINATURAS -->
  <table class="assinaturas">
    <tr>
      <td>Supervisor</td>
      <td>Departamento Pessoal</td>
      <td>Gestor de Obra</td>
    </tr>
  </table>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

  const win=window.open('','_blank');
  if(!win){ showToast('Permita pop-ups para gerar o documento.','error'); return; }
  win.document.write(html); win.document.close();

  /* Histórico de documentos */
  const tbody=el('doc-historico');
  const primeira=tbody?.querySelector('td[colspan]');
  if(primeira) tbody.innerHTML='';
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><span class="badge badge-info">${tipo}</span></td>
    <td>${priNome(c.nome,3)}</td>
    <td style="font-size:11px">${FF.fmt(new Date())} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
    <td style="font-size:11px">${App.user?.nome||'—'}</td>
    <td><button class="btn-icon" onclick="this.closest('tr').remove()"><i class="ti ti-trash"></i></button></td>`;
  tbody?.insertBefore(tr,tbody.firstChild);
}

/* ════════════════════════════════════════════════
   USUÁRIOS (apenas Admin)
════════════════════════════════════════════════ */
function renderUsuarios(){
  if(!canAdmin()){ showToast('Acesso restrito a Administradores.','error'); navigate('dashboard'); return; }
  const perfis={Administrador:'badge-danger',RH:'badge-warning',Supervisão:'badge-info',Consulta:'badge-gray'};
  setEl('usuarios-tbody', FF.usuarios.map(u=>`<tr>
    <td><div class="person-cell">
      <div class="avatar av-blue" style="${u.ativo===false?'opacity:.4':''}">${FF.initials(u.nome)}</div>
      <div><div class="p-name" style="${u.ativo===false?'color:var(--text-3)':''}">${u.nome}</div>
        <div class="p-role">${u.email}</div></div></div></td>
    <td><span class="badge ${perfis[u.perfil]||'badge-gray'}">${u.perfil}</span></td>
    <td><span class="badge ${u.ativo!==false?'badge-success':'badge-gray'}">${u.ativo!==false?'Ativo':'Inativo'}</span></td>
    <td><div style="display:flex;gap:4px">
      <button class="btn btn-sm" onclick="editarUsuario(${u.id})"><i class="ti ti-edit"></i> Editar</button>
      <button class="btn btn-sm" onclick="toggleAtivoUsuario(${u.id})">${u.ativo!==false?'<i class="ti ti-lock"></i> Desativar':'<i class="ti ti-lock-open"></i> Ativar'}</button>
      ${u.id!==App.user?.id?`<button class="btn-icon" onclick="excluirUsuarioConfirm(${u.id})" title="Excluir"><i class="ti ti-trash"></i></button>`:''}
    </div></td></tr>`).join(''));
}

function abrirNovoUsuario(){
  if(!canAdmin()){ showToast('Sem permissão.','error'); return; }
  App._usuarioEditId=null;
  ['u-nome','u-email','u-senha','u-senha2'].forEach(id=>{const e=el(id);if(e)e.value='';});
  el('u-perfil').value='Consulta';
  el('u-senha-hint').style.display='none';
  setEl('modal-usuario-titulo','Novo usuário');
  openModal('modal-usuario');
}

function editarUsuario(id){
  if(!canAdmin()){ showToast('Sem permissão.','error'); return; }
  const u=FF.usuarios.find(x=>x.id===id); if(!u) return;
  App._usuarioEditId=id;
  el('u-nome').value=u.nome||''; el('u-email').value=u.email||'';
  el('u-senha').value=''; el('u-senha2').value='';
  el('u-perfil').value=u.perfil||'Consulta';
  el('u-senha-hint').style.display='block';
  setEl('modal-usuario-titulo','Editar usuário');
  openModal('modal-usuario');
}

async function salvarUsuario(){
  if(!canAdmin()){ showToast('Sem permissão.','error'); return; }
  const nome=v('u-nome').trim(), email=v('u-email').trim();
  const senha=v('u-senha'), senha2=v('u-senha2'), perfil=v('u-perfil');
  if(!nome||!email){ showToast('Nome e e-mail são obrigatórios.','error'); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showToast('E-mail inválido.','error'); return; }
  if(senha&&senha!==senha2){ showToast('As senhas não coincidem.','error'); return; }
  if(senha&&senha.length<4){ showToast('Senha deve ter pelo menos 4 caracteres.','error'); return; }
  const btn=el('btn-salvar-usuario'); if(btn){btn.disabled=true;btn.textContent='Salvando...';}
  try {
    if(App._usuarioEditId){
      const dados={nome,email,perfil};
      if(senha) dados.senha=senha;
      await FF.updateUsuario(App._usuarioEditId,dados);
    } else {
      if(!senha){ showToast('Informe uma senha para o novo usuário.','error'); return; }
      const existe=FF.usuarios.find(u=>u.email===email);
      if(existe){ showToast('E-mail já cadastrado.','error'); return; }
      await FF.addUsuario({nome,email,perfil,senha});
    }
    App._usuarioEditId=null;
    closeModal('modal-usuario');
    renderUsuarios();
    showToast('Usuário salvo com sucesso!','success');
  } finally {
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Salvar';}
  }
}

function toggleAtivoUsuario(id){
  if(!canAdmin()){ showToast('Sem permissão.','error'); return; }
  const u=FF.usuarios.find(x=>x.id===id); if(!u) return;
  if(u.id===App.user?.id){ showToast('Não é possível desativar o próprio usuário.','error'); return; }
  u.ativo=u.ativo===false;
  renderUsuarios();
  showToast(`Usuário ${u.ativo?'ativado':'desativado'}!`,'info');
}

function excluirUsuarioConfirm(id){
  if(!canAdmin()){ showToast('Sem permissão.','error'); return; }
  const u=FF.usuarios.find(x=>x.id===id); if(!u) return;
  abrirConfirm(
    `Excluir o usuário "${u.nome}"?`,
    'Esta ação não pode ser desfeita.',
    'danger',
    ()=>{ FF.deleteUsuario(id); renderUsuarios(); showToast('Usuário excluído!','success'); }
  );
}

/* ════════════════════════════════════════════════
   MODAL DE CONFIRMAÇÃO
════════════════════════════════════════════════ */
function abrirConfirm(titulo, msg, tipo, callback){
  App._confirmCallback=callback;
  setEl('confirm-titulo',titulo);
  setEl('confirm-msg',msg);
  const btn=el('btn-confirm-ok');
  if(btn){
    btn.className=`btn ${tipo==='danger'?'btn-danger':'btn-primary'}`;
    btn.innerHTML=tipo==='danger'?'<i class="ti ti-trash"></i> Confirmar exclusão':'<i class="ti ti-check"></i> Confirmar';
  }
  openModal('modal-confirm');
}
function executarConfirm(){
  closeModal('modal-confirm');
  App._confirmCallback?.();
  App._confirmCallback=null;
}

/* ════════════════════════════════════════════════
   MODAIS
════════════════════════════════════════════════ */
function openModal(id)  { el(id)?.classList.add('open'); }
function closeModal(id) {
  el(id)?.classList.remove('open');
  if(id==='modal-novo-colab') App._colabEditId=null;
  if(id==='modal-usuario')    App._usuarioEditId=null;
}

function abrirNovoColaborador(){
  if(!canEdit()){ showToast('Sem permissão para cadastrar colaboradores.','error'); return; }
  App._colabEditId=null;
  ['novo-chapa','novo-nome','novo-funcao','novo-empresa','novo-cidade','novo-estado','novo-cpf','novo-cip'].forEach(id=>{const e=el(id);if(e)e.value='';});
  el('novo-periodo').value='60'; el('novo-status').value='Ativo';
  el('novo-obra').value=FF.obras[0]||'';
  el('novo-admissao').value=''; el('novo-apresentacao').value='';
  setEl('modal-colab-titulo','Novo colaborador');
  openModal('modal-novo-colab');
}

/* ════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════ */
function showToast(msg,tipo='success'){
  const t=el('toast');
  const icon={success:'ti-circle-check',info:'ti-info-circle',error:'ti-alert-circle',warning:'ti-alert-triangle'};
  t.innerHTML=`<i class="ti ${icon[tipo]||icon.success}" style="font-size:16px;flex-shrink:0"></i> ${msg}`;
  t.className=`toast toast-${tipo} show`;
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),3500);
}

/* ════════════════════════════════════════════════
   BUSCA GLOBAL
════════════════════════════════════════════════ */
function buscaGlobal(q){
  if(!q||q.length<2) return;
  navigate('colaboradores');
  setTimeout(()=>{const e=el('f-colab-busca');if(e){e.value=q;App.colabPage=1;renderColaboradores();}},80);
}

/* ════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════ */
function el(id)        { return document.getElementById(id); }
function v(id)         { return el(id)?.value||''; }
function setEl(id,val) { const e=el(id); if(!e)return; if(typeof val==='string'&&/<[a-z]/i.test(val))e.innerHTML=val; else e.textContent=val; }
function priNome(nome,n=2){ return (nome||'').trim().split(' ').slice(0,n).join(' '); }

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Enter no login */
  el('login-senha')?.addEventListener('keydown',e=>{ if(e.key==='Enter') login(); });
  el('login-email')?.addEventListener('keydown',e=>{ if(e.key==='Enter') el('login-senha')?.focus(); });

  /* Fechar modais ao clicar fora */
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); });
  });

  /* Busca global */
  el('search-global')?.addEventListener('keydown',e=>{ if(e.key==='Enter') buscaGlobal(e.target.value.trim()); });

  /* Upload drag & drop */
  const zone=el('upload-zone');
  if(zone){
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragging');});
    zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');handleUpload(e);});
    zone.addEventListener('click',()=>el('file-input')?.click());
  }

  /* Mobile sidebar */
  el('sidebar-toggle')?.addEventListener('click',()=>document.querySelector('.sidebar')?.classList.toggle('open'));

  /* Inicializa mês atual nos inputs de mês */
  const hoje=new Date();
  const mesStr=hoje.getFullYear()+'-'+String(hoje.getMonth()+1).padStart(2,'0');
  ['fp-mes','sim-mes'].forEach(id=>{ const e=el(id); if(e&&!e.value) e.value=mesStr; });
});
