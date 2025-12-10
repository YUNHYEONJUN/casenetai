const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 서비스 파일 검증');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const servicesDir = path.join(__dirname, 'services');
const services = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));

console.log(`📦 서비스 파일 개수: ${services.length}\n`);

let errors = [];

services.forEach(service => {
  const servicePath = path.join(servicesDir, service);
  try {
    const content = fs.readFileSync(servicePath, 'utf8');
    
    // 기본 문법 체크
    let hasErrors = false;
    
    // require 문 확인
    const requireMatches = content.match(/require\(['"](.+?)['"]\)/g);
    if (requireMatches) {
      requireMatches.forEach(req => {
        const moduleName = req.match(/require\(['"](.+?)['"]\)/)[1];
        // 상대 경로 require 확인
        if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
          const requiredPath = path.resolve(servicesDir, moduleName);
          if (!fs.existsSync(requiredPath) && !fs.existsSync(requiredPath + '.js')) {
            console.log(`   ⚠️  ${service}: 누락된 의존성 - ${moduleName}`);
            hasErrors = true;
          }
        }
      });
    }
    
    // 잠재적 문법 오류 체크
    if (content.includes('require(') && !content.includes('module.exports')) {
      console.log(`   ⚠️  ${service}: module.exports 누락 가능성`);
      hasErrors = true;
    }
    
    if (!hasErrors) {
      console.log(`   ✅ ${service}`);
    }
    
  } catch (error) {
    console.log(`   ❌ ${service}: ${error.message}`);
    errors.push(service);
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (errors.length === 0) {
  console.log('✅ 모든 서비스 파일 정상');
} else {
  console.log(`❌ 오류가 있는 파일: ${errors.length}개`);
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
