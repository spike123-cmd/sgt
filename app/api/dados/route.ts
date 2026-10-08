import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { sanitizarHoras, normalizarNomeMes } from "@/lib/sgt-sanitizer";

// Caminho de fallback no filesystem e em /tmp (para Vercel Serverless)
const TMP_FILE = path.join("/tmp", "dados_sgt.json");
const LOCAL_FILE = path.join(process.cwd(), "public", "dados_sgt.json");

// Cache em memória para instâncias serverless aquecidas
let cacheMemoria: any[] | null = null;
let ultimaAtualizacaoCache: string | null = null;

/**
 * GET /api/dados
 * Retorna os dados mais recentes do SGT CNI para o dashboard.
 */
export async function GET() {
  try {
    // 1. Tenta carregar do cache em memória
    if (cacheMemoria && cacheMemoria.length > 0) {
      return NextResponse.json(cacheMemoria, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          "x-data-source": "memory-cache",
          "x-last-updated": ultimaAtualizacaoCache || new Date().toISOString()
        }
      });
    }

    // 2. Tenta carregar de /tmp (se n8n tiver postado recentemente)
    if (fs.existsSync(TMP_FILE)) {
      try {
        const raw = fs.readFileSync(TMP_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cacheMemoria = parsed;
          const stats = fs.statSync(TMP_FILE);
          ultimaAtualizacaoCache = stats.mtime.toISOString();
          return NextResponse.json(parsed, {
            headers: {
              "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
              "x-data-source": "tmp-serverless-file",
              "x-last-updated": ultimaAtualizacaoCache
            }
          });
        }
      } catch (e) {
        console.warn("Erro ao ler /tmp/dados_sgt.json:", e);
      }
    }

    // 3. Fallback para public/dados_sgt.json
    if (fs.existsSync(LOCAL_FILE)) {
      const raw = fs.readFileSync(LOCAL_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cacheMemoria = parsed;
        const stats = fs.statSync(LOCAL_FILE);
        ultimaAtualizacaoCache = stats.mtime.toISOString();
        return NextResponse.json(parsed, {
          headers: {
            "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
            "x-data-source": "public-base-file",
            "x-last-updated": ultimaAtualizacaoCache
          }
        });
      }
    }

    return NextResponse.json([], { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: "Falha ao carregar dados do SGT", detalhe: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dados
 * Endpoint de ingestão automática para o n8n.
 * Quando o robô do n8n finaliza a coleta e tratamento do SGT, ele envia o JSON para cá.
 */
export async function POST(req: Request) {
  try {
    // 1. Verificação de Token de Segurança (se SGT_WEBHOOK_SECRET estiver configurado)
    const secretConfigurado = process.env.SGT_WEBHOOK_SECRET;
    if (secretConfigurado) {
      const authHeader = req.headers.get("authorization") || "";
      const tokenHeader = req.headers.get("x-sgt-token") || "";
      const bearerToken = authHeader.replace(/^Bearer\s+/i, "");

      if (tokenHeader !== secretConfigurado && bearerToken !== secretConfigurado) {
        return NextResponse.json(
          { erro: "Acesso negado: token de sincronização inválido" },
          { status: 401 }
        );
      }
    }

    const body = await req.json();
    let listaItens: any[] = [];

    if (Array.isArray(body)) {
      listaItens = body;
    } else if (body && Array.isArray(body.dados)) {
      listaItens = body.dados;
    } else if (body && Array.isArray(body.itens)) {
      listaItens = body.itens;
    } else {
      return NextResponse.json(
        { erro: "Payload inválido. Esperava um array de atendimentos ou { dados: [...] }" },
        { status: 400 }
      );
    }

    // 2. Proteção de integridade: não sobrescreve se vier lote vazio ou com pouquíssimos registros por erro
    if (listaItens.length < 20) {
      return NextResponse.json(
        {
          erro: "Carga rejeitada por segurança: lote continha menos de 20 registros.",
          total_enviado: listaItens.length
        },
        { status: 422 }
      );
    }

    // 3. Sanitização automática de cada atendimento recebido do n8n
    const sanitizados = listaItens.map(item => {
      const hp = sanitizarHoras(item.horas_previstas);
      const ha = sanitizarHoras(item.horas_apropriadas);
      const sh = sanitizarHoras(item.saldo_horas !== undefined ? item.saldo_horas : (hp - ha));
      const av = sanitizarHoras(item.avanco_percentual);

      const horasPorMes: Record<string, number> = {};
      const mesesLista: string[] = [];

      if (item.horas_por_mes && typeof item.horas_por_mes === "object") {
        for (const [m, h] of Object.entries(item.horas_por_mes)) {
          const hSanit = sanitizarHoras(h);
          const mNorm = normalizarNomeMes(m);
          horasPorMes[m] = hSanit;
          if (mNorm && mNorm !== m) {
            horasPorMes[mNorm] = hSanit;
          }
          if (!mesesLista.includes(mNorm)) mesesLista.push(mNorm);
        }
      }

      return {
        ...item,
        horas_previstas: hp,
        horas_apropriadas: ha,
        saldo_horas: sh,
        avanco_percentual: av,
        receita_prevista: sanitizarHoras(item.receita_prevista || hp * 181.72),
        receita_realizada: sanitizarHoras(item.receita_realizada || ha * 181.72),
        saldo_receita: sanitizarHoras(item.saldo_receita || sh * 181.72),
        meses_producao: mesesLista.length > 0 ? mesesLista : (item.meses_producao || []),
        horas_por_mes: horasPorMes
      };
    });

    // 4. Atualiza Cache em Memória
    cacheMemoria = sanitizados;
    ultimaAtualizacaoCache = new Date().toISOString();

    // 5. Persiste em /tmp (compatível com Vercel)
    try {
      fs.writeFileSync(TMP_FILE, JSON.stringify(sanitizados, null, 2), "utf-8");
    } catch (e) {
      console.warn("Não foi possível salvar em /tmp:", e);
    }

    // 6. Se for ambiente com filesystem gravável (VPS / Dev), atualiza public/dados_sgt.json
    try {
      if (fs.existsSync(path.dirname(LOCAL_FILE))) {
        fs.writeFileSync(LOCAL_FILE, JSON.stringify(sanitizados, null, 2), "utf-8");
      }
    } catch (_) {
      // Ignora erro em ambientes estritamente read-only como Vercel production
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Dados do SGT ingeridos e sanitizados com sucesso!",
      total_processados: sanitizados.length,
      timestamp: ultimaAtualizacaoCache,
      ambiente: process.env.VERCEL ? "vercel-serverless" : "standard-node"
    });
  } catch (error: any) {
    return NextResponse.json(
      { erro: "Erro ao processar ingestão do n8n", detalhe: error.message },
      { status: 500 }
    );
  }
}
