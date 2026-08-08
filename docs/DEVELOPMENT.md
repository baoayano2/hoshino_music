# Phát triển Hoshino Music

## Thiết lập

```bash
pnpm install
pnpm dev
```

Vite phục vụ renderer và plugin Electron chạy main/preload trong development mode.

## Quality gate hiện tại

Chạy trước mỗi commit/release:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint . --report-unused-disable-directives --max-warnings 0
pnpm build
```

Script `pnpm lint` hiện có `--fix`; dùng lệnh ESLint phía trên nếu chỉ muốn kiểm tra mà không sửa file.

## Quy ước thay đổi IPC

1. Thêm hoặc cập nhật type trong `electron/ipc/types.ts`.
2. Thêm channel trong `electron/ipc/channels.ts`.
3. Expose method tối thiểu trong `electron/ipc/preload-api.ts`.
4. Implement và validate input trong `electron/ipc/main-handlers.ts`.
5. Gọi method typed từ renderer.

Không truyền path tùy ý từ renderer đến filesystem nếu main process chưa kiểm tra scope, extension và kích thước.

## Quy ước UI

- Giữ `App.tsx` làm composition/orchestration root; pure helper đặt trong `src/app/`.
- Modal mới đặt đúng domain file và export lại qua `components/Modals.tsx`.
- Logic có lifecycle riêng nên được đóng gói thành hook.
- Model dùng chung renderer/main phải đặt trong IPC types, không tạo hai bản khác nhau.

## Packaging

`pnpm build` thực hiện typecheck, build Vite/Electron và chạy electron-builder. Target hiện có Windows NSIS, macOS DMG và Linux AppImage. Một máy build thường chỉ nên phát hành artifact của chính nền tảng đó, trừ khi CI đã cài đầy đủ cross-platform tooling.

Các secret dùng để code-sign không được commit. Chúng phải đến từ secret store của CI hoặc environment tại thời điểm release.

## Debugging

DevTools được bật trong development. Production chỉ cho mở DevTools khi debugger setting được bật. Debugger browser dùng BrowserWindow sandbox riêng và từ chối popup ngoài flow được cho phép.
