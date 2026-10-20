# LexiBook AI — Ứng dụng Đọc sách PDF Tiếng Anh & Học Từ vựng Ngữ cảnh (Windows Desktop MVP)

**LexiBook AI** là ứng dụng máy tính ưu tiên dữ liệu cục bộ (**Local-First Windows Desktop Application**) giúp người dùng Việt Nam đọc sách PDF tiếng Anh, đánh dấu từ/cụm từ ngay trong mạch đọc, nhận giải thích nghĩa tiếng Việt theo đúng ngữ cảnh câu sách bằng **Google Gemini (BYOK)**, và ôn tập dài hạn bằng thuật toán lặp lại ngắt quãng **FSRS** (`ts-fsrs`) cùng bài kiểm tra **Contextual Quiz** mà không làm đứt quãng trải nghiệm đọc.

---

## 1. Kiến trúc & Điểm nổi bật

- **Giao diện tiếng Việt tinh gọn, ưu tiên việc đọc (Reading-First UX)**:
  - 6 màn hình chính: `Thư viện | Đọc sách | Từ vựng | Ôn tập | Tiến độ | Cài đặt`.
  - Màn hình đọc PDF chiếm ~68% diện tích, bảng từ vựng bên phải (~32%) có thể thu gọn hoặc thay đổi kích thước (`280px`–`460px`), không dùng hộp thoại chặn việc đọc.
- **Đánh dấu PDF bền vững (Zoom-Stable & Rotation-Stable Anchors)**:
  - Lưu trữ đồng thời tọa độ chuẩn hóa trên trang PDF (`NormalizedQuad` trong khoảng `[0..1]`) và neo văn bản (`TextAnchor` gồm `startOffset`, `endOffset`, `prefix`, `suffix`, `pdfFingerprint`).
  - Giữ đúng vị trí từ được đánh dấu khi phóng to/thu nhỏ (`50%`, `100%`, `125%`, `200%`), xoay trang (`0°`, `90°`, `180°`, `270°`), đóng/mở lại ứng dụng, hoặc khi một từ xuất hiện nhiều lần trên cùng một trang.
- **Lưu trữ trước khi gọi AI (Persist-Before-AI Invariant)**:
  - Mọi thao tác xác nhận đánh dấu đều ghi nhận `Highlight`, `Lexeme`, và `Occurrence` vào cơ sở dữ liệu SQLite (`lexibook.db`) **trước** khi gửi yêu cầu phân tích tới Gemini. Nếu mất mạng, hết hạn mức (HTTP 429) hoặc chưa nhập khóa API, đánh dấu và câu ngữ cảnh gốc vẫn được bảo toàn 100% kèm nút `Thử lại phân tích`.
- **Tách biệt Từ đa nghĩa (Polysemy Across Books)**:
  - Cùng một từ vựng (ví dụ: `"charge"`) gặp ở nhiều cuốn sách hoặc đoạn văn khác nhau sẽ dùng chung một `Lexeme` (`normalized_key`) nhưng lưu các `Occurrence` và `Sense` riêng biệt để các nghĩa ngữ cảnh không bao giờ ghi đè lên nhau.
- **Ôn tập FSRS & Quiz độc lập (ADR-002)**:
  - Từ vựng mới lưu mặc định ở trạng thái `Đã lưu (Saved)` và chỉ vào hàng đợi FSRS khi người dùng chủ động chọn `Đưa vào Ôn tập`.
  - Chấm điểm thẻ ghi nhớ (`submitReview`) chống trùng lặp (`clientReviewRequestId` idempotency).
  - Kết quả bài kiểm tra (`submitQuizAttempt`) được thống kê độc lập, **tuyệt đối không** tạo bản ghi `ReviewEvent` giả hoặc làm sai lệch lịch trình FSRS.
- **Bảo mật & Quyền riêng tư (BYOK Security Non-Negotiables)**:
  - Khóa API Gemini được bảo vệ riêng biệt trong kho khóa bảo mật máy tính (Windows Credential Manager / DPAPI / AES-256-GCM local vault), **không bao giờ** lưu trong SQLite (`lexibook.db`), gói giao diện `dist/`, `localStorage`, nhật ký lỗi hay tệp sao lưu `.zip`.
  - Đoạn trích PDF gửi tới Gemini được giới hạn độ dài và bọc trong thẻ `<untrusted_pdf_excerpt>` chống tấn công Prompt Injection; phản hồi AI được kiểm tra lược đồ nghiêm ngặt bằng `Zod` và lọc bỏ hoàn toàn mã HTML/script.
  - Khôi phục sao lưu (`importBackup`) giải nén vào thư mục tạm (`staging`), chặn mọi đường dẫn vượt cấp (`../`), đường dẫn tuyệt đối, symlink, và kiểm tra mã băm `SHA-256` trước khi cập nhật SQLite trong một giao dịch nguyên tử (`BEGIN IMMEDIATE ... COMMIT`).

---

## 2. Yêu cầu hệ thống & Cài đặt môi trường phát triển

### Yêu cầu nền tảng
- **Hệ điều hành**: Windows 10 (1903+) hoặc Windows 11 (64-bit) với Microsoft Edge WebView2 Runtime.
- **Node.js**: `v24.x` (sử dụng mô-đun `node:sqlite` tích hợp sẵn và npm `12+`).
- **Rust & MSVC Build Tools** *(bắt buộc khi biên dịch gói cài đặt gốc `.msi` / `.exe` qua Tauri v2)*:
  - Rust stable (`x86_64-pc-windows-msvc`) qua `rustup`.
  - Visual Studio 2022 C++ Build Tools (`Desktop development with C++` workload).

### Cài đặt phụ thuộc & Khởi tạo dữ liệu kiểm thử
```powershell
# 1. Cài đặt các gói phụ thuộc từ lockfile
npm ci

# 2. Tạo bộ 6 tệp PDF mẫu phục vụ kiểm thử tự động trong tests/fixtures/
node scripts/generate_pdf_fixtures.mjs
```

---

## 3. Các lệnh chạy ứng dụng, kiểm thử & đóng gói

| Tác vụ | Lệnh thực thi | Mô tả |
|---|---|---|
| **Chạy giao diện phát triển (kèm cầu nối SQLite cục bộ)** | `npm run dev` | Khởi chạy Vite server tại `http://localhost:5173` kết nối trực tiếp tới SQLite cục bộ |
| **Kiểm tra kiểu tĩnh TypeScript** | `npm run typecheck` | Chạy `tsc --noEmit` ở chế độ strict |
| **Kiểm tra quy tắc mã nguồn ESLint** | `npm run lint` | Kiểm tra toàn bộ `src/` và `tests/` |
| **Chạy toàn bộ bộ kiểm thử tự động (Unit + Integration + E2E Loop)** | `npm run test` | Thực thi 10 bộ kiểm thử Vitest (27 kịch bản) trên SQLite thật và tệp PDF thật |
| **Đóng gói giao diện sản xuất (Production Frontend)** | `npm run build` | Biên dịch gói giao diện tối ưu vào thư mục `dist/` |
| **Quét bảo mật khóa API (SEC-01)** | `node scripts/secret_scan.mjs` | Quét `dist/`, `src/`, `src-tauri/` đảm bảo không rò rỉ khóa API |
| **Kiểm tra tính toàn vẹn bộ kit** | `python scripts/validate_kit.py` | Kiểm tra cấu trúc 17 tác vụ, rules, skills và tài liệu |
| **Đóng gói bộ cài đặt Windows Tauri (`.msi` / `.exe`)** | `npm run tauri build` | Yêu cầu đã cài đặt `rustc`/`cargo` và MSVC C++ Build Tools |

---

## 4. Vị trí lưu trữ dữ liệu & Hướng dẫn cấu hình khóa Gemini (BYOK)

1. **Vị trí lưu trữ dữ liệu cục bộ**:
   - Toàn bộ cơ sở dữ liệu SQLite (`lexibook.db`) và thư mục sách PDF được quản lý (`books/<id>_<sha256>.pdf`) nằm trong thư mục dữ liệu ứng dụng của người dùng (`%APPDATA%\com.lexibook.ai` khi chạy bản cài đặt Tauri hoặc `.lexibook-local-data/` khi chạy môi trường dev).
2. **Cấu hình khóa API Gemini (BYOK)**:
   - Mở ứng dụng → chuyển sang tab **Cài đặt** → mục **Khóa API Gemini (BYOK) & Quyền riêng tư**.
   - Nhập khóa API Google Gemini của bạn, chọn mô hình (`gemini-2.5-flash` hoặc `gemini-2.5-pro`), nhấn **Lưu khóa API** và **Kiểm tra kết nối**.
   - Bạn hoàn toàn có thể sử dụng ứng dụng **không cần khóa API** để đọc sách PDF, đánh dấu câu, tự ghi chú nghĩa tiếng Việt và ôn tập thẻ FSRS ngoại tuyến.
3. **Sao lưu & Khôi phục**:
   - Trong tab **Cài đặt** → **Sao lưu & Khôi phục Dữ liệu Cục bộ**, chọn **Xuất bản sao lưu (.zip)** (có thể chọn kèm hoặc không kèm tệp PDF gốc).
   - Lưu ý: Tệp sao lưu `.zip` **không bao giờ** chứa khóa API Gemini của bạn; sau khi khôi phục sang máy tính mới, bạn chỉ cần nhập lại khóa API trong phần Cài đặt.
