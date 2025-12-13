#!/usr/bin/env python3
"""
SQLite SQL을 PostgreSQL SQL로 자동 변환하는 스크립트
사용법: python3 scripts/convert-to-postgres.py [file_path]
"""

import sys
import re
import os

def convert_sql_placeholders(content):
    """
    SQL 쿼리의 ? placeholder를 $1, $2, $3...로 변환
    """
    lines = content.split('\n')
    result_lines = []
    
    for line_num, line in enumerate(lines, 1):
        if '?' not in line:
            result_lines.append(line)
            continue
        
        # SQL 문자열을 찾아서 그 안의 ?만 변환
        new_line = ""
        i = 0
        in_string = False
        string_char = None
        placeholder_count = 0
        
        while i < len(line):
            char = line[i]
            
            # 문자열 시작/종료 확인
            if char in ["'", '`', '"'] and (i == 0 or line[i-1] != '\\'):
                if not in_string:
                    # 문자열 시작
                    in_string = True
                    string_char = char
                    new_line += char
                elif char == string_char:
                    # 문자열 종료
                    in_string = False
                    string_char = None
                    new_line += char
                else:
                    new_line += char
            elif char == '?' and in_string:
                # SQL 문자열 안의 ?를 $N으로 변환
                placeholder_count += 1
                new_line += f"${placeholder_count}"
            else:
                new_line += char
            
            i += 1
        
        result_lines.append(new_line)
    
    return '\n'.join(result_lines)


def convert_datetime_functions(content):
    """
    SQLite datetime 함수를 PostgreSQL로 변환
    """
    # datetime('now') → CURRENT_TIMESTAMP
    content = re.sub(
        r"datetime\(\s*['\"]now['\"]\s*\)",
        'CURRENT_TIMESTAMP',
        content,
        flags=re.IGNORECASE
    )
    
    # datetime('now', '+7 days') → CURRENT_TIMESTAMP + INTERVAL '7 days'
    content = re.sub(
        r"datetime\(\s*['\"]now['\"]\s*,\s*['\"]([+\-]\d+\s+(?:day|days|hour|hours))['\"]\s*\)",
        r"CURRENT_TIMESTAMP + INTERVAL '\1'",
        content,
        flags=re.IGNORECASE
    )
    
    # date('now', 'start of month') → DATE_TRUNC('month', CURRENT_DATE)
    content = re.sub(
        r"date\(\s*['\"]now['\"]\s*,\s*['\"]start of month['\"]\s*\)",
        "DATE_TRUNC('month', CURRENT_DATE)",
        content,
        flags=re.IGNORECASE
    )
    
    # date(created_at) → DATE(created_at)
    content = re.sub(
        r'\bdate\(',
        'DATE(',
        content
    )
    
    return content


def convert_boolean_values(content):
    """
    Boolean 값 변환
    """
    # is_* = 1 → is_* = true
    content = re.sub(
        r'(is_\w+\s*=\s*)1(?!\d)',
        r'\1true',
        content
    )
    
    # is_* = 0 → is_* = false
    content = re.sub(
        r'(is_\w+\s*=\s*)0(?!\d)',
        r'\1false',
        content
    )
    
    # isFree ? 1 : 0 → isFree (boolean을 그대로 사용)
    content = re.sub(
        r'(\w+)\s*\?\s*1\s*:\s*0',
        r'\1',
        content
    )
    
    return content


def convert_file(file_path):
    """
    파일을 PostgreSQL SQL로 변환
    """
    print(f"📝 변환 중: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"   ❌ 파일 없음")
        return False
    
    try:
        # 파일 읽기
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        # 변환 적용
        converted_content = original_content
        converted_content = convert_sql_placeholders(converted_content)
        converted_content = convert_datetime_functions(converted_content)
        converted_content = convert_boolean_values(converted_content)
        
        # 변경 사항 확인
        if original_content == converted_content:
            print(f"   ⏭️  변경 사항 없음")
            return False
        
        # 백업 생성
        backup_path = f"{file_path}.backup"
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(original_content)
        
        # 파일 저장
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(converted_content)
        
        # 통계
        original_q = original_content.count('?')
        converted_q = converted_content.count('?')
        converted_count = original_q - converted_q
        
        print(f"   ✅ 완료: {converted_count}개 placeholder 변환")
        return True
        
    except Exception as e:
        print(f"   ❌ 오류: {str(e)}")
        return False


def main():
    """
    메인 함수
    """
    if len(sys.argv) > 1:
        # 특정 파일만 변환
        file_path = sys.argv[1]
        convert_file(file_path)
    else:
        # 모든 파일 변환
        print("🔧 SQL → PostgreSQL 자동 변환")
        print("=" * 60)
        print()
        
        files_to_convert = [
            'routes/admin.js',
            'routes/auth.js',
            'routes/join-requests.js',
            'routes/org-admin.js',
            'routes/system-admin-dashboard.js',
            'routes/system-admin.js',
            'routes/payment.js',
            'routes/feedback.js',
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
        
        for file_path in files_to_convert:
            full_path = os.path.join('/home/user/webapp', file_path)
            if convert_file(full_path):
                converted_count += 1
            else:
                skipped_count += 1
            print()
        
        print("=" * 60)
        print(f"✅ 변환 완료: {converted_count}개 파일")
        print(f"⏭️  변경 없음: {skipped_count}개 파일")
        print("=" * 60)
        print()
        print("💡 백업 파일: *.backup")
        print("💡 다음: npm start로 테스트")


if __name__ == '__main__':
    main()
