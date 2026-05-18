// 📹 VideoCapture.jsx
// ─────────────────────────────────────────────────────────────
// 模型已從 YOLOv8（後端 API）切換為 MediaPipe Hands + MLP（純前端 ONNX）。
// 切換日期：2026-05-19
//
// 這個檔案現在只是個「轉發器」——把原本三個 Tab 的 import VideoCapture
// 自動導向到 PoseVideoCapture，這樣三個 Tab 的程式碼不用改。
//
// 舊的 YOLO 版備份在：VideoCapture.yolo.jsx.bak
// 如果需要切回舊版做對比，把那個檔案重新命名為 VideoCapture.jsx 即可。
// ─────────────────────────────────────────────────────────────

export { default } from './PoseVideoCapture';
