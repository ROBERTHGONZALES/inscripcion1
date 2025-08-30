import mysql from 'mysql2/promise';

// Configuración de la base de datos MySQL
const dbConfig = {
  host: 'mysql-roberth.alwaysdata.net',
  database: 'roberth_basededatos',
  user: 'roberth',
  password: '73814322',
  charset: 'utf8mb4'
};

export async function getConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    return connection;
  } catch (error) {
    console.error('Error conectando a la base de datos:', error);
    throw error;
  }
}
