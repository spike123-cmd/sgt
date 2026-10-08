/**
 * server.js
 * Servidor HTTP leve para o Dashboard SGT (VPS porta 5040)
 * Servindo arquivos estáticos e endpoint de status
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5040;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=UTF-8'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // Rota de status do pipeline
  if (urlPath === '/api/status') {
    const jsonPath = path.join(PUBLIC_DIR, 'dados_sgt.json');
    let totalItens = 0;
    let mtime = null;

    if (fs.existsSync(jsonPath)) {
      try {
        const dados = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        totalItens = Array.isArray(dados) ? dados.length : 0;
        mtime = fs.statSync(jsonPath).mtime;
      } catch (e) {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      versao: '2.0.0',
      total_atendimentos: totalItens,
      ultima_atualizacao: mtime,
      porta: PORT
    }));
    return;
  }

  // Arquivos estáticos
  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Arquivo não encontrado no servidor SGT Dashboard.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.json' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SGT Dashboard] Servidor rodando na porta ${PORT}`);
  console.log(`URL local: http://localhost:${PORT}/`);
});
