/**
 * lib/sgt-sanitizer.ts
 * Utilitários de sanitização de dados, tratamento de horas e filtragem por intervalo de datas (Date Range).
 * Suporta o pipeline de ingestão de planilhas Excel (via SheetJS / xlsx) e o front-end do SGT Dashboard.
 */

// Mapeamento multilíngue (pt-BR e en-US) de abreviações e nomes de meses
export const MESES_ORDEM: { [key: string]: number } = {
  'jan': 0, 'janeiro': 0, 'january': 0,
  'fev': 1, 'fevereiro': 1, 'feb': 1, 'february': 1,
  'mar': 2, 'marco': 2, 'março': 2, 'march': 2,
  'abr': 3, 'abril': 3, 'apr': 3, 'april': 3,
  'mai': 4, 'maio': 4, 'may': 4,
  'jun': 5, 'junho': 5, 'june': 5,
  'jul': 6, 'julho': 6, 'july': 6,
  'ago': 7, 'agosto': 7, 'aug': 7, 'august': 7,
  'set': 8, 'setembro': 8, 'sep': 8, 'september': 8,
  'out': 9, 'outubro': 9, 'oct': 9, 'october': 9,
  'nov': 10, 'novembro': 10, 'november': 10,
  'dez': 11, 'dezembro': 11, 'dec': 11, 'december': 11
};

export const MESES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

/**
 * TAREFA 2: Sanitização da Coluna de Horas (Bugfix Setembro e formatações gerais)
 * Garante que qualquer entrada (string com vírgula, "02:30", número, nulo, undefined)
 * seja convertida para um Float decimal limpo.
 *
 * @param valor - Valor bruto vindo da planilha Excel ou JSON
 * @returns number - Float sanitizado (>= 0) com precisão de 2 casas decimais
 */
export function sanitizarHoras(valor: unknown): number {
  if (valor === null || valor === undefined) {
    return 0;
  }

  // 1. Já é um número
  if (typeof valor === 'number') {
    if (isNaN(valor) || !isFinite(valor)) return 0;
    return Math.round(valor * 100) / 100;
  }

  const str = String(valor).trim();
  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined' || str === '--') {
    return 0;
  }

  // 2. Formato de tempo string "HH:MM" ou "HH:MM:SS" (ex: "02:30" => 2.5, "00:45" => 0.75, "120:15" => 120.25)
  const regexTempo = /^(-?\d+):(\d{1,2})(?::(\d{1,2}))?$/;
  const matchTempo = str.match(regexTempo);
  if (matchTempo) {
    const horas = parseInt(matchTempo[1], 10) || 0;
    const minutos = parseInt(matchTempo[2], 10) || 0;
    const segundos = parseInt(matchTempo[3] || '0', 10) || 0;
    const sinal = horas < 0 ? -1 : 1;
    const totalDecimal = Math.abs(horas) + (minutos / 60) + (segundos / 3600);
    return Math.round(sinal * totalDecimal * 100) / 100;
  }

  // 3. String numérica com vírgula ou ponto (ex: "2,5", "1.250,50", "1,250.50", "2.5")
  // Limpa caracteres não numéricos exceto dígitos, '.', ',' e '-'
  let limpo = str.replace(/[^\d.,-]/g, '');

  if (limpo.includes(',') && limpo.includes('.')) {
    // Formato brasileiro: 1.250,50 -> remove ponto de milhar e troca vírgula por ponto
    if (limpo.indexOf('.') < limpo.indexOf(',')) {
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato americano: 1,250.50 -> remove vírgula de milhar
      limpo = limpo.replace(/,/g, '');
    }
  } else if (limpo.includes(',')) {
    // Ex: "2,5" ou "12,75"
    limpo = limpo.replace(',', '.');
  }

  const parsed = parseFloat(limpo);
  if (isNaN(parsed) || !isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed * 100) / 100;
}

/**
 * Normaliza qualquer representação de mês (ex: "Sep/2025", "set/2025", "09/2025", "Setembro/2025")
 * para o padrão canônico em português "Set/2025".
 */
export function normalizarNomeMes(mesStr: string): string {
  if (!mesStr) return '';
  const limpo = mesStr.trim();
  
  // Ex: "Sep/2025", "Set/2025", "09/2025"
  const partes = limpo.split(/[/ -]/);
  if (partes.length >= 2) {
    let mesP = partes[0].toLowerCase();
    let anoP = partes[1];
    if (anoP.length < 4 && mesP.length === 4) {
      // Ex: "2025/09"
      const temp = mesP;
      mesP = anoP;
      anoP = temp;
    }

    // Se mês for número ("09", "9")
    const numMes = parseInt(mesP, 10);
    if (!isNaN(numMes) && numMes >= 1 && numMes <= 12) {
      return `${MESES_PT[numMes - 1]}/${anoP}`;
    }

    // Se mês for texto ("sep", "set", etc.)
    const chave = mesP.substring(0, 3);
    if (MESES_ORDEM[chave] !== undefined) {
      const idx = MESES_ORDEM[chave];
      return `${MESES_PT[idx]}/${anoP}`;
    }
  }

  return limpo;
}

/**
 * Extrai intervalo de data de início e fim para um mês (ex: "Sep/2025" => 01/09/2025 00:00:00 até 30/09/2025 23:59:59)
 */
export function extrairIntervaloMes(mesStr: string): { inicio: Date; fim: Date } | null {
  if (!mesStr) return null;
  const limpo = mesStr.trim();
  const partes = limpo.split(/[/ -]/);
  if (partes.length < 2) return null;

  let mesP = partes[0].toLowerCase();
  let anoP = parseInt(partes[1], 10);
  if (isNaN(anoP)) return null;
  if (anoP < 100) anoP += 2000;

  let mesIdx = -1;
  const numMes = parseInt(mesP, 10);
  if (!isNaN(numMes) && numMes >= 1 && numMes <= 12) {
    mesIdx = numMes - 1;
  } else {
    const chave = mesP.substring(0, 3);
    if (MESES_ORDEM[chave] !== undefined) {
      mesIdx = MESES_ORDEM[chave];
    }
  }

  if (mesIdx === -1) return null;

  // Primeiro dia do mês (00:00:00)
  const inicio = new Date(anoP, mesIdx, 1, 0, 0, 0, 0);
  // Último dia do mês (23:59:59.999)
  const fim = new Date(anoP, mesIdx + 1, 0, 23, 59, 59, 999);
  return { inicio, fim };
}

/**
 * Converte string de data no formato "YYYY-MM-DD" ou "DD/MM/YYYY" para Date
 */
export function converterStringParaData(dataStr: string, fimDoDia = false): Date | null {
  if (!dataStr) return null;
  const s = dataStr.trim();

  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [ano, mes, dia] = s.split('-').map(Number);
    return fimDoDia
      ? new Date(ano, mes - 1, dia, 23, 59, 59, 999)
      : new Date(ano, mes - 1, dia, 0, 0, 0, 0);
  }

  // Formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dia, mes, ano] = s.split('/').map(Number);
    return fimDoDia
      ? new Date(ano, mes - 1, dia, 23, 59, 59, 999)
      : new Date(ano, mes - 1, dia, 0, 0, 0, 0);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * TAREFA 1: Lógica de Filtro por Intervalo de Datas (Date Range)
 * Verifica se um atendimento possui produção ou vigência contida dentro de [dataInicio, dataFim].
 *
 * @param item - Objeto do atendimento (com meses_producao, horas_por_mes, etc.)
 * @param dataInicio - String ou Date do início do intervalo (ex: "2025-07-01")
 * @param dataFim - String ou Date do fim do intervalo (ex: "2025-09-30")
 * @returns boolean - true se o atendimento pertencer ao intervalo
 */
export function verificarAtendimentoNoPeriodo(
  item: {
    meses_producao?: string[];
    horas_por_mes?: Record<string, number>;
    data_registro?: string;
    data_inicio?: string;
    data_fim?: string;
  },
  dataInicio: string | Date | null | undefined,
  dataFim: string | Date | null | undefined
): boolean {
  // Se nenhum período estiver selecionado, passa todos
  if (!dataInicio && !dataFim) {
    return true;
  }

  const dtInicio = typeof dataInicio === 'string'
    ? converterStringParaData(dataInicio, false)
    : dataInicio;

  const dtFim = typeof dataFim === 'string'
    ? converterStringParaData(dataFim, true)
    : dataFim;

  const tInicio = dtInicio ? dtInicio.getTime() : -Infinity;
  const tFim = dtFim ? dtFim.getTime() : Infinity;

  // 1. Se o item tiver data_registro ou data_inicio direta
  if (item.data_registro) {
    const dReg = converterStringParaData(item.data_registro, false);
    if (dReg) {
      const tReg = dReg.getTime();
      return tReg >= tInicio && tReg <= tFim;
    }
  }

  // 2. Se o item tiver meses_producao ou horas_por_mes (padrão principal do SGT)
  const meses = item.meses_producao || (item.horas_por_mes ? Object.keys(item.horas_por_mes) : []);
  if (meses && meses.length > 0) {
    for (const m of meses) {
      const intervaloMes = extrairIntervaloMes(m);
      if (intervaloMes) {
        const mInicio = intervaloMes.inicio.getTime();
        const mFim = intervaloMes.fim.getTime();

        // Houve sobreposição de intervalo: max(mInicio, tInicio) <= min(mFim, tFim)
        if (mFim >= tInicio && mInicio <= tFim) {
          // Se tiver horas_por_mes, garante que tem horas > 0 naquele mês
          if (item.horas_por_mes) {
            const h = item.horas_por_mes[m] ?? 0;
            if (h > 0) return true;
          } else {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Se não tem meses de produção registrados (ex: atendimento recém-aberto),
  // se o período for amplo (ex: todos), mantém, caso contrário filtra
  return false;
}

/**
 * Calcula a soma das horas apropriadas no período filtrado
 */
export function calcularHorasNoPeriodo(
  item: {
    horas_apropriadas?: number;
    horas_por_mes?: Record<string, number>;
  },
  dataInicio: string | Date | null | undefined,
  dataFim: string | Date | null | undefined
): number {
  if (!dataInicio && !dataFim) {
    return sanitizarHoras(item.horas_apropriadas || 0);
  }

  const dtInicio = typeof dataInicio === 'string'
    ? converterStringParaData(dataInicio, false)
    : dataInicio;

  const dtFim = typeof dataFim === 'string'
    ? converterStringParaData(dataFim, true)
    : dataFim;

  const tInicio = dtInicio ? dtInicio.getTime() : -Infinity;
  const tFim = dtFim ? dtFim.getTime() : Infinity;

  if (item.horas_por_mes && Object.keys(item.horas_por_mes).length > 0) {
    let soma = 0;
    for (const [m, hBruto] of Object.entries(item.horas_por_mes)) {
      const intervalo = extrairIntervaloMes(m);
      if (intervalo) {
        if (intervalo.fim.getTime() >= tInicio && intervalo.inicio.getTime() <= tFim) {
          soma += sanitizarHoras(hBruto);
        }
      }
    }
    return Math.round(soma * 100) / 100;
  }

  return sanitizarHoras(item.horas_apropriadas || 0);
}
