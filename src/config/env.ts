type Env = {
  DB_HOST: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_CONNECTION_LIMIT: number;
  PORT: number;
};

function mustGet(name: keyof Env | string): string {
  const value = process.env[name as string];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const env: Env = {
  DB_HOST: mustGet("DB_HOST"),
  DB_USER: mustGet("DB_USER"),
  DB_PASSWORD: mustGet("DB_PASSWORD"),
  DB_NAME: mustGet("DB_NAME"),
  DB_CONNECTION_LIMIT: Number(process.env.DB_CONNECTION_LIMIT ?? "30"),
  PORT: Number(process.env.PORT ?? "3000")
};

