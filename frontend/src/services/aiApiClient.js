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

const apiClient = axios.create({ baseURL: AI_API_URL, timeout: 15000 });

/**
 * 送出影格進行手語辨識
 * @param {string} base64Frame - canvas.toDataURL('image/jpeg') 的輸出
 * @returns {Promise<{ label: string, confidence: number, bbox: number[] }>}
 *
 * TODO: 依照 docs/api_spec.md 的介面定義實作
 */
export const predictSign = async (base64Frame) => {
  const response = await apiClient.post('/predict', { image: base64Frame });
  console.log('後端回傳：', response.data);
  return response.data;
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
