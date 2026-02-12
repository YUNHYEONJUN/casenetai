/**
 * 심층 코드 리뷰 스크립트
 * - 런타임 오류 가능성 검사
 * - 로직 버그 탐지
 * - 보안 취약점 재검증
 * - 성능 이슈 탐지
 */

const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 CaseNetAI 심층 코드 리뷰');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const issues = {
  critical: [],
  high: [],
  medium: [],
  low: [],
  info: []
};

let totalFiles = 0;

// 검사할 파일 패턴
const filePatterns = [
  'server.js',
  'routes/*.js',
  'services/*.js',
  'middleware/*.js',
  'database/*.js',
  'public/js/*.js'
];

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  totalFiles++;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fileName = path.relative('.', filePath);
  
  // 1. Null/Undefined 체크 누락
  checkNullSafety(fileName, content, lines);
  
  // 2. 비동기 처리 오류
  checkAsyncErrors(fileName, content, lines);
  
  // 3. 데이터베이스 연결 관리
  checkDatabaseConnection(fileName, content, lines);
  
  // 4. 입력 검증 누락
  checkInputValidation(fileName, content, lines);
  
  // 5. 에러 처리 누락
  checkErrorHandling(fileName, content, lines);
  
  // 6. 메모리 누수 가능성
  checkMemoryLeaks(fileName, content, lines);
  
  // 7. 레이스 컨디션
  checkRaceConditions(fileName, content, lines);
  
  // 8. 하드코딩된 값
  checkHardcodedValues(fileName, content, lines);
  
  // 9. 불필요한 로깅
  checkLogging(fileName, content, lines);
  
  // 10. API 응답 일관성
  checkAPIConsistency(fileName, content, lines);
}

function checkNullSafety(file, content, lines) {
  // req.body, req.params, req.query 사용 시 null 체크 누락
  const patterns = [
    /req\.body\.(\w+)(?!\s*&&|\s*\?|\s*\|\|)/g,
    /req\.params\.(\w+)(?!\s*&&|\s*\?|\s*\|\|)/g,
    /req\.query\.(\w+)(?!\s*&&|\s*\?|\s*\|\|)/g
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNum - 1];
      
      // if 문이나 검증 로직 내부가 아닌 경우
      if (!line.includes('if') && !line.includes('!') && !line.includes('||')) {
        issues.medium.push({
          file,
          line: lineNum,
          issue: `Null safety 체크 누락: ${match[0]}`,
          code: line.trim(),
          recommendation: '값 사용 전 존재 여부 확인 필요'
        });
      }
    }
  });
}

function checkAsyncErrors(file, content, lines) {
  // async 함수에서 Promise.all 사용 시 에러 처리 확인
  if (content.includes('Promise.all') || content.includes('Promise.race')) {
    const hasErrorHandling = content.includes('.catch') || 
                             content.includes('try') ||
                             /Promise\.(all|race)\([^)]+\)\.catch/.test(content);
    
    if (!hasErrorHandling) {
      issues.high.push({
        file,
        issue: 'Promise.all/race 에러 처리 누락',
        recommendation: '.catch() 또는 try-catch 추가 필요'
      });
    }
  }
  
  // await 사용 시 try-catch 누락 체크
  const awaitMatches = content.match(/await\s+\w+/g) || [];
  const tryBlocks = content.match(/try\s*\{/g) || [];
  
  if (awaitMatches.length > 0 && tryBlocks.length === 0) {
    issues.medium.push({
      file,
      issue: `${awaitMatches.length}개의 await 문이 try-catch 없이 사용됨`,
      recommendation: 'async/await는 try-catch로 감싸는 것이 권장됨'
    });
  }
}

function checkDatabaseConnection(file, content, lines) {
  // db.get, db.all, db.run 사용 시 연결 체크
  if (content.includes('db.get') || content.includes('db.all') || content.includes('db.run')) {
    const hasConnectionCheck = content.includes('getDB()') || content.includes('db.open');
    
    // database.close() 후 사용 가능성
    const closeMatch = content.match(/db\.close\(\)/g);
    if (closeMatch && closeMatch.length > 0) {
      issues.high.push({
        file,
        issue: 'Database 연결 close 후 재사용 가능성',
        recommendation: '연결 풀(pool) 사용 또는 적절한 연결 관리 필요'
      });
    }
  }
}

function checkInputValidation(file, content, lines) {
  // routes 파일에서 req.body 검증
  if (file.includes('routes/')) {
    const bodyAccess = (content.match(/req\.body\.\w+/g) || []).length;
    const validation = (content.match(/if\s*\([^)]*req\.body/g) || []).length;
    
    if (bodyAccess > validation * 2) {
      issues.medium.push({
        file,
        issue: '입력 검증 부족 (req.body 사용 vs 검증 비율)',
        recommendation: '모든 사용자 입력에 대해 검증 필요'
      });
    }
  }
  
  // 이메일 검증 정규식 확인
  const emailRegex = content.match(/\/[^\/]+@[^\/]+\//g);
  if (emailRegex && emailRegex.some(r => !r.includes('\\.'))) {
    issues.low.push({
      file,
      issue: '이메일 검증 정규식이 불완전할 수 있음',
      recommendation: '표준 이메일 정규식 사용 권장'
    });
  }
}

function checkErrorHandling(file, content, lines) {
  // catch 블록에서 에러를 무시하는 경우
  const catchBlocks = content.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/gs) || [];
  
  catchBlocks.forEach((block, index) => {
    if (block.includes('// ignore') || block.includes('// TODO')) {
      const lineNum = content.substring(0, content.indexOf(block)).split('\n').length;
      issues.medium.push({
        file,
        line: lineNum,
        issue: 'catch 블록에서 에러를 무시하거나 TODO 상태',
        recommendation: '적절한 에러 처리 또는 로깅 추가'
      });
    }
    
    // 빈 catch 블록
    if (block.match(/catch\s*\([^)]*\)\s*\{\s*\}/)) {
      issues.high.push({
        file,
        issue: '빈 catch 블록 발견 - 에러가 조용히 무시됨',
        recommendation: '최소한 로깅이라도 추가해야 함'
      });
    }
  });
}

function checkMemoryLeaks(file, content, lines) {
  // setInterval이나 setTimeout 정리 확인
  const setIntervalCount = (content.match(/setInterval/g) || []).length;
  const clearIntervalCount = (content.match(/clearInterval/g) || []).length;
  
  if (setIntervalCount > clearIntervalCount) {
    issues.medium.push({
      file,
      issue: `setInterval(${setIntervalCount}) vs clearInterval(${clearIntervalCount}) 불균형`,
      recommendation: '모든 interval은 반드시 clear 되어야 함'
    });
  }
  
  // 이벤트 리스너 정리
  const addEventCount = (content.match(/addEventListener|on\(/g) || []).length;
  const removeEventCount = (content.match(/removeEventListener|off\(/g) || []).length;
  
  if (addEventCount > 5 && removeEventCount === 0) {
    issues.low.push({
      file,
      issue: '이벤트 리스너가 제거되지 않을 수 있음',
      recommendation: '컴포넌트 언마운트 시 이벤트 리스너 제거'
    });
  }
}

function checkRaceConditions(file, content, lines) {
  // 동일 변수에 대한 여러 비동기 작업
  const asyncVarWrites = content.match(/(\w+)\s*=\s*await/g) || [];
  const varNames = asyncVarWrites.map(m => m.split('=')[0].trim());
  const duplicates = varNames.filter((item, index) => varNames.indexOf(item) !== index);
  
  if (duplicates.length > 0) {
    issues.low.push({
      file,
      issue: `동일 변수(${duplicates.join(', ')})에 대한 여러 async 할당`,
      recommendation: 'Race condition 가능성 검토 필요'
    });
  }
}

function checkHardcodedValues(file, content, lines) {
  // 포트 번호, API URL 하드코딩
  const hardcodedPorts = content.match(/:\d{4,5}(?!\/\/)/g) || [];
  if (hardcodedPorts.length > 0 && !content.includes('process.env.PORT')) {
    issues.low.push({
      file,
      issue: `하드코딩된 포트 번호: ${hardcodedPorts.join(', ')}`,
      recommendation: '환경 변수 사용 권장'
    });
  }
  
  // API 키 패턴
  const possibleKeys = content.match(/['"](sk|pk)_[a-zA-Z0-9]{20,}['"]/g) || [];
  if (possibleKeys.length > 0) {
    issues.critical.push({
      file,
      issue: 'API 키가 하드코딩된 것으로 의심됨',
      code: possibleKeys[0],
      recommendation: '즉시 환경 변수로 변경 및 키 재발급'
    });
  }
}

function checkLogging(file, content, lines) {
  // console.log 과다 사용
  const consoleCount = (content.match(/console\.(log|info|warn|error)/g) || []).length;
  
  if (consoleCount > 20 && file.includes('services/')) {
    issues.info.push({
      file,
      issue: `과도한 console 사용 (${consoleCount}회)`,
      recommendation: '구조화된 로깅 라이브러리(winston, pino) 사용 권장'
    });
  }
  
  // 프로덕션 환경에서도 debug 로그
  if (content.includes('console.log') && !content.includes('process.env.NODE_ENV')) {
    issues.low.push({
      file,
      issue: '환경별 로그 레벨 구분 없음',
      recommendation: 'NODE_ENV에 따라 로그 레벨 조정'
    });
  }
}

function checkAPIConsistency(file, content, lines) {
  if (!file.includes('routes/')) return;
  
  // 일관되지 않은 응답 형식
  const successPatterns = [
    /res\.json\(\s*\{[^}]*success:\s*true/g,
    /res\.json\(\s*\{[^}]*success:\s*false/g
  ];
  
  const successTrue = (content.match(successPatterns[0]) || []).length;
  const successFalse = (content.match(successPatterns[1]) || []).length;
  
  // success 필드 없이 응답하는 경우
  const jsonResponses = (content.match(/res\.json\(/g) || []).length;
  const withSuccess = successTrue + successFalse;
  
  if (jsonResponses > 0 && withSuccess < jsonResponses * 0.5) {
    issues.medium.push({
      file,
      issue: 'API 응답 형식이 일관되지 않음 (success 필드 누락)',
      recommendation: '모든 API 응답에 success 필드 포함 권장'
    });
  }
  
  // 상태 코드 없이 에러 응답
  const errorResponses = content.match(/res\.json\(\s*\{[^}]*error/g) || [];
  errorResponses.forEach(match => {
    const beforeMatch = content.substring(0, content.indexOf(match));
    const statusMatch = beforeMatch.match(/res\.status\(\d+\)/g);
    
    if (!statusMatch || statusMatch.length === 0) {
      issues.medium.push({
        file,
        issue: '에러 응답에 HTTP 상태 코드 누락',
        recommendation: 'res.status(4xx/5xx).json() 사용'
      });
    }
  });
}

// 파일 스캔 실행
function scanDirectory(dir, pattern) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
      scanDirectory(fullPath, pattern);
    } else if (file.isFile() && file.name.endsWith('.js')) {
      scanFile(fullPath);
    }
  });
}

// 메인 스캔
const dirsToScan = ['routes', 'services', 'middleware', 'database', 'public/js'];
dirsToScan.forEach(dir => {
  if (fs.existsSync(dir)) {
    scanDirectory(dir, '*.js');
  }
});

// server.js 별도 스캔
if (fs.existsSync('server.js')) {
  scanFile('server.js');
}

// 결과 출력
console.log('📊 스캔 결과');
console.log('─────────────────────────────────────────');
console.log(`검사한 파일: ${totalFiles}개`);
console.log(`Critical: ${issues.critical.length}개`);
console.log(`High: ${issues.high.length}개`);
console.log(`Medium: ${issues.medium.length}개`);
console.log(`Low: ${issues.low.length}개`);
console.log(`Info: ${issues.info.length}개\n`);

// Critical 이슈 출력
if (issues.critical.length > 0) {
  console.log('🔴 CRITICAL 이슈:');
  console.log('─────────────────────────────────────────');
  issues.critical.forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.file}]`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.code) console.log(`   코드: ${issue.code}`);
    if (issue.line) console.log(`   라인: ${issue.line}`);
    console.log(`   권장: ${issue.recommendation}\n`);
  });
}

// High 이슈 출력 (상위 10개)
if (issues.high.length > 0) {
  console.log('🔴 HIGH 이슈 (상위 10개):');
  console.log('─────────────────────────────────────────');
  issues.high.slice(0, 10).forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.file}]`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.line) console.log(`   라인: ${issue.line}`);
    console.log(`   권장: ${issue.recommendation}\n`);
  });
  if (issues.high.length > 10) {
    console.log(`   ... 외 ${issues.high.length - 10}개\n`);
  }
}

// Medium 이슈 출력 (상위 5개)
if (issues.medium.length > 0) {
  console.log('🟡 MEDIUM 이슈 (상위 5개):');
  console.log('─────────────────────────────────────────');
  issues.medium.slice(0, 5).forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.file}]`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.line) console.log(`   라인: ${issue.line}`);
    console.log(`   권장: ${issue.recommendation}\n`);
  });
  if (issues.medium.length > 5) {
    console.log(`   ... 외 ${issues.medium.length - 5}개\n`);
  }
}

// JSON 저장
const report = {
  timestamp: new Date().toISOString(),
  totalFiles,
  summary: {
    critical: issues.critical.length,
    high: issues.high.length,
    medium: issues.medium.length,
    low: issues.low.length,
    info: issues.info.length,
    total: issues.critical.length + issues.high.length + issues.medium.length + issues.low.length + issues.info.length
  },
  issues
};

fs.writeFileSync('deep-code-review-report.json', JSON.stringify(report, null, 2));
console.log('📄 상세 보고서: deep-code-review-report.json\n');

// 최종 평가
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ 코드 리뷰 완료\n');

if (issues.critical.length > 0) {
  console.log('⚠️  Critical 이슈가 있습니다. 즉시 수정이 필요합니다.');
  process.exit(1);
} else if (issues.high.length > 0) {
  console.log('⚠️  High 이슈가 있습니다. 배포 전 수정을 권장합니다.');
} else {
  console.log('✨ 심각한 이슈가 발견되지 않았습니다.');
}
