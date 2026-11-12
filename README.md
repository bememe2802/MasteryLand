# Mastery Land

Game 3D góc nhìn từ trên xuống cho mobile: đánh để tăng thông thạo (Võ, Kiếm, Phòng Thủ), PvP ngoài vùng an toàn, đấu trường 1 vs 1.

## Chạy

```bash
npm install
cp .env.example .env
npm run build
npm start
```

Mở http://localhost:5173

Khi sửa giao diện: chạy `npm run dev` (server) và `npm run dev:client` (Vite, tự tải lại), rồi mở http://localhost:5174.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `client/src/game/` | Vòng lặp game bằng JavaScript thuần: Three.js, va chạm, quái, hiệu ứng, minimap, kết nối WebSocket |
| `client/src/ui/` | Giao diện bằng Vue 3: HUD, joystick, nút hành động, bảng chỉ số, cửa hàng, đấu trường, bản đồ, đăng nhập |
| `shared/rules.js` | Luật game dùng chung cho client và server: chỉ số, đồ, bản đồ, công thức sát thương |
| `server/` | Express + `ws` + SQLite |

Game và giao diện chỉ gặp nhau ở `client/src/ui/state.js`. Game ghi vài con số đã định dạng vào một object `reactive` (tối đa 10 lần/giây, Vue bỏ qua giá trị không đổi). Vị trí, mesh và trạng thái thế giới không bao giờ đi qua reactivity của Vue, nên vòng lặp 60 khung hình/giây không tốn thêm gì cho Vue. Joystick ghi thẳng vào một object thường để game đọc mỗi khung hình.

## Đăng nhập Google

1. Vào Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
2. Authorized JavaScript origins: `http://localhost:5173` khi chạy máy mình, và domain thật dạng `https://game.example.com` khi đưa lên mạng (Google không nhận IP LAN).
3. Dán Client ID vào `GOOGLE_CLIENT_ID` trong `.env`, khởi động lại server.

`DEV_LOGIN=1` bật nút "Đăng nhập thử" (thêm `?dev=ten` trên URL để có nhiều tài khoản thử). Luôn để `DEV_LOGIN=0` khi chạy thật.

## Cấu hình `.env`

| Biến | Ý nghĩa |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID |
| `MAX_PLAYERS` | Số người online tối đa |
| `ALLOWED_ORIGINS` | Origin được phép mở WebSocket ngoài chính domain của server |
| `TRUST_PROXY` | `1` khi chạy sau Nginx/Cloudflare để lấy đúng IP người chơi |
| `WS_PER_IP`, `API_PER_MIN`, `AUTH_PER_MIN` | Giới hạn kết nối / request theo IP |

## Chống gian lận

Server quyết định mọi thứ có giá trị; client chỉ gửi ý định:

- Vàng, điểm thông thạo, đồ, bình máu, checkpoint, máu người chơi đều do server tính và lưu.
- Đánh thường/kỹ năng bị giới hạn theo hồi chiêu phía server; mỗi cú đánh chỉ trúng mỗi mục tiêu một lần.
- Giết quái chỉ được thưởng khi tổng sát thương tối đa có thể gây ra đủ máu quái, đúng thời gian hồi sinh, và người chơi đang ở gần bãi quái.
- Sát thương PvP và đấu trường do server tính từ chỉ số thật của hai bên.
- Kiểm tra tốc độ di chuyển, đi trên nước, ra ngoài bản đồ → kéo về vị trí hợp lệ.
- Mua đồ phải đứng cạnh NPC và đủ vàng.
- Giới hạn số tin nhắn/giây, kích thước tin nhắn, số kết nối mỗi IP; spam bị ngắt kết nối.
- Hành vi bất thường ghi vào bảng `cheat_log`; quá nhiều trong 1 phút sẽ bị kick. Cột `banned` trong `users` để khóa tài khoản.
- Token phiên lưu dạng băm SHA-256, gửi qua tin nhắn đầu tiên của WebSocket (không nằm trong URL).
- CSP, chặn iframe, kiểm tra Origin của WebSocket.

Giới hạn còn lại: quái vật chạy ở máy người chơi (mỗi người thấy bầy quái riêng), nên client sửa đổi có thể né đòn quái trong PvE. Vật cản như cây/đá chỉ kiểm tra ở client.

## Chịu tải

- Mỗi người chỉ nhận dữ liệu người chơi trong bán kính 60 ô (lưới không gian), 10 lần/giây.
- Bỏ qua gói cập nhật cho máy mạng chậm (backpressure), ping/pong dọn kết nối chết.
- Lưu DB theo lô mỗi 15 giây trong một transaction (SQLite WAL), lưu hết khi tắt server.
- Thử 300 bot cùng lúc trên máy cá nhân: server ~21% một nhân CPU, ~90MB RAM.

Khi đưa lên mạng: đặt sau Nginx/Caddy có HTTPS (WebSocket cần `wss://`), bật `TRUST_PROXY=1`. Một tiến trình Node phục vụ được vài trăm người; nhiều hơn cần chia server theo kênh/khu vực.

## Nguồn tài nguyên

Xem `public/assets/CREDITS.md`.
