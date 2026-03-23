/**
 * 피드백 위젯
 * 익명화 결과에 대한 사용자 피드백 수집
 */

class FeedbackWidget {
  constructor() {
    this.logId = null;
    this.organizationId = null;
    this.anonymizationMethod = null;
    this.processingTime = null;
    this.detectedEntitiesCount = null;
  }

  /**
   * 위젯 초기화
   */
  init(config) {
    this.logId = config.logId;
    this.organizationId = config.organizationId;
    this.anonymizationMethod = config.anonymizationMethod;
    this.processingTime = config.processingTime;
    this.detectedEntitiesCount = config.detectedEntitiesCount;

    this.injectStyles();
    this.injectModal();
    this.injectFeedbackButton();
    this.attachEventListeners();
  }

  /**
   * 스타일 주입
   */
  injectStyles() {
    if (document.getElementById('feedback-widget-styles')) return;

    const styles = `
      <style id="feedback-widget-styles">
        .feedback-button {
          position: fixed;
          bottom: 30px;
          right: 30px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 50px;
          padding: 15px 30px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          transition: all 0.3s;
          z-index: 999;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .feedback-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }

        .feedback-modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }

        .feedback-modal.active {
          display: flex;
        }

        .feedback-modal-content {
          background: white;
          border-radius: 20px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .feedback-modal h2 {
          font-size: 1.8rem;
          margin-bottom: 10px;
          color: #333;
        }

        .feedback-modal p {
          color: #666;
          margin-bottom: 30px;
        }

        .feedback-form-group {
          margin-bottom: 25px;
        }

        .feedback-form-group label {
          display: block;
          font-weight: 600;
          margin-bottom: 10px;
          color: #333;
        }

        .feedback-rating {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }

        .rating-star {
          font-size: 2rem;
          cursor: pointer;
          color: #ddd;
          transition: color 0.2s;
        }

        .rating-star.active,
        .rating-star:hover {
          color: #ffc107;
        }

        .feedback-checkbox {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .feedback-checkbox input {
          width: 20px;
          height: 20px;
          cursor: pointer;
        }

        .feedback-checkbox label {
          margin: 0;
          font-weight: normal;
          cursor: pointer;
        }

        .feedback-textarea {
          width: 100%;
          min-height: 100px;
          padding: 15px;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          font-family: inherit;
          font-size: 1rem;
          resize: vertical;
        }

        .feedback-textarea:focus {
          outline: none;
          border-color: #667eea;
        }

        .feedback-buttons {
          display: flex;
          gap: 15px;
          margin-top: 30px;
        }

        .feedback-btn {
          flex: 1;
          padding: 15px;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .feedback-btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .feedback-btn-primary:hover {
          transform: translateY(-2px);
        }

        .feedback-btn-secondary {
          background: #f0f0f0;
          color: #333;
        }

        .feedback-btn-secondary:hover {
          background: #e0e0e0;
        }

        .feedback-success {
          text-align: center;
          padding: 40px;
        }

        .feedback-success .icon {
          font-size: 4rem;
          margin-bottom: 20px;
        }

        .feedback-success h3 {
          font-size: 1.5rem;
          color: #4caf50;
          margin-bottom: 10px;
        }

        @media (max-width: 768px) {
          .feedback-button {
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            font-size: 0.9rem;
          }

          .feedback-modal-content {
            padding: 25px;
          }
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }

  /**
   * 모달 HTML 주입
   */
  injectModal() {
    if (document.getElementById('feedback-modal')) return;

    const modal = `
      <div id="feedback-modal" class="feedback-modal">
        <div class="feedback-modal-content">
          <div id="feedback-form-container">
            <h2>💬 익명화 결과 피드백</h2>
            <p>익명화 결과에 대한 의견을 알려주세요. 서비스 개선에 큰 도움이 됩니다.</p>

            <form id="feedback-form">
              <!-- 전반적인 평가 -->
              <div class="feedback-form-group">
                <label>전반적인 만족도 ⭐</label>
                <div class="feedback-rating" id="rating-overall">
                  ${[1, 2, 3, 4, 5].map(n => `<span class="rating-star" data-rating="${n}">★</span>`).join('')}
                </div>
              </div>

              <!-- 정확도 평가 -->
              <div class="feedback-form-group">
                <label>정확도 평가 🎯</label>
                <div class="feedback-rating" id="rating-accuracy">
                  ${[1, 2, 3, 4, 5].map(n => `<span class="rating-star" data-rating="${n}">★</span>`).join('')}
                </div>
              </div>

              <!-- 오류 유형 -->
              <div class="feedback-form-group">
                <label>발견된 오류 (해당하는 것을 선택해주세요)</label>
                <div class="feedback-checkbox">
                  <input type="checkbox" id="hasFalsePositive" name="hasFalsePositive">
                  <label for="hasFalsePositive">오탐: 일반 명사를 개인정보로 오인</label>
                </div>
                <div class="feedback-checkbox">
                  <input type="checkbox" id="hasFalseNegative" name="hasFalseNegative">
                  <label for="hasFalseNegative">미탐: 개인정보를 탐지하지 못함</label>
                </div>
                <div class="feedback-checkbox">
                  <input type="checkbox" id="hasIncorrectMapping" name="hasIncorrectMapping">
                  <label for="hasIncorrectMapping">잘못된 매핑: 다른 정보를 같은 것으로 처리</label>
                </div>
              </div>

              <!-- 상세 의견 -->
              <div class="feedback-form-group">
                <label>상세 의견 (선택)</label>
                <textarea id="comment" class="feedback-textarea" placeholder="예시: '정보', '상황' 같은 일반 명사가 이름으로 잘못 익명화되었습니다..."></textarea>
              </div>

              <!-- 개선 제안 -->
              <div class="feedback-form-group">
                <label>개선 제안 (선택)</label>
                <textarea id="improvementSuggestion" class="feedback-textarea" placeholder="이런 점이 개선되면 좋겠습니다..."></textarea>
              </div>

              <div class="feedback-buttons">
                <button type="button" class="feedback-btn feedback-btn-secondary" id="feedback-cancel">취소</button>
                <button type="submit" class="feedback-btn feedback-btn-primary">제출</button>
              </div>
            </form>
          </div>

          <div id="feedback-success-container" style="display: none;">
            <div class="feedback-success">
              <div class="icon">✅</div>
              <h3>피드백이 제출되었습니다!</h3>
              <p>소중한 의견 감사합니다. 서비스 개선에 반영하겠습니다.</p>
              <button class="feedback-btn feedback-btn-primary" id="feedback-close">닫기</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modal);
  }

  /**
   * 피드백 버튼 주입
   */
  injectFeedbackButton() {
    if (document.getElementById('feedback-button')) return;

    const button = `
      <button id="feedback-button" class="feedback-button">
        <span>💬</span>
        <span>피드백 보내기</span>
      </button>
    `;

    document.body.insertAdjacentHTML('beforeend', button);
  }

  /**
   * 이벤트 리스너 연결
   */
  attachEventListeners() {
    // 피드백 버튼 클릭
    document.getElementById('feedback-button').addEventListener('click', () => {
      this.openModal();
    });

    // 취소 버튼
    document.getElementById('feedback-cancel').addEventListener('click', () => {
      this.closeModal();
    });

    // 닫기 버튼
    document.getElementById('feedback-close').addEventListener('click', () => {
      this.closeModal();
    });

    // 모달 외부 클릭
    document.getElementById('feedback-modal').addEventListener('click', (e) => {
      if (e.target.id === 'feedback-modal') {
        this.closeModal();
      }
    });

    // 별점 클릭
    this.attachRatingListeners('rating-overall');
    this.attachRatingListeners('rating-accuracy');

    // 폼 제출
    document.getElementById('feedback-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitFeedback();
    });
  }

  /**
   * 별점 리스너 연결
   */
  attachRatingListeners(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const stars = container.querySelectorAll('.rating-star');

    stars.forEach(star => {
      star.addEventListener('click', () => {
        const rating = parseInt(star.dataset.rating);
        stars.forEach((s, idx) => {
          if (idx < rating) {
            s.classList.add('active');
          } else {
            s.classList.remove('active');
          }
        });
        container.dataset.value = rating;
      });
    });
  }

  /**
   * 모달 열기
   */
  openModal() {
    document.getElementById('feedback-modal').classList.add('active');
    document.getElementById('feedback-form-container').style.display = 'block';
    document.getElementById('feedback-success-container').style.display = 'none';
  }

  /**
   * 모달 닫기
   */
  closeModal() {
    document.getElementById('feedback-modal').classList.remove('active');
    this.resetForm();
  }

  /**
   * 폼 리셋
   */
  resetForm() {
    document.getElementById('feedback-form').reset();
    document.querySelectorAll('.rating-star').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.feedback-rating').forEach(r => delete r.dataset.value);
  }

  /**
   * 피드백 제출
   */
  async submitFeedback() {
    const rating = parseInt(document.getElementById('rating-overall').dataset.value);
    const accuracyScore = parseInt(document.getElementById('rating-accuracy').dataset.value);

    if (!rating) {
      alert('전반적인 만족도를 선택해주세요.');
      return;
    }

    const feedbackData = {
      logId: this.logId,
      organizationId: this.organizationId,
      rating,
      accuracyScore,
      hasFalsePositive: document.getElementById('hasFalsePositive').checked,
      hasFalseNegative: document.getElementById('hasFalseNegative').checked,
      hasIncorrectMapping: document.getElementById('hasIncorrectMapping').checked,
      comment: document.getElementById('comment').value.trim(),
      improvementSuggestion: document.getElementById('improvementSuggestion').value.trim(),
      anonymizationMethod: this.anonymizationMethod,
      processingTimeMs: this.processingTime,
      detectedEntitiesCount: this.detectedEntitiesCount
    };

    try {
      const response = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(feedbackData)
      });

      if (!response.ok) {
        throw new Error('서버 오류가 발생했습니다.');
      }

      const result = await response.json();

      if (result.success) {
        document.getElementById('feedback-form-container').style.display = 'none';
        document.getElementById('feedback-success-container').style.display = 'block';
      } else {
        alert('피드백 제출 실패: ' + result.error);
      }
    } catch (error) {
      console.error('피드백 제출 오류:', error);
      alert('피드백 제출 중 오류가 발생했습니다.');
    }
  }
}

// 전역에서 사용 가능하도록 export
window.FeedbackWidget = FeedbackWidget;
