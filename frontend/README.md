# 📱 Frontend — React 前端

**主要負責人：組員 B（前端工程師）、組員 C（Firebase 整合）**

---

## 📁 目錄結構說明

```
src/
├── components/         ← 可重用的 UI 元件
│   ├── VideoCapture.jsx    ← 【組員 B】Webcam 串接 + 擷取影格
│   ├── Navbar.jsx          ← 【組員 B】導覽列
│   └── WordCard.jsx        ← 【組員 D】手語單字詞卡元件
│
├── services/           ← 外部 API 通訊層
│   ├── aiApiClient.js      ← 【組員 B】呼叫 FastAPI 推論 API
│   └── firebaseClient.js   ← 【組員 C】Firebase 設定與操作封裝
│
└── pages/              ← 各頁面
    ├── Home.jsx            ← 首頁（所有人可協作）
    ├── Practice.jsx        ← 【組員 B】練習室（Webcam + 即時辨識）
    ├── Vocabulary.jsx      ← 單字庫（所有人可協作）
    └── Profile.jsx         ← 【組員 C】個人檔案 + 進度追蹤
```

---

## 🚀 啟動方式

```bash
npm install
npm start
```

前端預設跑在 `http://localhost:3000`，AI 後端需同時在 `http://localhost:8000` 執行。

---

## 🔑 環境變數設定

複製 `.env.example` 為 `.env.local`：

```bash
cp .env.example .env.local
```

填入你的 Firebase 設定值（找組員 C 取得）。
