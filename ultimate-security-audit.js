/**
 * 궁극의 보안 및 오류 분석
 * - 모든 보안 취약점 재검증
 * - 실제 런타임 오류 가능성
 * - 비즈니스 로직 버그
 * - 데이터 무결성 문제
 */

const fs = require('fs');
const path = require('path');

const issues = {
  critical: [],
  high: [],
  medium: [],
  low: []
};

let filesScanned = 0;

function analyzeFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  
  filesScanned++;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const fileName = path.relative('.', filePath);
  
  // 1. 비밀번호 해싱 검증
  checkPasswordHashing(fileName, content, lines);
  
  // 2. JWT 토큰 보안
  checkJWTSecurity(fileName, content, lines);
  
  // 3. 파일 업로드 보안
  checkFileUploadSecurity(fileName, content, lines);
  
  // 4. 인증/인가 누락
  checkAuthorizationBypass(fileName, content, lines);
  
  // 5. IDOR (Insecure Direct Object Reference)
  checkIDOR(fileName, content, lines);
  
  // 6. 비즈니스 로직 오류
  checkBusinessLogicFlaws(fileName, content, lines);
  
  // 7. 데이터베이스 무결성
  checkDatabaseIntegrity(fileName, content, lines);
  
  // 8. 경쟁 조건 (Race Condition)
  checkRaceConditions(fileName, content, lines);
  
  // 9. 정보 노출
  checkInformationDisclosure(fileName, content, lines);
  
  // 10. 에러 처리 부재
  checkErrorHandlingGaps(fileName, content, lines);
}

function checkPasswordHashing(file, content, lines) {
  // bcrypt salt rounds 체크
  const bcryptPattern = /bcrypt\.(hash|hashSync)\([^,]+,\s*(\d+)/g;
  let match;
  
  while ((match = bcryptPattern.exec(content)) !== null) {
    const rounds = parseInt(match[2]);
    if (rounds < 12) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      issues.high.push({
        file,
        line: lineNum,
        issue: `bcrypt salt rounds가 ${rounds}로 너무 낮음 (권장: 12 이상)`,
        code: lines[lineNum - 1].trim(),
        fix: 'bcrypt.hash(password, 12) 로 변경',
        impact: '브루트포스 공격에 취약'
      });
    }
  }
  
  // 비밀번호 비교 시 timing attack 방지
  if (content.includes('password') && content.includes('===') && !content.includes('bcrypt.compare')) {
    const lineNum = lines.findIndex(l => l.includes('password') && l.includes('===')) + 1;
    if (lineNum > 0) {
      issues.critical.push({
        file,
        line: lineNum,
        issue: '비밀번호를 직접 비교 (timing attack 취약)',
        code: lines[lineNum - 1].trim(),
        fix: 'bcrypt.compare() 사용',
        impact: 'CRITICAL - 비밀번호 유출 가능'
      });
    }
  }
}

function checkJWTSecurity(file, content, lines) {
  // JWT secret 길이 체크
  if (content.includes('JWT_SECRET')) {
    const secretPattern = /JWT_SECRET\s*=\s*['"]([^'"]+)['"]/;
    const match = content.match(secretPattern);
    
    if (match && match[1].length < 32) {
      issues.critical.push({
        file,
        issue: `JWT_SECRET이 너무 짧음 (${match[1].length}자)`,
        fix: '최소 32자 이상의 랜덤 문자열 사용',
        impact: 'JWT 토큰 위조 가능'
      });
    }
  }
  
  // JWT 검증 없이 디코딩
  if (content.includes('jwt.decode') && !content.includes('jwt.verify')) {
    issues.high.push({
      file,
      issue: 'JWT를 verify 없이 decode만 수행',
      fix: 'jwt.verify() 사용',
      impact: '위조된 토큰 수용 가능'
    });
  }
  
  // expiresIn 누락
  if (content.includes('jwt.sign') && !content.includes('expiresIn')) {
    const lineNum = content.search(/jwt\.sign/);
    issues.high.push({
      file,
      line: content.substring(0, lineNum).split('\n').length,
      issue: 'JWT에 만료 시간 미설정',
      fix: "jwt.sign(payload, secret, { expiresIn: '1h' })",
      impact: '토큰이 영구적으로 유효함'
    });
  }
}

function checkFileUploadSecurity(file, content, lines) {
  if (!content.includes('multer')) return;
  
  // 파일 크기 제한 확인
  if (!content.includes('limits:') || !content.includes('fileSize')) {
    issues.high.push({
      file,
      issue: 'multer 파일 크기 제한 없음',
      fix: 'limits: { fileSize: 10 * 1024 * 1024 } 추가',
      impact: 'DoS 공격 가능 (대용량 파일 업로드)'
    });
  }
  
  // 파일 타입 검증
  if (!content.includes('fileFilter')) {
    issues.high.push({
      file,
      issue: 'multer 파일 타입 검증 없음',
      fix: 'fileFilter 콜백으로 허용된 타입만 수용',
      impact: '악성 파일 업로드 가능'
    });
  }
  
  // 파일명 sanitization
  if (content.includes('originalname') && !content.includes('sanitize')) {
    issues.medium.push({
      file,
      issue: '업로드 파일명 sanitization 누락',
      fix: 'path.basename() + UUID 사용',
      impact: '경로 탐색 공격 가능'
    });
  }
}

function checkAuthorizationBypass(file, content, lines) {
  if (!file.includes('routes/')) return;
  
  // router.use() 이후 router.METHOD() 체크
  const routerUseIdx = content.indexOf('router.use(authenticateToken)');
  
  if (routerUseIdx > -1) {
    // router.use 이전에 정의된 라우트들
    const beforeUse = content.substring(0, routerUseIdx);
    const unprotectedRoutes = beforeUse.match(/router\.(get|post|put|delete|patch)/g) || [];
    
    if (unprotectedRoutes.length > 0) {
      issues.critical.push({
        file,
        issue: `${unprotectedRoutes.length}개 라우트가 인증 미들웨어 이전에 정의됨`,
        fix: 'router.use(authenticateToken)를 파일 상단으로 이동',
        impact: '인증 우회 가능'
      });
    }
  }
  
  // 관리자 전용 라우트에서 권한 체크 누락
  if (file.includes('admin') && content.includes('router.')) {
    const hasAdminCheck = content.includes('requireAdmin') || 
                          content.includes('isAdmin') ||
                          content.includes('role === \'system_admin\'');
    
    if (!hasAdminCheck) {
      issues.critical.push({
        file,
        issue: '관리자 라우터에 권한 체크 없음',
        fix: 'router.use(requireAdmin) 추가',
        impact: '권한 상승 공격 가능'
      });
    }
  }
}

function checkIDOR(file, content, lines) {
  // req.params.id를 사용하면서 소유권 체크 없는 경우
  if (content.includes('req.params.id') || content.includes('req.params.userId')) {
    const hasOwnershipCheck = 
      content.includes('req.user.userId') ||
      content.includes('req.user.id') ||
      content.includes('user_id = ?');
    
    if (!hasOwnershipCheck && !file.includes('admin')) {
      issues.high.push({
        file,
        issue: 'IDOR 취약점: URL 파라미터 ID에 대한 소유권 검증 없음',
        fix: 'WHERE id = ? AND user_id = ? 조건 추가',
        impact: '다른 사용자의 데이터 접근/수정 가능'
      });
    }
  }
}

function checkBusinessLogicFlaws(file, content, lines) {
  // 크레딧 차감 로직
  if (content.includes('balance') && (content.includes('UPDATE credits') || content.includes('balance -'))) {
    // 음수 체크
    const hasNegativeCheck = content.includes('balance < 0') || 
                             content.includes('balance <= 0') ||
                             content.includes('CHECK (balance >= 0)');
    
    if (!hasNegativeCheck) {
      issues.high.push({
        file,
        issue: '크레딧 잔액 음수 방지 체크 없음',
        fix: 'IF balance < amount THEN RAISE ERROR',
        impact: '무한 크레딧 사용 가능'
      });
    }
  }
  
  // 금액 계산에서 부동소수점 사용
  if (content.includes('amount') && content.includes('parseFloat')) {
    issues.medium.push({
      file,
      issue: '금액 계산에 부동소수점 사용',
      fix: '정수(센트 단위) 또는 Decimal 라이브러리 사용',
      impact: '금액 계산 오류 가능'
    });
  }
}

function checkDatabaseIntegrity(file, content, lines) {
  // SQL에서 ON DELETE CASCADE 없이 외래키 사용
  if (content.includes('FOREIGN KEY') && !content.includes('ON DELETE')) {
    issues.medium.push({
      file,
      issue: '외래키에 ON DELETE 정책 없음',
      fix: 'ON DELETE CASCADE/SET NULL/RESTRICT 추가',
      impact: '고아 레코드 발생 가능'
    });
  }
  
  // 트랜잭션 없이 여러 INSERT/UPDATE
  const insertCount = (content.match(/INSERT INTO/gi) || []).length;
  const updateCount = (content.match(/UPDATE \w+ SET/gi) || []).length;
  const hasTransaction = content.includes('BEGIN') || 
                         content.includes('transaction') ||
                         content.includes('serialize');
  
  if ((insertCount + updateCount > 1) && !hasTransaction) {
    issues.high.push({
      file,
      issue: `트랜잭션 없이 ${insertCount + updateCount}개의 쓰기 작업`,
      fix: 'BEGIN ... COMMIT/ROLLBACK 사용',
      impact: '데이터 불일치 발생 가능'
    });
  }
}

function checkRaceConditions(file, content, lines) {
  // SELECT 후 UPDATE (Check-Then-Act)
  const hasSelectThenUpdate = /SELECT.*FROM.*WHERE/.test(content) && 
                              /UPDATE.*SET.*WHERE/.test(content);
  
  if (hasSelectThenUpdate && !content.includes('FOR UPDATE')) {
    issues.high.push({
      file,
      issue: 'Race condition: SELECT 후 UPDATE (Check-Then-Act)',
      fix: 'SELECT ... FOR UPDATE 또는 낙관적 잠금 사용',
      impact: '동시 요청 시 데이터 불일치'
    });
  }
  
  // 잔액 차감 시 원자성 보장 없음
  if (content.includes('balance') && content.includes('UPDATE')) {
    const atomicUpdate = /UPDATE.*SET balance = balance - /i.test(content);
    
    if (!atomicUpdate) {
      issues.critical.push({
        file,
        issue: '잔액 차감이 원자적이지 않음',
        fix: 'UPDATE credits SET balance = balance - ? WHERE id = ?',
        impact: 'CRITICAL - 이중 차감 또는 무한 크레딧 가능'
      });
    }
  }
}

function checkInformationDisclosure(file, content, lines) {
  // 에러 메시지에 민감한 정보 포함
  if (content.includes('error.stack') || content.includes('error.message')) {
    const sendToClient = /res\.(json|send).*error\.(stack|message)/.test(content);
    
    if (sendToClient) {
      issues.high.push({
        file,
        issue: '에러 스택/메시지를 클라이언트에 노출',
        fix: 'NODE_ENV === production일 때 일반 메시지만 전송',
        impact: '내부 구조 정보 노출'
      });
    }
  }
  
  // SQL 에러를 그대로 반환
  if (content.includes('catch (error)') && content.includes('res.json') && content.includes('error')) {
    const lineNum = lines.findIndex(l => l.includes('res.json') && l.includes('error'));
    if (lineNum > 0) {
      const line = lines[lineNum];
      if (!line.includes('error.message') && !line.includes('일반 메시지')) {
        issues.medium.push({
          file,
          line: lineNum + 1,
          issue: 'DB 에러를 그대로 클라이언트에 반환 가능',
          fix: '일반화된 에러 메시지 사용',
          impact: '데이터베이스 스키마 정보 노출'
        });
      }
    }
  }
}

function checkErrorHandlingGaps(file, content, lines) {
  // db.get/all/run 에서 await 사용하면서 try-catch 없음
  const dbOps = content.match(/await\s+db\.(get|all|run)/g) || [];
  const tryBlocks = content.match(/try\s*\{/g) || [];
  
  if (dbOps.length > 0 && tryBlocks.length === 0) {
    issues.high.push({
      file,
      issue: `${dbOps.length}개의 DB 작업이 try-catch 없이 실행됨`,
      fix: 'try-catch로 감싸기',
      impact: '에러 발생 시 서버 크래시 가능'
    });
  }
  
  // Promise.all 에서 에러 하나가 전체 실패
  if (content.includes('Promise.all')) {
    const hasAllSettled = content.includes('allSettled');
    
    if (!hasAllSettled) {
      issues.medium.push({
        file,
        issue: 'Promise.all 사용 (하나 실패 시 전체 실패)',
        fix: 'Promise.allSettled 사용 고려',
        impact: '부분 실패 처리 불가'
      });
    }
  }
}

// 스캔 실행
function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
      scanDirectory(fullPath);
    } else if (file.isFile() && (file.name.endsWith('.js') || file.name.endsWith('.sql'))) {
      analyzeFile(fullPath);
    }
  });
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔒 궁극의 보안 감사 (Ultimate Security Audit)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

['routes', 'services', 'middleware', 'database', 'config'].forEach(dir => scanDirectory(dir));
analyzeFile('server.js');

const critical = issues.critical;
const high = issues.high;
const medium = issues.medium;
const low = issues.low;

console.log('📊 감사 결과:');
console.log(`   파일 스캔: ${filesScanned}개`);
console.log(`   Critical: ${critical.length}개`);
console.log(`   High: ${high.length}개`);
console.log(`   Medium: ${medium.length}개`);
console.log(`   Low: ${low.length}개\n`);

if (critical.length > 0) {
  console.log('🔴 CRITICAL 이슈:');
  console.log('─────────────────────────────────────────');
  critical.forEach((issue, i) => {
    console.log(`\n${i + 1}. [${issue.file}${issue.line ? ':' + issue.line : ''}]`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.code) console.log(`   코드: ${issue.code}`);
    console.log(`   수정: ${issue.fix}`);
    console.log(`   영향: ${issue.impact}`);
  });
  console.log('');
}

if (high.length > 0) {
  console.log('🟠 HIGH 이슈 (상위 10개):');
  console.log('─────────────────────────────────────────');
  high.slice(0, 10).forEach((issue, i) => {
    console.log(`\n${i + 1}. [${issue.file}${issue.line ? ':' + issue.line : ''}]`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.code) console.log(`   코드: ${issue.code}`);
    console.log(`   수정: ${issue.fix}`);
    console.log(`   영향: ${issue.impact}`);
  });
  if (high.length > 10) console.log(`\n   ... 외 ${high.length - 10}개`);
  console.log('');
}

// JSON 저장
fs.writeFileSync('ultimate-security-report.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  filesScanned,
  summary: {
    critical: critical.length,
    high: high.length,
    medium: medium.length,
    low: low.length
  },
  issues
}, null, 2));

console.log('📄 상세 보고서: ultimate-security-report.json\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (critical.length > 0) {
  console.log('⚠️  CRITICAL 이슈 발견! 즉시 수정이 필요합니다.');
  process.exit(1);
} else if (high.length > 0) {
  console.log('⚠️  HIGH 이슈 발견! 배포 전 수정을 강력히 권장합니다.');
} else {
  console.log('✅ Critical/High 보안 이슈가 발견되지 않았습니다.');
}
