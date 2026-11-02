// Pruebas unitarias
const assert = require('assert');
const { start } = require('../src/app');

describe('App', () => {
  it('debería iniciar correctamente', async () => {
    await start();
    assert.ok(true);
  });
});
