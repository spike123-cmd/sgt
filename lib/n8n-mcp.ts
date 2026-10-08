/**
 * lib/n8n-mcp.ts
 * Cliente MCP (Model Context Protocol) para conectar ao n8n da Nufluxo
 */

const N8N_MCP_URL = process.env.N8N_MCP_URL || "https://n8n.nufluxo.com.br/mcp-server/http";
const N8N_MCP_TOKEN = process.env.N8N_MCP_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3MDY3YmZlMC0wNjVlLTRjZWQtYWNlYi1lMzEyNzg5YzI3ZTIiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImU3NmVjOTU5LTFjODUtNDU5OC1hZmVmLTdkODIwYWNjMGNiMCIsImlhdCI6MTc5MTQ2Mjk5Nn0.7Cw1FB5S2nIz_hSYz1bDHEqn5EldcavpvUO4MvQobUo";

export async function callN8nMcp(method: string, params: Record<string, any> = {}) {
  const reqBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params
  };

  const res = await fetch(N8N_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${N8N_MCP_TOKEN}`
    },
    body: JSON.stringify(reqBody)
  });

  if (!res.ok) {
    throw new Error(`Erro HTTP no MCP Server do n8n: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const match = text.match(/data:\s*({.*})/);
  if (match) {
    return JSON.parse(match[1]);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Executa uma ferramenta MCP no n8n (tools/call)
 */
export async function callN8nTool(name: string, args: Record<string, any> = {}) {
  return callN8nMcp("tools/call", {
    name,
    arguments: args
  });
}
