/**
 * tratar_sgt.js
 * Script de ingestão, sanitização e consolidação dos relatórios SGT CNI
 * Atualiza o arquivo dados_sgt.json e despacha para o webhook do n8n
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Carregar variáveis de ambiente locais se existirem
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/(^['"]|['"]$)/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  });
}

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.nufluxo.com.br/webhook/sgt-ingestao';
const DADOS_JSON_DESTINO = process.env.DADOS_JSON_DESTINO || path.resolve(__dirname, '../dados_sgt.json');
const DADOS_XLSX_DESTINO = process.env.DADOS_XLSX_DESTINO || path.resolve(__dirname, '../Dados_NovoSGT.xlsx');

/**
 * TAREFA 2: Sanitização da Coluna de Horas
 * Converte qualquer valor bruto da planilha (string com vírgula, "02:30", número, vazio/null) em Float decimal válido.
 * @param {*} valor 
 * @returns {number}
 */
function sanitizarHoras(valor) {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') {
    if (isNaN(valor) || !isFinite(valor)) return 0;
    return Math.round(valor * 100) / 100;
  }
  const str = String(valor).trim();
  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined' || str === '--') return 0;

  // Formato tempo string "HH:MM" ou "HH:MM:SS" (ex: "02:30" -> 2.5)
  const regexTempo = /^(-?\d+):(\d{1,2})(?::(\d{1,2}))?$/;
  const matchTempo = str.match(regexTempo);
  if (matchTempo) {
    const horas = parseInt(matchTempo[1], 10) || 0;
    const minutos = parseInt(matchTempo[2], 10) || 0;
    const segundos = parseInt(matchTempo[3] || '0', 10) || 0;
    const sinal = horas < 0 ? -1 : 1;
    const total = Math.abs(horas) + (minutos / 60) + (segundos / 3600);
    return Math.round(sinal * total * 100) / 100;
  }

  // String numérica com vírgula ou ponto (ex: "2,5", "1.250,50")
  let limpo = str.replace(/[^\d.,-]/g, '');
  if (limpo.includes(',') && limpo.includes('.')) {
    if (limpo.indexOf('.') < limpo.indexOf(',')) {
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    } else {
      limpo = limpo.replace(/,/g, '');
    }
  } else if (limpo.includes(',')) {
    limpo = limpo.replace(',', '.');
  }

  const parsed = parseFloat(limpo);
  if (isNaN(parsed) || !isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

const MESES_MAP = {
  'jan': 'Jan', 'fev': 'Fev', 'feb': 'Fev',
  'mar': 'Mar',
  'abr': 'Abr', 'apr': 'Abr',
  'mai': 'Mai', 'may': 'Mai',
  'jun': 'Jun',
  'jul': 'Jul',
  'ago': 'Ago', 'aug': 'Ago',
  'set': 'Set', 'sep': 'Set',
  'out': 'Out', 'oct': 'Out',
  'nov': 'Nov',
  'dez': 'Dez', 'dec': 'Dez'
};

/**
 * Normaliza abreviações de meses (ex: "Sep/2025" -> "Set/2025")
 * @param {string} mesStr 
 * @returns {string}
 */
function normalizarNomeMes(mesStr) {
  if (!mesStr) return '';
  const s = String(mesStr).trim();
  const partes = s.split(/[/ -]/);
  if (partes.length >= 2) {
    let mes = partes[0].toLowerCase().substring(0, 3);
    let ano = partes[1];
    if (MESES_MAP[mes]) {
      return `${MESES_MAP[mes]}/${ano}`;
    }
  }
  return s;
}

function detectarBp(texto) {
  const t = (texto || '').toUpperCase();
  return t.includes('B+P') || t.includes('BRASIL MAIS PRODUTIVO') || t.includes('MANUFATURA ENXUTA') || t.includes('LEAN');
}

/**
 * Trata o arquivo XLSX exportado do SGT e gera o dados_sgt.json
 * @param {string} caminhoArquivoXlsx 
 */
async function processarArquivoXlsx(caminhoArquivoXlsx) {
  console.log(`[${new Date().toISOString()}] Iniciando tratamento do arquivo: ${caminhoArquivoXlsx}`);

  if (!fs.existsSync(caminhoArquivoXlsx)) {
    throw new Error(`Arquivo não encontrado no caminho: ${caminhoArquivoXlsx}`);
  }

  const fileBuffer = fs.readFileSync(caminhoArquivoXlsx);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  let itensTratados = [];

  // Formato 1: Planilha com abas "Atendimentos" e "Produção" (Padrão SGT CNI)
  if (workbook.SheetNames.includes('Atendimentos')) {
    console.log('Detectado padrão de exportação oficial do SGT (Abas: Atendimentos + Produção)');
    const wsAtend = workbook.Sheets['Atendimentos'];
    const jsonAtend = XLSX.utils.sheet_to_json(wsAtend);

    const wsProdName = workbook.SheetNames.find(s => s.toLowerCase().startsWith('produ'));
    const jsonProd = wsProdName ? XLSX.utils.sheet_to_json(workbook.Sheets[wsProdName]) : [];

    // Mapear produção por ID de atendimento
    const prodMap = {};
    jsonProd.forEach(p => {
      const idAt = String(p['ID DO ATENDIMENTO'] || p['ID ATENDIMENTO'] || p['id_atendimento'] || '').trim();
      const hReal = sanitizarHoras(p['PRODUÇÃO REALIZADA'] || p['PRODUCAO REALIZADA'] || p['PRODUÇÃO'] || p['HORAS'] || p['Horas'] || 0);
      const cons = String(p['NOME DO COLABORADOR'] || p['NOME DO'] || p['consultor'] || '').trim();
      const mesRaw = String(p['MÊS/ANO'] || p['MES/ANO'] || p['DATA'] || '').trim();
      const mes = normalizarNomeMes(mesRaw);

      if (!prodMap[idAt]) {
        prodMap[idAt] = { total_horas: 0, consultores: {}, meses: {}, mesesLista: [] };
      }
      prodMap[idAt].total_horas = Math.round((prodMap[idAt].total_horas + hReal) * 100) / 100;
      if (cons) {
        prodMap[idAt].consultores[cons] = Math.round(((prodMap[idAt].consultores[cons] || 0) + hReal) * 100) / 100;
      }
      if (mes) {
        prodMap[idAt].meses[mes] = Math.round(((prodMap[idAt].meses[mes] || 0) + hReal) * 100) / 100;
        if (!prodMap[idAt].mesesLista.includes(mes)) {
          prodMap[idAt].mesesLista.push(mes);
        }
      }
    });

    itensTratados = jsonAtend.map(r => {
      const idAt = String(r['ID'] || r['ID DO ATENDIMENTO'] || r['id_atendimento'] || '').trim();
      const pInfo = prodMap[idAt] || { total_horas: 0, consultores: {}, meses: {}, mesesLista: [] };

      // Consultor com maior número de horas apropriadas
      let principalCons = 'Não Atribuído';
      let maxH = 0;
      for (const [c, h] of Object.entries(pInfo.consultores)) {
        if (h > maxH) {
          maxH = h;
          principalCons = c;
        }
      }

      const hPrev = sanitizarHoras(r['PRODUÇÃO ESTIMADA'] || r['HORAS_PREVISTAS'] || r['PRODUCAO ESTIMADA'] || 0);
      const hAprop = Math.round(pInfo.total_horas * 100) / 100;
      const saldoH = Math.round((hPrev - hAprop) * 10) / 10;
      const avanco = hPrev > 0 ? Math.round((hAprop / hPrev) * 1000) / 10 : (hAprop > 0 ? 100 : 0);
      const tit = String(r['TÍTULO DO ATENDIMENTO'] || r['TITULO DO ATENDIMENTO'] || r['TITULO'] || '').trim();

      const receitaPrev = Math.round(hPrev * 181.72 * 100) / 100;
      const receitaReal = Math.round(hAprop * 181.72 * 100) / 100;
      const saldoRec = Math.round(saldoH * 181.72 * 100) / 100;

      return {
        id_atendimento: idAt,
        numero_proposta: String(r['NÚMERO'] || r['NUMERO'] || '').replace('.0', '').trim(),
        titulo_proposta: tit,
        status: String(r['STATUS ATUAL'] || r['STATUS'] || 'Aceito/Em execução').trim(),
        status_auditoria: String(r['STATUS AUDITORIA'] || 'Sem Auditoria / Regular').trim(),
        empresa: String(r['NOME EMPRESA ATENDIDA'] || r['NOME DA EMPRESA ATENDIDA'] || r['NOME CLIENTE'] || '').trim(),
        consultor: principalCons,
        horas_previstas: hPrev,
        horas_apropriadas: hAprop,
        avanco_percentual: avanco,
        saldo_horas: saldoH,
        receita_prevista: receitaPrev,
        receita_realizada: receitaReal,
        saldo_receita: saldoRec,
        is_bp: detectarBp(tit),
        meses_producao: pInfo.mesesLista,
        horas_por_mes: pInfo.meses
      };
    });

  } else if (workbook.SheetNames.includes('dAtendimentos')) {
    // Formato 2: Planilha dAtendimentos consolidada
    console.log('Detectado padrão consolidado (Aba: dAtendimentos)');
    const json = XLSX.utils.sheet_to_json(workbook.Sheets['dAtendimentos']);
    itensTratados = json.map(r => {
      const hp = sanitizarHoras(r['HORAS_PREVISTAS'] || r['PRODUÇÃO ESTIMADA'] || 0);
      const ha = sanitizarHoras(r['HORAS_APROPRIADAS_TOTAL'] || r['PRODUÇÃO REALIZADA'] || 0);
      const tit = String(r['TITULO_ATENDIMENTO'] || r['TÍTULO DO'] || '').trim();
      const saldoH = sanitizarHoras(r['SALDO_HORAS'] || (hp - ha));
      const avanco = parseFloat(r['AVANCO_PERCENTUAL'] || 0) || (hp > 0 ? (ha / hp) * 100 : 0);

      return {
        id_atendimento: String(r['ID'] || r['ID_ATENDIMENTO'] || '').trim(),
        numero_proposta: String(r['NUMERO'] || r['NÚMERO'] || '').replace('.0', '').trim(),
        titulo_proposta: tit,
        status: String(r['STATUS_ATUAL'] || r['STATUS'] || 'Aceito/Em execução').trim(),
        status_auditoria: String(r['STATUS_AUDITORIA'] || 'Sem Auditoria / Regular').trim(),
        empresa: String(r['EMPRESA_ATENDIDA'] || r['NOME DA'] || '').trim(),
        consultor: String(r['CONSULTOR_RESPONSAVEL'] || 'Não Atribuído').trim(),
        horas_previstas: hp,
        horas_apropriadas: ha,
        avanco_percentual: Math.round(avanco * 10) / 10,
        saldo_horas: Math.round(saldoH * 10) / 10,
        receita_prevista: Math.round(hp * 181.72 * 100) / 100,
        receita_realizada: Math.round(ha * 181.72 * 100) / 100,
        saldo_receita: Math.round(saldoH * 181.72 * 100) / 100,
        is_bp: detectarBp(tit),
        meses_producao: [],
        horas_por_mes: {}
      };
    });
  } else {
    // Formato 3: Primeira aba como fallback
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(firstSheet);
    itensTratados = json;
  }

  console.log(`Processamento concluído. Total de registros gerados: ${itensTratados.length}`);

  // PROTEÇÃO CONTRA PERDA DE DADOS: Se tiver menos de 50 registros, impede sobrescrever base completa
  if (itensTratados.length < 50) {
    console.warn(`[ALERTA DE SEGURANÇA] Arquivo continha apenas ${itensTratados.length} registros.`);
    console.warn('O arquivo dados_sgt.json principal NÃO foi sobrescrito para evitar perdas.');
    // Salva em arquivo de debug para inspeção
    const debugPath = path.resolve(__dirname, 'dados_sgt_parcial_debug.json');
    fs.writeFileSync(debugPath, JSON.stringify(itensTratados, null, 2), 'utf-8');
    console.log(`Dados parciais salvos para inspeção em: ${debugPath}`);
    return { sucesso: false, motivo: 'Registros insuficientes (< 50)', total: itensTratados.length };
  }

  // Backup do dados_sgt.json existente se houver
  const destinos = [
    DADOS_JSON_DESTINO,
    path.resolve(__dirname, '../dados_sgt.json'),
    path.resolve(__dirname, '../../public/dados_sgt.json')
  ];

  for (const destino of destinos) {
    try {
      const pastaDestino = path.dirname(destino);
      if (!fs.existsSync(pastaDestino)) fs.mkdirSync(pastaDestino, { recursive: true });

      if (fs.existsSync(destino)) {
        fs.copyFileSync(destino, destino + '.bak');
      }
      fs.writeFileSync(destino, JSON.stringify(itensTratados, null, 2), 'utf-8');
      console.log(`Arquivo atualizado com sucesso em: ${destino}`);
    } catch (err) {
      console.warn(`Aviso ao salvar em ${destino}:`, err.message);
    }
  }

  // Atualizar planilha consolidada Dados_NovoSGT.xlsx
  try {
    const ws = XLSX.utils.json_to_sheet(itensTratados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'dAtendimentos');
    XLSX.writeFile(wb, DADOS_XLSX_DESTINO);
    console.log(`Planilha consolidada atualizada: ${DADOS_XLSX_DESTINO}`);
  } catch (err) {
    console.warn('Aviso ao gerar Dados_NovoSGT.xlsx:', err.message);
  }

  // Despacho para o webhook do n8n
  await enviarParaN8n(itensTratados, caminhoArquivoXlsx);

  return { sucesso: true, total: itensTratados.length };
}

/**
 * Envia os dados processados e/ou o arquivo para o webhook do n8n
 */
async function enviarParaN8n(dados, caminhoArquivo) {
  if (!N8N_WEBHOOK_URL) {
    console.log('N8N_WEBHOOK_URL não configurada. Etapa ignorada.');
    return;
  }

  console.log(`Despachando para n8n webhook: ${N8N_WEBHOOK_URL}`);
  try {
    // 1. Se o arquivo XLSX existir, envia como multipart/form-data (esperado pelo nó extractFromFile do n8n)
    if (caminhoArquivo && fs.existsSync(caminhoArquivo)) {
      console.log(`Enviando arquivo XLSX (${caminhoArquivo}) para o n8n...`);
      const fileBuffer = fs.readFileSync(caminhoArquivo);
      const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const form = new FormData();
      form.append('data', blob, path.basename(caminhoArquivo));

      const resp = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'User-Agent': 'SGT-Dashboard-Automation/1.0'
        },
        body: form
      });

      if (resp.ok) {
        console.log(`SUCESSO n8n: Webhook recebeu e processou o arquivo XLSX! Status: ${resp.status}`);
        return;
      } else {
        console.warn(`Aviso n8n (multipart): Respondeu com status ${resp.status} - ${resp.statusText}`);
      }
    }

    // 2. Fallback: envio como JSON
    console.log('Enviando payload JSON consolidado...');
    const payload = {
      timestamp: new Date().toISOString(),
      origem: 'SGT CNI - Pipeline Automático',
      total_atendimentos: dados.length,
      dados: dados
    };

    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SGT-Dashboard-Automation/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      console.log(`SUCESSO n8n: Webhook recebeu e processou payload JSON! Status: ${resp.status}`);
    } else {
      console.warn(`Aviso n8n (JSON): Respondeu com status ${resp.status} - ${resp.statusText}`);
    }
  } catch (err) {
    console.error('Erro na chamada do webhook n8n:', err.message);
  }
}

// Execução via linha de comando
if (require.main === module) {
  const arquivoAlvo = process.argv[2] || process.env.ARQUIVO_DESTINO || path.resolve(__dirname, 'downloads/sgt_export_diario.xlsx');
  processarArquivoXlsx(arquivoAlvo)
    .then(res => {
      console.log('Resultado final do pipeline:', res);
      process.exit(res.sucesso ? 0 : 1);
    })
    .catch(err => {
      console.error('Falha no tratamento:', err.message);
      process.exit(1);
    });
}

module.exports = { processarArquivoXlsx, enviarParaN8n };
