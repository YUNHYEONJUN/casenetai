/**
 * 실제 버그 및 런타임 에러 가능성 체크
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 실제 버그 및 런타임 에러 체크\n');

const bugs = [];

function checkFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fileName = path.relative('.', filePath);
  
  // 1. parseInt/parseFloat without validation
  const parsePattern = /parse(Int|Float)\(([^)]+)\)(?!\s*[;,\)]|\s*&&|\s*\|\|)/g;
  let match;
  while ((match = parsePattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const line = lines[lineNum - 1];
    
    // 다음 줄에서 isNaN 체크가 없는지 확인
    const nextLine = lines[lineNum];
    if (!line.includes('isNaN') && (!nextLine || !nextLine.includes('isNaN'))) {
      bugs.push({
        severity: 'HIGH',
        file: fileName,
        line: lineNum,
        issue: `parse${match[1]} 결과가 NaN 체크 없이 사용됨`,
        code: line.trim(),
        fix: `if (isNaN(value)) { return error... }`
      });
    }
  }
  
  // 2. Array access without length check
  const arrayAccessPattern = /(\w+)\[(\d+|\w+)\](?!\s*&&|\s*\?)/g;
  while ((match = arrayAccessPattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const line = lines[lineNum - 1];
    const varName = match[1];
    
    // 이전 10줄 내에서 배열 길이 체크가 있는지 확인
    const startLine = Math.max(0, lineNum - 11);
    const prevLines = lines.slice(startLine, lineNum - 1).join('\n');
    
    if (!prevLines.includes(`${varName}.length`) && 
        !prevLines.includes(`${varName}?`) &&
        !line.includes('forEach') &&
        !line.includes('map') &&
        varName !== 'process' && varName !== 'req') {
      bugs.push({
        severity: 'MEDIUM',
        file: fileName,
        line: lineNum,
        issue: `배열 ${varName} 길이 체크 없이 접근`,
        code: line.trim(),
        fix: `if (${varName} && ${varName}.length > index) { ... }`
      });
    }
  }
  
  // 3. Async function without error handling
  const asyncFuncPattern = /async\s+(?:function\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
  while ((match = asyncFuncPattern.exec(content)) !== null) {
    const startIdx = match.index;
    const funcName = match[1];
    
    // 함수 본문에서 try-catch 찾기
    let braceCount = 1;
    let idx = content.indexOf('{', startIdx) + 1;
    let funcBody = '';
    
    while (braceCount > 0 && idx < content.length) {
      if (content[idx] === '{') braceCount++;
      if (content[idx] === '}') braceCount--;
      funcBody += content[idx];
      idx++;
    }
    
    const hasTryCatch = funcBody.includes('try') && funcBody.includes('catch');
    const hasAwait = funcBody.includes('await');
    
    if (hasAwait && !hasTryCatch) {
      const lineNum = content.substring(0, startIdx).split('\n').length;
      bugs.push({
        severity: 'MEDIUM',
        file: fileName,
        line: lineNum,
        issue: `async 함수 '${funcName}'에 try-catch 없음`,
        fix: 'try-catch로 에러 처리 추가'
      });
    }
  }
  
  // 4. SQL query without parameterized query
  const sqlPattern = /\.(get|all|run)\s*\(\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE).*\$\{/gi;
  if (sqlPattern.test(content)) {
    const lineNum = content.substring(0, content.search(sqlPattern)).split('\n').length;
    bugs.push({
      severity: 'CRITICAL',
      file: fileName,
      line: lineNum,
      issue: 'SQL Injection 위험: 템플릿 리터럴에 변수 직접 삽입',
      fix: '파라미터 바인딩(?) 사용'
    });
  }
  
  // 5. Password/Secret in code
  const secretPattern = /(password|secret|key|token)\s*=\s*['"][^'"]{8,}['"]/gi;
  while ((match = secretPattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const line = lines[lineNum - 1];
    
    // 환경 변수나 테스트가 아닌 경우
    if (!line.includes('process.env') && 
        !line.includes('test') &&
        !line.includes('example') &&
        !fileName.includes('test')) {
      bugs.push({
        severity: 'CRITICAL',
        file: fileName,
        line: lineNum,
        issue: '하드코딩된 비밀 정보 발견',
        code: line.trim(),
        fix: '환경 변수로 변경'
      });
    }
  }
  
  // 6. Callback hell (3단계 이상 중첩)
  const callbackDepth = (content.match(/function\s*\([^)]*\)\s*\{[^}]*function\s*\([^)]*\)\s*\{[^}]*function\s*\([^)]*\)\s*\{/g) || []).length;
  if (callbackDepth > 0) {
    bugs.push({
      severity: 'MEDIUM',
      file: fileName,
      issue: `Callback hell 발견 (${callbackDepth}곳)`,
      fix: 'Promise 또는 async/await로 변경'
    });
  }
  
  // 7. Memory leak: setInterval without clear
  if (content.includes('setInterval') && !content.includes('clearInterval')) {
    const lineNum = content.search(/setInterval/);
    bugs.push({
      severity: 'HIGH',
      file: fileName,
      line: content.substring(0, lineNum).split('\n').length,
      issue: 'setInterval이 clearInterval 없이 사용됨',
      fix: 'clearInterval 추가'
    });
  }
  
  // 8. Race condition: parallel DB writes
  const dbWritePattern = /await\s+db\.(run|exec)/g;
  const dbWrites = content.match(dbWritePattern) || [];
  if (dbWrites.length > 2 && !content.includes('transaction') && !content.includes('serialize')) {
    bugs.push({
      severity: 'MEDIUM',
      file: fileName,
      issue: `여러 DB write 작업이 transaction 없이 실행됨 (${dbWrites.length}곳)`,
      fix: 'db.transaction 또는 db.serialize 사용'
    });
  }
}

// 스캔 실행
function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir, { withFileTypes: true });
  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
      scanDir(fullPath);
    } else if (file.name.endsWith('.js')) {
      checkFile(fullPath);
    }
  });
}

['routes', 'services', 'middleware', 'database'].forEach(dir => scanDir(dir));
checkFile('server.js');

// 결과 정리
const critical = bugs.filter(b => b.severity === 'CRITICAL');
const high = bugs.filter(b => b.severity === 'HIGH');
const medium = bugs.filter(b => b.severity === 'MEDIUM');

console.log('📊 실제 버그 체크 결과:');
console.log(`   Critical: ${critical.length}개`);
console.log(`   High: ${high.length}개`);
console.log(`   Medium: ${medium.length}개`);
console.log(`   Total: ${bugs.length}개\n`);

if (critical.length > 0) {
  console.log('🔴 CRITICAL 버그:');
  critical.forEach((bug, i) => {
    console.log(`\n${i + 1}. [${bug.file}:${bug.line || '?'}]`);
    console.log(`   문제: ${bug.issue}`);
    if (bug.code) console.log(`   코드: ${bug.code}`);
    console.log(`   수정: ${bug.fix}`);
  });
  console.log('');
}

if (high.length > 0) {
  console.log('🔴 HIGH 버그:');
  high.slice(0, 5).forEach((bug, i) => {
    console.log(`\n${i + 1}. [${bug.file}:${bug.line || '?'}]`);
    console.log(`   문제: ${bug.issue}`);
    if (bug.code) console.log(`   코드: ${bug.code}`);
    console.log(`   수정: ${bug.fix}`);
  });
  if (high.length > 5) console.log(`\n   ... 외 ${high.length - 5}개`);
  console.log('');
}

fs.writeFileSync('critical-bugs.json', JSON.stringify({ critical, high, medium }, null, 2));
console.log('📄 상세 보고서: critical-bugs.json\n');

if (critical.length > 0) {
  console.log('⚠️  Critical 버그를 즉시 수정해야 합니다!');
  process.exit(1);
} else if (high.length > 0) {
  console.log('⚠️  High 버그를 수정하는 것을 권장합니다.');
} else {
  console.log('✅ Critical/High 버그가 발견되지 않았습니다.');
}
