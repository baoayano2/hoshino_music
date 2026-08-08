# Kiểm thử và phát hành

## Hiện trạng

Project chưa có test runner hoặc test suite tự động. TypeScript và ESLint chỉ xác nhận type/static rules; chúng không chứng minh playback, IPC, storage hay UI flow hoạt động đúng khi runtime.

## Test pyramid đề xuất

### Unit tests

Kiểm tra hàm hoặc module độc lập, chạy nhanh và không mở Electron:

- version comparison, normalization và Discovery filters;
- LRC parsing, sort và shuffle invariants;
- Spotify candidate scoring/mapping;
- settings/library migration và validation.

Stack phù hợp: Vitest + Testing Library cho pure logic và React component nhỏ.

### Integration tests

Kiểm tra nhiều module phối hợp với nhau nhưng vẫn kiểm soát dependency ngoài:

- storage đọc/ghi/migrate trong temporary userData;
- preload API gọi đúng IPC channel và payload;
- IPC handler validate input rồi cập nhật library;
- import metadata, cover optimization và range response;
- playback state reducer/hook phối hợp với mocked audio element.

Network Spotify/Discord/YouTube nên mock bằng fixture; không gọi tài khoản thật trong CI.

### End-to-end tests

Khởi động app Electron thật và thao tác như người dùng:

- mở app lần đầu;
- import file fixture, phát/seek/pause;
- tạo playlist, kéo sắp xếp và khởi động lại để kiểm tra persistence;
- mở mini player và quay lại main window;
- kiểm tra modal settings và error/offline states.

Stack phù hợp: Playwright với Electron support. E2E ít hơn integration test vì chậm và dễ phụ thuộc môi trường audio/window manager.

## Lộ trình test ngắn hạn

1. Thêm Vitest và unit test cho các helper đã tách trong `src/app/`.
2. Cho storage nhận root path hoặc adapter để test bằng thư mục tạm.
3. Tách IPC handler core khỏi Electron objects để integration test không cần mở cửa sổ.
4. Thêm 3–5 Playwright smoke flows quan trọng nhất.
5. Chạy typecheck, lint, unit, integration và E2E smoke trong CI trước release.

## Updater production-grade

Updater hiện tại chỉ đọc version từ endpoint và mở một URL installer cố định. Một updater an toàn hơn cần:

- manifest theo platform/architecture chứa version, URL, file size và SHA-256;
- checksum verification sau khi tải để phát hiện file hỏng hoặc bị thay thế;
- code-sign artifact để hệ điều hành xác minh publisher;
- chữ ký số cho manifest hoặc distribution channel HTTPS được kiểm soát chặt;
- staged rollout, retry, rollback guidance và release notes;
- kiểm tra downgrade và chọn đúng Windows/macOS/Linux artifact.

Checksum đảm bảo byte tải về khớp manifest nhưng không tự chứng minh manifest đáng tin. Code signing xác nhận binary đến từ publisher sở hữu private key và chưa bị sửa sau khi ký. Hai lớp này giải quyết hai rủi ro khác nhau và nên dùng cùng nhau.

Với electron-builder, có thể dùng `electron-updater` và publish metadata (`latest.yml`, `latest-mac.yml` hoặc tương đương). Certificate/private key phải nằm trong CI secret store; chỉ public certificate và checksum/manifest được công bố.
