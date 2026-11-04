// Type declarations for pg-connection.mjs, so the TypeScript API can share it.
export declare const SUPABASE_CA_FILE: string;
export declare function isSupabaseHost(hostname: string): boolean;
export declare function pgClientConfig(url: string): {
  connectionString: string;
  ssl: false | { ca?: string; rejectUnauthorized: boolean; servername?: string };
  connectionTimeoutMillis: number;
};
