# HSK Flashcard (1–5)

Web app luyện từ vựng HSK 1-5 (3.600 từ), thuần HTML/CSS/JS — không cần cài đặt, không cần server, không cần build.

## Dùng ngay (không cần deploy)

Mở trực tiếp file `index.html` bằng trình duyệt (double-click, hoặc "Open with" → Chrome/Safari). Mọi tính năng chạy được ngay kể cả offline, trừ phần chọn font online (vẫn có font dự phòng của máy) và giọng đọc (dùng giọng có sẵn trên máy/trình duyệt).

## Đưa lên GitHub Pages (để dùng trên điện thoại, chia sẻ link)

1. Tạo repo mới trên GitHub, ví dụ `hsk-flashcard`.
2. Copy toàn bộ nội dung thư mục này (`index.html`, `css/`, `js/`) vào repo, commit & push.
3. Vào **Settings → Pages** của repo → chọn nhánh `main`, thư mục `/ (root)` → Save.
4. Sau 1-2 phút, trang sẽ chạy ở `https://<tên-github-của-bạn>.github.io/hsk-flashcard/`.
5. Mở link đó trên điện thoại → **Thêm vào màn hình chính** (Add to Home Screen) để dùng như app.

*Lưu ý: mình (Claude) không đăng nhập được vào tài khoản GitHub của bạn — bạn cần tự tạo repo và push. Nếu bạn dùng GitHub Desktop hoặc VS Code, chỉ cần kéo thả thư mục này vào là xong.*

## Cấu trúc dữ liệu học tập

- Dữ liệu gốc 3.600 từ (chữ Hán, pinyin, từ loại, cấp độ) lấy từ **Đề cương từ vựng HSK chính thức** (bản mới, hiệu lực 7/2026) bạn tải lên — chính xác 100%.
- **Nghĩa tiếng Việt**: đã điền đầy đủ cho toàn bộ **3.600/3.600 từ (HSK1-5)**, tự biên soạn. **Câu ví dụ + từ đồng nghĩa/trái nghĩa**: đã soạn đầy đủ cho **HSK1-2 (500 từ)**; HSK3-5 hiện còn trống — dùng nút ✎ / "Sửa từ này" để tự thêm, hoặc **dán CSV hàng loạt** ở mục *Thêm từ → Nhập/Xuất hàng loạt* để điền nhanh cho nhiều từ cùng lúc.
- Toàn bộ chỉnh sửa, từ tự thêm, và tiến độ học được lưu trong **localStorage của trình duyệt** (không mất khi tắt app, nhưng gắn với máy/trình duyệt đó — dùng nút "Xuất JSON" để sao lưu / chuyển sang máy khác).

## Ghi công dữ liệu

Nghĩa tiếng Anh tạm thời dùng dữ liệu **CC-CEDICT** (Creative Commons Attribution-Share Alike License, https://cc-cedict.org).
