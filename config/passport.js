/**
 * Passport OAuth 설정
 * - 카카오, 네이버 OAuth 2.0 인증
 */

const passport = require('passport');
const KakaoStrategy = require('passport-kakao').Strategy;
const NaverStrategy = require('passport-naver-v2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getDB } = require('../database/db-postgres');
const { logger } = require('../lib/logger');

// 환경 변수에서 OAuth 키 로드
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || 'YOUR_KAKAO_CLIENT_ID';
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';
const KAKAO_CALLBACK_URL = process.env.KAKAO_CALLBACK_URL || 'http://localhost:3000/api/auth/kakao/callback';

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || 'YOUR_NAVER_CLIENT_ID';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || 'YOUR_NAVER_CLIENT_SECRET';
const NAVER_CALLBACK_URL = process.env.NAVER_CALLBACK_URL || 'http://localhost:3000/api/auth/naver/callback';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 카카오 OAuth Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (KAKAO_CLIENT_ID === 'YOUR_KAKAO_CLIENT_ID') {
  logger.warn('카카오 OAuth 키가 설정되지 않았습니다. 카카오 로그인이 비활성화됩니다.');
} else {

passport.use(new KakaoStrategy({
    clientID: KAKAO_CLIENT_ID,
    clientSecret: KAKAO_CLIENT_SECRET,
    callbackURL: KAKAO_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const db = getDB();
      
      // 카카오 ID로 기존 사용자 찾기
      let user = await db.get(
        'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
        ['kakao', profile.id]
      );
      
      if (user) {
        // 정지/삭제된 계정 차단
        if (user.status && user.status !== 'active') {
          return done(null, false, { message: '비활성화된 계정입니다.' });
        }
        // 기존 사용자 - 로그인 시간 업데이트
        await db.run(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );

        logger.info('카카오 로그인 성공', { userId: user.id });
        return done(null, user);
      }
      
      // 신규 사용자 - 회원가입
      logger.info('카카오 신규 회원가입');

      const userId = await db.transaction(async (client) => {
        // 사용자 생성 (기본 role = 'user', is_approved = false)
        const result = await client.query(
          `INSERT INTO users (
            oauth_provider, oauth_id, oauth_nickname,
            name, oauth_email, profile_image,
            service_type, role, is_approved
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            'kakao',
            profile.id,
            profile.displayName || profile.username || '사용자',
            profile.displayName || profile.username || '사용자',
            profile._json?.kakao_account?.email || null,
            profile._json?.kakao_account?.profile?.profile_image_url || null,
            'elderly_protection',
            'user',
            false
          ]
        );

        const newUserId = result.rows[0].id;

        // 크레딧 초기화 (무료 체험 3회)
        await client.query(
          `INSERT INTO credits (user_id, balance, free_trial_count)
           VALUES ($1, 0, 3)`,
          [newUserId]
        );

        return newUserId;
      });

      // 생성된 사용자 조회
      user = await db.get('SELECT * FROM users WHERE id = $1', [userId]);

      logger.info('카카오 회원가입 완료 (승인 대기)', { userId: user.id });
      return done(null, user);
      
    } catch (error) {
      console.error('❌ 카카오 인증 오류:', error);
      return done(error);
    }
  }
));

} // end kakao if

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 네이버 OAuth Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (NAVER_CLIENT_ID === 'YOUR_NAVER_CLIENT_ID') {
  logger.warn('네이버 OAuth 키가 설정되지 않았습니다. 네이버 로그인이 비활성화됩니다.');
} else {

passport.use(new NaverStrategy({
    clientID: NAVER_CLIENT_ID,
    clientSecret: NAVER_CLIENT_SECRET,
    callbackURL: NAVER_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const db = getDB();
      
      // 네이버 ID로 기존 사용자 찾기
      let user = await db.get(
        'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
        ['naver', profile.id]
      );
      
      if (user) {
        // 정지/삭제된 계정 차단
        if (user.status && user.status !== 'active') {
          return done(null, false, { message: '비활성화된 계정입니다.' });
        }
        // 기존 사용자 - 로그인 시간 업데이트
        await db.run(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );

        logger.info('네이버 로그인 성공', { userId: user.id });
        return done(null, user);
      }
      
      // 신규 사용자 - 회원가입
      logger.info('네이버 신규 회원가입');

      const userId = await db.transaction(async (client) => {
        // 사용자 생성 (기본 role = 'user', is_approved = false)
        const result = await client.query(
          `INSERT INTO users (
            oauth_provider, oauth_id, oauth_nickname,
            name, oauth_email, profile_image,
            service_type, role, is_approved
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            'naver',
            profile.id,
            profile.displayName || profile.name || '사용자',
            profile.displayName || profile.name || '사용자',
            profile.email || null,
            profile.profileImage || null,
            'elderly_protection',
            'user',
            false
          ]
        );

        const newUserId = result.rows[0].id;

        // 크레딧 초기화 (무료 체험 3회)
        await client.query(
          `INSERT INTO credits (user_id, balance, free_trial_count)
           VALUES ($1, 0, 3)`,
          [newUserId]
        );

        return newUserId;
      });

      // 생성된 사용자 조회
      user = await db.get('SELECT * FROM users WHERE id = $1', [userId]);

      logger.info('네이버 회원가입 완료 (승인 대기)', { userId: user.id });
      return done(null, user);
      
    } catch (error) {
      console.error('❌ 네이버 인증 오류:', error);
      return done(error);
    }
  }
));

} // end naver if

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 구글 OAuth Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
  logger.warn('구글 OAuth 키가 설정되지 않았습니다. 구글 로그인이 비활성화됩니다.');
} else {

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const db = getDB();
      
      // 구글 ID로 기존 사용자 찾기
      let user = await db.get(
        'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
        ['google', profile.id]
      );
      
      if (user) {
        // 정지/삭제된 계정 차단
        if (user.status && user.status !== 'active') {
          return done(null, false, { message: '비활성화된 계정입니다.' });
        }
        // 기존 사용자 - 로그인 시간 업데이트
        await db.run(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );

        logger.info('구글 로그인 성공', { userId: user.id });
        return done(null, user);
      }
      
      // 신규 사용자 - 회원가입
      logger.info('구글 신규 회원가입');

      const userId = await db.transaction(async (client) => {
        // 사용자 생성 (기본 role = 'user', is_approved = false)
        const result = await client.query(
          `INSERT INTO users (
            oauth_provider, oauth_id, oauth_nickname,
            name, oauth_email, profile_image,
            service_type, role, is_approved
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            'google',
            profile.id,
            profile.displayName || profile.name?.givenName || '사용자',
            profile.displayName || profile.name?.givenName || '사용자',
            profile.emails?.[0]?.value || null,
            profile.photos?.[0]?.value || null,
            'elderly_protection',
            'user',
            false
          ]
        );

        const newUserId = result.rows[0].id;

        // 크레딧 초기화 (무료 체험 3회)
        await client.query(
          `INSERT INTO credits (user_id, balance, free_trial_count)
           VALUES ($1, 0, 3)`,
          [newUserId]
        );

        return newUserId;
      });

      // 생성된 사용자 조회
      user = await db.get('SELECT * FROM users WHERE id = $1', [userId]);

      logger.info('구글 회원가입 완료 (승인 대기)', { userId: user.id });
      return done(null, user);
      
    } catch (error) {
      console.error('❌ 구글 인증 오류:', error);
      return done(error);
    }
  }
));

} // end google if

module.exports = passport;
