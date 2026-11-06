# 🦖 T-Rex Runner & Local AI Chatbot (Ollama)

Trò chơi **Khủng Long (T-Rex Runner)** trên nền web HTML5 Canvas kết hợp với **Trợ lý AI Local (Ollama)** chạy trực tiếp 100% trên phần cứng máy tính của bạn, không cần Internet để chat với AI!

![T-Rex Runner & AI Local](https://img.shields.io/badge/Node.js-v20+-green.svg)
![Ollama Local AI](https://img.shields.io/badge/AI-Ollama%20Local-blue.svg)
![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-orange.svg)

---

## 🌟 Tính năng nổi bật

### 1. 🦖 Trò chơi Khủng Long T-Rex Runner
- **Đồ họa Pixel Art**: Tạo hình sắc nét cho Khủng Long (chạy, nhảy, cúi né, Game Over), Xương rồng, Thằn lằn bay (Pterodactyl), mây trời, mặt trăng và các vì sao.
- **Vật lý mượt mà (60fps)**: Hỗ trợ nhảy với gia tốc trọng lực tự nhiên, cúi né chim bay và tiếp đất nhanh (fast drop).
- **Chu kỳ Ngày / Đêm**: Tự động chuyển đổi giao diện sáng/tối sau mỗi 700 điểm.
- **Âm thanh Retro 8-bit**: Tạo bằng Web Audio API, hoàn toàn không cần file âm thanh ngoài, có nút bật/tắt tiếng (Mute/Unmute).
- **Hệ thống Điểm số & Kỷ lục**: Bảng xếp hạng trực tuyến (Leaderboard) lưu trữ điểm số.
- **Điều khiển đa nền tảng**:
  - **Bàn phím PC**: `Space` / `↑` / `W` (Nhảy), `↓` / `S` (Cúi né), `P` (Tạm dừng), `M` (Bật/tắt âm thanh).
  - **Điện thoại / Cảm ứng**: Chạm nửa trên màn hình để nhảy, nửa dưới để cúi né, kèm hệ thống nút ảo cảm ứng.

### 2. 🤖 Trợ lý AI Local (Ollama Integration)
- **Nút bật khung chat**: Nút tròn nổi (Floating Action Button) và nút trên thanh công cụ `🤖 Chat AI`.
- **Chạy trực tiếp từ máy (Local AI)**: Kết nối qua API nội bộ với ứng dụng **Ollama** (`http://localhost:11434`).
- **Hỗ trợ đa mô hình (Model Selector)**: Tự động phát hiện các mô hình AI có sẵn trong máy (`qwen-fast`, `qwen3.5:4b`, `qwen3.5-4k`...) và cho phép đổi mô hình ngay trên giao diện web.
- **Quá trình suy nghĩ (Thinking Process)**: Hiển thị thời gian và nội dung suy nghĩ theo thời gian thực (collapsible toggle), tương tự như giao diện Ollama Desktop.
- **Streaming Real-time (SSE)**: Phản hồi từng từ theo thời gian thực với Server-Sent Events, hỗ trợ định dạng Markdown và Code Block.

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Yêu cầu môi trường
- [Node.js](https://nodejs.org/) (phiên bản v18 trở lên).
- [Ollama](https://ollama.com/) đang chạy trên máy (cổng mặc định `11434`).

### Bước 2: Tải về và khởi chạy Server
```bash
# Di chuyển vào thư mục dự án
cd e:/REX

# Khởi chạy server web và API AI Local
node server.js
```

### Bước 3: Trải nghiệm
Mở trình duyệt bất kỳ (Chrome, Edge, Firefox, Cốc Cốc) và truy cập:
```
http://localhost:8080/
```

- Bấm **Space** hoặc nhấp vào màn hình để bắt đầu chơi game.
- Bấm vào nút **🤖 Chat AI** hoặc biểu tượng Robot ở góc dưới bên phải màn hình để trò chuyện với AI Local.

---

## 📁 Cấu trúc thư mục

```
e:\REX\
├── index.html          # Khung giao diện chính, Canvas game và cửa sổ Chatbot
├── server.js           # Máy chủ Node.js phục vụ Web, Database điểm số & API AI Local
├── css\
│   └── style.css       # Toàn bộ CSS phong cách Retro Arcade và Chatbot UI
├── js\
│   ├── audio.js        # Module âm thanh 8-bit Web Audio API
│   ├── sprites.js      # Module đồ họa pixel art cho nhân vật và chướng ngại vật
│   ├── game.js         # Động cơ vòng lặp game, vật lý nhảy/cúi và va chạm
│   ├── leaderboard.js  # Xử lý điểm số và bảng xếp hạng
│   └── chat.js         # Xử lý kết nối API AI Local, streaming SSE và Markdown
├── data\
│   └── leaderboard.json# Cơ sở dữ liệu lưu trữ điểm kỷ lục
├── .gitignore          # File cấu hình bỏ qua git
└── README.md           # Hướng dẫn chi tiết dự án
```

---

## 📄 Bản quyền
Dự án được xây dựng cho mục đích học tập và giải trí cá nhân.
