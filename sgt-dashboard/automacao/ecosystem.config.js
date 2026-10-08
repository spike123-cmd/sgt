/**
 * ecosystem.config.js
 * Configuração de serviços e agendamentos no PM2 para a VPS
 * Caminho VPS: /var/www/sgt-dashboard/automacao/ecosystem.config.js
 * 
 * Comandos PM2:
 * pm2 start ecosystem.config.js
 * pm2 save
 * pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'sgt-dashboard',
      script: 'server.js', // ou 'npx serve -s /var/www/sgt-dashboard -l 5040'
      cwd: '/var/www/sgt-dashboard',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5040
      }
    },
    {
      name: 'sgt-coletor-cron',
      script: 'coletar_sgt.js',
      cwd: '/var/www/sgt-dashboard/automacao',
      instances: 1,
      autorestart: false,
      watch: false,
      cron_restart: '0 23 * * *', // Executa diariamente às 23:00
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/www/sgt-dashboard/automacao/logs/coletor-erro.log',
      out_file: '/var/www/sgt-dashboard/automacao/logs/coletor-saida.log',
      time: true
    }
  ]
};
