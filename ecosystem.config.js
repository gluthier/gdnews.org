module.exports = {
  apps: [
    {
      name: 'gdnews-server',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'public'],
      max_memory_restart: '1G',
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'gdnews-batch',
      script: 'src/batch_server/batch_server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'public'],
      max_memory_restart: '1G',
      env_development: {
        NODE_ENV: 'development',
        BATCH_PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        BATCH_PORT: 3001
      }
    }
  ]
};
