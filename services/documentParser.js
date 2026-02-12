/**
 * 문서 파싱 서비스
 * Word (DOCX), PDF, TXT 파일에서 텍스트 추출
 */

const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');

// PDF 파싱은 조건부로 로드 (Vercel 환경 호환성)
let pdfParse;
try {
    pdfParse = require('pdf-parse');
} catch (error) {
    console.warn('⚠️  pdf-parse를 로드할 수 없습니다. PDF 파싱 기능이 비활성화됩니다.');
}

class DocumentParser {
    /**
     * 파일 확장자에 따라 적절한 파서 선택
     */
    async parse(filePath) {
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case '.docx':
                return await this.parseDocx(filePath);
            case '.pdf':
                return await this.parsePdf(filePath);
            case '.txt':
                return await this.parseTxt(filePath);
            default:
                throw new Error(`지원하지 않는 파일 형식입니다: ${ext}`);
        }
    }

    /**
     * DOCX 파일 파싱
     */
    async parseDocx(filePath) {
        try {
            const buffer = await fs.readFile(filePath);
            const result = await mammoth.extractRawText({ buffer });
            
            return {
                text: result.value,
                metadata: {
                    format: 'docx',
                    messages: result.messages
                }
            };
        } catch (error) {
            throw new Error(`DOCX 파싱 실패: ${error.message}`);
        }
    }

    /**
     * PDF 파일 파싱
     */
    async parsePdf(filePath) {
        if (!pdfParse) {
            throw new Error('PDF 파싱 기능을 사용할 수 없습니다. 서버 환경이 PDF 파싱을 지원하지 않습니다.');
        }
        
        try {
            const buffer = await fs.readFile(filePath);
            const data = await pdfParse(buffer);

            return {
                text: data.text,
                metadata: {
                    format: 'pdf',
                    pages: data.numpages,
                    info: data.info
                }
            };
        } catch (error) {
            throw new Error(`PDF 파싱 실패: ${error.message}`);
        }
    }

    /**
     * TXT 파일 파싱
     */
    async parseTxt(filePath) {
        try {
            const text = await fs.readFile(filePath, 'utf-8');

            return {
                text,
                metadata: {
                    format: 'txt',
                    encoding: 'utf-8'
                }
            };
        } catch (error) {
            throw new Error(`TXT 파싱 실패: ${error.message}`);
        }
    }

    /**
     * 지원하는 파일 형식 확인
     */
    isSupportedFormat(filename) {
        const ext = path.extname(filename).toLowerCase();
        return ['.docx', '.pdf', '.txt'].includes(ext);
    }
}

module.exports = new DocumentParser();
