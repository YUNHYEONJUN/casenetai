#!/usr/bin/env node
/**
 * SQLite 콜백 스타일 → PostgreSQL async/await 변환
 */

const fs = require('fs');
const path = require('path');

function convertCallbackToAsync(content) {
  // Pattern 1: db.get(sql, params, (err, row) => {...})
  // → const row = await db.get(sql, params);
  
  content = content.replace(
    /return new Promise\(\(resolve, reject\) => \{[\s\S]*?db\.get\(([^,]+),\s*([^,]+),\s*\(err,\s*(\w+)\)\s*=>\s*\{[\s\S]*?if\s*\(err\)\s*\{[\s\S]*?reject\(err\);[\s\S]*?\}\s*else\s*\{[\s\S]*?resolve\(\3\);[\s\S]*?\}[\s\S]*?\}\);[\s\S]*?\}\);/g,
    'const db = getDB();\nconst $3 = await db.get($1, $2);'
  );
  
  // Pattern 2: db.all(sql, params, (err, rows) => {...})
  content = content.replace(
    /return new Promise\(\(resolve, reject\) => \{[\s\S]*?db\.all\(([^,]+),\s*([^,]+),\s*\(err,\s*(\w+)\)\s*=>\s*\{[\s\S]*?if\s*\(err\)\s*\{[\s\S]*?reject\(err\);[\s\S]*?\}\s*else\s*\{[\s\S]*?resolve\(\3\);[\s\S]*?\}[\s\S]*?\}\);[\s\S]*?\}\);/g,
    'const db = getDB();\nconst $3 = await db.query($1, $2);'
  );
  
  return content;
}

function processFile(filePath) {
  console.log(`\n처리 중: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 이미 getDB를 사용하고 있는지 확인
  if (content.includes('const { getDB } = require')) {
    console.log('✅ 이미 getDB 형식 사용 중');
    return;
  }
  
  // db. 패턴이 있는지 확인 (콜백 스타일)
  const hasCallback = /db\.(get|all|run)\([^)]+,\s*\([^)]+\)\s*=>/.test(content);
  
  if (!hasCallback) {
    console.log('✅ 콜백 패턴 없음');
    return;
  }
  
  console.log('⚠️  콜백 패턴 발견, 수동 변환 필요');
  console.log('   파일이 복잡하여 자동 변환 불가');
  console.log('   다음 패턴을 찾아 수동 변환하세요:');
  console.log('   - db.get() with callbacks');
  console.log('   - db.all() with callbacks');
  console.log('   - db.run() with callbacks');
}

// 처리할 파일 목록
const files = [
  'services/analyticsService.js',
  'services/feedbackService.js'
];

console.log('🔍 SQLite 콜백 → PostgreSQL async/await 변환 시작\n');

files.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    processFile(filePath);
  } else {
    console.log(`❌ 파일 없음: ${file}`);
  }
});

console.log('\n✅ 스캔 완료');
console.log('\n💡 해결 방법:');
console.log('   1. analyticsService.js와 feedbackService.js는 복잡한 콜백 구조');
console.log('   2. 두 파일 모두 Promise wrapper를 사용 중');
console.log('   3. getDB()를 사용하도록 수정 필요');
console.log('\n   예시:');
console.log('   Before: db.get(sql, params, (err, row) => {...})');
console.log('   After:  const db = getDB(); const row = await db.get(sql, params);');
