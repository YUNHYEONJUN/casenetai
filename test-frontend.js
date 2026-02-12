/**
 * 프론트엔드 파일 검증
 */

const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('프론트엔드 파일 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const filesToCheck = [
  { path: 'public/index.html', description: '메인 페이지' },
  { path: 'public/login.html', description: '로그인 페이지' },
  { path: 'public/admin-dashboard.html', description: '관리자 대시보드' },
  { path: 'public/anonymization-compare.html', description: 'A/B 테스트 대시보드' },
  { path: 'public/analytics-dashboard.html', description: '데이터 분석 대시보드' },
  { path: 'public/js/feedback-widget.js', description: '피드백 위젯' }
];

let allValid = true;
const results = [];

filesToCheck.forEach(({ path: filePath, description }) => {
  const fullPath = path.join(__dirname, filePath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    const stats = fs.statSync(fullPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    
    // HTML/JS 파일 기본 유효성 검증
    const content = fs.readFileSync(fullPath, 'utf8');
    let issues = [];
    
    if (filePath.endsWith('.html')) {
      if (!content.includes('<!DOCTYPE html>') && !content.includes('<!doctype html>')) {
        issues.push('DOCTYPE 선언 누락');
      }
      if (!content.includes('<html')) {
        issues.push('<html> 태그 누락');
      }
      if (!content.includes('</html>')) {
        issues.push('</html> 태그 누락');
      }
    }
    
    if (filePath.endsWith('.js')) {
      // 기본 JS 문법 검증 (간단한 체크)
      if (content.includes('console.log') && content.includes('TODO')) {
        issues.push('TODO 주석 발견 (개발 중?)');
      }
    }
    
    if (issues.length === 0) {
      console.log(`✅ ${filePath}`);
      console.log(`   ${description} (${sizeKB} KB)`);
      results.push({ file: filePath, valid: true, size: sizeKB });
    } else {
      console.log(`⚠️  ${filePath}`);
      console.log(`   ${description} (${sizeKB} KB)`);
      console.log(`   문제점: ${issues.join(', ')}`);
      results.push({ file: filePath, valid: false, issues });
      allValid = false;
    }
  } else {
    console.log(`❌ ${filePath}`);
    console.log(`   ${description} - 파일 없음`);
    results.push({ file: filePath, valid: false, issues: ['파일 없음'] });
    allValid = false;
  }
  console.log('');
});

// HTML 파일에서 API 엔드포인트 참조 검증
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('API 엔드포인트 참조 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const htmlFiles = filesToCheck.filter(f => f.path.endsWith('.html'));
const apiEndpoints = [
  '/api/anonymize-document',
  '/api/anonymize-text-compare',
  '/api/feedback/submit',
  '/api/analytics/dashboard'
];

htmlFiles.forEach(({ path: filePath, description }) => {
  const fullPath = path.join(__dirname, filePath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`📄 ${filePath}:`);
    
    const foundEndpoints = apiEndpoints.filter(endpoint => 
      content.includes(endpoint) || content.includes(`'${endpoint}'`) || content.includes(`"${endpoint}"`)
    );
    
    if (foundEndpoints.length > 0) {
      foundEndpoints.forEach(endpoint => {
        console.log(`   ✅ ${endpoint}`);
      });
    } else {
      console.log(`   (API 호출 없음)`);
    }
    console.log('');
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (allValid) {
  console.log('✅ 모든 프론트엔드 파일이 정상입니다');
} else {
  console.log('⚠️  일부 파일에서 문제가 발견되었습니다');
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
