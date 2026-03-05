-- 마이그레이션 004: 사용자 피드백 시스템
-- 익명화 결과에 대한 피드백 수집 및 분석

-- 피드백 테이블
CREATE TABLE IF NOT EXISTS anonymization_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL,                    -- anonymization_logs.id 참조
  user_id INTEGER NOT NULL,                   -- 피드백 제출자
  organization_id INTEGER NOT NULL,           -- 소속 기관
  
  -- 평가
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),  -- 1-5점 평가
  accuracy_score INTEGER CHECK(accuracy_score BETWEEN 1 AND 5), -- 정확도 점수
  
  -- 오류 유형
  has_false_positive BOOLEAN DEFAULT 0,       -- 오탐 (일반 명사를 개인정보로 오인)
  has_false_negative BOOLEAN DEFAULT 0,       -- 미탐 (개인정보 누락)
  has_incorrect_mapping BOOLEAN DEFAULT 0,    -- 잘못된 매핑
  
  -- 상세 피드백
  false_positive_examples TEXT,               -- 오탐 예시 (JSON 배열)
  false_negative_examples TEXT,               -- 미탐 예시 (JSON 배열)
  incorrect_mapping_examples TEXT,            -- 잘못된 매핑 예시 (JSON 배열)
  
  comment TEXT,                                -- 자유 코멘트
  improvement_suggestion TEXT,                 -- 개선 제안
  
  -- 메타데이터
  anonymization_method TEXT,                   -- 사용된 익명화 방식 (rule/ai/clova/hybrid)
  processing_time_ms INTEGER,                  -- 처리 시간
  detected_entities_count INTEGER,             -- 탐지된 개인정보 수
  
  -- 응답 여부
  is_reviewed BOOLEAN DEFAULT 0,               -- 관리자 검토 완료 여부
  admin_response TEXT,                         -- 관리자 응답
  reviewed_at DATETIME,                        -- 검토 일시
  reviewed_by INTEGER,                         -- 검토자 ID
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (log_id) REFERENCES anonymization_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- 피드백 인덱스
CREATE INDEX IF NOT EXISTS idx_feedback_log ON anonymization_feedback(log_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON anonymization_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_org ON anonymization_feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON anonymization_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_method ON anonymization_feedback(anonymization_method);
CREATE INDEX IF NOT EXISTS idx_feedback_reviewed ON anonymization_feedback(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON anonymization_feedback(created_at);

-- 피드백 통계 테이블 (집계용)
CREATE TABLE IF NOT EXISTS feedback_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL UNIQUE,                   -- 집계 날짜 (YYYY-MM-DD)
  
  -- 전체 통계
  total_feedbacks INTEGER DEFAULT 0,
  average_rating REAL DEFAULT 0.0,
  average_accuracy REAL DEFAULT 0.0,
  
  -- 오류 통계
  false_positive_count INTEGER DEFAULT 0,
  false_negative_count INTEGER DEFAULT 0,
  incorrect_mapping_count INTEGER DEFAULT 0,
  
  -- 방식별 통계 (JSON)
  method_statistics TEXT,                      -- {"rule": {...}, "ai": {...}, "hybrid": {...}}
  
  -- 기관별 통계 (JSON)
  organization_statistics TEXT,                -- {"org_1": {...}, "org_2": {...}}
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 피드백 통계 인덱스
CREATE INDEX IF NOT EXISTS idx_feedback_stats_date ON feedback_statistics(date);

-- 학습 데이터 테이블 (AI 모델 개선용)
CREATE TABLE IF NOT EXISTS learning_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id INTEGER NOT NULL,               -- 피드백 ID
  
  -- 원본 정보 (익명화되지 않은 패턴)
  original_pattern TEXT NOT NULL,             -- 원본 패턴
  pattern_type TEXT NOT NULL,                 -- 패턴 유형 (name/phone/email/address 등)
  context TEXT,                                -- 주변 문맥
  
  -- 정답 레이블
  is_personal_info BOOLEAN NOT NULL,          -- 실제로 개인정보인지
  correct_type TEXT,                           -- 올바른 유형
  
  -- 탐지 결과
  was_detected BOOLEAN NOT NULL,              -- 시스템이 탐지했는지
  detected_type TEXT,                          -- 시스템이 탐지한 유형
  detection_method TEXT,                       -- 탐지 방식
  confidence_score REAL,                       -- 신뢰도 점수
  
  -- 메타데이터
  document_type TEXT,                          -- 문서 유형
  organization_type TEXT,                      -- 기관 유형
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (feedback_id) REFERENCES anonymization_feedback(id) ON DELETE CASCADE
);

-- 학습 데이터 인덱스
CREATE INDEX IF NOT EXISTS idx_learning_feedback ON learning_data(feedback_id);
CREATE INDEX IF NOT EXISTS idx_learning_type ON learning_data(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learning_detected ON learning_data(was_detected);
CREATE INDEX IF NOT EXISTS idx_learning_method ON learning_data(detection_method);

-- 개선 제안 테이블
CREATE TABLE IF NOT EXISTS improvement_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  
  -- 제안 내용
  category TEXT NOT NULL,                      -- 카테고리 (accuracy/performance/usability/feature)
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',              -- low/medium/high
  
  -- 투표
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  
  -- 상태
  status TEXT DEFAULT 'pending',               -- pending/reviewed/in_progress/completed/rejected
  admin_notes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- 개선 제안 인덱스
CREATE INDEX IF NOT EXISTS idx_suggestions_user ON improvement_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_org ON improvement_suggestions(organization_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_category ON improvement_suggestions(category);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON improvement_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON improvement_suggestions(created_at);
