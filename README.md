# 🤟 手語心連 — AI 即時手語學習平台

> 利用 YOLOv8 深度學習技術，打破聽障者與一般大眾的溝通隔閡。

[![SDG4](https://img.shields.io/badge/SDG4-優質教育-blue)](https://sdgs.un.org/goals/goal4)
[![SDG10](https://img.shields.io/badge/SDG10-減少不平等-orange)](https://sdgs.un.org/goals/goal10)

---

## 📁 專案結構

```
tsl-learning-platform/
├── .github/          → GitHub Actions、Issue/PR 範本
├── frontend/         → React 前端（組員 B 主導）
├── ai-backend/       → FastAPI + YOLOv8 推論 API（組員 A 主導）
├── docs/             → API 規格、資料標記規範
└── scripts/          → 資料前處理工具（組員 D 主導）
```

---

## 👥 團隊分工

| 組員 | 角色 | 主要負責資料夾 |
|------|------|----------------|
| 組員 A | AI 工程師 | `ai-backend/` |
| 組員 B | 前端工程師 | `frontend/src/components/`, `frontend/src/pages/Practice.jsx` |
| 組員 C | 後端與雲端 | `frontend/src/services/firebaseClient.js`, `frontend/src/pages/Profile.jsx` |
| 組員 D | 資料工程 & UX | `scripts/`, `docs/dataset_guide.md`, `frontend/src/components/WordCard.jsx` |

---

## 🚀 本地啟動指南

### 前端
```bash
cd frontend
npm install
npm start
# 開啟 http://localhost:3000
```

### AI 後端
```bash
cd ai-backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

---

## 🌿 Git 分支規範

| 分支 | 用途 |
|------|------|
| `main` | 穩定版本，只透過 PR 合併 |
| `dev` | 開發整合分支 |
| `feature/你的功能名稱` | 個人功能開發分支 |

**開發流程：**
1. 從 `dev` 開出 `feature/xxx` 分支
2. 完成後發 Pull Request → `dev`
3. 每週五整合後合併 `dev` → `main`

---

## 📋 開發進度

- [ ] Week 1-2：架構建立、資料收集與標記
- [ ] Week 3：YOLOv8 v1 訓練，打通 React → API → YOLO 鏈路
- [ ] Week 4：Firebase 登入、進度追蹤、UI/UX 優化
- [ ] Week 5：整合測試、壓力測試、發表準備
