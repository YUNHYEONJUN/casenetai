/**
 * 데이터베이스 연결 및 헬퍼 함수
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'casenetai.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ DB 연결 실패:', err);
      } else {
        console.log('✅ DB 연결 성공:', DB_PATH);
        // WAL 모드 활성화 (성능 향상)
        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run('PRAGMA foreign_keys = ON');
      }
    });
  }

  // Promise 기반 쿼리 실행
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Promise 기반 단일 row 조회
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Promise 기반 실행 (INSERT, UPDATE, DELETE)
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  // 트랜잭션 시작
  beginTransaction() {
    return this.run('BEGIN TRANSACTION');
  }

  // 트랜잭션 커밋
  commit() {
    return this.run('COMMIT');
  }

  // 트랜잭션 롤백
  rollback() {
    return this.run('ROLLBACK');
  }

  // DB 연결 종료
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

// 싱글톤 인스턴스
let dbInstance = null;

function getDB() {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}

module.exports = {
  getDB,
  Database
};
