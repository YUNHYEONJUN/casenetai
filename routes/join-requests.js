/**
 * 기관 가입 요청 API
 * 일반 사용자가 기관에 가입 요청
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기관 목록 조회 (공개)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GET /api/join-requests/organizations
 * 가입 가능한 기관 목록 (공개)
 */
router.get('/organizations', async (req, res) => {
  const db = getDB();
  
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let where = ['status = $1'];
    let params = ['active'];
    
    if (search) {
      where.push('name LIKE $1');
      params.push(`%${search}%`);
    }
    
    const whereClause = 'WHERE ' + where.join(' AND ');
    
    const organizations = await db.query(`
      SELECT 
        id, name, plan_type, subscription_status,
        created_at
      FROM organizations
      ${whereClause}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const totalResult = await db.get(`
      SELECT COUNT(*) as count FROM organizations ${whereClause}
    `, params);
    
    res.json({
      success: true,
      organizations,
      pagination: {
        total: totalResult.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalResult.count / limit)
      }
    });
    
  } catch (error) {
    console.error('❌ 기관 목록 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '기관 목록 조회에 실패했습니다'
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 가입 요청 (로그인 필요)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.use(authenticateToken);

/**
 * POST /api/join-requests
 * 기관 가입 요청 생성
 */
router.post('/', async (req, res) => {
  const db = getDB();
  
  try {
    const { organization_id, message } = req.body;
    
    if (!organization_id) {
      return res.status(400).json({
        success: false,
        error: '기관 ID는 필수입니다'
      });
    }
    
    // 이미 기관에 소속되어 있는지 확인
    if (req.user.organization_id) {
      return res.status(400).json({
        success: false,
        error: '이미 기관에 소속되어 있습니다'
      });
    }
    
    // 기관 존재 확인
    const organization = await db.get(
      'SELECT * FROM organizations WHERE id = $1 AND status = $2',
      [organization_id, 'active']
    );
    
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: '기관을 찾을 수 없습니다'
      });
    }
    
    // 이미 대기 중인 요청이 있는지 확인
    const existingRequest = await db.get(`
      SELECT * FROM organization_join_requests
      WHERE user_id = ? AND organization_id = ? AND status = 'pending'
    `, [req.user.id, organization_id]);
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        error: '이미 가입 요청이 대기 중입니다'
      });
    }
    
    // 가입 요청 생성
    const result = await db.run(`
      INSERT INTO organization_join_requests (user_id, organization_id, message, status)
      VALUES (?, ?, ?, 'pending')
    `, [req.user.id, organization_id, message || '']);
    
    console.log(`✅ 가입 요청 생성: user_id=${req.user.id}, org_id=${organization_id}`);
    
    res.status(201).json({
      success: true,
      message: '가입 요청이 제출되었습니다',
      requestId: result.lastID
    });
    
  } catch (error) {
    console.error('❌ 가입 요청 생성 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '가입 요청 생성에 실패했습니다'
    });
  }
});

/**
 * GET /api/join-requests/my
 * 내 가입 요청 목록
 */
router.get('/my', async (req, res) => {
  const db = getDB();
  
  try {
    const requests = await db.query(`
      SELECT 
        r.*,
        o.name as organization_name,
        reviewer.name as reviewer_name
      FROM organization_join_requests r
      JOIN organizations o ON o.id = r.organization_id
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `, [req.user.id]);
    
    res.json({
      success: true,
      requests
    });
    
  } catch (error) {
    console.error('❌ 가입 요청 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '가입 요청 조회에 실패했습니다'
    });
  }
});

/**
 * DELETE /api/join-requests/:id
 * 가입 요청 취소
 */
router.delete('/:id', async (req, res) => {
  const db = getDB();
  const requestId = parseInt(req.params.id);
  
  try {
    const request = await db.get(
      'SELECT * FROM organization_join_requests WHERE id = $1',
      [requestId]
    );
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: '가입 요청을 찾을 수 없습니다'
      });
    }
    
    // 본인의 요청만 취소 가능
    if (request.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: '다른 사용자의 요청을 취소할 수 없습니다'
      });
    }
    
    // 대기 중인 요청만 취소 가능
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: '이미 처리된 요청은 취소할 수 없습니다'
      });
    }
    
    await db.run(
      'DELETE FROM organization_join_requests WHERE id = $1',
      [requestId]
    );
    
    res.json({
      success: true,
      message: '가입 요청이 취소되었습니다'
    });
    
  } catch (error) {
    console.error('❌ 가입 요청 취소 실패:', error.message);
    res.status(500).json({
      success: false,
      error: '가입 요청 취소에 실패했습니다'
    });
  }
});

module.exports = router;
