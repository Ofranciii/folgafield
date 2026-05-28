/* ============================================================
   FolgaField — data.js  v3.0
   Regras de negócio, dados, cálculo de período aquisitivo
   ============================================================ */
'use strict';

/* ── Periodicidade ── */
const PERIODOS = {
  30: { label: '30 dias', extra2: 5  },
  45: { label: '45 dias', extra2: 9  },
  60: { label: '60 dias', extra2: 9  },
  90: { label: '90 dias', extra2: 9  },
   0: { label: 'Sem direito', extra2: 0 }
};
const PERIODO_MAP = { 1: 30, 2: 60, 3: 45, 4: 90, 5: 0 };

/* ── Status de itinerário ── */
const STATUS_ITINERARIO = [
  { val: 'aguardando',  label: 'Aguardando emissão', cls: 'badge-gray'    },
  { val: 'tratativa',   label: 'Em tratativa',        cls: 'badge-warning' },
  { val: 'emitido',     label: 'Voucher emitido',     cls: 'badge-info'    },
  { val: 'indenizacao', label: 'Indenização aprovada',cls: 'badge-amber'   },
  { val: 'finalizado',  label: 'Finalizado',          cls: 'badge-success' },
];

/* ── Cidade da obra (origem padrão) ── */
const OBRAS_CIDADES = {
  'UHE Sinop MT':   'Sinop / MT',
  'LT Norte AM':    'Silves / AM',
  'PCH Itapiranga': 'Itapiranga / AM',
  'Sub Boa Vista':  'Boa Vista / RR',
  'LT Pará':        'Belém / PA',
};

/* ── Hash simples (SHA-256 via SubtleCrypto — async) ── */
async function hashSenha(senha) {
  if (!senha) return '';
  try {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(senha));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch { return btoa(senha); }   /* fallback se crypto não disponível */
}
async function verificarSenha(senha, hash) {
  return (await hashSenha(senha)) === hash;
}

/* ── Pré-hash das senhas demo (SHA-256 de "1234") ── */
const HASH_1234 = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

const FF = {

  /* ════ Utilitários de data ════ */
  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },
  fmt(date) {
    if (!date) return '—';
    const d = new Date(date);
    return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
  },
  fmtLong(date) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d)) return '—';
    const dias   = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
    const meses  = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  },
  parseDate(str) {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str) ? null : str;
    const p = String(str).split(/[\/\-]/);
    if (p.length !== 3) return null;
    return p[0].length === 4
      ? new Date(`${p[0]}-${p[1]}-${p[2]}`)
      : new Date(`${p[2]}-${p[1]}-${p[0]}`);
  },
  toInputDate(str) {
    if (!str) return '';
    const d = this.parseDate(str);
    if (!d || isNaN(d)) return '';
    return d.toISOString().split('T')[0];
  },
  fmtCPF(cpf) {
    const s = String(cpf || '').replace(/\D/g, '');
    return s.length === 11
      ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : (cpf || '—');
  },

  /* ════ Cálculo de período aquisitivo ════ */
  calcProximaFolga(c) {
    const p = c.periodoDias;
    if (!p) return null;
    const cfg = PERIODOS[p];
    if (!cfg) return null;
    const n = c.historico ? c.historico.length : 0;
    if (n === 0) {
      const a = this.parseDate(c.dataApresentacao);
      return a ? this.addDays(a, p) : null;
    }
    const ult = c.historico[n - 1];
    const ret = this.parseDate(ult.dataRetorno);
    return ret ? this.addDays(ret, p + cfg.extra2) : null;
  },
  diasParaVencer(c) {
    const prox = this.calcProximaFolga(c);
    if (!prox) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    return Math.round((prox - hoje) / 86400000);
  },
  statusFolga(c) {
    if (!c.periodoDias)  return { label: 'Sem direito', cls: 'badge-gray' };
    if (c.emFolga)       return { label: 'Em folga',   cls: 'badge-info' };
    const dias = this.diasParaVencer(c);
    if (dias === null)   return { label: 'Sem dados',   cls: 'badge-gray' };
    if (dias < 0)        return { label: `Vencida há ${Math.abs(dias)}d`, cls: 'badge-danger' };
    if (dias <= 7)       return { label: `Vence em ${dias}d`,             cls: 'badge-danger' };
    if (dias <= 30)      return { label: `Vence em ${dias}d`,             cls: 'badge-warning' };
    return { label: 'Em dia', cls: 'badge-success' };
  },
  initials(nome) {
    const p = (nome || '').trim().split(' ');
    return p.length === 1
      ? p[0].substring(0,2).toUpperCase()
      : (p[0][0] + p[p.length-1][0]).toUpperCase();
  },
  avatarCls(c) {
    const s = this.statusFolga(c);
    if (s.cls === 'badge-danger')  return 'av-red';
    if (s.cls === 'badge-warning') return 'av-amber';
    if (s.cls === 'badge-info')    return 'av-blue';
    return 'av-teal';
  },
  descricaoRegra(periodoDias, numFolga) {
    if (!periodoDias) return 'Sem direito a folga';
    if (numFolga <= 1) return `1ª folga: Data de apresentação + ${periodoDias} dias`;
    const cfg = PERIODOS[periodoDias];
    const ciclo = periodoDias + (cfg ? cfg.extra2 : 0);
    return `${numFolga}ª+ folga: Data retorno anterior + ${periodoDias}d + ${cfg?.extra2||0}d = ${ciclo} dias`;
  },

  /* ════ BANCO DE DADOS EM MEMÓRIA ════ */
  colaboradores: [],   /* Inicia VAZIO — importar via planilha */

  usuarios: [
    { id:1, nome:'João Silva',   email:'joao@azulao.com.br',   perfil:'Administrador', senhaHash: HASH_1234, ativo:true },
    { id:2, nome:'Ana Costa',    email:'ana@azulao.com.br',    perfil:'RH',            senhaHash: HASH_1234, ativo:true },
    { id:3, nome:'Marcos Lima',  email:'marcos@azulao.com.br', perfil:'Supervisão',    senhaHash: HASH_1234, ativo:true },
    { id:4, nome:'Carlos Pinto', email:'carlos@obra.com.br',   perfil:'Consulta',      senhaHash: HASH_1234, ativo:true },
  ],

  obras: ['UHE Sinop MT','LT Norte AM','PCH Itapiranga','Sub Boa Vista','LT Pará'],

  folgasProgramadas: [],   /* { id, colabId, dataSaida, dataRetorno, tipo, origem, destino, obs, statusItinerario, historicoStatus:[], criadoEm } */

  logs: [],   /* auditoria simples: { ts, usuario, acao, detalhe } */

  /* ════ CRUD Colaboradores ════ */
  addColaborador(dados) {
    const id = Math.max(0, ...this.colaboradores.map(c => c.id)) + 1;
    const colab = { id, historico: [], emFolga: false, ...dados };
    this.colaboradores.push(colab);
    return id;
  },
  updateColaborador(id, dados) {
    const idx = this.colaboradores.findIndex(c => c.id === id);
    if (idx >= 0) Object.assign(this.colaboradores[idx], dados);
  },
  deleteColaboradores(ids, usuario) {
    const nomes = this.colaboradores.filter(c => ids.includes(c.id)).map(c => c.nome);
    this.colaboradores = this.colaboradores.filter(c => !ids.includes(c.id));
    this.folgasProgramadas = this.folgasProgramadas.filter(f => !ids.includes(f.colabId));
    this._log(usuario, 'EXCLUSÃO_LOTE', `${ids.length} colaborador(es): ${nomes.join(', ')}`);
  },

  /* ════ CRUD Usuários ════ */
  async addUsuario(dados) {
    const id = Math.max(0, ...this.usuarios.map(u => u.id)) + 1;
    const senhaHash = dados.senha ? await hashSenha(dados.senha) : HASH_1234;
    const { senha, ...resto } = dados;
    this.usuarios.push({ id, ativo: true, senhaHash, ...resto });
    return id;
  },
  async updateUsuario(id, dados) {
    const idx = this.usuarios.findIndex(u => u.id === id);
    if (idx < 0) return;
    if (dados.senha) {
      dados.senhaHash = await hashSenha(dados.senha);
      delete dados.senha;
    }
    Object.assign(this.usuarios[idx], dados);
  },
  deleteUsuario(id) {
    this.usuarios = this.usuarios.filter(u => u.id !== id);
  },
  async autenticar(email, senha) {
    const u = this.usuarios.find(u => u.email === email && u.ativo !== false);
    if (!u) return null;
    /* Suporte legado: senha em texto puro ainda funciona na 1ª vez */
    const hash = await hashSenha(senha);
    if (u.senhaHash === hash) return u;
    /* Fallback para senha em texto puro (migração) */
    if (u.senhaHash === senha) return u;
    return null;
  },

  /* ════ Programação de Folgas ════ */
  programarFolga(dados, usuario) {
    const id = Math.max(0, ...this.folgasProgramadas.map(f => f.id)) + 1;
    const folga = {
      id, statusItinerario: 'aguardando',
      historicoStatus: [{
        status: 'aguardando', label: 'Aguardando emissão',
        obs: 'Folga programada', usuario: usuario || 'Sistema',
        ts: new Date().toISOString()
      }],
      ...dados,
      criadoEm: new Date().toISOString()
    };
    this.folgasProgramadas.push(folga);
    /* Atualiza histórico do colaborador */
    const c = this.colaboradores.find(x => x.id === dados.colabId);
    if (c) {
      if (!c.historico) c.historico = [];
      c.historico.push({
        num: c.historico.length + 1,
        dataSaida:    dados.dataSaida,
        dataRetorno:  dados.dataRetorno || null,
        tipo:         dados.tipo,
        destino:      dados.destino,
        origem:       dados.origem,
        folgaId:      id,
      });
      if (!dados.dataRetorno) c.emFolga = true;
    }
    this._log(usuario, 'FOLGA_PROGRAMADA', `Colab ID ${dados.colabId} — saída ${dados.dataSaida}`);
    return id;
  },

  atualizarStatusItinerario(folgaId, novoStatus, obs, valorIndenizacao, usuario) {
    const f = this.folgasProgramadas.find(x => x.id === folgaId);
    if (!f) return;
    const si = STATUS_ITINERARIO.find(s => s.val === novoStatus);
    f.statusItinerario = novoStatus;
    if (valorIndenizacao !== undefined && valorIndenizacao !== '') f.valorIndenizacao = valorIndenizacao;
    if (!f.historicoStatus) f.historicoStatus = [];
    f.historicoStatus.push({
      status: novoStatus,
      label:  si ? si.label : novoStatus,
      obs:    obs || '',
      usuario: usuario || 'Sistema',
      ts:     new Date().toISOString()
    });
    f.atualizadoEm = new Date().toISOString();
    this._log(usuario, 'STATUS_ITINERARIO', `Folga ${folgaId} → ${novoStatus}`);
  },

  registrarRetorno(colabId, dataRetorno, usuario) {
    const c = this.colaboradores.find(x => x.id === colabId);
    if (!c || !c.historico?.length) return;
    const ult = c.historico[c.historico.length - 1];
    ult.dataRetorno = dataRetorno;
    c.emFolga = false;
    if (ult.folgaId) {
      const fp = this.folgasProgramadas.find(f => f.id === ult.folgaId);
      if (fp) {
        fp.dataRetorno = dataRetorno;
        this.atualizarStatusItinerario(fp.id, 'finalizado', `Retorno em ${dataRetorno}`, undefined, usuario);
      }
    }
    this._log(usuario, 'RETORNO', `Colab ID ${colabId} retornou em ${dataRetorno}`);
  },

  getFolgasMes(ano, mes) {
    return this.folgasProgramadas
      .filter(f => {
        const d = this.parseDate(f.dataSaida);
        return d && d.getFullYear() === ano && d.getMonth() === mes - 1;
      })
      .map(f => ({ ...f, colab: this.colaboradores.find(c => c.id === f.colabId) }))
      .filter(f => f.colab);
  },

  /* ════ Sumários ════ */
  getResumo() {
    let vencidas=0, proximas7=0, proximas30=0, emFolga=0, semDireito=0;
    for (const c of this.colaboradores) {
      if (!c.periodoDias) { semDireito++; continue; }
      if (c.emFolga)      { emFolga++;   continue; }
      const dias = this.diasParaVencer(c);
      if (dias === null) continue;
      if (dias < 0)        vencidas++;
      else if (dias <= 7)  proximas7++;
      else if (dias <= 30) proximas30++;
    }
    return {
      total:     this.colaboradores.length,
      ativos:    this.colaboradores.filter(c => c.status === 'Ativo').length,
      emFolga, vencidas, proximas7, proximas30, semDireito,
      alertas:   vencidas + proximas7
    };
  },
  getPorObra() {
    const map = {};
    for (const c of this.colaboradores) map[c.obra] = (map[c.obra] || 0) + 1;
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  },

  /* ════ Log de auditoria ════ */
  _log(usuario, acao, detalhe) {
    this.logs.push({ ts: new Date().toISOString(), usuario: usuario || '—', acao, detalhe });
    if (this.logs.length > 500) this.logs.shift();
  },
};
