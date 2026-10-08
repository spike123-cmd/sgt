'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Download,
  Search,
  ExternalLink,
  ShieldCheck,
  Building2,
  Users,
  UserCheck,
  Target,
  DollarSign,
  Flame,
  FileSpreadsheet,
  Activity,
  Layers,
  Sparkles,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Info,
  Calendar,
  CalendarRange,
  Filter,
  LayoutGrid,
  List
} from 'lucide-react';
import {
  sanitizarHoras,
  extrairIntervaloMes,
  converterStringParaData,
  verificarAtendimentoNoPeriodo,
  calcularHorasNoPeriodo
} from '@/lib/sgt-sanitizer';

interface Atendimento {
  id_atendimento: string;
  numero_proposta: string;
  titulo_proposta: string;
  status: string;
  status_auditoria: string;
  empresa: string;
  consultor: string;
  horas_previstas: number;
  horas_apropriadas: number;
  avanco_percentual: number;
  saldo_horas: number;
  receita_prevista: number;
  receita_realizada: number;
  saldo_receita: number;
  is_bp: boolean;
  meses_producao?: string[];
  horas_por_mes?: Record<string, number>;
  data_registro?: string;
  data_inicio?: string;
  data_fim?: string;
}

export default function SgtDashboardPage() {
  const [dados, setDados] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [visao, setVisao] = useState<'OPERACIONAL' | 'FINANCEIRO' | 'BP' | 'CALOR'>('OPERACIONAL');

  // Filtros de Período / Date Range (Tarefa 1)
  const [modoData, setModoData] = useState<'MESES' | 'DIAS'>('MESES');
  const [mesInicio, setMesInicio] = useState<string>('TODOS');
  const [mesFim, setMesFim] = useState<string>('TODOS');
  const [dataInicio, setDataInicio] = useState<string>(''); // YYYY-MM-DD
  const [dataFim, setDataFim] = useState<string>(''); // YYYY-MM-DD
  const [atalhoPeriodo, setAtalhoPeriodo] = useState<string>('TODOS');

  // Filtros Operacionais
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [filtroAuditoria, setFiltroAuditoria] = useState('TODOS');
  const [consultoresSelecionados, setConsultoresSelecionados] = useState<string[]>([]);
  const [dropdownConsultoresAberto, setDropdownConsultoresAberto] = useState(false);
  const [buscaConsultorDropdown, setBuscaConsultorDropdown] = useState('');
  const dropdownConsultorRef = useRef<HTMLDivElement>(null);
  const [filtroFaixa, setFiltroFaixa] = useState<'TODOS' | '0-25' | '26-50' | '51-75' | '76-99' | '100'>('TODOS');
  const [busca, setBusca] = useState('');

  // Fechar dropdown de seleção múltipla de consultores ao clicar fora
  useEffect(() => {
    const handleClickFora = (e: MouseEvent | TouchEvent) => {
      if (dropdownConsultorRef.current && !dropdownConsultorRef.current.contains(e.target as Node)) {
        setDropdownConsultoresAberto(false);
      }
    };
    if (dropdownConsultoresAberto) {
      document.addEventListener('mousedown', handleClickFora);
      document.addEventListener('touchstart', handleClickFora);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickFora);
      document.removeEventListener('touchstart', handleClickFora);
    };
  }, [dropdownConsultoresAberto]);

  // Paginação e ordenação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(15);
  const [ordem, setOrdem] = useState<{ campo: keyof Atendimento; asc: boolean }>({
    campo: 'avanco_percentual',
    asc: false
  });
  // Modo de exibição da listagem (Cards touch para mobile / Tabela para desktop)
  const [modoLista, setModoLista] = useState<'AUTO' | 'CARDS' | 'TABELA'>('AUTO');

  // Modal
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<Atendimento | null>(null);

  // Status de Automação & Sincronização
  const [toast, setToast] = useState<string | null>(null);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string>('Base Oficial SGT');
  const [sincronizando, setSincronizando] = useState(false);

  const mostrarToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Interceptar erros de extensões de navegador (ex.: MetaMask, Web3, extensões Chrome)
  useEffect(() => {
    const handleRejection = (e: PromiseRejectionEvent) => {
      const reason = e?.reason;
      const str = (reason?.stack || reason?.message || String(reason || '')).toLowerCase();
      if (
        str.includes('metamask') ||
        str.includes('chrome-extension://') ||
        str.includes('moz-extension://') ||
        str.includes('ethereum') ||
        str.includes('web3')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    const handleError = (e: ErrorEvent) => {
      const str = (e?.error?.stack || e?.message || e?.filename || '').toLowerCase();
      if (
        str.includes('metamask') ||
        str.includes('chrome-extension://') ||
        str.includes('moz-extension://') ||
        str.includes('ethereum') ||
        str.includes('web3')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Normalização de dados recebidos
  const normalizarDadosSgt = React.useCallback((json: any[]): Atendimento[] => {
    return json.map(r => {
      const hp = sanitizarHoras(r.horas_previstas);
      const ha = sanitizarHoras(r.horas_apropriadas);
      const sh = sanitizarHoras(r.saldo_horas !== undefined ? r.saldo_horas : (hp - ha));
      const av = sanitizarHoras(r.avanco_percentual);

      const horasPorMesSanitizado: Record<string, number> = {};
      if (r.horas_por_mes && typeof r.horas_por_mes === 'object') {
        for (const [m, h] of Object.entries(r.horas_por_mes)) {
          horasPorMesSanitizado[m] = sanitizarHoras(h);
        }
      }

      return {
        ...r,
        horas_previstas: hp,
        horas_apropriadas: ha,
        saldo_horas: sh,
        avanco_percentual: av,
        receita_prevista: sanitizarHoras(r.receita_prevista || hp * 181.72),
        receita_realizada: sanitizarHoras(r.receita_realizada || ha * 181.72),
        saldo_receita: sanitizarHoras(r.saldo_receita || sh * 181.72),
        horas_por_mes: horasPorMesSanitizado
      };
    });
  }, []);

  // Sincronização manual acionada pelo usuário
  const executarSincronizacaoManual = async () => {
    setSincronizando(true);
    try {
      const resp = await fetch('/api/dados', { cache: 'no-store' });
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json) && json.length >= 20) {
          setDados(normalizarDadosSgt(json));
          const lastUpdated = resp.headers.get('x-last-updated');
          if (lastUpdated) {
            setUltimaSincronizacao(new Date(lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
          }
          mostrarToast(`Base de dados atualizada! ${json.length} atendimentos carregados.`);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSincronizando(false);
    }
  };

  // Carregar dados na inicialização
  useEffect(() => {
    let cancelado = false;

    async function inicializarDados() {
      try {
        let json: any = null;
        try {
          const resp = await fetch('/api/dados');
          if (resp.ok) {
            json = await resp.json();
            const lastUpdated = resp.headers.get('x-last-updated');
            if (lastUpdated && !cancelado) {
              setUltimaSincronizacao(new Date(lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            }
          }
        } catch (_) {}

        if (!json || !Array.isArray(json) || json.length < 20) {
          const respFallback = await fetch('/dados_sgt.json');
          if (respFallback.ok) {
            json = await respFallback.json();
          }
        }

        if (Array.isArray(json) && json.length >= 20 && !cancelado) {
          setDados(normalizarDadosSgt(json));
        }
      } catch (err) {
        console.error('Erro na carga inicial:', err);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    inicializarDados();

    // Auto-polling suave a cada 60 segundos para receber atualizações do n8n automaticamente
    const interval = setInterval(() => {
      fetch('/api/dados')
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (Array.isArray(json) && json.length >= 20 && !cancelado) {
            setDados(normalizarDadosSgt(json));
          }
        })
        .catch(() => {});
    }, 60000);

    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, [normalizarDadosSgt]);

  // Lista oficial de meses em ordem cronológica
  const listaMesesDisponiveis = useMemo(() => [
    'Jul/2025', 'Ago/2025', 'Set/2025', 'Out/2025', 'Nov/2025', 'Dez/2025',
    'Jan/2026', 'Fev/2026', 'Mar/2026', 'Abr/2026', 'Mai/2026', 'Jun/2026',
    'Jul/2026', 'Ago/2026', 'Set/2026', 'Out/2026'
  ], []);

  // Intervalo de Data Efetivo (Date Range)
  const periodoEfetivo = useMemo(() => {
    if (modoData === 'DIAS') {
      const ini = dataInicio ? converterStringParaData(dataInicio, false) : null;
      const fim = dataFim ? converterStringParaData(dataFim, true) : null;
      let label = 'Todos os dias';
      if (dataInicio && dataFim) {
        label = `${dataInicio.split('-').reverse().join('/')} até ${dataFim.split('-').reverse().join('/')}`;
      } else if (dataInicio) {
        label = `A partir de ${dataInicio.split('-').reverse().join('/')}`;
      } else if (dataFim) {
        label = `Até ${dataFim.split('-').reverse().join('/')}`;
      }
      return { inicio: ini, fim, label, ativo: Boolean(ini || fim) };
    }

    // Modo MESES
    if (mesInicio === 'TODOS' && mesFim === 'TODOS') {
      return { inicio: null, fim: null, label: 'Todos os meses', ativo: false };
    }

    const intIni = mesInicio !== 'TODOS' ? extrairIntervaloMes(mesInicio) : null;
    const intFim = mesFim !== 'TODOS' ? extrairIntervaloMes(mesFim) : null;

    if (mesInicio !== 'TODOS' && mesFim === 'TODOS') {
      return {
        inicio: intIni ? intIni.inicio : null,
        fim: intIni ? intIni.fim : null,
        label: `Mês: ${mesInicio}`,
        ativo: true
      };
    }

    if (mesInicio === 'TODOS' && mesFim !== 'TODOS') {
      return {
        inicio: null,
        fim: intFim ? intFim.fim : null,
        label: `Até ${mesFim}`,
        ativo: true
      };
    }

    return {
      inicio: intIni ? intIni.inicio : null,
      fim: intFim ? intFim.fim : null,
      label: `${mesInicio} até ${mesFim}`,
      ativo: true
    };
  }, [modoData, mesInicio, mesFim, dataInicio, dataFim]);

  // Aplicar atalhos rápidos de período
  const aplicarAtalhoPeriodo = (tipo: string) => {
    setAtalhoPeriodo(tipo);
    setModoData('MESES');
    setPaginaAtual(1);

    if (tipo === 'TODOS') {
      setMesInicio('TODOS');
      setMesFim('TODOS');
      setDataInicio('');
      setDataFim('');
      mostrarToast('Filtro de período limpo: exibindo todos os meses.');
    } else if (tipo === 'SET_2025') {
      setMesInicio('Set/2025');
      setMesFim('Set/2025');
      mostrarToast('Filtro aplicado: Set/2025 (Setembro consolidado).');
    } else if (tipo === 'Q3_2025') {
      setMesInicio('Jul/2025');
      setMesFim('Set/2025');
      mostrarToast('Filtro aplicado: Q3/2025 (Jul a Set/2025).');
    } else if (tipo === 'Q4_2025') {
      setMesInicio('Out/2025');
      setMesFim('Dez/2025');
      mostrarToast('Filtro aplicado: Q4/2025 (Out a Dez/2025).');
    } else if (tipo === 'ANO_2025') {
      setMesInicio('Jul/2025');
      setMesFim('Dez/2025');
      mostrarToast('Filtro aplicado: Ano 2025 Completo.');
    } else if (tipo === 'Q1_2026') {
      setMesInicio('Jan/2026');
      setMesFim('Mar/2026');
      mostrarToast('Filtro aplicado: Q1/2026 (Jan a Mar/2026).');
    } else if (tipo === 'Q2_2026') {
      setMesInicio('Abr/2026');
      setMesFim('Jun/2026');
      mostrarToast('Filtro aplicado: Q2/2026 (Abr a Jun/2026).');
    } else if (tipo === 'Q3_2026') {
      setMesInicio('Jul/2026');
      setMesFim('Set/2026');
      mostrarToast('Filtro aplicado: Q3/2026 (Jul a Set/2026).');
    } else if (tipo === 'ANO_2026') {
      setMesInicio('Jan/2026');
      setMesFim('Out/2026');
      mostrarToast('Filtro aplicado: Ano 2026 Completo.');
    }
  };

  // Lista de Consultores únicos
  const listaConsultores = useMemo(() => {
    const nomes = new Set<string>();
    dados.forEach(d => {
      if (d.consultor && d.consultor !== 'Não Atribuído') nomes.add(d.consultor);
    });
    return Array.from(nomes).sort();
  }, [dados]);

  // Contagem de atendimentos por consultor (na base total)
  const contagemAtendimentosPorConsultor = useMemo(() => {
    const contagem = new Map<string, number>();
    dados.forEach(d => {
      if (d.consultor && d.consultor !== 'Não Atribuído') {
        contagem.set(d.consultor, (contagem.get(d.consultor) || 0) + 1);
      }
    });
    return contagem;
  }, [dados]);

  // Lista Filtrada com Date Range Picker (Tarefa 1)
  const dadosFiltrados = useMemo(() => {
    return dados.filter(item => {
      // Filtro Status
      if (filtroStatus !== 'TODOS' && item.status !== filtroStatus) return false;

      // Filtro Auditoria
      if (filtroAuditoria !== 'TODOS' && item.status_auditoria !== filtroAuditoria) return false;

      // Filtro Consultores (Seleção Múltipla de Nomes)
      if (consultoresSelecionados.length > 0 && !consultoresSelecionados.includes(item.consultor)) return false;

      // TAREFA 1: Filtro de Intervalo de Datas (Date Range)
      if (periodoEfetivo.ativo && (periodoEfetivo.inicio || periodoEfetivo.fim)) {
        const noPeriodo = verificarAtendimentoNoPeriodo(item, periodoEfetivo.inicio, periodoEfetivo.fim);
        if (!noPeriodo) return false;
      }

      // Filtro Faixa de Avanço
      if (filtroFaixa !== 'TODOS') {
        const av = item.avanco_percentual;
        if (filtroFaixa === '0-25' && (av < 0 || av > 25)) return false;
        if (filtroFaixa === '26-50' && (av <= 25 || av > 50)) return false;
        if (filtroFaixa === '51-75' && (av <= 50 || av > 75)) return false;
        if (filtroFaixa === '76-99' && (av <= 75 || av >= 100)) return false;
        if (filtroFaixa === '100' && av < 100) return false;
      }

      // Busca Textual
      if (busca.trim()) {
        const q = busca.toLowerCase().trim();
        const texto = `${item.id_atendimento} ${item.numero_proposta} ${item.empresa} ${item.consultor} ${item.titulo_proposta}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }

      return true;
    });
  }, [dados, filtroStatus, filtroAuditoria, consultoresSelecionados, periodoEfetivo, filtroFaixa, busca]);

  // Dados Ordenados
  const dadosOrdenados = useMemo(() => {
    return [...dadosFiltrados].sort((a, b) => {
      const vA = a[ordem.campo] ?? '';
      const vB = b[ordem.campo] ?? '';
      if (typeof vA === 'number' && typeof vB === 'number') {
        return ordem.asc ? vA - vB : vB - vA;
      }
      return ordem.asc
        ? String(vA).localeCompare(String(vB))
        : String(vB).localeCompare(String(vA));
    });
  }, [dadosFiltrados, ordem]);

  // Paginação
  const totalPaginas = Math.ceil(dadosOrdenados.length / itensPorPagina) || 1;
  const dadosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return dadosOrdenados.slice(inicio, inicio + itensPorPagina);
  }, [dadosOrdenados, paginaAtual, itensPorPagina]);

  // Métricas Consolidadas
  const metricas = useMemo(() => {
    let horasPrev = 0;
    let horasAprop = 0;
    let receitaPrev = 0;
    let receitaReal = 0;
    let emExecucao = 0;
    let concluidos = 0;
    let totalBp = 0;
    let bpMicro = 0;
    let bpEpp = 0;
    let bpMe = 0;
    let bpOutros = 0;
    let aguardandoGet = 0;

    dadosFiltrados.forEach(d => {
      // Se período estiver selecionado, calcula horas no período para precisão executiva (Tarefa 1 & 2)
      const horasApropNoPeriodo = (periodoEfetivo.ativo && (periodoEfetivo.inicio || periodoEfetivo.fim))
        ? calcularHorasNoPeriodo(d, periodoEfetivo.inicio, periodoEfetivo.fim)
        : d.horas_apropriadas;

      horasPrev += d.horas_previstas;
      horasAprop += horasApropNoPeriodo;
      receitaPrev += d.receita_prevista || d.horas_previstas * 181.72;
      receitaReal += (periodoEfetivo.ativo && (periodoEfetivo.inicio || periodoEfetivo.fim))
        ? (horasApropNoPeriodo * 181.72)
        : (d.receita_realizada || d.horas_apropriadas * 181.72);

      if (d.status === 'Concluído') concluidos++;
      if (d.status === 'Aceito/Em execução') emExecucao++;

      if (d.is_bp) {
        totalBp++;
        if (d.horas_previstas === 76) bpMicro++;
        else if (d.horas_previstas === 106) bpEpp++;
        else if (d.horas_previstas === 116) bpMe++;
        else bpOutros++;
      }

      // Alerta 23 atendimentos com 100% de avanço ainda não concluídos (aguardando encerramento GET)
      if (d.avanco_percentual >= 100 && d.status !== 'Concluído') {
        aguardandoGet++;
      }
    });

    const saldoHoras = Math.round(horasPrev - horasAprop);
    const avancoGlobal = horasPrev > 0 ? ((horasAprop / horasPrev) * 100).toFixed(1) : '0';

    return {
      total: dadosFiltrados.length,
      horasPrev: Math.round(horasPrev),
      horasAprop: Math.round(horasAprop),
      saldoHoras,
      avancoGlobal,
      receitaPrev: Math.round(receitaPrev),
      receitaReal: Math.round(receitaReal),
      saldoReceita: Math.round(receitaPrev - receitaReal),
      emExecucao,
      concluidos,
      totalBp,
      bpMicro,
      bpEpp,
      bpMe,
      bpOutros,
      aguardandoGet
    };
  }, [dadosFiltrados, periodoEfetivo]);

  // Mapa de Calor Consultores
  const mapaCalor = useMemo(() => {
    const mapa: Record<string, { total: number; execucao: number; concluidos: number; horas: number }> = {};
    dados.forEach(d => {
      const cons = d.consultor && d.consultor !== 'Não Atribuído' ? d.consultor : 'Não Atribuído';
      if (!mapa[cons]) {
        mapa[cons] = { total: 0, execucao: 0, concluidos: 0, horas: 0 };
      }
      mapa[cons].total++;
      if (d.status === 'Aceito/Em execução') mapa[cons].execucao++;
      if (d.status === 'Concluído') mapa[cons].concluidos++;
      mapa[cons].horas += d.horas_apropriadas;
    });

    return Object.entries(mapa)
      .map(([nome, info]) => ({ nome, ...info }))
      .sort((a, b) => b.execucao - a.execucao || b.horas - a.horas);
  }, [dados]);

  // Resetar Filtros
  const resetarFiltros = () => {
    setModoData('MESES');
    setMesInicio('TODOS');
    setMesFim('TODOS');
    setDataInicio('');
    setDataFim('');
    setAtalhoPeriodo('TODOS');
    setFiltroStatus('TODOS');
    setFiltroAuditoria('TODOS');
    setConsultoresSelecionados([]);
    setBuscaConsultorDropdown('');
    setFiltroFaixa('TODOS');
    setBusca('');
    setPaginaAtual(1);
    mostrarToast('Filtros limpos. Exibindo base completa.');
  };

  // Filtrar 23 Atendimentos Aguardando GET
  const filtrarAguardandoGet = () => {
    setFiltroStatus('Aceito/Em execução');
    setFiltroFaixa('100');
    setBusca('');
    setVisao('BP');
    mostrarToast('Filtrados atendimentos com 100% de avanço aguardando encerramento no GET.');
  };

  // Filtrar Consultor Direto (Exclusivo)
  const filtrarConsultorDireto = (nome: string) => {
    setConsultoresSelecionados([nome]);
    setPaginaAtual(1);
    setVisao('OPERACIONAL');
    mostrarToast(`Filtrando exclusivamente: ${nome}. Você pode adicionar outros nomes no filtro.`);
  };

  // Alternar Consultor na Seleção Múltipla
  const alternarConsultorNaSelecao = (nome: string) => {
    setConsultoresSelecionados(prev => {
      const existe = prev.includes(nome);
      if (existe) {
        return prev.filter(c => c !== nome);
      } else {
        return [...prev, nome];
      }
    });
    setPaginaAtual(1);
  };

  // Exportar CSV
  const exportarCSV = () => {
    let csv = 'ID;Proposta;Empresa;Consultor;Status;Auditoria;Horas Previstas;Horas Apropriadas;Avanco;Saldo\n';
    dadosFiltrados.forEach(d => {
      csv += `"${d.id_atendimento}";"${d.numero_proposta}";"${d.empresa}";"${d.consultor}";"${d.status}";"${d.status_auditoria}";${d.horas_previstas};${d.horas_apropriadas};${d.avanco_percentual}%;${d.saldo_horas}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGT_Atendimentos_${visao}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('Arquivo CSV gerado e baixado!');
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* HEADER PRINCIPAL */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md ${darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight truncate">SGT Analytics & Produção</h1>
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="hidden xs:inline">SGT Ativo</span>
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">SENAI-MG / FIEMG • Gestão & Rentabilidade</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Botão Sincronizar */}
            <button
              onClick={executarSincronizacaoManual}
              disabled={sincronizando}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition disabled:opacity-50"
              title="Recarregar dados atualizados do SGT"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{sincronizando ? 'Atualizando...' : `Atualizar Dados (${ultimaSincronizacao})`}</span>
              <span className="md:hidden">{sincronizando ? '...' : ultimaSincronizacao}</span>
            </button>

            {/* Exportar CSV */}
            <button
              onClick={exportarCSV}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
              title="Exportar seleção atual para CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>

            {/* Resetar Filtros */}
            <button
              onClick={resetarFiltros}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
              title="Resetar filtros"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>

            {/* Alternar Modo Escuro */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-1.5 sm:p-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
              title="Alternar tema"
              aria-label="Alternar tema"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* ABAS DE VISÃO EXECUTIVA */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-1 sm:gap-2 border-t border-slate-100 dark:border-slate-800 pt-1.5 sm:pt-2 overflow-x-auto no-scrollbar scroll-smooth">
          {[
            { id: 'OPERACIONAL', label: 'Operacional & Horas', icon: Clock },
            { id: 'FINANCEIRO', label: 'Receita & Faturamento', icon: DollarSign },
            { id: 'BP', label: 'Brasil Mais Produtivo (B+P)', icon: Target },
            { id: 'CALOR', label: 'Mapa de Calor Consultores', icon: Flame }
          ].map(tab => {
            const Icon = tab.icon;
            const ativo = visao === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setVisao(tab.id as any)}
                className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition whitespace-nowrap shrink-0 ${
                  ativo
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{tab.label}</span>
                {tab.id === 'BP' && metricas.aguardandoGet > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                    {metricas.aguardandoGet}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        
        {/* HERO BANNER EXECUTIVO */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-4 sm:p-6 lg:p-7 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-4xl">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-[10px] sm:text-xs">
              <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-200 font-semibold border border-blue-400/20">
                Base Oficial SGT CNI
              </span>
              <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 font-semibold border border-emerald-400/20">
                {dados.length} Atendimentos Cadastrados
              </span>
              <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-semibold border border-purple-400/20">
                38 Consultores Técnicos Ativos
              </span>
              <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 font-semibold border border-indigo-400/20">
                Sincronização Diária 23:00
              </span>
            </div>

            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold mt-2 sm:mt-2.5 leading-snug">
              {visao === 'OPERACIONAL' && 'Visão Executiva: Ocupação, Status, Alocação & Avanço'}
              {visao === 'FINANCEIRO' && 'Visão Financeira: Receita Orçada vs. Realizada & Ticket'}
              {visao === 'BP' && 'Programa Brasil Mais Produtivo: Portes, Horas e Encerramento'}
              {visao === 'CALOR' && 'Mapa de Calor: Carga de Trabalho dos Consultores Técnicos'}
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Acompanhamento contínuo de produção técnica SENAI-MG, conformidade com auditoria DR e automação de ingestão do portal SGT CNI.
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-white/10 text-xs text-slate-200">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 sm:bg-transparent min-w-0">
                <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase truncate">Carteira Atual</p>
                  <p className="font-bold text-xs sm:text-sm truncate">{metricas.total} atendimentos</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 sm:bg-transparent min-w-0">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase truncate">Horas Produzidas</p>
                  <p className="font-bold text-xs sm:text-sm truncate">{metricas.horasAprop.toLocaleString('pt-BR')} h</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 sm:bg-transparent min-w-0">
                <TrendingUp className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase truncate">Avanço Global</p>
                  <p className="font-bold text-xs sm:text-sm truncate">{metricas.avancoGlobal}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 sm:bg-transparent min-w-0">
                <DollarSign className="w-4 h-4 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase truncate">Receita Realizada</p>
                  <p className="font-bold text-xs sm:text-sm truncate">R$ {metricas.receitaReal.toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ALERTA DOS 23 ATENDIMENTOS B+P COM 100% DE HORAS */}
        {metricas.aguardandoGet > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              darkMode
                ? 'bg-amber-950/30 border-amber-800/60 text-amber-200'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold">
                  Atenção Operacional: {metricas.aguardandoGet} atendimentos com 100% de horas apropriadas
                </p>
                <p className="text-xs opacity-90">
                  Estes projetos concluíram todas as horas estimadas mas ainda figuram em status ativo no sistema aguardando encerramento pelo GET.
                </p>
              </div>
            </div>
            <button
              onClick={filtrarAguardandoGet}
              className="w-full sm:w-auto px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-sm shrink-0 flex items-center justify-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5" />
              <span>Ver os 23 Atendimentos</span>
            </button>
          </motion.div>
        )}

        {/* PAINEL DE FILTROS ESTRUTURADOS COM DATE RANGE PICKER (TAREFA 1) */}
        <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CalendarRange className="w-4 h-4 text-blue-600" />
              <span>Filtros Estruturados & Seletor de Intervalo (Date Range)</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {periodoEfetivo.ativo && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold text-[11px]">
                  <Calendar className="w-3 h-3" />
                  <span>{periodoEfetivo.label}</span>
                  <button
                    onClick={() => aplicarAtalhoPeriodo('TODOS')}
                    className="hover:text-red-600 font-bold ml-1"
                    title="Limpar filtro de data"
                  >
                    ✕
                  </button>
                </span>
              )}
              <span>
                Exibindo <strong>{dadosFiltrados.length}</strong> de <strong>{dados.length}</strong> registros
              </span>
            </div>
          </div>

          {/* COMPONENTE DATE RANGE PICKER (TAREFA 1) */}
          <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50/80 border-slate-200'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  Intervalo Temporal:
                </span>
                <div className="inline-flex rounded-lg p-0.5 bg-slate-200 dark:bg-slate-700 text-[11px]">
                  <button
                    type="button"
                    onClick={() => { setModoData('MESES'); setPaginaAtual(1); }}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${
                      modoData === 'MESES'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    Faixa de Meses
                  </button>
                  <button
                    type="button"
                    onClick={() => { setModoData('DIAS'); setPaginaAtual(1); }}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${
                      modoData === 'DIAS'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    Dias Específicos (DD/MM)
                  </button>
                </div>
              </div>

              {/* Atalhos Rápidos de Período */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-slate-400 text-[10px] uppercase font-bold mr-1">Atalhos:</span>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo('TODOS')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    atalhoPeriodo === 'TODOS' && !periodoEfetivo.ativo
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo('SET_2025')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition flex items-center gap-1 ${
                    atalhoPeriodo === 'SET_2025'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                  }`}
                  title="Verificar o mês de setembro corrigido (5.402h)"
                >
                  <span>🎯 Set/2025</span>
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo('Q3_2025')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    atalhoPeriodo === 'Q3_2025'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Q3/2025
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo('Q4_2025')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    atalhoPeriodo === 'Q4_2025'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Q4/2025
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo('ANO_2025')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    atalhoPeriodo === 'ANO_2025'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Ano 2025
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo('Q1_2026')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    atalhoPeriodo === 'Q1_2026'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Q1/2026
                </button>
                <button
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo('ANO_2026')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    atalhoPeriodo === 'ANO_2026'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Ano 2026
                </button>
              </div>
            </div>

            {/* Inputs de Data por Modo */}
            {modoData === 'MESES' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    De (Mês Inicial):
                  </label>
                  <select
                    value={mesInicio}
                    onChange={e => {
                      setMesInicio(e.target.value);
                      setAtalhoPeriodo('CUSTOM');
                      setPaginaAtual(1);
                    }}
                    className={`w-full text-xs rounded-lg p-2 border font-medium ${
                      darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                    }`}
                  >
                    <option value="TODOS">Todos os Meses Iniciais</option>
                    {listaMesesDisponiveis.map(m => (
                      <option key={`ini-${m}`} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Até (Mês Final):
                  </label>
                  <select
                    value={mesFim}
                    onChange={e => {
                      setMesFim(e.target.value);
                      setAtalhoPeriodo('CUSTOM');
                      setPaginaAtual(1);
                    }}
                    className={`w-full text-xs rounded-lg p-2 border font-medium ${
                      darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                    }`}
                  >
                    <option value="TODOS">Todos os Meses Finais</option>
                    {listaMesesDisponiveis.map(m => (
                      <option key={`fim-${m}`} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Data Inicial (Dia/Mês/Ano):
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={e => {
                      setDataInicio(e.target.value);
                      setAtalhoPeriodo('CUSTOM');
                      setPaginaAtual(1);
                    }}
                    className={`w-full text-xs rounded-lg p-2 border font-medium ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Data Final (Dia/Mês/Ano):
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={e => {
                      setDataFim(e.target.value);
                      setAtalhoPeriodo('CUSTOM');
                      setPaginaAtual(1);
                    }}
                    className={`w-full text-xs rounded-lg p-2 border font-medium ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* DEMAIS FILTROS OPERACIONAIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filtro Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Status Atendimento</label>
              <select
                value={filtroStatus}
                onChange={e => { setFiltroStatus(e.target.value); setPaginaAtual(1); }}
                className={`w-full text-xs rounded-lg p-2 border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-300'}`}
              >
                <option value="TODOS">Todos os Status</option>
                <option value="Aceito/Em execução">Aceito / Em execução</option>
                <option value="Concluído">Concluído</option>
                <option value="Aceito/Contratado">Aceito / Contratado</option>
              </select>
            </div>

            {/* Filtro Auditoria */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Status de Auditoria</label>
              <select
                value={filtroAuditoria}
                onChange={e => { setFiltroAuditoria(e.target.value); setPaginaAtual(1); }}
                className={`w-full text-xs rounded-lg p-2 border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-300'}`}
              >
                <option value="TODOS">Todas as Auditorias</option>
                <option value="Sem Auditoria / Regular">Sem Auditoria / Regular</option>
                <option value="Análise concluída pelo Auditor DR">Análise concluída (Auditor DR)</option>
                <option value="Aguardando análise do Auditor DR">Aguardando análise (Auditor DR)</option>
                <option value="Aguardando ajustes no atendimento">Aguardando ajustes</option>
              </select>
            </div>

            {/* Filtro Consultor - Seleção Múltipla de Nomes */}
            <div className="relative" ref={dropdownConsultorRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Consultores ({consultoresSelecionados.length === 0 ? 'Todos' : consultoresSelecionados.length})
                </label>
                {consultoresSelecionados.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConsultoresSelecionados([]);
                      setPaginaAtual(1);
                    }}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Botão Gatilho com Suporte a Vários Nomes */}
              <button
                type="button"
                onClick={() => setDropdownConsultoresAberto(prev => !prev)}
                className={`w-full text-xs rounded-lg p-2 border flex items-center justify-between gap-1.5 transition text-left cursor-pointer ${
                  consultoresSelecionados.length > 0
                    ? darkMode
                      ? 'bg-blue-950/40 border-blue-500 text-blue-200 ring-1 ring-blue-500/30'
                      : 'bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-400/20'
                    : darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
                title="Clique para selecionar um ou múltiplos nomes"
                aria-expanded={dropdownConsultoresAberto}
              >
                <div className="flex items-center gap-1.5 truncate min-w-0">
                  <Users className={`w-3.5 h-3.5 shrink-0 ${consultoresSelecionados.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  <span className="truncate font-medium">
                    {consultoresSelecionados.length === 0
                      ? `Todos os Consultores (${listaConsultores.length})`
                      : consultoresSelecionados.length === 1
                      ? consultoresSelecionados[0]
                      : `${consultoresSelecionados.length} nomes selecionados`}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {consultoresSelecionados.length > 1 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white leading-none">
                      {consultoresSelecionados.length}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${dropdownConsultoresAberto ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Menu Popover Flutuante */}
              <AnimatePresence>
                {dropdownConsultoresAberto && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute z-50 left-0 sm:-left-4 right-0 sm:right-auto sm:w-80 mt-1.5 rounded-xl border shadow-2xl p-2.5 backdrop-blur-md ${
                      darkMode ? 'bg-slate-900/95 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-800'
                    }`}
                  >
                    {/* Cabeçalho do Popover */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {consultoresSelecionados.length === 0
                          ? `Todos ativos (${listaConsultores.length})`
                          : `${consultoresSelecionados.length} de ${listaConsultores.length} selecionados`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setConsultoresSelecionados([...listaConsultores]);
                            setPaginaAtual(1);
                          }}
                          className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1 py-0.5"
                        >
                          Marcar Todos
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            setConsultoresSelecionados([]);
                            setPaginaAtual(1);
                          }}
                          className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-1 py-0.5"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {/* Campo de Busca Rápida de Nomes */}
                    <div className="relative mb-2">
                      <input
                        type="text"
                        placeholder="Buscar consultor por nome..."
                        value={buscaConsultorDropdown}
                        onChange={e => setBuscaConsultorDropdown(e.target.value)}
                        className={`w-full text-xs rounded-lg py-1.5 pl-7 pr-7 border ${
                          darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                        autoFocus
                      />
                      <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
                      {buscaConsultorDropdown && (
                        <button
                          type="button"
                          onClick={() => setBuscaConsultorDropdown('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Lista com Checkboxes e Contadores */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1 text-xs">
                      {listaConsultores
                        .filter(nome => nome.toLowerCase().includes(buscaConsultorDropdown.toLowerCase()))
                        .map(nome => {
                          const selecionado = consultoresSelecionados.includes(nome);
                          const totalAtend = contagemAtendimentosPorConsultor.get(nome) || 0;
                          return (
                            <button
                              type="button"
                              key={nome}
                              onClick={() => alternarConsultorNaSelecao(nome)}
                              className={`w-full flex items-center justify-between gap-2 p-2 rounded-lg text-left transition cursor-pointer ${
                                selecionado
                                  ? darkMode
                                    ? 'bg-blue-950/70 text-blue-200 border border-blue-800/60'
                                    : 'bg-blue-50 text-blue-900 border border-blue-200 font-semibold'
                                  : darkMode
                                  ? 'hover:bg-slate-800 text-slate-300'
                                  : 'hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                                  selecionado
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : darkMode
                                    ? 'border-slate-600 bg-slate-800'
                                    : 'border-slate-300 bg-white'
                                }`}>
                                  {selecionado && <Check className="w-3 h-3 stroke-[3]" />}
                                </span>
                                <span className="truncate">{nome}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0 font-normal">
                                {totalAtend} {totalAtend === 1 ? 'atend.' : 'atend.'}
                              </span>
                            </button>
                          );
                        })}

                      {listaConsultores.filter(nome => nome.toLowerCase().includes(buscaConsultorDropdown.toLowerCase())).length === 0 && (
                        <div className="p-3 text-center text-slate-400 text-xs">
                          Nenhum consultor encontrado com &quot;{buscaConsultorDropdown}&quot;.
                        </div>
                      )}
                    </div>

                    {/* Rodapé do Popover */}
                    <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        {consultoresSelecionados.length === 0
                          ? 'Mostrando todos'
                          : `${consultoresSelecionados.length} pessoa(s) no filtro`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDropdownConsultoresAberto(false)}
                        className="px-3 py-1 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                      >
                        Pronto
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Busca ID / Proposta / Cliente */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Busca Textual</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="ID, Proposta, Empresa..."
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setPaginaAtual(1); }}
                  className={`w-full text-xs rounded-lg p-2 pl-7 border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-300'}`}
                />
                <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Tags de Consultores Selecionados */}
          {consultoresSelecionados.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Pessoas selecionadas ({consultoresSelecionados.length}):
              </span>
              {consultoresSelecionados.map(nome => (
                <span
                  key={nome}
                  className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-xs"
                >
                  <span className="max-w-[160px] truncate">{nome}</span>
                  <button
                    type="button"
                    onClick={() => alternarConsultorNaSelecao(nome)}
                    className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full transition cursor-pointer"
                    title={`Remover ${nome} da seleção`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setConsultoresSelecionados([]);
                  setPaginaAtual(1);
                  mostrarToast('Filtro de consultores redefinido para todos.');
                }}
                className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline ml-1 cursor-pointer"
              >
                Limpar todos os nomes
              </button>
            </div>
          )}

          {/* Faixas Rápidas de Avanço */}
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Faixa de Avanço:</span>
            {[
              { id: 'TODOS', label: 'Todas as Faixas' },
              { id: '0-25', label: '0 a 25%' },
              { id: '26-50', label: '26 a 50%' },
              { id: '51-75', label: '51 a 75%' },
              { id: '76-99', label: '76 a 99%' },
              { id: '100', label: '100% Concluído' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => { setFiltroFaixa(f.id as any); setPaginaAtual(1); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                  filtroFaixa === f.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* SEÇÃO DINÂMICA DE ACORDO COM A ABA SELECIONADA */}

        {/* 1. ABA OPERACIONAL */}
        {visao === 'OPERACIONAL' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-blue-600 font-bold uppercase">
                  <span>Atendimentos</span>
                  <Layers className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2 truncate">{metricas.total}</div>
                <p className="text-xs text-slate-500 mt-1 truncate">{metricas.emExecucao} em execução • {metricas.concluidos} concluídos</p>
              </div>

              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-emerald-600 font-bold uppercase">
                  <span>Horas Produzidas</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2 truncate">{metricas.horasAprop.toLocaleString('pt-BR')} h</div>
                <p className="text-xs text-slate-500 mt-1 truncate">Horas orçadas: {metricas.horasPrev.toLocaleString('pt-BR')} h</p>
              </div>

              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-amber-600 font-bold uppercase">
                  <span>Saldo a Executar</span>
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2 truncate">{metricas.saldoHoras.toLocaleString('pt-BR')} h</div>
                <p className="text-xs text-slate-500 mt-1 truncate">Horas restantes em carteira ativa</p>
              </div>

              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-indigo-600 font-bold uppercase">
                  <span>Avanço Médio Global</span>
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2">{metricas.avancoGlobal}%</div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full"
                    style={{ width: `${Math.min(parseFloat(metricas.avancoGlobal), 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. ABA FINANCEIRO */}
        {visao === 'FINANCEIRO' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-emerald-600 font-bold uppercase">
                  <span>Receita Realizada</span>
                  <DollarSign className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2 truncate text-emerald-600 dark:text-emerald-400">R$ {metricas.receitaReal.toLocaleString('pt-BR')}</div>
                <p className="text-xs text-slate-500 mt-1 truncate">Produção técnica apropriada</p>
              </div>

              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-blue-600 font-bold uppercase">
                  <span>Receita Prevista Total</span>
                  <DollarSign className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2 truncate">R$ {metricas.receitaPrev.toLocaleString('pt-BR')}</div>
                <p className="text-xs text-slate-500 mt-1 truncate">Valor integral dos contratos SGT</p>
              </div>

              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-amber-600 font-bold uppercase">
                  <span>Saldo a Faturar</span>
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2 truncate text-amber-600 dark:text-amber-400">R$ {metricas.saldoReceita.toLocaleString('pt-BR')}</div>
                <p className="text-xs text-slate-500 mt-1 truncate">Receita futura a apropriar</p>
              </div>

              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs text-indigo-600 font-bold uppercase">
                  <span>Valor Homologado / Hora</span>
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-2 truncate">R$ 181,72</div>
                <p className="text-xs text-slate-500 mt-1 truncate">Tarifa técnica padrão SGT CNI</p>
              </div>
            </div>
          </div>
        )}

        {/* 3. ABA BRASIL MAIS PRODUTIVO (B+P) */}
        {visao === 'BP' && (
          <div className="space-y-4 sm:space-y-6">
            <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-emerald-600 shrink-0" />
                <h3 className="text-sm sm:text-base font-bold">Matriz de Portes: Programa Brasil Mais Produtivo (B+P)</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className={`p-3.5 sm:p-4 rounded-xl border ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-emerald-50/50 border-emerald-100'}`}>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Microempresa (76h)</p>
                  <p className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{metricas.bpMicro}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Pacote Lean 76 horas</p>
                </div>

                <div className={`p-3.5 sm:p-4 rounded-xl border ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-blue-50/50 border-blue-100'}`}>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Pequena Empresa - EPP (106h)</p>
                  <p className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{metricas.bpEpp}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Pacote Lean 106 horas</p>
                </div>

                <div className={`p-3.5 sm:p-4 rounded-xl border ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-purple-50/50 border-purple-100'}`}>
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Média Empresa (116h)</p>
                  <p className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{metricas.bpMe}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Pacote Lean 116 horas</p>
                </div>

                <div className={`p-3.5 sm:p-4 rounded-xl border ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Demais Cargas B+P</p>
                  <p className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{metricas.bpOutros}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Projetos especiais / outros pacotes</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-slate-500">
                <span>Total de Atendimentos no Escopo B+P: <strong>{metricas.totalBp}</strong></span>
                <span>Aceitação Contratada pós-jan/2026: <strong>Monitorada</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* 4. ABA MAPA DE CALOR CONSULTORES */}
        {visao === 'CALOR' && (
          <div className="space-y-4">
            <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Flame className="w-5 h-5 text-amber-500" />
                    <span>Ocupação & Carga dos 38 Consultores Técnicos</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Classificação por projetos em execução simultânea: 🟢 Normal (1-2) • 🟡 Moderado (3-4) • 🔴 Crítico (5+)
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">1-2 Disp.</span>
                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold">3-4 Moderado</span>
                  <span className="px-2 py-1 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-semibold">5+ Sobrecarga</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mapaCalor.map(cons => {
                  let badgeCor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200';
                  let statusTexto = 'Normal';
                  if (cons.execucao >= 5) {
                    badgeCor = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200';
                    statusTexto = 'Crítico';
                  } else if (cons.execucao >= 3) {
                    badgeCor = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200';
                    statusTexto = 'Moderado';
                  }

                  const isSelecionado = consultoresSelecionados.includes(cons.nome);

                  return (
                    <div
                      key={cons.nome}
                      className={`p-3.5 rounded-xl border transition ${
                        isSelecionado
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/30 shadow-md'
                          : darkMode
                          ? 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold truncate block">{cons.nome}</span>
                          {isSelecionado && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                              <Check className="w-3 h-3" /> No filtro atual
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeCor} shrink-0`}>
                          {cons.execucao} em exec.
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                        <span>Total: {cons.total} atendimentos</span>
                        <span>{cons.horas.toLocaleString('pt-BR')} h produzidas</span>
                      </div>

                      {/* Ações de Seleção de Pessoa */}
                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => filtrarConsultorDireto(cons.nome)}
                          className="px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition cursor-pointer"
                          title="Filtrar exclusivamente este consultor"
                        >
                          Apenas este
                        </button>
                        <button
                          type="button"
                          onClick={() => alternarConsultorNaSelecao(cons.nome)}
                          className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                            isSelecionado
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-200'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-200'
                          }`}
                          title={isSelecionado ? 'Remover da seleção múltipla' : 'Adicionar à seleção múltipla'}
                        >
                          {isSelecionado ? 'Remover' : '+ Adicionar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TABELA E CARTOES DE ATENDIMENTOS (COMPLETO E TOTALMENTE RESPONSIVO) */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="p-3.5 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Detalhamento dos Atendimentos SGT ({dadosFiltrados.length})</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Toque ou clique em qualquer atendimento para visualizar o dossiê completo.</p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-between sm:justify-end text-xs">
              {/* Seletor de Modo de Exibição */}
              <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-[11px]">
                <button
                  type="button"
                  onClick={() => setModoLista('AUTO')}
                  className={`px-2 py-1 rounded-md font-semibold transition ${
                    modoLista === 'AUTO'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Automático: Cartões no celular, Tabela no computador"
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setModoLista('CARDS')}
                  className={`px-2 py-1 rounded-md font-semibold flex items-center gap-1 transition ${
                    modoLista === 'CARDS'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Modo Cartões Otimizados para Touch"
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span>Cartões</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoLista('TABELA')}
                  className={`px-2 py-1 rounded-md font-semibold flex items-center gap-1 transition ${
                    modoLista === 'TABELA'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Modo Tabela Geral"
                >
                  <List className="w-3 h-3" />
                  <span>Tabela</span>
                </button>
              </div>

              {/* Itens por página */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-slate-500">Exibir:</span>
                <select
                  value={itensPorPagina}
                  onChange={e => { setItensPorPagina(Number(e.target.value)); setPaginaAtual(1); }}
                  className={`p-1 rounded-lg border text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          {/* 1. VISÃO EM CARTÕES RESPONSIVOS (MOBILE DEFAULT OU ESCOLHA DO USUÁRIO) */}
          <div className={`${modoLista === 'CARDS' ? 'block' : modoLista === 'TABELA' ? 'hidden' : 'block md:hidden'} p-3 sm:p-4 space-y-3`}>
            {dadosPaginados.map(item => {
              let badgeStatus = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
              if (item.status === 'Concluído') badgeStatus = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
              if (item.status === 'Aceito/Contratado') badgeStatus = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

              let badgeAud = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
              if (item.status_auditoria.includes('concluída')) badgeAud = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
              if (item.status_auditoria.includes('Aguardando')) badgeAud = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

              return (
                <div
                  key={`card-${item.id_atendimento}`}
                  onClick={() => setAtendimentoSelecionado(item)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer active:scale-[0.99] shadow-xs ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700/80 hover:border-blue-500 hover:bg-slate-800/80'
                      : 'bg-white border-slate-200/90 hover:border-blue-400 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">#{item.id_atendimento}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5 font-mono">Prop: {item.numero_proposta}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeStatus}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>

                  <h4 className="font-bold text-xs text-slate-900 dark:text-white mt-1.5 line-clamp-1">
                    {item.empresa || 'Empresa não informada'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                    {item.titulo_proposta}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1 truncate max-w-[65%]">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate font-medium">{item.consultor}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 truncate max-w-[130px] ${badgeAud}`} title={item.status_auditoria}>
                      {item.status_auditoria.includes('concluída') ? 'Aud. OK' : item.status_auditoria.includes('Aguardando') ? 'Aguard. Aud.' : 'Sem Auditoria'}
                    </span>
                  </div>

                  {/* Estatísticas resumidas em 3 colunas */}
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                    <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Previstas</span>
                      <span className="text-xs font-semibold">{item.horas_previstas}h</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Produzidas</span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{item.horas_apropriadas}h</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40">
                      <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400 block">Saldo</span>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{item.saldo_horas}h</span>
                    </div>
                  </div>

                  {/* Barra de Avanço Físico */}
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[10px] font-medium mb-1 text-slate-500">
                      <span>Avanço Físico</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{item.avanco_percentual}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${
                          item.avanco_percentual >= 100
                            ? 'bg-emerald-500'
                            : item.avanco_percentual >= 50
                            ? 'bg-blue-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(item.avanco_percentual, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. VISÃO EM TABELA TRADICIONAL (DESKTOP DEFAULT OU ESCOLHA DO USUÁRIO) */}
          <div className={`overflow-x-auto ${modoLista === 'TABELA' ? 'block' : modoLista === 'CARDS' ? 'hidden' : 'hidden md:block'}`}>
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className={`text-[11px] uppercase tracking-wider font-bold border-b ${
                darkMode ? 'bg-slate-800/50 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
                <tr>
                  <th className="py-3 px-4 cursor-pointer" onClick={() => setOrdem({ campo: 'id_atendimento', asc: ordem.campo === 'id_atendimento' ? !ordem.asc : true })}>
                    ID / Proposta
                  </th>
                  <th className="py-3 px-4 cursor-pointer" onClick={() => setOrdem({ campo: 'empresa', asc: ordem.campo === 'empresa' ? !ordem.asc : true })}>
                    Empresa Atendida
                  </th>
                  <th className="py-3 px-4 cursor-pointer" onClick={() => setOrdem({ campo: 'consultor', asc: ordem.campo === 'consultor' ? !ordem.asc : true })}>
                    Consultor
                  </th>
                  <th className="py-3 px-4 cursor-pointer" onClick={() => setOrdem({ campo: 'status', asc: ordem.campo === 'status' ? !ordem.asc : true })}>
                    Status
                  </th>
                  <th className="py-3 px-4 cursor-pointer" onClick={() => setOrdem({ campo: 'status_auditoria', asc: ordem.campo === 'status_auditoria' ? !ordem.asc : true })}>
                    Auditoria DR
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer" onClick={() => setOrdem({ campo: 'horas_previstas', asc: ordem.campo === 'horas_previstas' ? !ordem.asc : false })}>
                    Previstas
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer" onClick={() => setOrdem({ campo: 'horas_apropriadas', asc: ordem.campo === 'horas_apropriadas' ? !ordem.asc : false })}>
                    Apropriadas
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer" onClick={() => setOrdem({ campo: 'avanco_percentual', asc: ordem.campo === 'avanco_percentual' ? !ordem.asc : false })}>
                    Avanço (%)
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer" onClick={() => setOrdem({ campo: 'saldo_horas', asc: ordem.campo === 'saldo_horas' ? !ordem.asc : false })}>
                    Saldo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dadosPaginados.map(item => {
                  let badgeStatus = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                  if (item.status === 'Concluído') badgeStatus = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                  if (item.status === 'Aceito/Contratado') badgeStatus = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

                  let badgeAud = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  if (item.status_auditoria.includes('concluída')) badgeAud = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
                  if (item.status_auditoria.includes('Aguardando')) badgeAud = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

                  return (
                    <tr
                      key={item.id_atendimento}
                      onClick={() => setAtendimentoSelecionado(item)}
                      className={`cursor-pointer transition ${
                        darkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono">
                        <span className="font-bold text-blue-600 dark:text-blue-400">#{item.id_atendimento}</span>
                        <span className="text-[11px] text-slate-400 block">Prop: {item.numero_proposta}</span>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <span className="font-semibold block truncate" title={item.empresa}>{item.empresa || 'Não informada'}</span>
                        <span className="text-[11px] text-slate-500 truncate block" title={item.titulo_proposta}>{item.titulo_proposta}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300 block truncate max-w-[180px]">
                          {item.consultor}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeStatus}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium block truncate max-w-[150px] ${badgeAud}`} title={item.status_auditoria}>
                          {item.status_auditoria}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium">{item.horas_previstas} h</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">{item.horas_apropriadas} h</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${
                                item.avanco_percentual >= 100
                                  ? 'bg-emerald-500'
                                  : item.avanco_percentual >= 50
                                  ? 'bg-blue-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(item.avanco_percentual, 100)}%` }}
                            ></div>
                          </div>
                          <span className="font-bold text-[11px]">{item.avanco_percentual}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-500">{item.saldo_horas} h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação Responsiva */}
          <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <span className="text-slate-500 text-center sm:text-left">
              Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong> (Total: {dadosFiltrados.length} atendimentos)
            </span>
            <div className="flex items-center justify-center gap-1.5">
              <button
                disabled={paginaAtual <= 1}
                onClick={() => setPaginaAtual(p => p - 1)}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs font-medium">Anterior</span>
              </button>
              <button
                disabled={paginaAtual >= totalPaginas}
                onClick={() => setPaginaAtual(p => p + 1)}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
              >
                <span className="text-xs font-medium">Próxima</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </main>

      {/* MODAL DETALHES DO ATENDIMENTO (100% RESPONSIVO COM SCROLL INTERNO SEGURO) */}
      <AnimatePresence>
        {atendimentoSelecionado && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={() => setAtendimentoSelecionado(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className={`max-w-2xl w-full max-h-[92vh] overflow-y-auto rounded-2xl p-4 sm:p-6 shadow-2xl border space-y-3.5 sm:space-y-4 ${
                darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      ID #{atendimentoSelecionado.id_atendimento}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Proposta: {atendimentoSelecionado.numero_proposta}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold mt-1.5 break-words">{atendimentoSelecionado.empresa}</h3>
                </div>
                <button
                  onClick={() => setAtendimentoSelecionado(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                <span className="font-semibold text-slate-500 block mb-1">Título do Atendimento:</span>
                <p className="font-medium text-slate-800 dark:text-slate-200 break-words">{atendimentoSelecionado.titulo_proposta}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
                <div className="p-2.5 sm:p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 text-[10px] sm:text-[11px] block uppercase font-medium">Consultor Responsável</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block">{atendimentoSelecionado.consultor}</span>
                </div>
                <div className="p-2.5 sm:p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 text-[10px] sm:text-[11px] block uppercase font-medium">Status de Auditoria</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block">{atendimentoSelecionado.status_auditoria}</span>
                </div>
                <div className="p-2.5 sm:p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 text-[10px] sm:text-[11px] block uppercase font-medium">Horas Estimadas</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block">{atendimentoSelecionado.horas_previstas} h</span>
                </div>
                <div className="p-2.5 sm:p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 text-[10px] sm:text-[11px] block uppercase font-medium">Horas Apropriadas</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">{atendimentoSelecionado.horas_apropriadas} h</span>
                </div>
                <div className="p-2.5 sm:p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 text-[10px] sm:text-[11px] block uppercase font-medium">Saldo de Horas</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400 mt-0.5 block">{atendimentoSelecionado.saldo_horas} h</span>
                </div>
                <div className="p-2.5 sm:p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 text-[10px] sm:text-[11px] block uppercase font-medium">Avanço Físico</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 mt-0.5 block">{atendimentoSelecionado.avanco_percentual}%</span>
                </div>
              </div>

              {/* Financeiro do Atendimento */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block font-medium">Receita Prevista</span>
                  <span className="font-bold text-xs sm:text-sm">R$ {(atendimentoSelecionado.receita_prevista || atendimentoSelecionado.horas_previstas * 181.72).toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block font-medium">Receita Realizada</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">R$ {(atendimentoSelecionado.receita_realizada || atendimentoSelecionado.horas_apropriadas * 181.72).toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block font-medium">Saldo Futuro</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400 text-xs sm:text-sm">R$ {Math.max(0, (atendimentoSelecionado.receita_prevista || atendimentoSelecionado.horas_previstas * 181.72) - (atendimentoSelecionado.receita_realizada || atendimentoSelecionado.horas_apropriadas * 181.72)).toLocaleString('pt-BR')}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setAtendimentoSelecionado(null)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold rounded-lg transition text-center"
                >
                  Fechar Detalhes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOAST DE FEEDBACK RESPONSIVO */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:bottom-5 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-semibold flex items-center justify-center sm:justify-start gap-2 border border-slate-700 backdrop-blur-sm"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
