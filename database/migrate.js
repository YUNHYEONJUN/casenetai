/**
 * Database Migration Script
 */

const fs = require('fs');
const path = require('path');
const { getDB } = require('./db');

async function runMigration(migrationFile) {
  const db = getDB();
  const migrationPath = path.join(__dirname, 'migrations', migrationFile);
  
  console.log(`📝 Running migration: ${migrationFile}`);
  
  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await db.run(statement.trim());
      }
    }
    
    console.log(`✅ Migration completed: ${migrationFile}`);
    return true;
  } catch (error) {
    console.error(`❌ Migration failed: ${migrationFile}`, error.message);
    return false;
  }
}

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠️  No migrations directory found');
    return;
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  if (files.length === 0) {
    console.log('⚠️  No migration files found');
    return;
  }
  
  console.log('\n🚀 Starting database migrations...\n');
  
  for (const file of files) {
    await runMigration(file);
  }
  
  console.log('\n✨ All migrations completed!\n');
}

// Run migrations if executed directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}

module.exports = { migrate, runMigration };
