# ⚾ KBO Live Center (KBO 실시간 중계 대시보드)

KBO 리그 10개 팀의 경기 현황과 5개 경기의 실시간 중계 데이터를 한눈에 확인할 수 있는 대시보드 애플리케이션입니다.

## 🚀 주요 기능

- **실시간 경기 중계**: 현재 진행 중인 모든 KBO 경기의 스코어, 이닝, 주자 상황 등을 실시간으로 표시합니다.
- **팀별 상세 정보**: 각 팀의 최근 경기 결과(승/패/무)와 최근 전적 요약을 제공합니다.
- **상세 경기 로그**: 특정 경기를 선택하여 타석별 상세 텍스트 중계 로그를 확인할 수 있습니다.
- **그라운드 상황 시각화**: 현재 타자, 투수, 수비 위치 및 주자 상황을 텍스트로 시각화하여 보여줍니다.
- **반응형 디자인**: 다양한 기기에서 최적화된 화면으로 정보를 확인할 수 있습니다.

## 🛠 기술 스택

- **Backend**: Node.js (Vanilla http module)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **API**: KBO 공식 데이터 연동 (Proxy Server 구현)

## 📦 설치 및 실행 방법

### 1. 저장소 클론
```bash
git clone https://github.com/changook123/KBO_BROADCAST_WEB.git
cd KBO_BROADCAST_WEB
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 서버 실행
```bash
npm start
```
서버가 실행되면 브라우저에서 `http://localhost:3000`으로 접속하세요.

## 🌐 외부 접속 (ngrok 이용 시)
로컬에서 실행 중인 서버를 외부에서 접속 가능하게 하려면 다음 명령어를 사용하세요:
```bash
npx ngrok http 3000
```

## 📝 라이선스
이 프로젝트는 MIT 라이선스 하에 배포됩니다.
