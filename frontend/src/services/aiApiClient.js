// 🤖 aiApiClient.js
// 【組員 B 負責實作】
// 功能：封裝所有對 FastAPI AI 後端的 HTTP 請求
//
// TODO 清單：
//   1. 實作 predictSign：傳送 base64 影格，回傳辨識結果
//   2. 實作 healthCheck：確認後端是否在線
//   3. 加入請求逾時與錯誤處理

import axios from 'axios';

const AI_API_URL = process.env.REACT_APP_AI_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: AI_API_URL,
  timeout: 5000, // 5 秒逾時
});

/**
 * 送出影格進行手語辨識
 * @param {string} base64Frame - canvas.toDataURL('image/jpeg') 的輸出
 * @returns {Promise<{ label: string, confidence: number, bbox: number[] }>}
 *
 * TODO: 依照 docs/api_spec.md 的介面定義實作
 */
export const predictSign = async (base64Frame) => {
  // TODO: 實作 POST /predict 請求
  // Request body: { image: base64Frame }
  // Response: { label, confidence, bbox }

  // 暫時回傳假資料，等後端 API 完成後替換
  console.warn('predictSign: 使用假資料，等待組員 A 完成後端 API');
  return { label: '你好', confidence: 0.87, bbox: [100, 80, 300, 400] };

  /*
  const response = await apiClient.post('/predict', { image: base64Frame });
  return response.data;
  */
};

/**
 * 健康檢查：確認 AI 後端是否正常運行
 * @returns {Promise<boolean>}
 */
export const healthCheck = async () => {
  try {
    const response = await apiClient.get('/health');
    return response.status === 200;
  } catch {
    return false;
  }
};
