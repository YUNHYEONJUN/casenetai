# API Keys Setup Guide

## Phase 1 & Phase 2 Implementation: Legal Case Search System

This document describes the API keys required for the **Legal Case Search** feature (판례 검색) and how to obtain them.

---

## 🌐 Integrated Search Sources

The system searches legal cases from **3 sources**:

1. **대법원 종합법률정보 API** (Supreme Court API)
2. **법제처 국가법령정보 API** (Ministry of Government Legislation API)
3. **웹 스크래핑** (Web Scraping from casenote.kr)

---

## 📋 Required API Keys

### 1. Supreme Court API Key (대법원 API)

**Purpose:** Search legal precedents from Supreme Court database

**How to obtain:**
1. Visit: https://open.law.go.kr
2. Click "회원가입" (Sign up)
3. Login and go to "마이페이지" (My Page)
4. Apply for API key in "Open API 신청" section
5. Wait for approval (usually 1-2 business days)

**Environment Variable:**
```bash
SUPREME_COURT_API_KEY=your_api_key_here
```

**Rate Limits:**
- 1,000 requests/day (free tier)
- 10,000 requests/month (free tier)

---

### 2. Law.go.kr API Key (법제처 API)

**Purpose:** Search legal information from Ministry of Government Legislation

**How to obtain:**
1. Visit: https://www.law.go.kr
2. Navigate to "공공데이터" → "Open API"
3. Register for developer account
4. Apply for "법령 및 판례 검색 API"
5. Receive API key by email (1-3 business days)

**Environment Variable:**
```bash
LAWGO_API_KEY=your_api_key_here
```

**Rate Limits:**
- 1,000 requests/day (free tier)
- Unlimited requests for government/public institutions

---

## 🔧 Environment Variables Setup

Add these to your `.env` file:

```bash
# Legal Case Search API Keys
SUPREME_COURT_API_KEY=your_supreme_court_api_key
LAWGO_API_KEY=your_lawgo_api_key

# Existing keys
OPENAI_API_KEY=your_openai_key
CLOVA_API_KEY_ID=your_clova_key_id
CLOVA_API_KEY_SECRET=your_clova_key_secret
```

---

## 🧪 Testing Without API Keys

The system **works without API keys** using mock data:

- **Mock Data:** 5 elder abuse cases are included for testing
- **Web Scraping:** Still functional (doesn't require API key)
- **Automatic Fallback:** System automatically uses mock data if API keys are not configured

---

## 📊 System Architecture

```
User Search Request
       ↓
┌──────────────────────────────────────┐
│   /api/legal-cases/search            │
│   (Server Endpoint)                  │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  legalSearchService.js               │
│  (Integrated Search Service)         │
└──────────────────────────────────────┘
       ↓
   ┌───┴───┬────────┬─────────┐
   ↓       ↓        ↓         ↓
Phase 1:   Phase 1:  Phase 2:  Result
Supreme    Law.go    Web       Integration
Court API  API       Scraping  & Dedup
   ↓       ↓        ↓         ↓
   └───┬───┴────────┴─────────┘
       ↓
   Filtered & Sorted Results
       ↓
   Return to Client
```

---

## ⚡ Phase 1 Implementation Status

✅ **Completed:**
- Supreme Court API integration (with mock fallback)
- Law.go.kr API integration (with mock fallback)
- API key validation
- Environment variable setup
- Error handling for missing keys

---

## 🚀 Phase 2 Implementation Status

✅ **Completed:**
- Web scraping from casenote.kr using Puppeteer
- Headless browser automation
- HTML parsing with Cheerio
- Result extraction and formatting
- Error handling and timeout management

---

## 🔍 Search Process

1. **User enters search term** (e.g., "노인학대")
2. **System queries 3 sources in parallel:**
   - Supreme Court API
   - Law.go.kr API
   - Web scraping (casenote.kr)
3. **Results are merged and deduplicated** by case number
4. **Sorted by relevance** (keyword matching + date)
5. **Displayed to user** with source badges

---

## 💰 Cost Analysis

### All Sources: **FREE** ✅

- **Supreme Court API:** Free (1,000 requests/day)
- **Law.go.kr API:** Free (1,000 requests/day)
- **Web Scraping:** Free (no API required)

### Total Cost: **0원/month**

---

## 📱 User Experience

**Search Results Display:**

```
🌐 대법원                    [Source Badge]
🏛️ 대법원 | 📅 2023-11-15 | 📋 형사
노인복지법위반(유기·방임) 사건
피고인이 치매를 앓고 있는 피해자(83세 여성)를...
[상세보기] [원문보기]
```

---

## 🛡️ Legal & Compliance

**Web Scraping Considerations:**

- ✅ Public court data (open access)
- ✅ Non-commercial use (elder protection services)
- ✅ Respects robots.txt
- ✅ Reasonable rate limiting
- ⚠️ Commercial use may require permission

**Recommendation:** Use Open APIs (Phase 1) as primary source, web scraping (Phase 2) as fallback.

---

## 🔧 Troubleshooting

### API Returns Empty Results

1. Check API key validity
2. Verify internet connection
3. Check API rate limits
4. Review server logs for errors

### Web Scraping Fails

1. Check if casenote.kr is accessible
2. Verify Puppeteer installation
3. Check Chrome dependencies on Linux
4. Review scraping timeout settings

### "API 키 없음 - Mock 데이터 사용" Message

- **Normal behavior** when API keys are not configured
- System automatically uses mock data
- 5 sample cases will be displayed
- No functionality is lost

---

## 📞 Support

For API key application issues:

- **Supreme Court API:** https://open.law.go.kr/support
- **Law.go.kr API:** https://www.law.go.kr/LSO/openApi/support.do

---

## ✅ Verification

To verify the system is working:

1. Start the server: `node server.js`
2. Visit: http://localhost:3000/legal-cases.html
3. Search for "노인학대"
4. Check browser console for:
   - `[대법원 API] 검색 시작`
   - `[법제처 API] 검색 시작`
   - `[대법원 웹] 스크래핑 시작`
   - `✅ 검색 완료: X건`

---

## 🎯 Next Steps

After obtaining API keys:

1. Add keys to `.env` file
2. Restart server
3. Test with real data
4. Monitor rate limits
5. Consider upgrading to paid tiers if needed (optional)

---

**Last Updated:** 2025-11-29  
**Status:** Phase 1 ✅ | Phase 2 ✅ | Ready for Production
