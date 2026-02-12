/**
 * 서버 시작 테스트 (포트 바인딩만 검증)
 */

const express = require('express');
const http = require('http');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('서버 시작 테스트');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Express 앱 생성
const app = express();

// 기본 미들웨어
app.use(express.json());

// 테스트용 라우트
app.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// 서버 생성
const server = http.createServer(app);
const PORT = 3001; // 테스트용 포트

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 서버가 포트 ${PORT}에서 정상적으로 시작되었습니다`);
  console.log(`   주소: http://0.0.0.0:${PORT}`);
  
  // 간단한 헬스체크
  http.get(`http://localhost:${PORT}/test`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`\n✅ 헬스체크 성공: ${data}`);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ 서버 시작 테스트 완료');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 서버 종료
      server.close(() => {
        console.log('\n서버 종료됨');
        process.exit(0);
      });
    });
  }).on('error', (err) => {
    console.error(`\n❌ 헬스체크 실패: ${err.message}`);
    server.close();
    process.exit(1);
  });
});

server.on('error', (err) => {
  console.error(`❌ 서버 시작 실패: ${err.message}`);
  if (err.code === 'EADDRINUSE') {
    console.error(`   포트 ${PORT}가 이미 사용 중입니다`);
  }
  process.exit(1);
});
