// Punto de entrada del proyecto
const { start } = require('./app');

start().then(() => {
  console.log('Aplicación iniciada');
}).catch(err => {
  console.error('Error:', err);
});
