// Configuración del entorno
module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  debug: process.env.DEBUG === 'true'
};
