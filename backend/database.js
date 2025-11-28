const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./propostas.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS propostas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    empresa TEXT,
    valor TEXT,
    descricao TEXT,
    email TEXT,
    data_envio TEXT,
    status TEXT
  )`);
});

module.exports = db;
