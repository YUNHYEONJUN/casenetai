/**
 * 심층 보안 분석 스크립트
 */

const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('CaseNetAI 심층 보안 분석');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const issues = [];
const warnings = [];
const recommendations = [];

// 1. 환경변수 보안 검사
console.log('1️⃣ 환경변수 보안 검사');
console.log('─────────────────────────────────────────');

const envFile = '.env';
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  
  // JWT_SECRET 강도 검사
  const jwtMatch = envContent.match(/JWT_SECRET=(.+)/);
  if (jwtMatch) {
    const jwtSecret = jwtMatch[1].trim();
    if (jwtSecret.length < 32) {
      issues.push({
        severity: 'HIGH',
        category: '환경변수',
        issue: 'JWT_SECRET이 너무 짧음 (32자 이상 권장)',
        current: `${jwtSecret.length}자`,
        recommendation: '최소 32자 이상의 무작위 문자열 사용'
      });
    } else {
      console.log(`✅ JWT_SECRET 강도: ${jwtSecret.length}자 (안전)`);
    }
  } else {
    issues.push({
      severity: 'CRITICAL',
      category: '환경변수',
      issue: 'JWT_SECRET 누락',
      recommendation: '32자 이상의 무작위 문자열 생성 필요'
    });
  }
  
  // API 키 검사
  const requiredKeys = [
    'OPENAI_API_KEY',
    'CLOVA_CLIENT_ID',
    'CLOVA_CLIENT_SECRET'
  ];
  
  requiredKeys.forEach(key => {
    if (!envContent.includes(key) || envContent.includes(`${key}=\n`)) {
      warnings.push({
        severity: 'MEDIUM',
        category: '환경변수',
        issue: `${key} 미설정`,
        recommendation: '운영 배포 전 반드시 설정 필요'
      });
      console.log(`⚠️  ${key}: 미설정`);
    } else {
      console.log(`✅ ${key}: 설정됨`);
    }
  });
} else {
  issues.push({
    severity: 'CRITICAL',
    category: '환경변수',
    issue: '.env 파일 없음',
    recommendation: '.env.example을 참고하여 .env 파일 생성'
  });
}

console.log('');

// 2. SQL Injection 취약점 검사
console.log('2️⃣ SQL Injection 취약점 검사');
console.log('─────────────────────────────────────────');

const serviceFiles = fs.readdirSync('services')
  .filter(f => f.endsWith('.js'))
  .map(f => path.join('services', f));

let sqlVulnerabilities = 0;

serviceFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  
  // 위험한 문자열 연결 패턴 검색
  const dangerousPatterns = [
    /db\.prepare\(`[^`]*\$\{[^}]+\}[^`]*`\)/g,
    /db\.run\(`[^`]*\$\{[^}]+\}[^`]*`\)/g,
    /db\.all\(`[^`]*\$\{[^}]+\}[^`]*`\)/g,
    /db\.get\(`[^`]*\$\{[^}]+\}[^`]*`\)/g
  ];
  
  dangerousPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      sqlVulnerabilities += matches.length;
      issues.push({
        severity: 'HIGH',
        category: 'SQL Injection',
        file: file,
        issue: 'SQL 쿼리에 직접 변수 삽입 발견',
        count: matches.length,
        recommendation: '파라미터 바인딩(?) 사용 권장'
      });
    }
  });
});

if (sqlVulnerabilities === 0) {
  console.log('✅ SQL Injection 취약점 없음');
} else {
  console.log(`❌ ${sqlVulnerabilities}개의 잠재적 SQL Injection 발견`);
}

console.log('');

// 3. XSS (Cross-Site Scripting) 취약점 검사
console.log('3️⃣ XSS 취약점 검사');
console.log('─────────────────────────────────────────');

const htmlFiles = [
  'public/index.html',
  'public/login.html',
  'public/admin-dashboard.html',
  'public/anonymization-compare.html',
  'public/analytics-dashboard.html'
];

let xssVulnerabilities = 0;

htmlFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    
    // innerHTML 사용 검사
    const innerHTMLMatches = content.match(/\.innerHTML\s*=/g);
    if (innerHTMLMatches) {
      xssVulnerabilities += innerHTMLMatches.length;
      warnings.push({
        severity: 'MEDIUM',
        category: 'XSS',
        file: file,
        issue: `innerHTML 사용 ${innerHTMLMatches.length}회`,
        recommendation: 'textContent 또는 sanitize 라이브러리 사용 권장'
      });
    }
    
    // eval() 사용 검사
    if (content.includes('eval(')) {
      issues.push({
        severity: 'CRITICAL',
        category: 'XSS',
        file: file,
        issue: 'eval() 함수 사용 발견',
        recommendation: 'eval() 절대 사용 금지'
      });
      xssVulnerabilities++;
    }
  }
});

if (xssVulnerabilities === 0) {
  console.log('✅ XSS 취약점 없음');
} else {
  console.log(`⚠️  ${xssVulnerabilities}개의 잠재적 XSS 발견`);
}

console.log('');

// 4. 비밀번호 정책 검사
console.log('4️⃣ 비밀번호 정책 검사');
console.log('─────────────────────────────────────────');

const authServiceFile = 'services/authService.js';
if (fs.existsSync(authServiceFile)) {
  const content = fs.readFileSync(authServiceFile, 'utf8');
  
  // bcrypt 사용 확인
  if (content.includes('bcrypt')) {
    console.log('✅ bcrypt 해싱 사용');
    
    // salt rounds 확인
    const saltRoundsMatch = content.match(/bcrypt\.(hash|hashSync)\([^,]+,\s*(\d+)/);
    if (saltRoundsMatch) {
      const rounds = parseInt(saltRoundsMatch[2]);
      if (rounds < 10) {
        warnings.push({
          severity: 'MEDIUM',
          category: '비밀번호 보안',
          issue: `bcrypt salt rounds가 낮음 (${rounds})`,
          recommendation: '최소 10 이상 권장 (12 권장)'
        });
        console.log(`⚠️  Salt rounds: ${rounds} (10 이상 권장)`);
      } else {
        console.log(`✅ Salt rounds: ${rounds} (안전)`);
      }
    }
  } else {
    issues.push({
      severity: 'CRITICAL',
      category: '비밀번호 보안',
      issue: 'bcrypt 미사용',
      recommendation: 'bcrypt 또는 argon2 사용 필수'
    });
    console.log('❌ bcrypt 미사용');
  }
  
  // 비밀번호 검증 로직 확인
  if (!content.includes('password') || !content.includes('length')) {
    warnings.push({
      severity: 'MEDIUM',
      category: '비밀번호 보안',
      issue: '비밀번호 강도 검증 로직 없음',
      recommendation: '최소 길이, 복잡도 검증 추가 권장'
    });
    console.log('⚠️  비밀번호 강도 검증 없음');
  } else {
    console.log('✅ 비밀번호 검증 로직 있음');
  }
}

console.log('');

// 5. CORS 설정 검사
console.log('5️⃣ CORS 설정 검사');
console.log('─────────────────────────────────────────');

const serverFile = 'server.js';
if (fs.existsSync(serverFile)) {
  const content = fs.readFileSync(serverFile, 'utf8');
  
  if (content.includes("origin: '*'") || content.includes('origin:"*"')) {
    issues.push({
      severity: 'HIGH',
      category: 'CORS',
      issue: 'CORS에서 모든 origin 허용 (origin: "*")',
      recommendation: '특정 도메인만 허용하도록 변경'
    });
    console.log('❌ CORS: 모든 origin 허용 (보안 위험)');
  } else if (content.includes('cors')) {
    console.log('✅ CORS 설정 있음');
  } else {
    warnings.push({
      severity: 'LOW',
      category: 'CORS',
      issue: 'CORS 설정 없음',
      recommendation: 'cors 미들웨어 추가 권장'
    });
    console.log('⚠️  CORS 설정 없음');
  }
}

console.log('');

// 6. Rate Limiting 검사
console.log('6️⃣ Rate Limiting 검사');
console.log('─────────────────────────────────────────');

if (fs.existsSync(serverFile)) {
  const content = fs.readFileSync(serverFile, 'utf8');
  
  if (content.includes('express-rate-limit') || content.includes('rate-limit')) {
    console.log('✅ Rate limiting 적용됨');
  } else {
    warnings.push({
      severity: 'MEDIUM',
      category: 'Rate Limiting',
      issue: 'Rate limiting 미적용',
      recommendation: 'express-rate-limit 패키지 사용 권장'
    });
    console.log('⚠️  Rate limiting 없음 (DDoS 취약)');
  }
}

console.log('');

// 7. 파일 업로드 보안 검사
console.log('7️⃣ 파일 업로드 보안 검사');
console.log('─────────────────────────────────────────');

if (fs.existsSync(serverFile)) {
  const content = fs.readFileSync(serverFile, 'utf8');
  
  // Multer 설정 확인
  if (content.includes('multer')) {
    console.log('✅ Multer 파일 업로드 사용');
    
    // 파일 크기 제한 확인
    const limitMatch = content.match(/limits:\s*{\s*fileSize:\s*(\d+)/);
    if (limitMatch) {
      const limitMB = parseInt(limitMatch[1]) / (1024 * 1024);
      console.log(`✅ 파일 크기 제한: ${limitMB.toFixed(0)}MB`);
      
      if (limitMB > 100) {
        warnings.push({
          severity: 'MEDIUM',
          category: '파일 업로드',
          issue: `파일 크기 제한이 너무 큼 (${limitMB.toFixed(0)}MB)`,
          recommendation: '필요한 최소 크기로 제한 권장'
        });
      }
    } else {
      warnings.push({
        severity: 'HIGH',
        category: '파일 업로드',
        issue: '파일 크기 제한 없음',
        recommendation: 'fileSize 제한 설정 필수'
      });
      console.log('⚠️  파일 크기 제한 없음');
    }
    
    // 파일 타입 검증 확인
    if (content.includes('fileFilter')) {
      console.log('✅ 파일 타입 검증 있음');
    } else {
      warnings.push({
        severity: 'HIGH',
        category: '파일 업로드',
        issue: '파일 타입 검증 없음',
        recommendation: 'fileFilter로 허용 타입만 업로드하도록 설정'
      });
      console.log('⚠️  파일 타입 검증 없음');
    }
  }
}

console.log('');

// 8. 로깅 및 모니터링 검사
console.log('8️⃣ 로깅 및 모니터링 검사');
console.log('─────────────────────────────────────────');

if (fs.existsSync(serverFile)) {
  const content = fs.readFileSync(serverFile, 'utf8');
  
  // 민감 정보 로깅 검사
  const sensitiveLogPatterns = [
    /console\.log\([^)]*password[^)]*\)/gi,
    /console\.log\([^)]*token[^)]*\)/gi,
    /console\.log\([^)]*secret[^)]*\)/gi,
    /console\.log\([^)]*apiKey[^)]*\)/gi
  ];
  
  let sensitiveLogging = 0;
  sensitiveLogPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      sensitiveLogging += matches.length;
    }
  });
  
  if (sensitiveLogging > 0) {
    issues.push({
      severity: 'HIGH',
      category: '로깅',
      issue: `민감 정보 로깅 ${sensitiveLogging}건 발견`,
      recommendation: '비밀번호, 토큰 등 민감 정보 로깅 제거'
    });
    console.log(`❌ 민감 정보 로깅 발견: ${sensitiveLogging}건`);
  } else {
    console.log('✅ 민감 정보 로깅 없음');
  }
  
  // 구조화된 로깅 도구 확인
  if (content.includes('winston') || content.includes('pino')) {
    console.log('✅ 구조화된 로깅 도구 사용');
  } else {
    recommendations.push({
      category: '로깅',
      recommendation: 'winston 또는 pino 같은 구조화된 로깅 도구 사용 권장'
    });
    console.log('💡 구조화된 로깅 도구 미사용');
  }
}

console.log('');

// 9. 에러 처리 검사
console.log('9️⃣ 에러 처리 검사');
console.log('─────────────────────────────────────────');

if (fs.existsSync(serverFile)) {
  const content = fs.readFileSync(serverFile, 'utf8');
  
  // 전역 에러 핸들러 확인
  if (content.includes('uncaughtException') && content.includes('unhandledRejection')) {
    console.log('✅ 전역 에러 핸들러 있음');
  } else {
    warnings.push({
      severity: 'MEDIUM',
      category: '에러 처리',
      issue: '전역 에러 핸들러 없음',
      recommendation: 'uncaughtException, unhandledRejection 핸들러 추가'
    });
    console.log('⚠️  전역 에러 핸들러 없음');
  }
  
  // 스택 트레이스 노출 검사
  if (content.includes('error.stack') && !content.includes('NODE_ENV')) {
    warnings.push({
      severity: 'MEDIUM',
      category: '에러 처리',
      issue: '에러 스택 트레이스가 클라이언트에 노출될 수 있음',
      recommendation: '프로덕션에서는 스택 트레이스 숨기기'
    });
    console.log('⚠️  스택 트레이스 노출 가능');
  } else {
    console.log('✅ 에러 정보 적절히 처리');
  }
}

console.log('');

// 10. 세션 보안 검사
console.log('🔟 세션 및 토큰 보안 검사');
console.log('─────────────────────────────────────────');

if (fs.existsSync(authServiceFile)) {
  const content = fs.readFileSync(authServiceFile, 'utf8');
  
  // JWT 만료 시간 확인
  const expiresInMatch = content.match(/expiresIn:\s*['"]([^'"]+)['"]/);
  if (expiresInMatch) {
    console.log(`✅ JWT 만료 시간 설정: ${expiresInMatch[1]}`);
    
    // 너무 긴 만료 시간 경고
    if (expiresInMatch[1].includes('30d') || expiresInMatch[1].includes('90d')) {
      warnings.push({
        severity: 'MEDIUM',
        category: '세션 보안',
        issue: 'JWT 만료 시간이 너무 김',
        recommendation: '15분-1시간 권장 (refresh token 활용)'
      });
      console.log('⚠️  JWT 만료 시간이 너무 김');
    }
  } else {
    warnings.push({
      severity: 'HIGH',
      category: '세션 보안',
      issue: 'JWT 만료 시간 미설정',
      recommendation: 'expiresIn 설정 필수'
    });
    console.log('⚠️  JWT 만료 시간 미설정');
  }
  
  // Refresh token 구현 확인
  if (content.includes('refreshToken') || content.includes('refresh_token')) {
    console.log('✅ Refresh token 구현됨');
  } else {
    recommendations.push({
      category: '세션 보안',
      recommendation: 'Refresh token 구현 권장'
    });
    console.log('💡 Refresh token 미구현');
  }
}

console.log('\n');

// 요약 리포트
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('보안 분석 요약');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`🔴 심각 (CRITICAL): ${issues.filter(i => i.severity === 'CRITICAL').length}건`);
console.log(`🟠 높음 (HIGH): ${issues.filter(i => i.severity === 'HIGH').length}건`);
console.log(`🟡 중간 (MEDIUM): ${[...issues, ...warnings].filter(i => i.severity === 'MEDIUM').length}건`);
console.log(`🟢 낮음 (LOW): ${warnings.filter(w => w.severity === 'LOW').length}건`);
console.log(`💡 권장사항: ${recommendations.length}건\n`);

// 상세 내역 출력
if (issues.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔴 발견된 보안 이슈');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. [${issue.severity}] ${issue.category}`);
    console.log(`   문제: ${issue.issue}`);
    if (issue.file) console.log(`   파일: ${issue.file}`);
    if (issue.count) console.log(`   발견 횟수: ${issue.count}`);
    if (issue.current) console.log(`   현재 상태: ${issue.current}`);
    console.log(`   권장사항: ${issue.recommendation}`);
    console.log('');
  });
}

if (warnings.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  경고 사항');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  warnings.forEach((warning, index) => {
    console.log(`${index + 1}. [${warning.severity}] ${warning.category}`);
    console.log(`   문제: ${warning.issue}`);
    if (warning.file) console.log(`   파일: ${warning.file}`);
    console.log(`   권장사항: ${warning.recommendation}`);
    console.log('');
  });
}

if (recommendations.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 권장사항');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  recommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec.category}`);
    console.log(`   ${rec.recommendation}`);
    console.log('');
  });
}

// 점수 계산
const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
const highCount = issues.filter(i => i.severity === 'HIGH').length;
const mediumCount = [...issues, ...warnings].filter(i => i.severity === 'MEDIUM').length;

let score = 100;
score -= criticalCount * 20;
score -= highCount * 10;
score -= mediumCount * 5;
score = Math.max(0, score);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`보안 점수: ${score}/100`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (score >= 90) {
  console.log('✅ 우수한 보안 수준');
} else if (score >= 70) {
  console.log('⚠️  보통 보안 수준 - 개선 권장');
} else if (score >= 50) {
  console.log('🟠 낮은 보안 수준 - 개선 필요');
} else {
  console.log('🔴 매우 낮은 보안 수준 - 즉시 개선 필요');
}

// JSON 리포트 저장
const report = {
  timestamp: new Date().toISOString(),
  score,
  summary: {
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: warnings.filter(w => w.severity === 'LOW').length
  },
  issues,
  warnings,
  recommendations
};

fs.writeFileSync('security-report.json', JSON.stringify(report, null, 2));
console.log('\n📄 상세 리포트: security-report.json');
