/**
 * 종합 시스템 스캔 - 모든 취약점 탐지
 */

const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('종합 시스템 스캔 시작');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const criticalIssues = [];
const highIssues = [];
const mediumIssues = [];
const lowIssues = [];
const warnings = [];

// 1. 모든 JavaScript 파일 찾기
function findJSFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'uploads'].includes(file)) {
        findJSFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

const jsFiles = findJSFiles('.');
console.log(`📁 검사할 파일: ${jsFiles.length}개\n`);

// 2. 각 파일 상세 검사
jsFiles.forEach(file => {
  if (file.includes('node_modules') || file.includes('test-')) return;
  
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  // 2.1 하드코딩된 비밀정보 검사
  const secretPatterns = [
    { pattern: /password\s*=\s*['"][^'"]{1,}['"]/gi, name: '하드코딩된 비밀번호', severity: 'CRITICAL' },
    { pattern: /api[_-]?key\s*=\s*['"][^'"]{10,}['"]/gi, name: '하드코딩된 API 키', severity: 'CRITICAL' },
    { pattern: /secret\s*=\s*['"][^'"]{10,}['"]/gi, name: '하드코딩된 시크릿', severity: 'CRITICAL' },
    { pattern: /token\s*=\s*['"][^'"]{20,}['"]/gi, name: '하드코딩된 토큰', severity: 'CRITICAL' },
    { pattern: /mongodb:\/\/[^'"]+/gi, name: 'DB 연결 문자열 노출', severity: 'HIGH' },
    { pattern: /mysql:\/\/[^'"]+/gi, name: 'DB 연결 문자열 노출', severity: 'HIGH' },
  ];
  
  secretPatterns.forEach(({ pattern, name, severity }) => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // process.env 사용은 제외
        if (!match.includes('process.env') && !match.includes('JWT_SECRET')) {
          const issue = {
            file,
            issue: name,
            line: lines.findIndex(l => l.includes(match)) + 1,
            code: match.substring(0, 50),
            severity
          };
          
          if (severity === 'CRITICAL') criticalIssues.push(issue);
          else if (severity === 'HIGH') highIssues.push(issue);
        }
      });
    }
  });
  
  // 2.2 SQL Injection 상세 검사
  const sqlPatterns = [
    /db\.run\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
    /db\.all\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
    /db\.get\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
    /db\.prepare\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
    /\.query\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
    /\.query\s*\(\s*"[^"]*"\s*\+/g,
  ];
  
  sqlPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const lineNum = lines.findIndex(l => l.includes(match)) + 1;
        highIssues.push({
          file,
          issue: 'SQL Injection 위험 - 직접 변수 삽입',
          line: lineNum,
          code: match.substring(0, 80),
          recommendation: '파라미터 바인딩(?) 사용'
        });
      });
    }
  });
  
  // 2.3 XSS 취약점 검사
  if (content.includes('innerHTML')) {
    const matches = content.match(/\.innerHTML\s*=/g);
    if (matches) {
      mediumIssues.push({
        file,
        issue: `innerHTML 사용 (${matches.length}회)`,
        recommendation: 'textContent 또는 SecurityUtils.setHtmlSafely 사용'
      });
    }
  }
  
  if (content.includes('eval(')) {
    const lineNum = lines.findIndex(l => l.includes('eval(')) + 1;
    criticalIssues.push({
      file,
      issue: 'eval() 사용 발견',
      line: lineNum,
      recommendation: 'eval() 절대 사용 금지'
    });
  }
  
  // 2.4 인증/권한 검증 누락 검사
  if (file.includes('routes/') && content.includes('router.')) {
    // POST/PUT/DELETE 엔드포인트 검사
    const routePattern = /router\.(post|put|delete|patch)\s*\(\s*['"][^'"]+['"]\s*,\s*(?!authenticateToken|isAdmin|loginLimiter)/g;
    const matches = content.match(routePattern);
    if (matches) {
      matches.forEach(match => {
        const lineNum = lines.findIndex(l => l.includes(match)) + 1;
        highIssues.push({
          file,
          issue: '인증 미들웨어 누락 가능성',
          line: lineNum,
          code: match,
          recommendation: 'authenticateToken 또는 isAdmin 미들웨어 추가'
        });
      });
    }
  }
  
  // 2.5 에러 메시지에서 민감 정보 노출
  const errorPatterns = [
    /error\.stack/g,
    /error\.message/g,
  ];
  
  errorPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches && !content.includes('NODE_ENV') && !content.includes('production')) {
      const lineNum = lines.findIndex(l => l.match(pattern)) + 1;
      mediumIssues.push({
        file,
        issue: '에러 스택 트레이스 노출 가능성',
        line: lineNum,
        recommendation: '프로덕션에서는 숨기기 (NODE_ENV 체크)'
      });
    }
  });
  
  // 2.6 안전하지 않은 난수 생성
  if (content.includes('Math.random()') && (content.includes('token') || content.includes('secret'))) {
    const lineNum = lines.findIndex(l => l.includes('Math.random()')) + 1;
    highIssues.push({
      file,
      issue: '안전하지 않은 난수 생성 (Math.random)',
      line: lineNum,
      recommendation: 'crypto.randomBytes() 사용'
    });
  }
  
  // 2.7 비동기 에러 처리 누락
  const asyncFunctions = content.match(/async\s+(?:function\s+\w+|\([^)]*\)\s*=>|\w+\s*\([^)]*\))/g);
  if (asyncFunctions) {
    asyncFunctions.forEach(func => {
      const funcIndex = content.indexOf(func);
      const funcBlock = content.substring(funcIndex, content.indexOf('}', funcIndex) + 1);
      
      if (!funcBlock.includes('try') && !funcBlock.includes('catch')) {
        const lineNum = lines.findIndex((l, i) => content.substring(0, content.indexOf(func)).split('\n').length === i + 1);
        warnings.push({
          file,
          issue: 'async 함수에 try-catch 없음',
          line: lineNum + 1,
          recommendation: 'try-catch 추가 권장'
        });
      }
    });
  }
  
  // 2.8 console.log에 민감 정보 로깅
  const sensitiveLogPatterns = [
    /console\.log\([^)]*password[^)]*\)/gi,
    /console\.log\([^)]*token[^)]*\)/gi,
    /console\.log\([^)]*secret[^)]*\)/gi,
    /console\.log\([^)]*apikey[^)]*\)/gi,
  ];
  
  sensitiveLogPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const lineNum = lines.findIndex(l => l.match(pattern)) + 1;
        highIssues.push({
          file,
          issue: '민감 정보 로깅',
          line: lineNum,
          code: match.substring(0, 60),
          recommendation: '민감 정보 로깅 제거'
        });
      });
    }
  });
  
  // 2.9 CORS 설정 검사
  if (content.includes('cors') && content.includes("origin: '*'")) {
    criticalIssues.push({
      file,
      issue: 'CORS에서 모든 origin 허용',
      recommendation: '특정 도메인만 허용하도록 변경'
    });
  }
  
  // 2.10 취약한 암호화 알고리즘
  const weakCryptoPatterns = [
    { pattern: /md5/gi, name: 'MD5 사용' },
    { pattern: /sha1/gi, name: 'SHA1 사용' },
    { pattern: /des/gi, name: 'DES 사용' },
  ];
  
  weakCryptoPatterns.forEach(({ pattern, name }) => {
    if (content.match(pattern)) {
      const lineNum = lines.findIndex(l => l.match(pattern)) + 1;
      highIssues.push({
        file,
        issue: `취약한 암호화: ${name}`,
        line: lineNum,
        recommendation: 'SHA-256 이상 또는 bcrypt 사용'
      });
    }
  });
});

// 3. HTML 파일 검사
const htmlFiles = [
  'public/index.html',
  'public/login.html',
  'public/admin-dashboard.html',
  'public/anonymization-compare.html',
  'public/analytics-dashboard.html'
];

htmlFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  
  const content = fs.readFileSync(file, 'utf8');
  
  // 3.1 인라인 스크립트 검사
  const inlineScripts = content.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
  if (inlineScripts) {
    const unsafeScripts = inlineScripts.filter(script => 
      !script.includes('src=') && script.length > 100
    );
    
    if (unsafeScripts.length > 0) {
      mediumIssues.push({
        file,
        issue: `인라인 스크립트 ${unsafeScripts.length}개`,
        recommendation: '외부 파일로 분리 (CSP 정책)'
      });
    }
  }
  
  // 3.2 보안 헤더 누락
  if (!content.includes('Content-Security-Policy')) {
    warnings.push({
      file,
      issue: 'CSP 헤더 없음',
      recommendation: 'Content-Security-Policy 메타 태그 추가'
    });
  }
});

// 4. 환경변수 및 설정 파일 검사
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  
  // JWT_SECRET 강도 검사
  const jwtMatch = envContent.match(/JWT_SECRET=(.+)/);
  if (jwtMatch) {
    const secret = jwtMatch[1].trim();
    if (secret.length < 32) {
      highIssues.push({
        file: '.env',
        issue: `JWT_SECRET이 너무 짧음 (${secret.length}자)`,
        recommendation: '최소 32자 이상 권장'
      });
    }
    
    // 단순 패턴 검사
    if (/^[a-z]{20,}$/i.test(secret)) {
      highIssues.push({
        file: '.env',
        issue: 'JWT_SECRET이 단순함 (영문자만)',
        recommendation: '영문+숫자+특수문자 혼합'
      });
    }
  }
  
  // API 키 검증
  const requiredKeys = ['OPENAI_API_KEY', 'CLOVA_CLIENT_ID', 'CLOVA_CLIENT_SECRET'];
  requiredKeys.forEach(key => {
    if (!envContent.includes(key) || envContent.includes(`${key}=\n`)) {
      warnings.push({
        file: '.env',
        issue: `${key} 미설정`,
        recommendation: '운영 배포 전 설정 필요'
      });
    }
  });
}

// 5. package.json 취약점 검사
if (fs.existsSync('package.json')) {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  // 오래된 패키지 검사
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  
  Object.entries(dependencies).forEach(([name, version]) => {
    // 버전 고정 확인
    if (!version.match(/^\d+\.\d+\.\d+$/)) {
      warnings.push({
        file: 'package.json',
        issue: `${name}: 버전 고정 안됨 (${version})`,
        recommendation: '정확한 버전 명시 (^, ~ 제거)'
      });
    }
  });
}

// 6. 데이터베이스 관련 검사
const dbFiles = jsFiles.filter(f => f.includes('database/') || f.includes('db.js'));

dbFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  
  // 6.1 데이터베이스 연결 설정 검사
  if (content.includes('sqlite3') || content.includes('Database')) {
    // 백업 설정 확인
    if (!content.includes('backup') && !content.includes('BACKUP')) {
      warnings.push({
        file,
        issue: '데이터베이스 백업 로직 없음',
        recommendation: '정기 백업 로직 추가'
      });
    }
  }
  
  // 6.2 트랜잭션 사용 확인
  if (content.includes('INSERT') || content.includes('UPDATE') || content.includes('DELETE')) {
    if (!content.includes('beginTransaction') && !content.includes('BEGIN TRANSACTION')) {
      warnings.push({
        file,
        issue: '트랜잭션 미사용 가능성',
        recommendation: '중요 작업에 트랜잭션 사용'
      });
    }
  }
});

// 7. 서비스 파일 로직 검사
const serviceFiles = jsFiles.filter(f => f.includes('services/'));

serviceFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  
  // 7.1 입력 검증 누락
  if (content.includes('async ') && content.includes('req.body')) {
    const functions = content.match(/async\s+\w+\s*\([^)]*\)/g);
    if (functions) {
      functions.forEach(func => {
        const funcStart = content.indexOf(func);
        const funcBody = content.substring(funcStart, content.indexOf('}', funcStart));
        
        // 입력 검증이 있는지 확인
        const hasValidation = funcBody.includes('if (') || 
                              funcBody.includes('validate') ||
                              funcBody.includes('check');
        
        if (!hasValidation) {
          warnings.push({
            file,
            issue: '입력 검증 누락 가능성',
            function: func,
            recommendation: '입력값 검증 추가'
          });
        }
      });
    }
  }
  
  // 7.2 에러 메시지 노출
  if (content.includes('throw new Error') || content.includes('throw Error')) {
    const errorMessages = content.match(/throw\s+(?:new\s+)?Error\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    if (errorMessages) {
      errorMessages.forEach(msg => {
        // 기술적 정보가 포함되어 있는지 확인
        if (msg.includes('SQL') || msg.includes('database') || msg.includes('query')) {
          const lineNum = content.split('\n').findIndex(l => l.includes(msg)) + 1;
          mediumIssues.push({
            file,
            issue: '에러 메시지에 기술적 정보 포함',
            line: lineNum,
            code: msg.substring(0, 60),
            recommendation: '일반적인 에러 메시지 사용'
          });
        }
      });
    }
  }
});

// 결과 출력
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('스캔 결과 요약');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`🔴 심각 (CRITICAL): ${criticalIssues.length}건`);
console.log(`🟠 높음 (HIGH): ${highIssues.length}건`);
console.log(`🟡 중간 (MEDIUM): ${mediumIssues.length}건`);
console.log(`🟢 낮음 (LOW): ${lowIssues.length}건`);
console.log(`💡 경고 (WARNING): ${warnings.length}건\n`);

// 상세 출력
if (criticalIssues.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔴 심각한 보안 이슈 (즉시 수정 필요)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  criticalIssues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue.file}${issue.line ? ` (Line ${issue.line})` : ''}`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.code) console.log(`   코드: ${issue.code}`);
    console.log(`   권장: ${issue.recommendation || '즉시 수정 필요'}`);
    console.log('');
  });
}

if (highIssues.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🟠 높은 위험도 이슈');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  highIssues.slice(0, 10).forEach((issue, i) => {
    console.log(`${i + 1}. ${issue.file}${issue.line ? ` (Line ${issue.line})` : ''}`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.code) console.log(`   코드: ${issue.code}`);
    console.log(`   권장: ${issue.recommendation}`);
    console.log('');
  });
  
  if (highIssues.length > 10) {
    console.log(`   ... 외 ${highIssues.length - 10}건\n`);
  }
}

if (mediumIssues.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🟡 중간 위험도 이슈');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`총 ${mediumIssues.length}건 발견`);
  console.log('주요 이슈:');
  
  // 그룹화
  const grouped = {};
  mediumIssues.forEach(issue => {
    const key = issue.issue.split('(')[0].trim();
    grouped[key] = (grouped[key] || 0) + 1;
  });
  
  Object.entries(grouped).forEach(([issue, count]) => {
    console.log(`  - ${issue}: ${count}건`);
  });
  console.log('');
}

// JSON으로 저장
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    critical: criticalIssues.length,
    high: highIssues.length,
    medium: mediumIssues.length,
    low: lowIssues.length,
    warnings: warnings.length,
    total: criticalIssues.length + highIssues.length + mediumIssues.length + lowIssues.length + warnings.length
  },
  criticalIssues,
  highIssues,
  mediumIssues,
  lowIssues,
  warnings
};

fs.writeFileSync('comprehensive-scan-report.json', JSON.stringify(report, null, 2));
console.log('📄 상세 리포트: comprehensive-scan-report.json\n');

// 보안 점수 계산
let score = 100;
score -= criticalIssues.length * 25;
score -= highIssues.length * 10;
score -= mediumIssues.length * 3;
score -= warnings.length * 1;
score = Math.max(0, score);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`최종 보안 점수: ${score}/100`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (criticalIssues.length > 0) {
  console.log('🔴 즉시 수정 필요 - 심각한 보안 취약점 존재');
  process.exit(1);
} else if (score >= 90) {
  console.log('✅ 우수한 보안 수준');
} else if (score >= 70) {
  console.log('⚠️  보통 보안 수준 - 개선 권장');
} else {
  console.log('🟠 낮은 보안 수준 - 개선 필요');
}
