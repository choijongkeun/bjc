import mysql from "mysql2/promise";

import { env } from "../config/env.js";

export const pool = mysql.createPool({
  host: env.DB_HOST,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  namedPlaceholders: true,
  decimalNumbers: false
});

export type DbPool = typeof pool;
export type DbConn = mysql.PoolConnection;

