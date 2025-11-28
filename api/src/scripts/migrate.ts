#!/usr/bin/env ts-node
/**
 * Database Migration Runner
 *
 * Reads SQL migration files from /database/migrations/ and applies them
 * using Supabase's REST API. Tracks applied migrations in the
 * supabase_migrations.schema_migrations table.
 *
 * Usage:
 *   npm run migrate           - Apply pending migrations
 *   npm run migrate:status    - Show migration status
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 *   - exec_sql function must exist (created by setup script)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Migration {
  version: string;
  name: string;
  filename: string;
  sql: string;
}

interface AppliedMigration {
  version: string;
  name: string;
}

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'database', 'migrations');

class MigrationRunner {
  private supabase: SupabaseClient;
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Execute raw SQL using Supabase REST API
   */
  private async executeSql(sql: string): Promise<void> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ sql_query: sql })
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Check if exec_sql function doesn't exist
      if (errorText.includes('42883') || errorText.includes('function') && errorText.includes('does not exist')) {
        throw new Error(
          `\n❌ The exec_sql function is not installed.\n\n` +
          `Please run this SQL in your Supabase dashboard (SQL Editor):\n\n` +
          `CREATE OR REPLACE FUNCTION exec_sql(sql_query text)\n` +
          `RETURNS void AS $$\n` +
          `BEGIN\n` +
          `  EXECUTE sql_query;\n` +
          `END;\n` +
          `$$ LANGUAGE plpgsql SECURITY DEFINER;\n`
        );
      }

      throw new Error(`SQL execution failed: ${errorText}`);
    }
  }

  /**
   * Parse migration filename to extract version and name
   */
  private parseMigrationFilename(filename: string): { version: string; name: string } | null {
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) return null;

    return {
      version: match[1],
      name: match[2]
    };
  }

  /**
   * Read all migration files from the migrations directory
   */
  private readMigrationFiles(): Migration[] {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log(`Migrations directory not found: ${MIGRATIONS_DIR}`);
      return [];
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const migrations: Migration[] = [];

    for (const filename of files) {
      const parsed = this.parseMigrationFilename(filename);
      if (!parsed) {
        console.warn(`Skipping invalid migration filename: ${filename}`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf-8');

      migrations.push({
        version: parsed.version,
        name: parsed.name,
        filename,
        sql
      });
    }

    return migrations;
  }

  /**
   * Get list of applied migrations from the database
   */
  private async getAppliedMigrations(): Promise<AppliedMigration[]> {
    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/get_applied_migrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Function might not exist yet
        if (errorText.includes('42883')) {
          console.warn('get_applied_migrations function not found, assuming no migrations applied');
          return [];
        }
        console.warn(`Could not read migrations: ${errorText}`);
        return [];
      }

      const data = await response.json() as AppliedMigration[];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn(`Could not read migrations table: ${error}`);
      return [];
    }
  }

  /**
   * Record a migration as applied
   */
  private async recordMigration(migration: Migration): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/record_migration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          p_version: timestamp,
          p_name: migration.name
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`  Warning: Could not record migration: ${errorText}`);
      }
    } catch (error) {
      console.warn(`  Warning: Could not record migration: ${error}`);
    }
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: Migration): Promise<void> {
    console.log(`  Applying: ${migration.filename}...`);

    await this.executeSql(migration.sql);
    await this.recordMigration(migration);

    console.log(`  ✓ Applied: ${migration.filename}`);
  }

  /**
   * Run pending migrations
   */
  async migrate(): Promise<void> {
    console.log('\n📦 Database Migration Runner\n');
    console.log(`Migrations directory: ${MIGRATIONS_DIR}\n`);

    const allMigrations = this.readMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedNames = new Set(appliedMigrations.map(m => m.name));

    // Find pending migrations by name
    const pendingMigrations = allMigrations.filter(m => !appliedNames.has(m.name));

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations. Database is up to date.\n');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);

    for (const migration of pendingMigrations) {
      try {
        await this.applyMigration(migration);
      } catch (error) {
        console.error(`\n❌ Migration failed: ${migration.filename}`);
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }

    console.log(`\n✅ Successfully applied ${pendingMigrations.length} migration(s).\n`);
  }

  /**
   * Show migration status
   */
  async status(): Promise<void> {
    console.log('\n📦 Migration Status\n');

    const allMigrations = this.readMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedNames = new Set(appliedMigrations.map(m => m.name));

    console.log('Local migrations:');
    console.log('─'.repeat(60));

    for (const migration of allMigrations) {
      const status = appliedNames.has(migration.name) ? '✓' : '○';
      console.log(`  ${status} ${migration.filename}`);
    }

    console.log('─'.repeat(60));

    const pending = allMigrations.filter(m => !appliedNames.has(m.name));
    console.log(`\nTotal: ${allMigrations.length} | Applied: ${appliedMigrations.length} | Pending: ${pending.length}\n`);
  }
}

// CLI entry point
async function main() {
  const command = process.argv[2] || 'migrate';
  const runner = new MigrationRunner();

  try {
    switch (command) {
      case 'migrate':
        await runner.migrate();
        break;
      case 'status':
        await runner.status();
        break;
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Usage: npm run migrate [migrate|status]');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
