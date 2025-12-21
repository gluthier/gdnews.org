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
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    },

  ]
};
