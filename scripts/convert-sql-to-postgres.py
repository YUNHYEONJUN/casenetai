#!/usr/bin/env python3
"""
SQLite 쿼리를 PostgreSQL 문법으로 자동 변환하는 스크립트
"""

import os
import re
import sys

def convert_sql_query(content):
    """SQL 쿼리를 SQLite에서 PostgreSQL 문법으로 변환"""
    
    # 1. ? placeholder를 $1, $2, $3... 으로 변환
    def replace_placeholders(match):
        query = match.group(0)
        placeholder_count = query.count('?')
        
        for i in range(placeholder_count, 0, -1):
            query = query.replace('?', f'${i}', 1)
        
        # 역순이므로 다시 정상 순서로 변경
        for i in range(1, placeholder_count + 1):
            query = query.replace(f'${placeholder_count - i + 1}', f'${i}', 1)
        
        return query
    
    # SQL 쿼리 패턴 (작은따옴표, 큰따옴표, 백틱 모두 지원)
    patterns = [
        (r"'(?:[^'\\]|\\.)*'", r"'[^']*?'"),  # 작은따옴표
        (r"`(?:[^`\\]|\\.)*`", r"`[^`]*?`"),  # 백틱
    ]
    
    original_content = content
    
    # ? 플레이스홀더 변환
    lines = content.split('\n')
    converted_lines = []
    
    for line in lines:
        # SQL 쿼리 라인인지 확인
        if '?' in line and ('db.query' in line or 'db.run' in line or 'db.get' in line or 'VALUES' in line or 'WHERE' in line or 'SET' in line):
            # 쿼리 내의 ? 개수 세기
            query_start = -1
            query_end = -1
            quote_char = None
            
            # 쿼리 시작 찾기 (' 또는 ` 또는 ")
            for i, char in enumerate(line):
                if char in ["'", '`', '"'] and (i == 0 or line[i-1] != '\\'):
                    if query_start == -1:
                        query_start = i
                        quote_char = char
                    elif char == quote_char:
                        query_end = i
                        break
            
            if query_start != -1 and query_end != -1:
                # 쿼리 부분 추출
                before = line[:query_start+1]
                query = line[query_start+1:query_end]
                after = line[query_end:]
                
                # ? 를 $1, $2... 로 변환
                placeholder_count = query.count('?')
                for i in range(1, placeholder_count + 1):
                    query = query.replace('?', f'${i}', 1)
                
                line = before + query + after
        
        converted_lines.append(line)
    
    content = '\n'.join(converted_lines)
    
    # 2. datetime('now') → CURRENT_TIMESTAMP
    content = re.sub(
        r"datetime\(\s*['\"]now['\"]\s*\)",
        'CURRENT_TIMESTAMP',
        content,
        flags=re.IGNORECASE
    )
    
    # 3. datetime('now', '+X days/hours') → CURRENT_TIMESTAMP + INTERVAL 'X days/hours'
    content = re.sub(
        r"datetime\(\s*['\"]now['\"]\s*,\s*['\"]\+(\d+)\s+(day|days|hour|hours)['\"]\s*\)",
        r"CURRENT_TIMESTAMP + INTERVAL '\1 \2'",
        content,
        flags=re.IGNORECASE
    )
    
    # 4. IFNULL → COALESCE
    content = re.sub(
        r'\bIFNULL\s*\(',
        'COALESCE(',
        content,
        flags=re.IGNORECASE
    )
    
    # 5. Boolean 값 변환 (1 → true, 0 → false)
    # 주의: 숫자 1, 0을 모두 바꾸면 안되므로 특정 컨텍스트만 변경
    # is_active = ?, is_approved = ? 등의 경우만 변경
    
    # 컨텍스트를 고려한 Boolean 변환 (배열 내부)
    boolean_fields = ['is_active', 'is_approved', 'is_deleted', 'is_paid', 'is_admin']
    
    for field in boolean_fields:
        # [field, 1] → [field, true]
        content = re.sub(
            rf"(\[{field},\s*)1(\s*\])",
            r"\1true\2",
            content
        )
        # [field, 0] → [field, false]
        content = re.sub(
            rf"(\[{field},\s*)0(\s*\])",
            r"\1false\2",
            content
        )
        
        # , 1, → , true,
        content = re.sub(
            rf"(,\s*)1(\s*,)",
            r"\1true\2",
            content
        )
        # , 0, → , false,
        content = re.sub(
            rf"(,\s*)0(\s*,)",
            r"\1false\2",
            content
        )
    
    # 6. INSERT ... VALUES 에 RETURNING id 추가 (없으면)
    # 단, 이미 RETURNING이 있는 경우는 스킵
    insert_pattern = r"(INSERT\s+INTO\s+\w+\s*\([^)]+\)\s*VALUES\s*\([^)]+\))(?!\s*RETURNING)"
    
    def add_returning(match):
        query = match.group(1)
        # 이미 RETURNING이 있는지 다시 확인
        if 'RETURNING' not in query.upper():
            return query + ' RETURNING id'
        return query
    
    content = re.sub(
        insert_pattern,
        add_returning,
        content,
        flags=re.IGNORECASE | re.DOTALL
    )
    
    return content


def convert_file(file_path):
    """파일의 SQL 쿼리를 PostgreSQL 문법으로 변환"""
    
    print(f"📝 변환 중: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        converted_content = convert_sql_query(content)
        
        if original_content != converted_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(converted_content)
            
            # 변경 사항 요약
            original_q_count = original_content.count('?')
            converted_q_count = converted_content.count('?')
            placeholders_changed = original_q_count - converted_q_count
            
            print(f"   ✅ 변환 완료: {placeholders_changed}개의 placeholder 변경")
            return True
        else:
            print(f"   ⏭️  변경 사항 없음")
            return False
    
    except Exception as e:
        print(f"   ❌ 오류: {str(e)}")
        return False


def main():
    """메인 실행 함수"""
    
    print("🔧 SQL 쿼리 자동 변환 스크립트")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("SQLite → PostgreSQL 문법 변환")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print()
    
    # 변환할 파일 목록
    files_to_convert = [
        'routes/admin.js',
        'routes/auth.js',
        'routes/join-requests.js',
        'routes/org-admin.js',
        'routes/system-admin-dashboard.js',
        'routes/system-admin.js',
        'routes/payment.js',
        'services/authService.js',
        'services/creditService.js',
        'services/paymentService.js',
        'services/usageTrackingService.js',
        'services/analyticsService.js',
        'services/feedbackService.js',
        'scripts/create-system-admin.js',
    ]
    
    converted_count = 0
    skipped_count = 0
    error_count = 0
    
    for file_path in files_to_convert:
        full_path = os.path.join('/home/user/webapp', file_path)
        
        if not os.path.exists(full_path):
            print(f"⚠️  파일 없음: {file_path}")
            skipped_count += 1
            continue
        
        if convert_file(full_path):
            converted_count += 1
        else:
            skipped_count += 1
    
    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"✅ 변환 완료: {converted_count}개 파일")
    print(f"⏭️  변경 없음: {skipped_count}개 파일")
    if error_count > 0:
        print(f"❌ 오류: {error_count}개 파일")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print()
    print("⚠️  주의: 자동 변환 후 수동으로 확인이 필요할 수 있습니다")
    print("   - Boolean 값 (1/0 → true/false)")
    print("   - RETURNING id 추가 여부")
    print("   - 복잡한 SQL 쿼리")


if __name__ == '__main__':
    main()
