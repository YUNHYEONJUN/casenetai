/**
 * Passport OAuth 설정
 * - 카카오, 네이버 OAuth 2.0 인증
 */

const passport = require('passport');
const KakaoStrategy = require('passport-kakao').Strategy;
const NaverStrategy = require('passport-naver-v2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getDB } = require('../database/db-postgres');

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
// Passport Serialization (세션 관리)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const db = getDB();
    const user = await db.get('SELECT * FROM users WHERE id = $1', [id]);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 카카오 OAuth Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
        // 기존 사용자 - 로그인 시간 업데이트
        await db.run(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );
        
        console.log('✅ 카카오 로그인 성공:', user.email || user.oauth_nickname);
        return done(null, user);
      }
      
      // 신규 사용자 - 회원가입
      console.log('📝 카카오 신규 회원가입:', profile.displayName);

      const userId = await db.transaction(async (client) => {
        // 사용자 생성 (기본 role = 'user', is_approved = 0)
        const result = await client.query(
          `INSERT INTO users (
            oauth_provider, oauth_id, oauth_nickname,
            name, email, profile_image,
            service_type, role, is_active, is_approved
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            'kakao',
            profile.id,
            profile.displayName || profile.username,
            profile.displayName || profile.username,
            profile._json?.kakao_account?.email || null,
            profile._json?.kakao_account?.profile?.profile_image_url || null,
            'elderly_protection',
            'user',
            true,
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

      console.log('✅ 카카오 회원가입 완료 (승인 대기):', user.oauth_nickname);
      return done(null, user);
      
    } catch (error) {
      console.error('❌ 카카오 인증 오류:', error);
      return done(error);
    }
  }
));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 네이버 OAuth Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
        // 기존 사용자 - 로그인 시간 업데이트
        await db.run(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );
        
        console.log('✅ 네이버 로그인 성공:', user.email || user.oauth_nickname);
        return done(null, user);
      }
      
      // 신규 사용자 - 회원가입
      console.log('📝 네이버 신규 회원가입:', profile.displayName);

      const userId = await db.transaction(async (client) => {
        // 사용자 생성 (기본 role = 'user', is_approved = 0)
        const result = await client.query(
          `INSERT INTO users (
            oauth_provider, oauth_id, oauth_nickname,
            name, email, profile_image,
            service_type, role, is_active, is_approved
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            'naver',
            profile.id,
            profile.displayName || profile.name,
            profile.displayName || profile.name,
            profile.email || null,
            profile.profileImage || null,
            'elderly_protection',
            'user',
            true,
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

      console.log('✅ 네이버 회원가입 완료 (승인 대기):', user.oauth_nickname);
      return done(null, user);
      
    } catch (error) {
      console.error('❌ 네이버 인증 오류:', error);
      return done(error);
    }
  }
));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 구글 OAuth Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
        // 기존 사용자 - 로그인 시간 업데이트
        await db.run(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );
        
        console.log('✅ 구글 로그인 성공:', user.email || user.oauth_nickname);
        return done(null, user);
      }
      
      // 신규 사용자 - 회원가입
      console.log('📝 구글 신규 회원가입:', profile.displayName);

      const userId = await db.transaction(async (client) => {
        // 사용자 생성 (기본 role = 'user', is_approved = 0)
        const result = await client.query(
          `INSERT INTO users (
            oauth_provider, oauth_id, oauth_nickname,
            name, email, profile_image,
            service_type, role, is_active, is_approved
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            'google',
            profile.id,
            profile.displayName || profile.name?.givenName,
            profile.displayName || profile.name?.givenName,
            profile.emails?.[0]?.value || null,
            profile.photos?.[0]?.value || null,
            'elderly_protection',
            'user',
            true,
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

      console.log('✅ 구글 회원가입 완료 (승인 대기):', user.oauth_nickname);
      return done(null, user);
      
    } catch (error) {
      console.error('❌ 구글 인증 오류:', error);
      return done(error);
    }
  }
));

module.exports = passport;
