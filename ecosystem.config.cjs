module.exports = {
  apps: [
    {
      name: "bjc-api",
      cwd: __dirname,
      script: "dist/src/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      watch: false,
      out_file: "logs/pm2/bjc-api.out.log",
      error_file: "logs/pm2/bjc-api.error.log",
      merge_logs: true,
      env_production: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
