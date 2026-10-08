/**
 * coletar_sgt.js
 * Robô Playwright de extração automática do SGT CNI
 * Fluxo:
 * 1. Login no https://sgt.cni.com.br/
 * 2. Navegação até Dashboards / Relatórios
 * 3. Aplicação de filtros regionais (SENAI-MG)
 * 4. Download da planilha consolidada para downloads/
 * 5. Execução do pipeline de sanitização (tratar_sgt.js)
 * 6. Atualização atômica do dados_sgt.json
 * 7. Envio para o webhook n8n
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { processarArquivoXlsx } = require('./tratar_sgt');

// Carregar variáveis do .env
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

const CONFIG = {
  portalUrl: process.env.SGT_PORTAL_URL || 'https://sgt.cni.com.br',
  usuario: process.env.SGT_USUARIO || 'rmcabral@fiemg.com.br',
  senha: process.env.SGT_SENHA || 'Assuero1!@#$%',
  webhookUrl: process.env.N8N_WEBHOOK_URL || 'https://n8n.nufluxo.com.br/webhook/sgt-ingestao',
  pastaDownloads: path.resolve(__dirname, 'downloads'),
  arquivoDestino: process.env.ARQUIVO_DESTINO || path.resolve(__dirname, 'downloads/sgt_export_diario.xlsx'),
  headless: process.env.HEADLESS !== 'false'
};

async function executar() {
  const dataHoje = new Date().toISOString().split('T')[0];
  console.log(`=======================================================`);
  console.log(`[${new Date().toISOString()}] INÍCIO DA EXTRAÇÃO SGT CNI`);
  console.log(`Usuário: ${CONFIG.usuario}`);
  console.log(`Portal: ${CONFIG.portalUrl}`);
  console.log(`Webhook: ${CONFIG.webhookUrl}`);
  console.log(`=======================================================`);

  if (!fs.existsSync(CONFIG.pastaDownloads)) {
    fs.mkdirSync(CONFIG.pastaDownloads, { recursive: true });
  }

  let browser = null;
  let arquivoSalvoPath = null;

  try {
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    // 1. Acesso à página de Login
    console.log(`Navegando para ${CONFIG.portalUrl}...`);
    await page.goto(CONFIG.portalUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 2. Preenchimento de Credenciais
    console.log('Realizando autenticação de usuário...');
    const seletorEmail = 'input[type="email"], input[name="login"], input[name="email"], input[name="username"], #usuario, #login, #email';
    const seletorSenha = 'input[type="password"], input[name="senha"], input[name="password"], #senha, #password';

    await page.waitForSelector(seletorEmail, { timeout: 15000 });
    await page.fill(seletorEmail, CONFIG.usuario);
    await page.fill(seletorSenha, CONFIG.senha);

    const seletorBtnEntrar = 'button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Acessar"), #btnEntrar';
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
      page.click(seletorBtnEntrar)
    ]);

    console.log('Autenticação enviada. Verificando acesso ao painel...');
    await page.waitForTimeout(3000);

    // 3. Navegação até a área de Dashboards / Relatórios
    console.log('Navegando até a exportação de dados do SGT...');
    const urlDashboards = `${CONFIG.portalUrl}/dashboards`;
    await page.goto(urlDashboards, { waitUntil: 'networkidle' }).catch(async () => {
      // Fallback: tentar clicar no menu se a rota direta não existir
      const linkDash = page.locator('text=Dashboard, text=Relatórios, text=Atendimentos').first();
      if (await linkDash.isVisible()) await linkDash.click();
    });

    await page.waitForTimeout(3000);

    // 4. Localizar e disparar evento de Download
    console.log('Aguardando botão de exportação da planilha XLSX...');
    const seletorExportar = 'button:has-text("Exportar"), a:has-text("Exportar"), button:has-text("XLSX"), button:has-text("Download"), .btn-export';

    const [ download ] = await Promise.all([
      page.waitForEvent('download', { timeout: 45000 }),
      page.click(seletorExportar).catch(async () => {
        // Fallback: buscar por ícone ou botão com atributo
        await page.click('[title*="Exportar"], [aria-label*="Exportar"]');
      })
    ]);

    const nomeOriginal = download.suggestedFilename() || `relatorio_sgt_${dataHoje}.xlsx`;
    arquivoSalvoPath = path.join(CONFIG.pastaDownloads, `relatorio_atendimento_${dataHoje}.xlsx`);

    console.log(`Download iniciado: ${nomeOriginal}`);
    await download.saveAs(arquivoSalvoPath);
    console.log(`Planilha salva com sucesso em: ${arquivoSalvoPath}`);

    // Cria cópia fixa padrão
    fs.copyFileSync(arquivoSalvoPath, CONFIG.arquivoDestino);
    console.log(`Cópia fixa atualizada em: ${CONFIG.arquivoDestino}`);

  } catch (erro) {
    console.error('Erro na extração Playwright:', erro.message);
    // Se o arquivo diário já existir em downloads (ex: baixado manualmente ou em tentativa anterior), continua com o tratamento
    const arquivoExistente = path.join(CONFIG.pastaDownloads, `relatorio_atendimento_${dataHoje}.xlsx`);
    if (fs.existsSync(arquivoExistente)) {
      console.log(`Usando arquivo existente de hoje para tratamento: ${arquivoExistente}`);
      arquivoSalvoPath = arquivoExistente;
    } else if (fs.existsSync(CONFIG.arquivoDestino)) {
      console.log(`Usando arquivo fixo de destino para tratamento: ${CONFIG.arquivoDestino}`);
      arquivoSalvoPath = CONFIG.arquivoDestino;
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // 5. TRATAMENTO E DISPARO AUTOMÁTICO (FECHAMENTO DO PIPELINE)
  if (arquivoSalvoPath && fs.existsSync(arquivoSalvoPath)) {
    console.log('\n-------------------------------------------------------');
    console.log('Disparando pipeline de sanitização pós-download...');
    try {
      const resultado = await processarArquivoXlsx(arquivoSalvoPath);
      console.log('Resultado do processamento:', resultado);
      console.log('Pipeline concluído com sucesso!');
    } catch (errTratar) {
      console.error('Erro no pós-tratamento da planilha:', errTratar.message);
    }
  } else {
    console.warn('Nenhum arquivo XLSX disponível para tratamento pós-coleta.');
  }

  console.log(`[${new Date().toISOString()}] Fim da rotina de automação.`);
  console.log('=======================================================\n');
}

if (require.main === module) {
  executar();
}

module.exports = { executar };
