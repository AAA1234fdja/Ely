// Lógica principal de la aplicación
function start() {
  return new Promise((resolve, reject) => {
    // Inicializar módulos
    const config = require('./config');
    console.log('Config cargada:', config.env);
    resolve();
  });
}

module.exports = { start };
