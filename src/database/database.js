const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '../../', envFile) });

const mariadb = require('mariadb');

let poolInstance = null;

function getPool() {
  if (!poolInstance) {
    poolInstance = mariadb.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 5
    });
  }
  return poolInstance;
}

module.exports = {
  get pool() {
    return getPool();
  },
  getConnection: () => getPool().getConnection(),
  query: (sql, params) => getPool().query(sql, params),
  close: () => {
    if (poolInstance) {
      return poolInstance.end().then(() => {
        poolInstance = null;
      });
    }
    return Promise.resolve();
  }
};
